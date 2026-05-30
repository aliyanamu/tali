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
- [x] ✅ Alchemy account → `ALCHEMY_MANTLE_RPC`
- [~] ~~CoinGecko Demo API key → `COINGECKO_API_KEY` — not needed, using free tier (no key required)~~
- [~] ~~Goldsky account + webhook secret → `GOLDSKY_WEBHOOK_SECRET` — replaced by Alchemy Webhooks (same Alchemy account)~~
- [x] ✅ Anthropic API key → `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`

**byreal-cli OpenClaw agent**
- [x] ✅ `npm install -g @byreal-io/byreal-cli`
- [x] ✅ `byreal-cli setup` — Solana wallet configured (`FkSMcD6rMnCaBtHPtqsa6HKRFkwknVsELHhXmGUr1tT7`)
- [x] ~~`npx skills add byreal-git/byreal-agent-skills` — skill installed in Claude~~ N/A: Claude calls byreal-cli via execSync in executor.ts; skills installer targets Cursor/Cline/etc., not Claude Code
- [x] ✅ Smoke test: `byreal-cli pools list` returns live data
- [x] ✅ Smoke test: `byreal-cli wallet balance` shows Solana balance

**tali-cli**
- [x] ✅ `tali-cli networth --wallet <address>` — tested live on Mantle Sepolia; returns MNT balance + IDR total
- [x] ✅ `tali-cli` available globally via `pnpm link --global` (dev wrapper using local tsx)
- [ ] 🟡 `tali-cli skill` — SKILL.md registration ready; smoke-test after install
- [ ] 🔲 Token addresses in `tokens.ts` verified on mantlescan.xyz
- [ ] 🔲 Alchemy Webhook configured (Transfer events on Mantle for user wallet) — do after webhook server + wallet address are ready
- [ ] 🔲 Alchemy webhook server receiving real events end-to-end

## Features

| Slug | Status | Notes |
|---|---|---|
| tali-cli | ✅ done | `networth` tested live; `log`/`rules`/`wallet` stubs |
| byreal-cli setup | ✅ done | wallet configured, skill installed, pools list live |
| alchemy-webhook | 🔲 not started | Alchemy Webhook for Mantle Transfer events (replaces Goldsky for hackathon) |
