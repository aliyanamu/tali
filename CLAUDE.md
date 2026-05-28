# CLAUDE.md — Tali project context for Claude Code

## What this is

Tali is an autonomous financial agent for Southeast Asian users who live across two financial systems: Indonesian bank accounts and onchain crypto wallets. Hackathon project for Mantle Turing Test Hackathon 2026 (Phase 2 "AI Awakening"). Deadline 2026-06-15 15:59.

**Branch: `feat/realclaw-integration`** — RealClaw is the automation engine. The OpenClaw skill surface (`tali-cli`) has been removed. Tali's Telegram bot is the user-facing layer; RealClaw handles all DeFi automation (yield, DCA, swaps) via Byreal on Solana. See `feat/openclaw-integration` for the standalone skill version.

## Repo layout

- `backend/` — all backend TypeScript: Telegram bot + Goldsky webhook server + Drizzle ORM
  - `backend/src/bot/` — Telegram commands (`/start`, `/networth`; `/log` and `/rules` are stubs)
  - `backend/src/webhook/` — Goldsky HMAC-verified webhook handler (Hono)
  - `backend/src/db/schema.ts` — unified event ledger schema (`users`, `events`, `watchedWallets`)
  - `backend/src/lib/` — chain (viem), prices (CoinGecko/IDR), tokens (Solana registry), env, logger
  - `backend/src/wallet/privy.ts` — wallet creation + tx signing via Privy server SDK
  - `backend/src/realclaw/` — **[TODO]** RealClaw integration: trigger strategies, poll status, receive events
  - `backend/drizzle/` — generated SQL migrations (run via `pnpm db:migrate`)
  - ~~`backend/src/cli/`~~ — removed; standalone skill lives on `feat/openclaw-integration`
  - ~~`backend/skills/`~~ — removed; OpenClaw registration not needed when RealClaw is the agent
- `contracts/` — **week 2, not yet created** — will hold Foundry project: `AutonomousRule.sol` + ERC-8004 NFT (Solana)
- `web/` — **week 2, not yet created** — will hold Next.js desktop dashboard (Privy auth)
- `docs/` — architecture, workflow, objectives, intents (NL parser contract)
- `design/` — conversation-flow wireframes (`telegram/`) and web-app design prompts (`web-app/`)
- `idea-bank/` — scoped future ideas by timeline (`next-month/`, `later/`); not active scope
- `plans/` — implementation plans following the compound-engineering cycle (see below)

## Key conventions

- **TypeScript** for all backend + web code, strict mode
- **Foundry** for contracts, Solidity 0.8.x
- **Privy** for all wallet management — never store private keys or seed phrases anywhere
- **viem** for chain interaction, not ethers
- **grammY** for Telegram bot surface
- **RealClaw** — the automation engine; Tali's bot talks to RealClaw to trigger DeFi strategies (yield, DCA, swaps) via Byreal on Solana
- **Postgres** for state; events flow through a single unified ledger schema
- No OpenClaw skill surface in this branch — RealClaw is the agent, Tali is the personal finance data layer

## Architecture summary (read full version in `docs/architecture.md`)

- **RealClaw is the automation engine.** User sets up DeFi strategies (SteadyClaw/yield, TradFiClaw/tokenized stocks, SniperClaw/DCA) via RealClaw. Tali's bot surfaces personal finance context (net worth, P2P log, bank data) alongside RealClaw's DeFi execution.
- **Two-tier wallet model:** watched (read-only) / Tali wallet (Privy, shared with RealClaw's non-custodial model). No AutonomousRule.sol in this branch — RealClaw handles pre-authorized automation natively.
- **Solana primary chain.** All DeFi execution via Byreal on Solana. Read-only watch of EVM wallets (MetaMask) via Goldsky.
- **Tali's job:** personal finance data layer — unified ledger, IDR net worth, P2P trade log, bank import, reconciliation. RealClaw's job: DeFi execution.

## The three core problems Tali solves

1. **P2P reconciliation** ← hero feature. When Mufidah sells USDT via P2P, both sides (USDT outflow onchain + IDR inflow to bank) link as one event in the unified ledger. No other product models this problem.
2. **Unified visibility** — Solana wallets + bank accounts (BCA, GoPay, cash) in one IDR net worth view.
3. **Autonomous agency** — plain-language rules trigger RealClaw DeFi strategies on Solana; agent acts while user sleeps.

## Track positioning (don't drift from this)

- Primary: **Agentic Economy Path B (RealClaw Real-Life Expansion)**
- Stretch: AI×RWA + Grand Champion
- Locked-in: 20 Project Deployment Award

## Strict rules

1. **Pivot parking lot is active.** Any new project idea or major reframe goes into `idea-bank/` with a date. It does NOT trigger a re-lock discussion.
2. **Don't suggest features beyond MVP scope** unless explicitly asked. Out-of-scope items go to v1.5/v2 mention in submission, not into the build.
3. **Never write to user's existing MetaMask or Phantom.** Those are watched (Tier 1, read-only) — no signing path exists.
4. **Solana execution goes through RealClaw only.** Tali never signs Solana transactions directly. All Byreal actions (yield, DCA, swaps) are triggered by Tali's bot calling RealClaw, which handles Solana signing via its own Privy non-custodial model.
5. **Real-time event delivery is via Goldsky Mirror webhooks, NOT Alchemy WebSocket.** Push-based delivery is a deliberate architectural choice.
6. **Wallets are non-custodial.** Privy split-key. We never hold keys or fund custody.

## Running locally

- Install: `pnpm install` (from repo root)
- Copy env: `cp backend/.env.example backend/.env` → fill in keys
- DB migrate: `pnpm db:migrate`
- Backend dev (bot + webhook server): `pnpm dev:backend`
- Web dev: `pnpm dev:web` — **web/ not yet created, week 2**
- Contracts: `cd contracts && forge build` / `forge test` — **contracts/ not yet created, week 2**

### Required env vars (see `backend/.env.example`)

`TELEGRAM_BOT_TOKEN`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `ALCHEMY_RPC`, `GOLDSKY_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `COINGECKO_API_KEY`, `DATABASE_URL`

## Current build state (as of 2026-05-28, week 1 scaffold)

**Built — code written, not yet tested against live services:**
- `/start` — code complete; needs Privy account + Postgres running to test
- `/networth` — code complete; needs Alchemy + CoinGecko API key + Postgres to test
- Goldsky webhook — code complete; needs Goldsky account + deployed pipeline to receive events
- DB schema — `users`, `events` (unified ledger), `watchedWallets`; migrations generated but not run against a real DB yet
- Bilingual (EN/ID) copy in `/start` and `/networth`

**Not yet built (week 2+):**
- `/log` — P2P reconciliation flow (stub)
- `/rules` — autonomous rules engine (stub)
- `backend/src/realclaw/` — RealClaw integration (stub directory placeholder)
- `AutonomousRule.sol` + ERC-8004 NFT contracts (Foundry, Solana)
- NL intent parser (Claude) — not wired yet
- Web dashboard (Next.js)
- Self-sovereign encrypted storage

## Plans folder — compound-engineering cycle

`plans/` follows the compound-engineering workflow: **brainstorm → plan → work → review → compound**.

### Structure

```
plans/
  week-1.md              ← parent milestone
  week-2.md
  week-3.md
  features/
    <slug>.md            ← one file per feature
docs/
  solutions/             ← /compound output after a feature ships
```

### Compound cycle mapping

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
