# Plan: feat/contracts — AutonomousRule.sol on Mantle

**Date:** 2026-06-04  
**Branch:** `feat/contracts`  
**Type:** feat  
**Brainstorm:** `plans/features/feat-contracts/brainstorm.md`

---

## Overview

Deploy `AutonomousRule.sol` on Mantle Sepolia (testnet now) and Mantle Mainnet (week 3). Wire the backend to call `setRule()` and `attestExecution()` via viem + Privy server wallet. Implement `tali-cli rules add/remove/list`.

**We deploy one contract.** Mantle issues the ERC-8004 agent identity NFT automatically to registered hackathon agents — we do not deploy `AgentIdentityNFT.sol`.

---

## Problem Statement

Rules ("whenever USDT comes in, farm 10% yield") are currently stubs in `tali-cli`. There is no on-chain record of a user authorizing autonomous execution, and no attestation trail when the agent acts. Without this, Tali's autonomous actions are unverifiable.

---

## Proposed Solution

`AutonomousRule.sol` is a minimal, hand-rolled Solidity contract that:
1. Stores rules as hash-anchored structs — `triggerHash` + `actionHash` are the integrity anchors; full params live in Postgres
2. Emits `RuleSet` when a user authorizes a rule (cryptographic consent via wallet signature)
3. Emits `RuleExecuted` when the agent attests a completed DeFi action

The Mantle-issued ERC-8004 `agentId` is stored in every rule, linking on-chain rules to Tali's verifiable agent identity.

---

## Technical Approach

### Architecture

```
tali-cli rules add "..."
    → backend NL parser extracts (token, direction, threshold, actionType, pct, slippage)
    → backend computes triggerHash + actionHash
    → backend calls setRule() via Privy server WalletClient → Mantle
    → RuleSet event emitted
    → ruleId saved to Postgres (rules table, to be added)

byreal-cli executes DeFi on Solana
    → backend calls attestExecution(ruleId, executionHash, solanaTxHash) → Mantle
    → RuleExecuted event emitted
    → written to onchainEvents table (kind="rule_attested", direction="neutral")
```

### Contract Design Decisions

**Hash encoding conventions (must match between contract and backend):**
```
triggerHash = keccak256(abi.encode(
    tokenAddress,    // address — e.g. USDT on Mantle
    direction,       // bytes32 — keccak256("IN") | keccak256("OUT") | keccak256("BOTH")
    threshold        // uint256 — minimum amount in raw units; 0 = any amount
))

actionHash = keccak256(abi.encode(
    actionType,      // bytes32 — keccak256("FARM") | keccak256("SWAP") | keccak256("DCA")
    targetPct,       // uint256 — e.g. 10 = 10%
    maxSlippage      // uint256 — basis points; e.g. 50 = 0.5%
))
```

**solanaTxHash convention:** Solana tx signatures are 64-byte ed25519 — too large for `bytes32`. Store `keccak256(abi.encodePacked(solanaTxSignatureBase58String))` as `bytes32`. Full signature is in Postgres `onchainEvents.rawPayload`. This is a content-addressed reference, not a verifiable hash.

**Who signs setRule():** `owner = msg.sender`. For CLI (Phase 1-5): Privy server wallet is the caller. For web dashboard (week 2): user's browser wallet signs directly — this is when `msg.sender` truly equals the user's personal wallet, giving full cryptographic consent. Document this distinction.

**Permissionless attestation:** `attestExecution()` has no caller restriction (hackathon simplification). Protected by: (1) rule must be active and non-expired, (2) `executionHash` deduplication prevents replays.

**agentId validation:** Not validated against Mantle's ERC-8004 registry (we don't have the contract address at dev time). Hackathon limitation — document with `// TODO: validate agentId against Mantle ERC-8004 registry in production`.

**ruleId:** Auto-increment counter starting at 1 (`_nextRuleId = 1`). Zero is reserved as "no rule" sentinel.

---

### Implementation Phases

#### Phase 1: Contract — `contracts/src/AutonomousRule.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AutonomousRule
/// @notice Stores user-authorized autonomous financial rules. Emits attestations
///         when the Tali agent executes a DeFi action on behalf of the rule owner.
///         agentId references a Mantle-issued ERC-8004 identity NFT.
contract AutonomousRule {
    struct Rule {
        uint256 agentId;        // Mantle-issued ERC-8004 NFT token ID
        address owner;          // wallet that called setRule() — cryptographic consent
        bytes32 triggerHash;    // keccak256(abi.encode(tokenAddress, direction, threshold))
        bytes32 actionHash;     // keccak256(abi.encode(actionType, targetPct, maxSlippage))
        uint64  expiry;         // unix timestamp; 0 = never expires
        uint32  executionCount;
        bool    active;
    }

    uint256 private _nextRuleId = 1; // 0 reserved as sentinel

    mapping(uint256 => Rule)         private _rules;
    mapping(address => uint256[])    private _ownerRules;
    mapping(bytes32 => bool)         private _attestedExecutions; // dedup by executionHash

    event RuleSet(
        uint256 indexed ruleId,
        uint256 indexed agentId,
        address indexed owner,
        bytes32 triggerHash,
        bytes32 actionHash,
        uint64  expiry
    );
    event RuleDeactivated(uint256 indexed ruleId, address indexed owner);
    event RuleExecuted(
        uint256 indexed ruleId,
        uint32  executionCount,
        bytes32 executionHash,
        bytes32 solanaTxHash, // keccak256(solanaTxSignatureBase58)
        uint256 timestamp
    );

    function setRule(
        uint256 agentId,
        bytes32 triggerHash,
        bytes32 actionHash,
        uint64  expiry
    ) external returns (uint256 ruleId) {
        require(expiry == 0 || expiry > block.timestamp, "expiry must be future");
        // TODO: validate agentId against Mantle ERC-8004 registry in production
        ruleId = _nextRuleId++;
        _rules[ruleId] = Rule({
            agentId:        agentId,
            owner:          msg.sender,
            triggerHash:    triggerHash,
            actionHash:     actionHash,
            expiry:         expiry,
            executionCount: 0,
            active:         true
        });
        _ownerRules[msg.sender].push(ruleId);
        emit RuleSet(ruleId, agentId, msg.sender, triggerHash, actionHash, expiry);
    }

    function deactivateRule(uint256 ruleId) external {
        Rule storage rule = _rules[ruleId];
        require(rule.owner == msg.sender, "not owner");
        require(rule.active, "already inactive");
        rule.active = false;
        emit RuleDeactivated(ruleId, msg.sender);
    }

    function attestExecution(
        uint256 ruleId,
        bytes32 executionHash,
        bytes32 solanaTxHash
    ) external {
        Rule storage rule = _rules[ruleId];
        require(rule.active, "rule not active");
        require(rule.expiry == 0 || rule.expiry > block.timestamp, "rule expired");
        require(!_attestedExecutions[executionHash], "already attested");
        _attestedExecutions[executionHash] = true;
        rule.executionCount++;
        emit RuleExecuted(ruleId, rule.executionCount, executionHash, solanaTxHash, block.timestamp);
    }

    /// @notice Returns true if rule exists, is active, and has not expired.
    ///         Uses block.timestamp (Mantle validators may skew ±15s — use generous expiry windows).
    function isRuleActive(uint256 ruleId) external view returns (bool) {
        Rule storage rule = _rules[ruleId];
        return rule.active && (rule.expiry == 0 || rule.expiry > block.timestamp);
    }

    function getRule(uint256 ruleId) external view returns (Rule memory) {
        return _rules[ruleId];
    }

    /// @notice Returns all rule IDs ever created by owner (including inactive/expired).
    ///         Unbounded — safe for single-user hackathon demo; paginate before production.
    function getRulesByOwner(address owner) external view returns (uint256[] memory) {
        return _ownerRules[owner];
    }
}
```

**Files to create:**
- `contracts/src/AutonomousRule.sol`

---

#### Phase 2: Tests — `contracts/test/AutonomousRule.t.sol`

**Test scenarios (in order):**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AutonomousRule} from "../src/AutonomousRule.sol";

contract AutonomousRuleTest is Test {
    AutonomousRule public rule;
    address public user    = address(0x1);
    address public stranger = address(0x2);

    uint256 constant AGENT_ID = 1; // placeholder; replace with real Mantle-issued ID at mainnet deploy

    // keccak256(abi.encode(USDT_ADDRESS, keccak256("IN"), uint256(0)))
    bytes32 constant TRIGGER_HASH = keccak256(abi.encode(
        address(0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE), // USDT Mantle Sepolia
        keccak256("IN"),
        uint256(0)
    ));
    // keccak256(abi.encode(keccak256("FARM"), uint256(10), uint256(50)))
    bytes32 constant ACTION_HASH = keccak256(abi.encode(
        keccak256("FARM"),
        uint256(10),
        uint256(50)
    ));

    function setUp() public {
        rule = new AutonomousRule();
    }

    // T1: setRule happy path
    function test_setRule_storesRuleAndEmitsEvent() public {
        vm.prank(user);
        vm.expectEmit(true, true, true, true);
        emit AutonomousRule.RuleSet(1, AGENT_ID, user, TRIGGER_HASH, ACTION_HASH, 0);
        uint256 ruleId = rule.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);
        assertEq(ruleId, 1);
        assertTrue(rule.isRuleActive(ruleId));
        AutonomousRule.Rule memory r = rule.getRule(ruleId);
        assertEq(r.owner, user);
        assertEq(r.agentId, AGENT_ID);
        assertEq(r.executionCount, 0);
    }

    // T2: deactivateRule — only owner
    function test_deactivateRule_ownerSucceeds() public {
        vm.prank(user);
        uint256 ruleId = rule.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);
        vm.prank(user);
        rule.deactivateRule(ruleId);
        assertFalse(rule.isRuleActive(ruleId));
    }

    function test_deactivateRule_strangerReverts() public {
        vm.prank(user);
        uint256 ruleId = rule.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);
        vm.prank(stranger);
        vm.expectRevert("not owner");
        rule.deactivateRule(ruleId);
    }

    // T3: attestExecution — happy path
    function test_attestExecution_emitsAndIncrementsCount() public {
        vm.prank(user);
        uint256 ruleId = rule.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);
        bytes32 execHash = keccak256("exec1");
        bytes32 solHash  = keccak256("solanaTxSig1");
        rule.attestExecution(ruleId, execHash, solHash);
        assertEq(rule.getRule(ruleId).executionCount, 1);
    }

    // T4: attestExecution on inactive rule reverts
    function test_attestExecution_inactiveRuleReverts() public {
        vm.prank(user);
        uint256 ruleId = rule.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);
        vm.prank(user);
        rule.deactivateRule(ruleId);
        vm.expectRevert("rule not active");
        rule.attestExecution(ruleId, keccak256("exec"), keccak256("sol"));
    }

    // T5: expiry — isRuleActive returns false after timestamp
    function test_expiry_ruleBecomesInactive() public {
        uint64 expiry = uint64(block.timestamp + 100);
        vm.prank(user);
        uint256 ruleId = rule.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, expiry);
        assertTrue(rule.isRuleActive(ruleId));
        vm.warp(block.timestamp + 101);
        assertFalse(rule.isRuleActive(ruleId));
    }

    // T6: attestExecution on expired rule reverts
    function test_attestExecution_expiredRuleReverts() public {
        uint64 expiry = uint64(block.timestamp + 100);
        vm.prank(user);
        uint256 ruleId = rule.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, expiry);
        vm.warp(block.timestamp + 101);
        vm.expectRevert("rule expired");
        rule.attestExecution(ruleId, keccak256("exec"), keccak256("sol"));
    }

    // T7: duplicate attestation reverts
    function test_attestExecution_duplicateReverts() public {
        vm.prank(user);
        uint256 ruleId = rule.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);
        bytes32 execHash = keccak256("exec1");
        rule.attestExecution(ruleId, execHash, keccak256("sol1"));
        vm.expectRevert("already attested");
        rule.attestExecution(ruleId, execHash, keccak256("sol2"));
    }

    // T8: getRulesByOwner returns correct IDs
    function test_getRulesByOwner_multipleRules() public {
        vm.startPrank(user);
        uint256 id1 = rule.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);
        uint256 id2 = rule.setRule(AGENT_ID, keccak256("other-trigger"), ACTION_HASH, 0);
        vm.stopPrank();
        uint256[] memory ids = rule.getRulesByOwner(user);
        assertEq(ids.length, 2);
        assertEq(ids[0], id1);
        assertEq(ids[1], id2);
    }

    // T9: setRule with past expiry reverts
    function test_setRule_pastExpiryReverts() public {
        vm.warp(1000);
        vm.prank(user);
        vm.expectRevert("expiry must be future");
        rule.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, uint64(999));
    }

    // T10: ruleId starts at 1
    function test_ruleId_startsAtOne() public {
        vm.prank(user);
        uint256 ruleId = rule.setRule(AGENT_ID, TRIGGER_HASH, ACTION_HASH, 0);
        assertEq(ruleId, 1);
    }
}
```

**Files to create:**
- `contracts/test/AutonomousRule.t.sol`

**Run tests:**
```bash
cd contracts && forge test -vvv
```

---

#### Phase 3: Deploy Script — `contracts/script/DeployAutonomousRule.s.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AutonomousRule} from "../src/AutonomousRule.sol";

contract DeployAutonomousRule is Script {
    function run() external {
        vm.startBroadcast();
        AutonomousRule autonomousRule = new AutonomousRule();
        console.log("AutonomousRule deployed at:", address(autonomousRule));
        vm.stopBroadcast();
    }
}
```

**Deploy to Mantle Sepolia:**
```bash
cd contracts
forge script script/DeployAutonomousRule.s.sol \
  --rpc-url mantle_sepolia \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url https://sepolia.mantlescan.xyz/api
```

**After deploy:** Copy the deployed address into `backend/.env`:
```
AUTONOMOUS_RULE_CONTRACT=0x...
```

**Files to create:**
- `contracts/script/DeployAutonomousRule.s.sol`

**foundry.toml** — add `mantle_sepolia` RPC alias if not present:
```toml
[rpc_endpoints]
mantle_sepolia = "https://rpc.sepolia.mantle.xyz"
mantle_mainnet = "https://rpc.mantle.xyz"
```

---

#### Phase 4: Backend — Contract helpers

**`backend/src/lib/contracts.ts`** — new file

```typescript
import { keccak256, toHex, encodeAbiParameters, parseAbiParameters } from 'viem';

// ABI is sourced from contracts/out/AutonomousRule.sol/AutonomousRule.json (forge build output)
// Copy to backend/abi/AutonomousRule.json after each forge build
// Requires tsconfig "resolveJsonModule": true
import autonomousRuleAbi from '../../abi/AutonomousRule.json' assert { type: 'json' };

export type TriggerDirection = 'IN' | 'OUT' | 'BOTH';
export type ActionType = 'FARM' | 'SWAP' | 'DCA';

// toHex(str) converts UTF-8 string → 0x-prefixed hex bytes.
// keccak256(toHex('IN')) === keccak256(abi.encodePacked("IN")) in Solidity. Must match exactly.

/** Computes triggerHash — must match Solidity: keccak256(abi.encode(tokenAddress, keccak256("IN"|"OUT"|"BOTH"), threshold)) */
export function hashTrigger(tokenAddress: `0x${string}`, direction: TriggerDirection, threshold: bigint): `0x${string}` {
  return keccak256(encodeAbiParameters(
    parseAbiParameters('address, bytes32, uint256'),
    [tokenAddress, keccak256(toHex(direction)), threshold]
  ));
}

/** Computes actionHash — must match Solidity: keccak256(abi.encode(keccak256("FARM"|...), targetPct, maxSlippage)) */
export function hashAction(actionType: ActionType, targetPct: bigint, maxSlippageBps: bigint): `0x${string}` {
  return keccak256(encodeAbiParameters(
    parseAbiParameters('bytes32, uint256, uint256'),
    [keccak256(toHex(actionType)), targetPct, maxSlippageBps]
  ));
}

/**
 * Computes solanaTxHash for on-chain storage.
 * Solana tx signatures are 64-byte ed25519 — too large for bytes32.
 * Store keccak256(toHex(sig)) as a 32-byte content-addressed reference. Full sig in Postgres.
 */
export function hashSolanaTx(solanaTxSignature: string): `0x${string}` {
  return keccak256(toHex(solanaTxSignature));
}

// NOTE (production): agentAddress should be a dedicated Privy embedded wallet registered
// via setAgentWallet() on Mantle's ERC-8004 Identity Registry. Steps:
//   1. Create a dedicated Privy server wallet for the agent (separate from user wallets)
//   2. Store AGENT_PRIVY_WALLET_ID in env (never expose private key)
//   3. Use Privy SDK to sign txs — key never leaves Privy's split-key infrastructure
//   4. Register the wallet address via setAgentWallet() on Mantle's ERC-8004 contract
//   5. Gate attestExecution() to only accept calls from this registered agentWallet
// For hackathon: attestExecution() is permissionless; server wallet is the caller for all ops.
```

**`backend/src/lib/env.ts`** — add these vars to the Zod schema:
```typescript
AUTONOMOUS_RULE_CONTRACT: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
AGENT_PRIVY_ID:           z.string().optional(), // Privy wallet ID for the agent server wallet
AGENT_WALLET_ADDRESS:     z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(), // derived from AGENT_PRIVY_ID
```

**`backend/abi/`** — new directory; copy `contracts/out/AutonomousRule.sol/AutonomousRule.json` here after `forge build`.

**Files to create/modify:**
- `backend/src/lib/contracts.ts` (new)
- `backend/abi/AutonomousRule.json` (copied from forge build output)
- `backend/src/lib/chain.ts` — add `createMantleWalletClient(rpcUrl, privateKey)` alongside existing `createMantleClient`

---

#### Phase 5: CLI — `backend/src/cli/commands/rules.ts`

Replace all `notImplemented()` stubs.

**`rules add "<nl text>"`:**
```typescript
// Flow:
// 1. Send nlText to LLM (backend/src/lib/llm.ts) with a structured extraction prompt
//    → extract { tokenAddress, direction, threshold, actionType, targetPct, maxSlippage }
// 2. Print parsed rule for user confirmation: "Add rule: when USDT (any amount) comes IN → FARM 10% (max 0.5% slippage). Confirm? [y/N]"
// 3. On confirm:
//    a. hashTrigger(tokenAddress, direction, threshold)
//    b. hashAction(actionType, targetPct, maxSlippage)
//    c. Call AutonomousRule.setRule(agentId, triggerHash, actionHash, expiry=0)
//    d. Wait for tx receipt
//    e. Parse RuleSet event → extract ruleId
//    f. Save to DB: rules table (to be added to schema.ts)
//    g. Print: "Rule #7 created. tx: 0x..."
// 4. On LLM parse failure: print "Could not parse rule. Try: 'when USDT comes in, farm 10% yield'"

// DB: add `rules` table to schema.ts:
// id (uuid), userId, ruleId (uint256 from contract), agentId, nlText,
// triggerHash, actionHash, active, createdAt, contractAddress
```

**`rules remove <ruleId>`:**
```typescript
// 1. Look up rule in DB by ruleId
// 2. Call AutonomousRule.deactivateRule(ruleId)
// 3. Wait for receipt
// 4. Mark rule inactive in DB
// 5. Print: "Rule #7 deactivated. tx: 0x..."
```

**`rules list`:**
```typescript
// 1. Query DB for active rules for current user
// 2. Print: contractRuleId, nlText, createdAt — no on-chain read needed (DB is source of truth for list)
```

**Files to modify:**
- `backend/src/cli/commands/rules.ts`
- `backend/src/db/schema.ts` — add `rules` table

**New `rules` table schema:**
```typescript
export const rules = pgTable('rules', {
  id:              uuid('id').defaultRandom().primaryKey(),
  userId:          uuid('user_id').notNull().references(() => users.id),
  contractRuleId:  bigint('contract_rule_id', { mode: 'bigint' }).notNull(),
  agentId:         bigint('agent_id', { mode: 'bigint' }).notNull(),
  nlText:          text('nl_text').notNull(),
  triggerHash:     varchar('trigger_hash', { length: 66 }).notNull(),
  actionHash:      varchar('action_hash', { length: 66 }).notNull(),
  contractAddress: varchar('contract_address', { length: 42 }).notNull(),
  active:          boolean('active').notNull().default(true),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  expiresAt:       timestamp('expires_at'), // null = never
}, (t) => ({
  uniqueContractRule: uniqueIndex('rules_contract_rule_idx').on(t.contractAddress, t.contractRuleId),
}));
```

---

## Acceptance Criteria

### Functional

- [ ] `forge test -vvv` passes all 10 test cases with 0 failures
- [ ] `DeployAutonomousRule.s.sol` deploys successfully to Mantle Sepolia; address logged and verifiable on `https://sepolia.mantlescan.xyz`
- [ ] Contract source verified on Mantle Sepolia explorer
- [ ] `tali-cli rules add "when USDT comes in, farm 10% yield"` → prints parsed rule, prompts confirm, sends tx, prints ruleId + tx hash
- [ ] `tali-cli rules list` → shows active rules with nlText and executionCount
- [ ] `tali-cli rules remove <ruleId>` → sends deactivateRule tx, marks inactive
- [ ] `attestExecution()` called twice with same `executionHash` → second call reverts

### Non-Functional

- [ ] No OpenZeppelin dependency added (maintain hand-rolled style)
- [ ] Contract compiles cleanly with `forge build` (no warnings)
- [ ] ABI JSON copied to `backend/abi/AutonomousRule.json` and importable
- [ ] `AUTONOMOUS_RULE_CONTRACT` env var populated in `.env` after deploy
- [ ] `contracts/broadcast/DeployAutonomousRule.s.sol/5003/` broadcast artifact committed

### Out of Scope (this branch)

- `attestExecution()` called from rule-execution flow → `feat/rule-execution`
- Web dashboard `setRule()` with user's own browser wallet → `feat/web-dashboard`
- Mainnet deploy → week 3
- agentAddress gating on `attestExecution()` → production hardening, post-hackathon
- Mantle ERC-8004 `agentId` real value → swap in at mainnet deploy time

---

## ERC-8004 Agent Registration (Pre-Deploy Step)

### Why

`AutonomousRule.sol` stores an `agentId` (uint256) in every rule, linking rules to Tali's verifiable on-chain identity. This `agentId` is the ERC-721 token ID minted when you call `register()` on Mantle's deployed ERC-8004 Identity Registry. Without it, the `agentId` field is just a placeholder and the attestation trail has no verifiable anchor.

**We do not deploy the ERC-8004 contract.** Mantle deployed it on both testnet and mainnet. We call `register()` on their contract.

### Contract addresses

| Network | Chain ID | Identity Registry |
|---|---|---|
| Mantle Sepolia testnet | 5003 | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Mantle mainnet | 5000 | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |

### What `register()` takes — the agent card

`register(agentURI)` mints an ERC-721 NFT and stores a URI pointing to a JSON metadata file called an **agent card**. The card describes who Tali is, what it does, and its service endpoints. Format is `registration-v1` per [ERC-8004 spec](https://eips.ethereum.org/EIPS/eip-8004).

Agent card lives at: `agent-card.json` in repo root. Raw URL (branch):
```
https://raw.githubusercontent.com/aliyanamu/tali/feat/contracts/agent-card.json
```
After merge to main, update to the `main` branch URL and call `setAgentURI()` on the registry to update the pointer.

**Key fields in the agent card:**
- `type` — must be `"https://eips.ethereum.org/EIPS/eip-8004#registration-v1"`
- `name` / `description` — Tali's identity
- `services` — array of `{ name, endpoint }` objects: `"web"` (GitHub) and `"MCP"` (tali-cli + byreal-cli skills)
- `registrations` — filled in after calling `register()` with the returned `agentId` and registry address
- `active: true`

### How to register (testnet)

```bash
# Requires cast (part of Foundry) + agent wallet private key
cast send 0x8004A818BFB912233c491871b3d84c89A494BD9e \
  "register(string)(uint256)" \
  "https://raw.githubusercontent.com/aliyanamu/tali/feat/contracts/agent-card.json" \
  --rpc-url https://rpc.sepolia.mantle.xyz \
  --private-key <AGENT_WALLET_PRIVATE_KEY>
```

The `Registered(agentId, agentURI, owner)` event in the tx receipt contains your `agentId`.

**After registration:**
1. Update `agent-card.json` → fill `registrations[0].agentId` with the real value → commit + push
2. Set `AGENT_ERC8004_ID=<agentId>` in `backend/.env`
3. Call `setAgentURI()` on the registry if the agent card URL changes (e.g. after merging to `main`)

### How to register (mainnet — week 3)

Same flow, different contract address and RPC:
```bash
cast send 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 \
  "register(string)(uint256)" \
  "https://raw.githubusercontent.com/aliyanamu/tali/main/agent-card.json" \
  --rpc-url https://rpc.mantle.xyz \
  --private-key <AGENT_WALLET_PRIVATE_KEY>
```

Update `registrations[1].agentId` in agent-card.json and swap `AGENT_ERC8004_ID` in `.env`.

---

## Dependencies & Risks

| Item | Notes |
|---|---|
| `forge-std` in `contracts/lib/` | Already present (MockERC20 uses it); no new dependency |
| Privy server SDK WalletClient | `backend/src/lib/chain.ts` needs WalletClient addition |
| LLM NL parser for rules | Use `backend/src/lib/llm.ts`; structured JSON output via tool_use |
| Mantle Sepolia faucet | Need testnet MNT for deploy gas + rule-setting txs |
| `AUTONOMOUS_RULE_CONTRACT` in env | Must be set before backend contract calls will work |
| Real `agentId` from Mantle | Use `1` as placeholder; replace at mainnet deploy |
| `forge verify-contract` on Mantle | Mantle Sepolia uses Blockscout, not Etherscan — different `--verifier` flags |

---

## Risk Analysis

**Viem WalletClient + Privy server wallet:** Use `AGENT_PRIVY_ID` (Privy wallet ID) + `AGENT_WALLET_ADDRESS` (its EVM address) in `.env`. At runtime, the backend calls Privy server SDK to sign txs using `AGENT_PRIVY_ID` — the private key never leaves Privy. `AGENT_WALLET_ADDRESS` is used for the `from` field and as the `owner` of rules set via CLI. No raw private key in env.

**LLM parsing reliability:** NL → `(tokenAddress, direction, threshold, actionType, pct, slippage)` extraction can fail on ambiguous input. Mitigate: strict JSON schema in tool_use call; user confirmation step before any tx; clear error message with example input.

**Mantle Sepolia RPC flakiness:** Public RPC `https://rpc.sepolia.mantle.xyz` can be slow. Already mitigated by `MANTLE_TESTNET_RPC` env var — point to Alchemy Mantle Sepolia if public RPC is unreliable.

---

## File Checklist

### New files
- `agent-card.json` — ERC-8004 agent identity metadata (registration-v1 format)
- `contracts/src/AutonomousRule.sol`
- `contracts/test/AutonomousRule.t.sol`
- `contracts/script/DeployAutonomousRule.s.sol`
- `backend/abi/AutonomousRule.json` (copied post-forge-build)
- `backend/src/lib/contracts.ts`

### Modified files
- `contracts/foundry.toml` — add `[rpc_endpoints]` section
- `backend/src/lib/chain.ts` — add `createMantleWalletClient`
- `backend/src/lib/env.ts` — ensure `AUTONOMOUS_RULE_CONTRACT` is validated
- `backend/src/db/schema.ts` — add `rules` table
- `backend/src/cli/commands/rules.ts` — implement add / remove / list

### Generated (do not hand-edit)
- `backend/drizzle/` — new migration for `rules` table (run `pnpm db:generate` then rename)
- `contracts/out/AutonomousRule.sol/AutonomousRule.json` — forge build output
- `contracts/broadcast/DeployAutonomousRule.s.sol/5003/run-latest.json` — deploy artifact

---

## Build Order

1. Write + compile `AutonomousRule.sol` → `forge build`
2. Write + run `AutonomousRule.t.sol` → `forge test -vvv`
3. Create `agent-card.json` → push to GitHub → register on Mantle Sepolia via `cast send` → save `agentId`
4. Set `AGENT_ERC8004_ID=<agentId>` in `.env`
5. Write `DeployAutonomousRule.s.sol` → deploy to Sepolia → copy address to env
6. `forge build` → copy ABI → `backend/abi/AutonomousRule.json`
7. Add `rules` table to schema → migration → `pnpm db:migrate`
8. Write `contracts.ts` helpers → `chain.ts` WalletClient
9. Implement `rules.ts` CLI commands
10. End-to-end test: `tali-cli rules add "..."` → confirm tx on Sepolia explorer

---

## References

- `contracts/src/MockERC20.sol` — established Solidity style (hand-rolled, no OZ, inline require)
- `contracts/script/DeployMockTokens.s.sol` — deploy script pattern (vm.startBroadcast, console.log)
- `backend/src/db/schema.ts:107-141` — `onchainEvents` table fields for attestation writes
- `backend/src/lib/chain.ts` — existing PublicClient factory to extend
- `backend/src/lib/env.ts:29-30` — `AUTONOMOUS_RULE_CONTRACT`, `ERC8004_NFT_CONTRACT` stubs
- `plans/features/feat-contracts/brainstorm.md` — all design decisions
- [ERC-8004 EIP spec](https://eips.ethereum.org/EIPS/eip-8004)
- [Mantle ERC-8004 deployment announcement](https://chainwire.org/2026/02/16/mantle-unlocks-autonomous-economy-with-erc-8004-deployment/)
