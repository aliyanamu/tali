# Week 2 milestone — Polish + Agent
**Target:** 2026-06-08

Contracts deployed on Mantle Sepolia. Rule setup flow wired end-to-end. Web dashboard scaffold live.

## Done criteria for the week
- [x] `AutonomousRule.sol` written, tested, deployed + verified on Mantle Sepolia
- [x] ERC-8004 agent identity — registered (agentId=114 on Mantle Sepolia); Mantle issues NFT, we don't deploy the contract
- [x] Rule setup flow: NL → LLM parse → confirmation → `setRule()` via viem WalletClient
- [ ] Onchain trigger → rule match → `byreal-cli` execution → `attestExecution()` on Mantle
- [ ] Web dashboard on Vercel — Privy auth, net-worth screen, activity feed
- [ ] Bank CSV/screenshot import (Claude OCR, bulk insert) — _if time allows_

## Features

| Slug | Status | Notes |
|---|---|---|
| autonomous-rule-contract | ✅ done | AutonomousRule.sol deployed + verified Mantle Sepolia `0x7f958B95...` |
| erc8004-nft | ✅ done (differently) | Mantle's registry; registered as agent #114 via `cast send` |
| rule-setup-flow | ✅ done | `tali-cli rules add/list/remove` → on-chain via viem WalletClient |
| [rule-execution](features/rule-execution.md) | 🔲 not started | Onchain event → rule match → byreal-cli → attestExecution() |
| [web-dashboard](features/web-dashboard.md) | 🔲 not started | Next.js + Privy, Vercel deploy |
| [bank-import](features/bank-import.md) | 🔲 not started | CSV + screenshot OCR via Claude — if time allows |
