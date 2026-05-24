# CLAUDE.md — Tali project context for Claude Code

## What this is
Tali is a unified onchain + offchain money tool for non-trader crypto-active users. Hackathon project for Mantle Turing Test Hackathon 2026 (Phase 2 "AI Awakening"). Deadline 2026-06-15 15:59.

Locked spec: `../context/13_project_locked.md` is the source of truth for product scope, architecture, and track positioning. **Always read it before suggesting product changes.**

## Repo layout
- `skill/` — TaliSkill TypeScript code (custom OpenClaw Skill running on RealClaw, with fallback to standalone Telegram bot if RealClaw access doesn't land by 2026-05-31)
- `contracts/` — Foundry project: `AutonomousRule.sol` (rule-execution surface) + ERC-8004 NFT contract
- `web/` — Next.js desktop dashboard (Privy auth, calm daily-use surface)
- `db/` — Postgres migrations for the unified event ledger
- `docs/` — architecture, workflow, objectives, design mockups

## Key conventions
- **TypeScript** for all skill + web code, strict mode
- **Foundry** for contracts, Solidity 0.8.x
- **Privy** for all wallet management — never store private keys or seed phrases anywhere
- **viem** for chain interaction, not ethers
- **grammY** for Telegram (only if RealClaw fallback is triggered; otherwise use RealClaw's Telegram surface)
- **Postgres** for state; events flow through a single unified ledger schema

## Architecture summary (read full version in `docs/architecture.md`)
- **Pattern B (agent-orchestrated):** RealClaw/TaliSkill watches events via Goldsky Mirror, decides when rules fire, signs transactions via Privy, calls AutonomousRule.sol to execute on-chain actions.
- **Three-tier wallet model:** watched (read-only) / Tali wallet (Privy, user-signed) / AutonomousRule.sol (agent-orchestrated action surface).
- **Mantle-only at MVP.** Read-only watch of other EVM chains via Goldsky pipelines if time permits.

## Track positioning (don't drift from this)
- Primary: **Agentic Economy Path B (RealClaw Real-Life Expansion)**
- Stretch: AI×RWA + Grand Champion
- Locked-in: 20 Project Deployment Award

## Strict rules
1. **Pivot parking lot is active.** Any new project idea or major reframe goes into `../context/parking_lot.md` with a date. It does NOT trigger a re-lock discussion. Three pivots in 30 hours during 2026-05-23/24; not doing that again.
2. **Don't suggest features beyond MVP scope** unless explicitly asked. The MVP scope is in `../context/13_project_locked.md`. Out-of-scope items go to v1.5/v2 mention in submission, not into the build.
3. **Never write to user's existing MetaMask** or any wallet they paste an address for. Those are watched (Tier 1, read-only) — no signing path exists.
4. **Don't use Solana-side Byreal primitives** (CLMM, Perps, Kamino) — Mantle-only by deliberate choice. If a Solana-side feature seems appealing, log it in `../context/parking_lot.md`, don't propose adding it.
5. **Real-time event delivery is via Goldsky Mirror webhooks, NOT Alchemy WebSocket.** User has production experience with WebSocket reliability issues; we use push-based delivery on purpose.
6. **Wallets are non-custodial.** Privy split-key. We never hold keys or fund custody.

## Running locally (will be filled in as we build)
- Install: `pnpm install`
- DB: `pnpm db:migrate`
- Skill dev: `pnpm dev:skill`
- Web dev: `pnpm dev:web`
- Contracts: `cd contracts && forge build` / `forge test`

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

## Pre-commit checklist
- Run linter / typecheck
- Don't commit `.env`, secrets, private keys, or seed phrases
- Don't bypass git hooks unless explicitly asked
- Conventional commit messages (feat:, fix:, chore:, docs:)
