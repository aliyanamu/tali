# CLAUDE.md — Tali project context for Claude Code

## What this is
Tali is a unified onchain + offchain money tool for non-trader crypto-active users. Hackathon project for Mantle Turing Test Hackathon 2026 (Phase 2 "AI Awakening"). Deadline 2026-06-15 15:59.

**Branch: `feat/realclaw-integration`** — RealClaw is the automation engine. The OpenClaw skill surface (`tali-cli`) has been removed. Tali's Telegram bot is the user-facing layer; RealClaw handles all DeFi automation (yield, DCA, swaps) via Byreal. See `feat/openclaw-integration` for the standalone skill version.

Locked spec: `../context/13_project_locked.md` is the source of truth for product scope, architecture, and track positioning. **Always read it before suggesting product changes.**

## Repo layout
- `backend/` — all backend TypeScript: Telegram bot + Goldsky webhook server + Drizzle ORM
  - `backend/src/bot/` — Telegram commands (`/start`, `/networth`; `/log` and `/rules` are stubs)
  - `backend/src/webhook/` — Goldsky HMAC-verified webhook handler (Hono)
  - `backend/src/db/schema.ts` — unified event ledger schema (`users`, `events`, `watchedWallets`)
  - `backend/src/lib/` — chain (viem), prices (CoinGecko/IDR), tokens (Mantle/Solana registry), env, logger
  - `backend/src/wallet/privy.ts` — wallet creation + tx signing via Privy server SDK
  - `backend/src/realclaw/` — **[TODO]** RealClaw integration: trigger strategies, poll status, receive events
  - `backend/drizzle/` — generated SQL migrations (run via `pnpm db:migrate`)
  - ~~`backend/src/cli/`~~ — removed; standalone skill lives on `feat/openclaw-integration`
  - ~~`backend/skills/`~~ — removed; OpenClaw registration not needed when RealClaw is the agent
- `contracts/` — **week 2, not yet created** — will hold Foundry project: `AutonomousRule.sol` + ERC-8004 NFT
- `web/` — **week 2, not yet created** — will hold Next.js desktop dashboard (Privy auth)
- `docs/` — architecture, workflow, objectives, intents (NL parser contract)
- `design/` — conversation-flow wireframes (`telegram/`) and web-app design prompts (`web-app/`)
- `idea-bank/` — scoped future ideas by timeline (`next-month/`, `later/`); not active scope
- `plans/` — implementation plans following the compound-engineering cycle (see below)

## Key conventions
- **TypeScript** for all backend + web code, strict mode
- **Privy** for all wallet management — never store private keys or seed phrases anywhere
- **viem** for chain interaction, not ethers
- **grammY** for Telegram bot surface
- **RealClaw** — the automation engine; Tali's bot talks to RealClaw to trigger DeFi strategies (yield, DCA, swaps) via Byreal on Solana
- **Postgres** for state; events flow through a single unified ledger schema
- No OpenClaw skill surface in this branch — RealClaw is the agent, Tali is the personal finance data layer

## Architecture summary (read full version in `docs/architecture.md`)
- **RealClaw is the automation engine.** User sets up DeFi strategies (SteadyClaw/yield, TradFiClaw/tokenized stocks, SniperClaw/DCA) via RealClaw. Tali's bot surfaces the personal finance context (net worth, P2P log, bank data) alongside RealClaw's DeFi execution.
- **Two-tier wallet model:** watched (read-only) / Tali wallet (Privy, shared with RealClaw's non-custodial model). No AutonomousRule.sol in this branch — RealClaw handles pre-authorized automation natively.
- **Multi-chain:** Solana for Byreal DeFi actions (via RealClaw), Mantle/EVM for wallet watching via Goldsky + net worth reads.
- **Tali's job:** personal finance data layer — unified ledger, IDR net worth, P2P trade log, bank import, reconciliation. RealClaw's job: DeFi execution.

## Track positioning (don't drift from this)
- Primary: **Agentic Economy Path B (RealClaw Real-Life Expansion)**
- Stretch: AI×RWA + Grand Champion
- Locked-in: 20 Project Deployment Award

## Strict rules
1. **Pivot parking lot is active.** Any new project idea or major reframe goes into `../context/parking_lot.md` with a date. It does NOT trigger a re-lock discussion. Three pivots in 30 hours during 2026-05-23/24; not doing that again.
2. **Don't suggest features beyond MVP scope** unless explicitly asked. The MVP scope is in `../context/13_project_locked.md`. Out-of-scope items go to v1.5/v2 mention in submission, not into the build.
3. **Never write to user's existing MetaMask** or any wallet they paste an address for. Those are watched (Tier 1, read-only) — no signing path exists.
4. **Solana execution goes through RealClaw only.** Tali never signs Solana transactions directly. All Byreal actions (yield, DCA, swaps) are triggered by Tali's bot calling RealClaw, which handles Solana signing via its own Privy non-custodial model.
5. **Real-time event delivery is via Goldsky Mirror webhooks, NOT Alchemy WebSocket.** User has production experience with WebSocket reliability issues; we use push-based delivery on purpose.
6. **Wallets are non-custodial.** Privy split-key. We never hold keys or fund custody.

## Running locally
- Install: `pnpm install` (from repo root)
- Copy env: `cp backend/.env.example backend/.env` → fill in keys
- DB migrate: `pnpm db:migrate` (runs `backend/src/db/migrate.ts` via Drizzle)
- Backend dev (bot + webhook server): `pnpm dev:backend`
- CLI dev: `pnpm --filter @tali/backend dev:cli`
- Web dev: `pnpm dev:web` — **web/ not yet created, week 2**
- Contracts: `cd contracts && forge build` / `forge test` — **contracts/ not yet created, week 2**

### Required env vars (see `backend/.env.example`)
`TELEGRAM_BOT_TOKEN`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `ALCHEMY_MANTLE_RPC`, `GOLDSKY_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `COINGECKO_API_KEY`, `DATABASE_URL`

## Where to find things
- Locked product spec: `../context/13_project_locked.md`
- Hackathon facts + tracks + criteria: `../context/01_overview.md`, `02_tracks.md`, `03_requirements_and_criteria.md`
- Byreal/RealClaw capability reference: `../context/06_byreal_realclaw_capabilities.md`
- Working todo: `../todo.md` (in parent folder, not this repo)
- Future ideas parking lot: `../context/parking_lot.md`
- Archive of previous direction (TKI Family Vault): `../archive/`

## When suggesting changes
- Match the locked-spec terminology (TaliSkill, Tier 1/2/3 wallets, Pattern B, etc.)
- Match the emotional register: "clarity, calm, control" — calm > flashy
- Single dogfooded first user (Mufidah); don't suggest features for hypothetical scale users
- The product is global with Indonesia as a regional layer, not Indonesia-only

## Current build state (as of 2026-05-27, week 1 scaffold)

**Code written, not yet tested (external services not set up):**
- `/start` — code complete; needs Privy account + Postgres running to test
- `/networth` — code complete; needs Alchemy + CoinGecko API key + Postgres to test
- Goldsky webhook — code complete; needs Goldsky account + deployed pipeline to receive events
- DB schema — `users`, `events` (unified ledger), `watchedWallets`; migrations generated but not run against a real DB yet
- Bilingual (EN/ID) copy in `/start` and `/networth`
- `tali-cli` OpenClaw skill — `networth`, `wallet watch/list` implemented; `log` and `rules` stubbed

**Services not yet set up (all blocking):**
- Telegram bot token (via @BotFather)
- Privy account + app
- Alchemy account (Mantle RPC)
- CoinGecko Demo API key
- Goldsky account + webhook secret
- Local Postgres

**Stubbed / not yet implemented:**
- `/log` — handler referenced in help text, file not created yet (week 1 remaining)
- `/rules` — referenced in help text, not created (week 3)
- NL intent parser (Claude) — not wired yet
- P2P trade logging (`log_p2p_trade` intent) — not implemented
- Watched-wallet auto-link for reconciliation — not implemented
- Goldsky Mirror pipeline config — not yet deployed (pipeline YAML needed)
- Mantle token addresses in `backend/src/lib/tokens.ts` — best-guess, need verification on mantlescan.xyz
- `contracts/`, `web/` — week 2

## Plans folder — compound-engineering cycle

`plans/` is the single place for implementation planning. It follows the compound-engineering workflow: **brainstorm → plan → work → review → compound**.

### Structure

```
plans/
  week-1.md              ← parent milestone: features, done criteria for the week
  week-2.md
  week-3.md
  features/
    <slug>.md            ← one file per feature; single goal
                           sections: ## Brainstorm, ## Plan, ## Done criteria
docs/
  solutions/             ← /compound output after a feature ships
```

### One file per feature
Each `plans/features/<slug>.md` is a single file with:
- `## Brainstorm` — output of `/brainstorm` (can skip if intent is obvious)
- `## Plan` — output of `/plan` (step-by-step, one goal)
- `## Done criteria` — observable, testable conditions for "done"

The milestone file (`week-N.md`) lists which slugs belong to that week.

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
