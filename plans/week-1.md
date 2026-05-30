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
- [ ] 🔲 `npx skills add byreal-git/byreal-agent-skills` — skill installed in Claude
- [ ] 🔲 Smoke test: `byreal-cli pools list` returns live data
- [x] ✅ Smoke test: `byreal-cli wallet balance` shows Solana balance

**tali-cli**
- [ ] 🟡 `tali-cli networth --wallet <address>` — code written; needs Alchemy + CoinGecko keys to test live
- [ ] 🟡 `tali-cli skill` — SKILL.md registration ready; smoke-test after install
- [ ] 🔲 Token addresses in `tokens.ts` verified on mantlescan.xyz
- [ ] 🔲 Alchemy Webhook configured (Transfer events on Mantle for user wallet) — do after webhook server + wallet address are ready
- [ ] 🔲 Alchemy webhook server receiving real events end-to-end

## Features

| Slug | Status | Notes |
|---|---|---|
| tali-cli | 🟡 code written | `networth` functional, `log`/`rules`/`wallet` stubs |
| byreal-cli setup | 🟡 in progress | wallet configured; skill install + pools smoke test remaining |
| alchemy-webhook | 🔲 not started | Alchemy Webhook for Mantle Transfer events (replaces Goldsky for hackathon) |
