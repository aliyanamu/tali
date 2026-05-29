# Objectives

## North star

**Mufidah opens Tali every day, and her financial life makes more sense because of it.**

## What Tali is right now

An OpenClaw agent skill bundle. Two skills, one Claude agent brain:

| Skill | Does |
|---|---|
| `tali-cli` | Personal finance — IDR net worth across Mantle wallets |
| `byreal-cli` | DeFi execution — yield, DCA, swaps on Byreal/Solana |

## What's built

- `tali-cli networth --wallet <address>` — live Mantle balances + IDR total via CoinGecko
- `byreal-cli` — full DeFi execution on Byreal/Solana (install: `npm install -g @byreal-io/byreal-cli`)
- Goldsky webhook server — HMAC-verified, ingests onchain events into unified ledger
- Unified event ledger schema (`users`, `events`, `watchedWallets`) — Drizzle + Postgres

## What's not built yet

Parked in `idea-bank/next-month/`: P2P reconciliation, autonomous rules + contracts, web dashboard.

## Decision principles

1. **Ship > perfect.** One working thing beats three half-finished ones.
2. **Honest scope > overclaiming.** Under-promise, over-deliver.
3. **No pivots until 2026-06-15.** New ideas go to `idea-bank/`, not active scope.
