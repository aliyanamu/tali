---
title: "On-Chain Rule Consent and Agent Identity for Autonomous DeFi Execution"
slug: "onchain-rule-consent-agent-identity"
date: "2026-06-04"
category: architecture-decisions
tags:
  - solidity
  - mantle
  - erc-8004
  - agent-identity
  - viem
  - tali-cli
  - rule-consent
  - attestation
  - eoa-wallet
  - drizzle
problem_type: "How to implement cryptographic on-chain consent for autonomous agent actions so users authorize scope and each execution is verifiably attested"
component: "contracts / tali-cli rules / backend/src/lib/contracts.ts"
severity: high
related_files:
  - contracts/src/AutonomousRule.sol
  - backend/src/cli/commands/rules.ts
  - backend/src/lib/contracts.ts
  - backend/src/db/schema.ts
  - backend/skills/tali/SKILL.md
summary: "Deployed AutonomousRule.sol on Mantle Sepolia with ERC-8004 agent identity (agentId=114) and wired tali-cli rules commands to NL-parsed setRule/deactivateRule transactions signed by a plain EOA wallet, storing contractRuleId, triggerHash, and actionHash in the rules table."
---

## Root Cause / Design Challenge

Tali's autonomous rules ("whenever USDT comes in, farm 10% yield") were CLI stubs with no on-chain record of user authorization, and no verifiable attestation trail when the agent acted. Without an on-chain anchor, autonomous execution is unverifiable — the user has no cryptographic proof that they consented to what the agent did.

The secondary challenge: the agent needs a signing identity. Privy's server SDK was the original plan, but it requires async API round-trips for every transaction and adds latency + operational complexity for a hackathon timeline.

---

## Solution

### Contract Design

`AutonomousRule.sol` is a minimal hand-rolled Solidity contract deployed on Mantle Sepolia (`0x7f958B9556Be6FA6Ddf876f929FEa36Df077d750`). Key decisions:

**Hash anchoring, not full storage.** The contract stores `triggerHash` and `actionHash` — tight `keccak256` commitments — not the full rule parameters. Full params live in Postgres. This keeps gas low and avoids storing potentially sensitive financial logic on-chain while still providing tamper-evident commitments.

```solidity
// triggerHash = keccak256(abi.encode(tokenAddress, keccak256(direction), threshold))
// actionHash  = keccak256(abi.encode(keccak256(actionType), targetPct, maxSlippageBps))
struct Rule {
    uint256 agentId;        // Mantle-issued ERC-8004 NFT token ID
    address owner;          // wallet that called setRule() — cryptographic consent
    bytes32 triggerHash;
    bytes32 actionHash;
    uint64  expiry;         // unix timestamp; 0 = never expires
    uint32  executionCount;
    bool    active;
}
```

**`attestExecution` is permissionless for the hackathon.** Replay protection comes from `executionHash` deduplication (`mapping(bytes32 => bool) _attestedExecutions`), and rules must be active and non-expired. The production path is to gate the function to the registered `agentWallet` via ERC-8004.

**`ruleId` starts at 1.** Zero is reserved as the "no rule" sentinel.

**Solana tx hash bridging.** Solana signatures are 64-byte ed25519 — too large for `bytes32`. The contract stores `keccak256(toHex(solanaTxSignatureBase58))` as a content-addressed lookup reference; the full signature lives in Postgres `onchainEvents.rawPayload`.

**ERC-8004 agent identity.** Registered as agent #114 on Mantle Sepolia via `cast send` (no contract deployed — Mantle issues the NFT). Every rule stores this `agentId`, linking on-chain rules to Tali's verifiable identity.

### Backend Wiring

`backend/src/lib/contracts.ts` provides the full contract interaction layer using viem:

- **Hash utilities** (`hashTrigger`, `hashAction`, `hashSolanaTx`) replicate the Solidity `keccak256(abi.encode(...))` encoding exactly. The inner string hash uses `toHex(str)` → raw UTF-8 bytes → `keccak256`, matching Solidity's `keccak256(bytes(str))`. The outer hash uses `encodeAbiParameters` with ABI padding (not `encodePacked`) to match Solidity's `abi.encode`.

- **Write functions** (`setRule`, `deactivateRule`, `attestExecution`) use a `WalletClient` backed by `privateKeyToAccount` and await `waitForTransactionReceipt`. `setRule` parses the `RuleSet` event log from the receipt to extract the on-chain `ruleId`.

- **Read functions** use a lazy singleton `PublicClient` to avoid creating a new HTTP transport on every call.

```typescript
function getClients() {
  const account = privateKeyToAccount(env.AGENT_PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  return { publicClient, walletClient, account };
}
```

### CLI Commands

`backend/src/cli/commands/rules.ts` implements three subcommands under `tali-cli rules`:

**`rules add "<nl text>"`** — the full pipeline:
1. Claude (`generateObject` + `ParsedRuleSchema` via Zod) parses the natural language into typed fields: `tokenSymbol`, `direction`, `thresholdRaw`, `actionType`, `targetPct`, `maxSlippageBps`.
2. Resolves the token address from the token registry (switches between testnet/mainnet by `MANTLE_CHAIN_ID`).
3. Shows the parsed rule and prompts for confirmation (`-y` to skip).
4. Computes `triggerHash` and `actionHash`.
5. Calls `contractSetRule()` → Mantle, gets back the on-chain `ruleId`.
6. Persists to Postgres `rules` table with both the `contractRuleId` and the original `nlText`.

**`rules list`** — reads active rules from Postgres, filtered by `AUTONOMOUS_RULE_CONTRACT` so testnet and mainnet rules don't mix. Outputs table or JSON.

**`rules remove <contractRuleId>`** — looks up the DB row, confirms, calls `contractDeactivateRule()` on Mantle, then marks the row `active = false` in Postgres.

### Agent Wallet Decision

Switched from Privy to a plain EOA generated with `cast wallet new`. The private key lives in `AGENT_PRIVATE_KEY` in `.env`. Reasons:
- Privy server SDK requires async API round-trips for every signing operation; viem's `privateKeyToAccount` is synchronous and local.
- For a hackathon CLI tool, the operational simplicity outweighs the custodial risk — there are no mainnet funds on the agent wallet.
- Production path: rotate to hardware wallet or Privy server wallet and gate `attestExecution()` to only accept calls from the registered `agentWallet` on ERC-8004.

**Privy remains for user-owned Tier 2 wallets** (web dashboard, week 2). The split: Privy for user wallets where split-key custody matters; EOA for the agent's own signing identity.

---

## Key Code Examples

**Hash utilities that must match Solidity exactly** (`backend/src/lib/contracts.ts`):
```typescript
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
```

**NL → structured rule via Claude** (`backend/src/cli/commands/rules.ts`):
```typescript
const ParsedRuleSchema = z.object({
  tokenSymbol:    z.enum(['USDT', 'USDC', 'MNT', 'mETH', 'USDY']),
  direction:      z.enum(['IN', 'OUT', 'BOTH']),
  thresholdRaw:   z.string().regex(/^\d+$/),
  actionType:     z.enum(['FARM', 'SWAP', 'DCA']),
  targetPct:      z.number().int().min(1).max(100),
  maxSlippageBps: z.number().int().min(0).max(1000).default(50),
});
```

**`ruleId` extracted from receipt log** (`backend/src/lib/contracts.ts`):
```typescript
for (const log of receipt.logs) {
  const decoded = decodeEventLog({ abi: autonomousRuleAbi, data: log.data, topics: log.topics });
  if (decoded.eventName === 'RuleSet') {
    return (decoded.args as { ruleId: bigint }).ruleId;
  }
}
```

**Dedup guard in `attestExecution`** (`contracts/src/AutonomousRule.sol`):
```solidity
require(!_attestedExecutions[executionHash], "already attested");
_attestedExecutions[executionHash] = true;
rule.executionCount++;
emit RuleExecuted(ruleId, executionHash, rule.executionCount, solanaTxHash, block.timestamp);
```

---

## Pitfalls & Prevention

### 1. Agent Wallet: Prefer viem EOA over Privy for On-Chain Writes

**Pitfall:** The initial design used Privy's server SDK for the agent wallet. This added an async round-trip to Privy's remote signer on every `attestExecution` call and made `cast send` debugging impossible.

**Prevention:** For agent-initiated writes (calls where the user is NOT the signer), use `privateKeyToAccount` + `createWalletClient` directly. Reserve Privy for user-owned Tier 2 wallets where split-key custody matters.

---

### 2. LLM Numeric Output: Strip Formatting Before BigInt Conversion

**Pitfall:** The LLM returns locale-formatted numbers (`"1,000"`, `"1.5M"`) rather than raw integer strings. Passing these to `BigInt()` throws a `SyntaxError` at runtime.

**Prevention:** Apply a Zod `.regex(/^\d+$/)` guard on `thresholdRaw` before it reaches `BigInt()`. Fail loudly with a human-readable message so the user knows to retry with a cleaner phrasing.

```ts
thresholdRaw: z.string().regex(/^\d+$/, "Threshold must be digits only — no commas or decimals"),
```

---

### 3. Rule ID Input: Validate String Before BigInt Conversion in Remove

**Pitfall:** `tali-cli rules remove <id>` accepts a user-supplied string. If the user passes an empty string or a non-numeric value, `BigInt(contractRuleIdStr)` throws before any error handling runs.

**Prevention:** Guard with an explicit check (`if (!/^\d+$/.test(id)) throw ...`) before the `BigInt()` call.

---

### 4. NL Text Length: Cap Input to Prevent Prompt Stuffing

**Pitfall:** The `nl_text` field fed into the LLM parse prompt is user-controlled. A long or adversarially crafted string can dilute the structured extraction prompt.

**Prevention:** Hard-cap `nl_text` at 500 characters at the CLI layer before the Anthropic SDK call. This is a trust boundary — treat it like any other user input.

---

### 5. viem PublicClient: Singleton Pattern, Not Per-Call Construction

**Pitfall:** Constructing a new `createPublicClient` (with `http()` transport) inside each read helper creates a new HTTP connection pool on every invocation.

**Prevention:** Export a lazy singleton initialized once per process:

```ts
let _client: PublicClient | undefined;
export function getPublicClient() {
  return (_client ??= createPublicClient({ chain: mantleTestnet, transport: http(RPC_URL) }));
}
```

---

### 6. Hash Anchors: Off-Chain and On-Chain Encoding Must Match Exactly

**Pitfall:** If the TypeScript encoding (viem) diverges from the Solidity `abi.encode` call — even by parameter order or type — the hashes won't match, breaking dedup and off-chain verification.

**Prevention:** Write a Foundry test that encodes the same params in Solidity and a matching TypeScript test with viem, then assert equality. Run as part of `forge test` so drift is caught immediately. Key distinction: `abi.encode` (padded) ≠ `abi.encodePacked` — use `encodeAbiParameters` on the viem side.

---

### 7. Duplicate Attestation: Handle `AlreadyExecuted` Revert as No-Op

**Pitfall:** If the agent retries `attestExecution` after a timeout, the second call reverts with `AlreadyExecuted`. Treating this as a hard agent failure is wrong — the first call succeeded.

**Prevention:** Catch the `AlreadyExecuted` revert specifically and log it as a no-op. Optionally add a pre-flight `isExecuted(executionHash)` read for idempotency guarantees.

---

## Best Practices Going Forward

- **Contract upgrade path:** `AutonomousRule.sol` is not upgradeable. Deploy a new contract version for new rule types; update `AUTONOMOUS_RULE_CONTRACT` in env. Never mutate hash encoding of a deployed contract.
- **Event indexing discipline:** Keep high-cardinality dedup keys like `executionHash` indexed in events. This makes Goldsky Mirror filters cheap.
- **Agent identity:** agentId=114 is on Mantle Sepolia. If the agent EOA rotates, re-register on the identity contract before deploying new rules.
- **LLM parse reliability:** Wrap Zod parse in `.safeParse()` and surface errors with a rephrasing prompt rather than crashing.
- **Environment separation:** Never reuse testnet contract addresses in mainnet config.

---

## Testing Checklist

### Smart Contract (`forge test`)

- [ ] `setRule` stores rule and emits `RuleSet` with correct `ruleId`, `triggerHash`, `actionHash`
- [ ] `deactivateRule` sets `active = false`; subsequent reads reflect deactivation
- [ ] `attestExecution` succeeds on first call, reverts with `AlreadyExecuted` on second identical call
- [ ] `attestExecution` reverts if called by non-agent address (production: after gating)
- [ ] `deactivateRule` reverts if called by non-owner
- [ ] `triggerHash` and `actionHash` match off-chain viem encoding for the same inputs (cross-language hash parity test)
- [ ] `executionHash` dedup survives across multiple distinct rule executions

### CLI (`tali-cli rules`)

- [ ] `rules add` with valid NL text creates on-chain rule and prints `ruleId`
- [ ] `rules add` with `nl_text` > 500 chars is rejected before LLM call
- [ ] `rules add` with LLM-returned threshold containing commas caught by Zod guard
- [ ] `rules list` returns all active rules for the configured wallet
- [ ] `rules remove <id>` with valid numeric ID deactivates rule on-chain
- [ ] `rules remove` with non-numeric ID fails before BigInt conversion with a human-readable error
- [ ] `rules remove` with non-owned ID surfaces contract revert message, not a crash

### Agent Execution Path

- [ ] `attestExecution` called by agent EOA succeeds and emits `RuleExecuted` with indexed `executionHash`
- [ ] Retry of `attestExecution` with same params is caught and logged as no-op
- [ ] Goldsky webhook receives `RuleExecuted` event and parses `executionHash` from indexed topics
- [ ] PublicClient singleton: single HTTP connection pool across multiple reads in same process

### Integration

- [ ] End-to-end: add rule → trigger condition met → agent calls `attestExecution` → event in `events` table
- [ ] ERC-8004 agent identity (agentId=114) resolves on Mantle Sepolia explorer
- [ ] Contract verified on Mantle Sepolia explorer at `0x7f958B9556Be6FA6Ddf876f929FEa36Df077d750`

---

## Related Documentation

- [`docs/solutions/dual-ingestion-testnet-poller.md`](dual-ingestion-testnet-poller.md) — viem `eth_getLogs` poller pattern on Mantle; same `PublicClient` pattern used in `tali-cli rules`
- [`docs/solutions/integration-issues/native-mnt-transfer-detection-goldsky-viem.md`](integration-issues/native-mnt-transfer-detection-goldsky-viem.md) — Mantle `block.timestamp` skew (±15s), directly relevant to `expiry` field in `AutonomousRule.sol`; note: `RuleExecuted` events also write to `events` table via the same ingestion service
- [`docs/solutions/database-issues/drizzle-schema-restructure-and-migration-collapse.md`](database-issues/drizzle-schema-restructure-and-migration-collapse.md) — covers the `rules` table Drizzle migration conventions
- [`plans/features/feat-contracts/brainstorm.md`](../../plans/features/feat-contracts/brainstorm.md) — full design record, including ERC-8004 rationale and permissionless `attestExecution` hackathon shortcut
- [`plans/features/feat-contracts/plan.md`](../../plans/features/feat-contracts/plan.md) — implementation plan with Foundry test scenarios and ERC-8004 registration walkthrough
