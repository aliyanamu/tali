/**
 * Contract interaction helpers for AutonomousRule.sol on Mantle.
 *
 * Write calls: encodeFunctionData → Privy sendTransactionFromWallet → waitForTransactionReceipt
 * Read calls:  publicClient.readContract
 *
 * NOTE (production — agentAddress):
 *   For the hackathon, attestExecution() is permissionless. In production:
 *   1. Create a dedicated Privy server wallet (AGENT_PRIVY_ID / AGENT_WALLET_ADDRESS in env)
 *   2. Register it via setAgentWallet() on Mantle's ERC-8004 Identity Registry
 *   3. Gate attestExecution() to only accept calls from that registered agentWallet
 *   The AGENT_PRIVY_ID env var is the hook for this — it's the Privy wallet used to sign all
 *   contract calls from the backend. Key never leaves Privy's split-key infrastructure.
 */

import { encodeFunctionData, keccak256, toHex, encodeAbiParameters, parseAbiParameters, decodeEventLog } from 'viem';
import type { Log } from 'viem';
import { env } from './env.js';
import { createMantlePublicClient } from './chain.js';
import { sendTransactionFromWallet } from '../wallet/privy.js';
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

function getAgentPrivyId(): string {
  if (!env.AGENT_PRIVY_ID) throw new Error('AGENT_PRIVY_ID not set in env');
  return env.AGENT_PRIVY_ID;
}

function getPublicClient() {
  const rpcUrl = env.MANTLE_TESTNET_RPC ?? env.MANTLE_ALCHEMY_RPC;
  return createMantlePublicClient(rpcUrl, env.MANTLE_CHAIN_ID);
}

// ── Hash utilities ─────────────────────────────────────────────
// Must match Solidity encoding exactly:
//   triggerHash = keccak256(abi.encode(tokenAddress, keccak256("IN"|"OUT"|"BOTH"), threshold))
//   actionHash  = keccak256(abi.encode(keccak256("FARM"|"SWAP"|"DCA"), targetPct, maxSlippageBps))
// toHex(str) → 0x-prefixed UTF-8 bytes, matching Solidity's keccak256(abi.encodePacked(str))

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
  const agentPrivyId    = getAgentPrivyId();
  const publicClient    = getPublicClient();

  const data = encodeFunctionData({
    abi:          autonomousRuleAbi,
    functionName: 'setRule',
    args:         [params.agentId, params.triggerHash, params.actionHash, params.expiry],
  });

  const { hash } = await sendTransactionFromWallet({
    walletId: agentPrivyId,
    to:       contractAddress,
    data,
    chainId:  env.MANTLE_CHAIN_ID,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

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
  const agentPrivyId    = getAgentPrivyId();
  const publicClient    = getPublicClient();

  const data = encodeFunctionData({
    abi:          autonomousRuleAbi,
    functionName: 'deactivateRule',
    args:         [ruleId],
  });

  const { hash } = await sendTransactionFromWallet({
    walletId: agentPrivyId,
    to:       contractAddress,
    data,
    chainId:  env.MANTLE_CHAIN_ID,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Calls AutonomousRule.attestExecution() on Mantle.
 * executionHash: keccak256 of execution details (ruleId + tokens + amounts + timestamp)
 * solanaTxHash:  use hashSolanaTx(solanaTxSignature) — keccak256 reference, full sig in Postgres
 */
export async function attestExecution(params: {
  ruleId:        bigint;
  executionHash: `0x${string}`;
  solanaTxHash:  `0x${string}`;
}): Promise<`0x${string}`> {
  const contractAddress = getContractAddress();
  const agentPrivyId    = getAgentPrivyId();
  const publicClient    = getPublicClient();

  const data = encodeFunctionData({
    abi:          autonomousRuleAbi,
    functionName: 'attestExecution',
    args:         [params.ruleId, params.executionHash, params.solanaTxHash],
  });

  const { hash } = await sendTransactionFromWallet({
    walletId: agentPrivyId,
    to:       contractAddress,
    data,
    chainId:  env.MANTLE_CHAIN_ID,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
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
