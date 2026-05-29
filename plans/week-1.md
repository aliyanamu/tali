# Week 1 milestone — Visibility
**Target:** 2026-05-31

Mufidah can open Tali, see her net worth in IDR, and log a P2P trade from a single sentence.

## Status key
- 🔲 not started
- 🟡 code written, not tested
- ✅ tested live

## Done criteria for the week

**Services to set up first (blockers for everything below)**
- [ ] 🔲 Telegram bot created via @BotFather → `TELEGRAM_BOT_TOKEN`
- [ ] 🔲 Local Postgres running + `pnpm db:migrate` passes
- [ ] 🔲 Privy account + app created → `PRIVY_APP_ID`, `PRIVY_APP_SECRET`
- [ ] 🔲 Alchemy account → `ALCHEMY_MANTLE_RPC`
- [ ] 🔲 CoinGecko Demo API key → `COINGECKO_API_KEY`
- [ ] 🔲 Goldsky account + webhook secret → `GOLDSKY_WEBHOOK_SECRET`

**Features**
- [ ] 🟡 `/start` — code written; needs Privy + Postgres to test
- [ ] 🟡 `/networth` — code written; needs Alchemy + CoinGecko + Postgres to test
- [ ] 🟡 Goldsky webhook handler — code written; needs Goldsky pipeline deployed to receive real events
- [ ] 🟡 `tali-cli networth <address>` — code written; needs Alchemy + CoinGecko keys to test
- [ ] 🟡 `tali-cli wallet watch/list` — code written; needs Postgres to test
- [ ] 🟡 `tali-cli skill` / `tali-cli catalog list` — SKILL.md registration ready; smoke-test after `npm install -g`
- [ ] 🟡 `tali-cli log` / `tali-cli rules` — stubs written (reply "coming soon"); verify stubs respond correctly
- [ ] 🔲 `/log` — NL parser recognizes `log_p2p_trade` intent, creates two-sided ledger event
- [ ] 🔲 Auto-link: Goldsky-detected USDT outflow matched to a P2P trade log within a time window
- [ ] 🔲 `add_watched_wallet` — user can register a Tier-1 address via chat
- [ ] 🔲 Goldsky Mirror pipeline deployed (Transfer events for USDT/USDC/mETH/USDY on Mantle)
- [ ] 🔲 Token addresses in `tokens.ts` verified on mantlescan.xyz

## Features

| Slug | Status | Notes |
|---|---|---|
| tali-cli | 🟡 code written | RealClaw skill registration + `networth`, `wallet`, `log` stub, `rules` stub |
| [p2p-log](features/p2p-log.md) | not started | Core differentiator — two-sided event |
| [nl-parser](features/nl-parser.md) | not started | Claude intent classification + slot extraction |
| [goldsky-pipeline](features/goldsky-pipeline.md) | not started | Pipeline YAML + deploy |
| [watched-wallet](features/watched-wallet.md) | not started | `add_watched_wallet` intent handler |
