# Week 2 milestone — Polish + Agent
**Target:** 2026-06-08

Contracts deployed on Mantle Sepolia. Rule setup flow wired end-to-end. Web dashboard scaffold live.

## Done criteria for the week
- [ ] `AutonomousRule.sol` written, tested, deployed to Mantle Sepolia
- [ ] ERC-8004 NFT contract written, tested, deployed to Mantle Sepolia
- [ ] Rule setup flow: NL → confirmation → Privy signature → `setRule()` → NFT mint
- [ ] Goldsky webhook → rule match → `byreal-cli` execution → attestation event
- [ ] Web dashboard on Vercel — Privy auth, net-worth screen, activity feed
- [ ] Bank CSV/screenshot import (Claude OCR, bulk insert) — _if time allows_

## Features

| Slug | Status | Notes |
|---|---|---|
| [autonomous-rule-contract](features/autonomous-rule-contract.md) | 🔲 not started | AutonomousRule.sol + Foundry tests on Mantle |
| [erc8004-nft](features/erc8004-nft.md) | 🔲 not started | Agent identity NFT on Mantle |
| [rule-setup-flow](features/rule-setup-flow.md) | 🔲 not started | End-to-end `rules add` → contract |
| [rule-execution](features/rule-execution.md) | 🔲 not started | Goldsky event → byreal-cli execute → attest |
| [web-dashboard](features/web-dashboard.md) | 🔲 not started | Next.js + Privy, Vercel deploy |
| [bank-import](features/bank-import.md) | 🔲 not started | CSV + screenshot OCR via Claude — if time allows |
