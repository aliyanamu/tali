/**
 * Contract interaction helpers for AutonomousRule.sol on Mantle.
 *
 * Write calls: WalletClient (AGENT_PRIVATE_KEY) → writeContract → waitForTransactionReceipt
 * Read calls:  PublicClient → readContract
 *
 * Agent wallet is a self-generated EOA (cast wallet new). Private key lives in AGENT_PRIVATE_KEY env.
 * Production path: rotate to hardware wallet or Privy server wallet and gate attestExecution()
 * to only accept calls from the registered agentWallet on ERC-8004.
 */

import { createWalletClient, http, keccak256, toHex, encodeAbiParameters, parseAbiParameters, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from './env.js';
import { createMantlePublicClient } from './chain.js';
import autonomousRuleAbi from '../../abi/AutonomousRule.json' with { type: 'json' };

// ── Types ─────────────────────────────────────────────────────

export type TriggerDirection = 'IN' | 'OUT' | 'BOTH';
export type ActionType = 'FARM' | 'SWAP' | 'DCA';

export type RuleOnChain = {
  agentId:        bigint;
  owner:          `0x${string}`;
  triggerHash:    `0x${string}`;
  actionHash:     `0x${string}`;
  expiry:         bigint;
  executionCount: number;
  active:         boolean;
};

// ── Internal helpers ──────────────────────────────────────────

function getContractAddress(): `0x${string}` {
  if (!env.AUTONOMOUS_RULE_CONTRACT) throw new Error('AUTONOMOUS_RULE_CONTRACT not set in env');
  return env.AUTONOMOUS_RULE_CONTRACT as `0x${string}`;
}

function getClients() {
  if (!env.AGENT_PRIVATE_KEY) throw new Error('AGENT_PRIVATE_KEY not set in env');
  const rpcUrl = env.MANTLE_TESTNET_RPC ?? env.MANTLE_ALCHEMY_RPC;
  const publicClient = createMantlePublicClient(rpcUrl, env.MANTLE_CHAIN_ID);
  const account = privateKeyToAccount(env.AGENT_PRIVATE_KEY as `0x${string}`);
  const chain = publicClient.chain;
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  return { publicClient, walletClient, account };
}

// Lazy singleton — avoid creating a new HTTP transport on every read call
let _publicClient: ReturnType<typeof createMantlePublicClient> | null = null;
function getPublicClient() {
  if (!_publicClient) {
    const rpcUrl = env.MANTLE_TESTNET_RPC ?? env.MANTLE_ALCHEMY_RPC;
    _publicClient = createMantlePublicClient(rpcUrl, env.MANTLE_CHAIN_ID);
  }
  return _publicClient;
}

// ── Hash utilities ─────────────────────────────────────────────
// Must match Solidity encoding exactly:
//   triggerHash = keccak256(abi.encode(tokenAddress, keccak256(bytes(direction)), threshold))
//   actionHash  = keccak256(abi.encode(keccak256(bytes(actionType)), targetPct, maxSlippageBps))
//
// Inner hash: toHex(str) → 0x-prefixed raw UTF-8 bytes → keccak256 matches Solidity keccak256(bytes(str))
// Outer hash: encodeAbiParameters with ABI padding matches Solidity abi.encode (NOT abi.encodePacked)

export function hashTrigger(
  tokenAddress: `0x${string}`,
  direction: TriggerDirection,
  threshold: bigint,
): `0x${string}` {
  return keccak256(encodeAbiParameters(
    parseAbiParameters('address, bytes32, uint256'),
    [tokenAddress, keccak256(toHex(direction)), threshold],
  ));
}

export function hashAction(
  actionType: ActionType,
  targetPct: bigint,
  maxSlippageBps: bigint,
): `0x${string}` {
  return keccak256(encodeAbiParameters(
    parseAbiParameters('bytes32, uint256, uint256'),
    [keccak256(toHex(actionType)), targetPct, maxSlippageBps],
  ));
}

/**
 * Solana tx signatures are 64-byte ed25519 — too large for bytes32.
 * Store keccak256(toHex(sig)) as a 32-byte content-addressed reference.
 * The full signature lives in Postgres onchainEvents.rawPayload.
 */
export function hashSolanaTx(solanaTxSignature: string): `0x${string}` {
  return keccak256(toHex(solanaTxSignature));
}

// ── Write functions (Privy-signed) ────────────────────────────

/**
 * Calls AutonomousRule.setRule() on Mantle.
 * Returns the on-chain ruleId parsed from the RuleSet event log.
 */
export async function setRule(params: {
  agentId:       bigint;
  triggerHash:   `0x${string}`;
  actionHash:    `0x${string}`;
  expiry:        bigint; // unix timestamp; 0 = never
}): Promise<bigint> {
  const contractAddress = getContractAddress();
  const { publicClient, walletClient, account } = getClients();

  const hash = await walletClient.writeContract({
    address:      contractAddress,
    abi:          autonomousRuleAbi,
    functionName: 'setRule',
    args:         [params.agentId, params.triggerHash, params.actionHash, params.expiry],
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });

  // Parse ruleId from RuleSet event in receipt logs
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi:  autonomousRuleAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === 'RuleSet') {
        const args = decoded.args as unknown as { ruleId: bigint };
        return args.ruleId;
      }
    } catch {
      // log is from a different event / contract — skip
    }
  }

  throw new Error(`RuleSet event not found in tx ${hash}`);
}

/** Calls AutonomousRule.deactivateRule() on Mantle. */
export async function deactivateRule(ruleId: bigint): Promise<`0x${string}`> {
  const contractAddress = getContractAddress();
  const { publicClient, walletClient, account } = getClients();

  const hash = await walletClient.writeContract({
    address:      contractAddress,
    abi:          autonomousRuleAbi,
    functionName: 'deactivateRule',
    args:         [ruleId],
    account,
  });

  await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
  return hash;
}

// Serialization queue for attestExecution — concurrent calls from the same EOA key
// cause nonce collisions on Mantle. This queue ensures at most one attest tx is in-flight at a time.
let _attestQueue: Promise<void> = Promise.resolve();

/**
 * Calls AutonomousRule.attestExecution() on Mantle.
 * executionHash: keccak256(abi.encode(ruleId, solanaTxHash, amountRaw)) — inputs available before the call.
 * solanaTxHash:  use hashSolanaTx(solanaTxSignature) — keccak256 reference, full sig in Postgres.
 * Serialized via _attestQueue to prevent nonce collisions when multiple rules fire concurrently.
 */
export async function attestExecution(params: {
  ruleId:        bigint;
  executionHash: `0x${string}`;
  solanaTxHash:  `0x${string}`;
}): Promise<`0x${string}`> {
  // Acquire serial slot
  let releaseSlot!: () => void;
  const ticket = new Promise<void>(resolve => { releaseSlot = resolve; });
  const prev = _attestQueue;
  _attestQueue = prev.then(() => ticket);
  await prev;

  try {
    const contractAddress = getContractAddress();
    const { publicClient, walletClient, account } = getClients();

    const hash = await walletClient.writeContract({
      address:      contractAddress,
      abi:          autonomousRuleAbi,
      functionName: 'attestExecution',
      args:         [params.ruleId, params.executionHash, params.solanaTxHash],
      account,
    });

    await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    return hash;
  } finally {
    releaseSlot();
  }
}

// ── Read functions (PublicClient) ──────────────────────────────

export async function isRuleActive(ruleId: bigint): Promise<boolean> {
  const publicClient = getPublicClient();
  return publicClient.readContract({
    address:      getContractAddress(),
    abi:          autonomousRuleAbi,
    functionName: 'isRuleActive',
    args:         [ruleId],
  }) as Promise<boolean>;
}

export async function getRule(ruleId: bigint): Promise<RuleOnChain> {
  const publicClient = getPublicClient();
  const result = await publicClient.readContract({
    address:      getContractAddress(),
    abi:          autonomousRuleAbi,
    functionName: 'getRule',
    args:         [ruleId],
  });
  // Drizzle returns struct as array tuple: [agentId, owner, triggerHash, actionHash, expiry, executionCount, active]
  const r = result as [bigint, `0x${string}`, `0x${string}`, `0x${string}`, bigint, number, boolean];
  return {
    agentId:        r[0],
    owner:          r[1],
    triggerHash:    r[2],
    actionHash:     r[3],
    expiry:         r[4],
    executionCount: r[5],
    active:         r[6],
  };
}

export async function getRulesByOwner(ownerAddress: `0x${string}`): Promise<bigint[]> {
  const publicClient = getPublicClient();
  return publicClient.readContract({
    address:      getContractAddress(),
    abi:          autonomousRuleAbi,
    functionName: 'getRulesByOwner',
    args:         [ownerAddress],
  }) as Promise<bigint[]>;
}
