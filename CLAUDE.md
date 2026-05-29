# CLAUDE.md — Tali project context for Claude Code

## What this is

Tali is an autonomous financial agent for Southeast Asian users who live across two financial systems: Indonesian bank accounts and onchain crypto wallets. Hackathon project for Mantle Turing Test Hackathon 2026 (Phase 2 "AI Awakening"). Deadline 2026-06-15 15:59.

**Branch: `feat/openclaw-integration`** — Tali as an OpenClaw skill bundle. No Telegram bot. No RealClaw dependency. Tali's `tali-cli` handles personal finance; `byreal-cli` (Byreal Agent Skills) handles DeFi execution on Solana/Byreal. Claude is the agent brain.

## Architecture: why we dropped RealClaw and the Telegram bot

**The logical error in the earlier design:**
- We assumed Tali's server could call RealClaw to trigger DeFi strategies.
- Reality: RealClaw has no external REST API or webhook. It works by taking over a Telegram bot token — RealClaw *becomes* your bot. There is no programmatic bridge from Tali's server to RealClaw.
- Additionally, registering a bot token with RealClaw means RealClaw controls that bot's webhook. A separate grammY server cannot share the same token.
- Conclusion: RealClaw cannot be called from Tali's backend. The integration was architecturally impossible as designed.

**The correct model:**
- Tali hosts Byreal Agent Skills (`byreal-cli`) directly — no RealClaw middleman.
- `byreal-cli` calls `https://api2.byreal.io` REST API and signs Solana transactions locally.
- Tali's `tali-cli` is an OpenClaw skill for personal finance.
- Claude (the LLM) is the agent brain — it uses both `tali-cli` and `byreal-cli` as tools.
- No Telegram bot needed; the OpenClaw skill interface is the product.

## Repo layout

- `backend/` — all backend TypeScript: Goldsky webhook server + tali-cli + Drizzle ORM
  - `backend/src/cli/` — `tali-cli` OpenClaw skill: `networth`, `log`, `rules`, `wallet`
  - `backend/src/webhook/` — Goldsky HMAC-verified webhook handler (Hono)
  - `backend/src/db/schema.ts` — unified event ledger schema (`users`, `events`, `watchedWallets`)
  - `backend/src/lib/` — chain (viem/Mantle), prices (CoinGecko/IDR), tokens, env, logger
  - `backend/src/wallet/privy.ts` — wallet creation + tx signing via Privy server SDK
  - `backend/drizzle/` — generated SQL migrations (run via `pnpm db:migrate`)
  - `backend/skills/tali/SKILL.md` — OpenClaw skill registration (LLM routing + install instructions)
- `docs/` — architecture + objectives (current state only)
- `idea-bank/` — future ideas; not active scope

## Key conventions

- **TypeScript** for all backend + web code, strict mode
- **Foundry** for contracts, Solidity 0.8.x
- **Privy** for Tier 2 wallet management — never store private keys or seed phrases
- **viem** for Mantle chain interaction
- **Commander** for `tali-cli` CLI structure
- **byreal-cli** (`@byreal-io/byreal-cli`) for all DeFi execution on Byreal/Solana
- **Postgres** for state; events flow through a single unified ledger schema
- No Telegram bot in this branch
- No RealClaw in this branch

## Architecture summary (read full version in `docs/architecture.md`)

- **Two-skill model:** `tali-cli` (personal finance) + `byreal-cli` (DeFi execution). Claude orchestrates both.
- **Two-tier wallet:** watched (read-only, Mantle/Solana) / Tali wallet (Privy, user-signed).
- **Mantle** for wallet balances and IDR net worth. **Solana** for DeFi execution via `byreal-cli`.
- **Goldsky Mirror** pushes real-time onchain events to Tali's webhook server. No polling.

## What Tali does now

- `tali-cli networth --wallet <address>` — live Mantle balances + IDR total
- `byreal-cli` — DeFi execution on Byreal/Solana
- Goldsky webhook server — real-time onchain event ingestion

## Track positioning

- Primary: **Agentic Economy Path B (RealClaw Real-Life Expansion)** — Tali extends Byreal's DeFi agent into real-life financial management
- Category: **Personal CFO Agent** (explicitly listed under Encouraged Directions B)
- Locked-in: 20 Project Deployment Award

## Strict rules

1. **Pivot parking lot is active.** New ideas go into `idea-bank/` with a date, not active scope.
2. **Don't suggest features beyond what's built** unless explicitly asked.
3. **Never write to watched wallets.** MetaMask/Phantom are Tier 1, read-only.
4. **Solana DeFi execution goes through `byreal-cli` only.**
5. **Real-time event delivery is via Goldsky Mirror webhooks, NOT polling.**
6. **Wallets are non-custodial.** Privy split-key. We never hold keys.

## Running locally

- Install: `pnpm install` (from repo root)
- Install byreal-cli: `npm install -g @byreal-io/byreal-cli && byreal-cli setup`
- Copy env: `cp backend/.env.example backend/.env` → fill in keys
- DB migrate: `pnpm db:migrate`
- Webhook server: `pnpm dev:backend`
- CLI dev: `pnpm --filter @tali/backend dev:cli`

### Required env vars (see `backend/.env.example`)

`PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `ALCHEMY_API_KEY`, `ALCHEMY_MANTLE_RPC`, `GOLDSKY_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `COINGECKO_API_KEY`, `DATABASE_URL`

## Current build state (as of 2026-05-29)

- `tali-cli networth` — functional; queries Mantle balances + IDR total
- `tali-cli log` / `rules` / `wallet` — stubs
- Goldsky webhook server — HMAC-verified, writes events to unified ledger
- DB schema — `users`, `events`, `watchedWallets`; migrations generated

## Plans folder — compound-engineering cycle

`plans/` follows the compound-engineering workflow: **brainstorm → plan → work → review → compound**.

```
plans/
  week-1.md              ← current milestone
  week-2.md
  week-3.md
  features/<slug>.md     ← one file per feature
docs/
  solutions/<slug>.md    ← /compound output after a feature ships
```

| Step | Where | Skill |
|---|---|---|
| brainstorm | `plans/features/<slug>.md` § Brainstorm | `/brainstorm` |
| plan | `plans/features/<slug>.md` § Plan | `/plan` |
| work | git commits | `/work` |
| review | PR diff | `/review` |
| compound | `docs/solutions/<slug>.md` | `/compound` |

## Pre-commit checklist

- Run linter / typecheck
- Don't commit `.env`, secrets, private keys, or seed phrases
- Don't bypass git hooks unless explicitly asked
- Conventional commit messages (feat:, fix:, chore:, docs:)
