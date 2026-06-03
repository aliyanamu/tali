# Brainstorm: Tali On-Chain Contracts (feat/contracts)

**Date:** 2026-06-04  
**Branch:** `feat/contracts`  
**Status:** Ready for planning

---

## What We're Building

**One** Solidity contract deployed on Mantle Sepolia (testnet) and Mantle Mainnet (prod):

1. **`AutonomousRule.sol`** — stores rules as hash-anchored structs; user signs `setRule()` with their wallet as cryptographic consent for autonomous execution; agent calls `attestExecution()` after each DeFi action.

**`AgentIdentityNFT.sol` is NOT deployed by us.** Per DoraHacks organizer (2026-05-21): *"You do not need to deploy your own ERC-8004. Every participating AI agent is issued a unique identity NFT via the ERC-8004 agent identity standard by Mantle."* Mantle issues the agent ID NFT as part of hackathon registration. We receive an `agentId` (uint256) and store it — we do not mint or manage the contract.

**Action required before deployment:** Register Tali as an agent in the Mantle ecosystem to receive our ERC-8004 `agentId`. Check official hackathon registration docs for the exact step.

---

## Why On-Chain (Value Proposition)

| Benefit | What it means for Tali |
|---|---|
| **Cryptographic consent** | User's wallet signature on `setRule()` IS the authorization for autonomous action — no "trust the server" |
| **Agent accountability** | Every DeFi action attested on Mantle; anyone can audit the agent's track record |
| **Composability** | Other contracts can query `isRuleActive(ruleId)` or look up the ERC-8004 agent identity |
| **Non-repudiability** | Neither user nor agent can deny a rule was set or an action was taken |

---

## ERC-8004 Standard (Real Spec — Mantle-Issued)

ERC-8004 went live on Ethereum mainnet 2026-01-29, Mantle deployed 2026-02-16. It defines three registries:

- **Identity Registry** — ERC-721 + URIStorage. `register()`, `setAgentURI()`, `setAgentWallet()`, `setMetadata(agentId, key, value)`, `getMetadata()`.
- **Reputation Registry** — third-party feedback. Not useful for self-attestation. **Skip.**
- **Validation Registry** — external validators. Overkill. **Skip.**

**We do not deploy any of these.** Mantle deploys and manages the ERC-8004 Identity Registry. We receive an `agentId` from them. Our `AutonomousRule.sol` stores this `agentId` in every rule as a reference.

**Open question:** Can we call `setMetadata()` on Mantle's deployed Identity Registry to record `totalActions`? Or is it write-locked to the agent owner only? This affects whether attestation metadata lands on the ERC-8004 NFT or stays in `RuleExecuted` events only. **To be confirmed during registration.**

---

## Key Decisions

### 1. Rule struct — tight hashes

```solidity
struct Rule {
    uint256 agentId;        // ERC-8004 NFT token ID (not an address)
    address owner;          // user wallet — signed setRule()
    bytes32 triggerHash;    // keccak256(abi.encode(tokenAddress, direction, threshold))
    bytes32 actionHash;     // keccak256(abi.encode(actionType, targetPct, maxSlippage))
    uint64  expiry;         // unix timestamp; 0 = never expires
    uint32  executionCount;
    bool    active;
}
```

Full NL rule text and params live in Postgres. The hashes are the on-chain integrity anchors — prove off-chain params were not tampered with.

**What goes in triggerHash:** `(tokenAddress, direction [IN|OUT|BOTH], thresholdAmount)`  
**What goes in actionHash:** `(actionType [FARM|SWAP|DCA], targetPct, maxSlippage)`

### 2. `attestExecution()` lives in `AutonomousRule.sol`

Rule lifecycle is self-contained: set → active → executed. Agent calls `attestExecution(ruleId, executionHash, solanaTxHash)` which emits `RuleExecuted` and increments `executionCount`. No cross-contract call needed.

Agent also calls `AgentIdentityNFT.recordAction(agentId, ruleId)` separately — no coupling between the two contracts.

### 3. Permissionless `attestExecution()` (hackathon)

For now, any caller can call `attestExecution()`. The `solanaTxHash` provides real-world integrity — if you didn't execute on Solana, you have no valid hash to record.

**Production note — agentAddress authorization (not building now):**
- Add `mapping(uint256 ruleId => address authorizedAgent) agents` to `AutonomousRule.sol`
- Agent address stored in the ERC-8004 `setAgentWallet(agentId, agentAddress, deadline, sig)` — rotatable via signature, recorded on-chain
- For Tali: the agent wallet is a Privy server-managed embedded wallet. Production path:
  1. Create a dedicated Privy embedded wallet for the agent (separate from the user wallet)
  2. Register it via `setAgentWallet()` on the ERC-8004 identity contract
  3. Store `agentWalletAddress` in env + Postgres; never expose private key outside Privy SDK
  4. Only this address can call `attestExecution()` on rules it's authorized for
  5. Future: hardware wallet or Safe multisig for the agent address for extra security

### 4. Rule ↔ ERC-8004 NFT linkage

Rules store `agentId` (uint256, the Mantle-issued NFT token ID), not an address. This means:
- Rules are anchored to Tali's verifiable agent identity
- Frontend can query all rules for a given `agentId`
- Judges and auditors can look up the agent on Mantle's explorer and see `AutonomousRule` events referencing it

---

## Contract Interface Sketch

```solidity
// AutonomousRule.sol — the ONLY contract we deploy
function setRule(uint256 agentId, bytes32 triggerHash, bytes32 actionHash, uint64 expiry)
    external returns (uint256 ruleId);

function deactivateRule(uint256 ruleId) external; // only owner

function attestExecution(uint256 ruleId, bytes32 executionHash, bytes32 solanaTxHash)
    external; // permissionless (hackathon); gate by agentWallet in production

function isRuleActive(uint256 ruleId) external view returns (bool);
function getRule(uint256 ruleId) external view returns (Rule memory);
function getRulesByOwner(address owner) external view returns (uint256[] memory);

// Events
event RuleSet(uint256 indexed ruleId, uint256 indexed agentId, address indexed owner, bytes32 triggerHash, bytes32 actionHash, uint64 expiry);
event RuleDeactivated(uint256 indexed ruleId, address indexed owner);
event RuleExecuted(uint256 indexed ruleId, bytes32 executionHash, bytes32 solanaTxHash, uint256 timestamp);
```

---

## Foundry Test Scenarios (Priority Order)

1. `setRule()` happy path — rule stored, `RuleSet` event emitted, `isRuleActive()` returns true
2. `deactivateRule()` — only owner can deactivate; stranger reverts
3. `attestExecution()` — stores execution hash, emits `RuleExecuted`, increments `executionCount`
4. `attestExecution()` on inactive rule — should revert
5. Expiry: `isRuleActive()` returns false after `expiry` timestamp passes
8. `getRulesByOwner()` — returns correct rule IDs across multiple rules

---

## Mantle-Specific Considerations

- **Block time ~1.2s** — `expiry` as unix timestamp (not block number) is correct; block-based expiry would drift
- **Gas** — Mantle uses MNT for gas; no special precompiles needed for this contract surface
- **Chain IDs** — testnet 5003, mainnet 5000; Foundry scripts should use `--chain-id` flag
- **Verification** — `forge verify-contract` targets `https://explorer.sepolia.mantle.xyz` (testnet) and `https://mantlescan.xyz` (mainnet)
- **solc 0.8.20** — already set in `contracts/foundry.toml`; compatible with all interfaces above

---

## What Stays Off-Chain

| Data | Why not on-chain |
|---|---|
| NL rule text ("whenever USDT comes in...") | Storage cost; hash is the anchor |
| Full trigger/action params | Same — reconstruct from Postgres, hash verifies integrity |
| Solana position state | Different chain; solanaTxHash is the reference |
| Rule execution history detail | `onchainEvents` table in Postgres is the indexed copy |
| Price data at execution time | Not needed on-chain |

---

## Open Questions (Resolved)

- ✅ attestExecution placement → `AutonomousRule.sol`
- ✅ ERC-8004 → real spec, implement Identity Registry only (skip Reputation + Validation)
- ✅ Rule struct → tight hashes, `agentId` (not address)
- ✅ agentAddress → permissionless for hackathon; production path documented above
- ✅ Foundry tests → 8 scenarios listed above
- ✅ Mantle considerations → unix expiry, MNT gas, chain IDs noted

---

## Pre-Deployment Action Required

Before deploying to Mantle Mainnet, register Tali as an agent in the Mantle ecosystem to receive the ERC-8004 `agentId`. Refer to the official hackathon event announcement for the registration link and steps. The `agentId` becomes the value hardcoded in `AUTONOMOUS_RULE_CONTRACT` env and referenced in every `setRule()` call.

## Out of Scope (This Feature)

- ERC-8004 contract deployment (Mantle provides it)
- Reputation Registry / Validation Registry
- Rule marketplace / social rules
- ZK proofs of Solana execution
- Backend viem WalletClient wiring → that's `feat/rule-setup-flow`
