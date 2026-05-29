# Week 2 milestone — Polish + Agent
**Target:** 2026-06-08

Reconciliation works. Bank CSV/OCR import works. Contracts are deployed on Sepolia. Web dashboard scaffold is live.

## Done criteria for the week
- [ ] Reconciliation suggestions — same-day match prompts, orphan deposit nudges, confirm flow
- [ ] Bank CSV/screenshot import via Telegram — Claude OCR, bulk insert, orphan review
- [ ] Web dashboard on Vercel — Privy auth, net-worth screen, activity feed
- [ ] `AutonomousRule.sol` written, tested, deployed to Mantle Sepolia
- [ ] ERC-8004 NFT contract written, tested, deployed to Sepolia
- [ ] Rule setup flow wired: NL → confirmation → Privy signature → `setRule()` → NFT mint

## Features

| Slug | Status | Notes |
|---|---|---|
| [reconciliation](features/reconciliation.md) | not started | Match suggestions + confirm flow |
| [bank-import](features/bank-import.md) | not started | CSV + screenshot OCR via Claude |
| [web-dashboard](features/web-dashboard.md) | not started | Next.js + Privy, Vercel deploy |
| [autonomous-rule-contract](features/autonomous-rule-contract.md) | not started | AutonomousRule.sol + Foundry tests |
| [erc8004-nft](features/erc8004-nft.md) | not started | Agent identity NFT |
| [rule-setup-flow](features/rule-setup-flow.md) | not started | End-to-end `set_rule` intent → contract |
