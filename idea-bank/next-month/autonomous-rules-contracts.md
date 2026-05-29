# Autonomous rules engine + on-chain contracts

**Added:** 2026-05-29

## AutonomousRule.sol (Mantle)
Smart contract storing rule configs and executing constrained actions on behalf of the user. User pre-authorizes once; agent invokes `executeRule()` thereafter. Emits attestation events for on-chain benchmarking.

## ERC-8004 NFT (Mantle)
Agent identity NFT minted at first rule activation. Records every agent action as on-chain reputation. Required by the Mantle Turing Test Hackathon for the "on-chain benchmarking of AI" track feature.

## Rules engine (tali-cli)
Natural language rule setup: "when USDT balance > 100, farm yield on Byreal." NL parser extracts trigger + action → confirmation → Privy signature → contract call. Byreal (`byreal-cli`) executes the DeFi side.

## What's needed to build this:
- Foundry project in `contracts/`
- `AutonomousRule.sol` + ERC-8004 NFT Solidity contracts
- Deploy to Mantle Sepolia, then Mainnet
- Wire `tali-cli rules add` → NL parse → Privy sign → contract call
- Goldsky event listener for rule trigger matching
