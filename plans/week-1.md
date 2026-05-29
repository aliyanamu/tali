# Week 1 milestone — Visibility
**Target:** 2026-05-31

Mufidah can run `tali-cli networth` and see her IDR net worth, and a `byreal-cli` OpenClaw agent is running DeFi on Byreal.

## Status key
- 🔲 not started
- 🟡 code written, not tested
- ✅ tested live

## Done criteria for the week

**Services to set up first (blockers for everything below)**
- [x] ✅ Local Postgres running + `pnpm db:migrate` passes
- [ ] 🔲 Privy account + app created → `PRIVY_APP_ID`, `PRIVY_APP_SECRET`
- [ ] 🔲 Alchemy account → `ALCHEMY_MANTLE_RPC`
- [~] ~~CoinGecko Demo API key → `COINGECKO_API_KEY` — not needed, using free tier (no key required)~~
- [ ] 🔲 Goldsky account + webhook secret → `GOLDSKY_WEBHOOK_SECRET`
- [ ] 🔲 Anthropic API key → `ANTHROPIC_API_KEY`

**byreal-cli OpenClaw agent**
- [ ] 🔲 `npm install -g @byreal-io/byreal-cli`
- [ ] 🔲 `byreal-cli setup` — Solana wallet configured
- [ ] 🔲 `npx skills add byreal-git/byreal-agent-skills` — skill installed in Claude
- [ ] 🔲 Smoke test: `byreal-cli pools list` returns live data
- [ ] 🔲 Smoke test: `byreal-cli wallet balance` shows Solana balance

**tali-cli**
- [ ] 🟡 `tali-cli networth --wallet <address>` — code written; needs Alchemy + CoinGecko keys to test live
- [ ] 🟡 `tali-cli skill` — SKILL.md registration ready; smoke-test after install
- [ ] 🔲 Token addresses in `tokens.ts` verified on mantlescan.xyz
- [ ] 🔲 Goldsky Mirror pipeline deployed (Transfer events on Mantle for user wallet)
- [ ] 🔲 Goldsky webhook server receiving real events end-to-end

## Features

| Slug | Status | Notes |
|---|---|---|
| tali-cli | 🟡 code written | `networth` functional, `log`/`rules`/`wallet` stubs |
| byreal-cli setup | 🔲 not started | 3-step Byreal agent setup |
| [goldsky-pipeline](features/goldsky-pipeline.md) | 🔲 not started | Pipeline YAML + deploy on Mantle |
