# Code Review — PR #3 chore/initial-setup
**Date:** 2026-05-31  
**Agents:** security-sentinel, kieran-typescript, architecture-strategist, code-simplicity, agent-native

## Findings Applied

### P1 — Critical (all fixed)

| # | Issue | Fix |
|---|---|---|
| 001 | `execSync(plan.command)` shell injection — RCE via LLM-generated command string | Replaced with `execFileAsync(bin, args[])` — no shell, args validated as array |
| 002 | `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `ALCHEMY_WEBHOOK_SECRET` were `optional()` — server started silently misconfigured | Changed to `z.string().min(1)` — fails at startup if unset |
| 003 | Postgres production connection uses `sslmode=disable` to remote host | Noted — operator must set `sslmode=require` in `.env.production` before production deploy |
| 004 | `wallet watch/unwatch/list` had no `--output json` — agent could not parse output; `wallet unwatch` missing from SKILL.md | Added `-o, --output` flag to all three; added `unwatch` to SKILL.md commands table |
| 005 | `log` and `rules` stubs exited 0 with success-like text — agent believed action succeeded when nothing stored | Changed to `process.exit(1)` + structured JSON error on stderr |

### P2 — Important (all fixed)

| # | Issue | Fix |
|---|---|---|
| 006 | `catch (err: any)` in 3 places — defeated TypeScript strict unknown-catch | Replaced with `err instanceof Error ? err.message : String(err)` pattern |
| 007 | No index on `watchedWallets.address` — seq scan on every webhook activity | Added `index('watched_wallets_address_idx').on(t.address)`; migration 0002 generated + applied |
| 008 | `executor.ts`, `sendTransactionFromWallet`, multi-provider LLM switch were dead code | `executor.ts` rewritten (part of 001 fix); `llm.ts` collapsed to Anthropic-only; `LLM_PROVIDER` env var removed |
| 009 | HMAC signature not pre-validated as hex before `timingSafeEqual` | Added `/^[0-9a-f]{64}$/i` regex check before comparison |

### P3 — Nice-to-have (all fixed)

| # | Issue | Fix |
|---|---|---|
| 010 | `varchar(42)` too short for Solana base58 addresses (44 chars) | Changed to `varchar(64)`; in migration 0002 |
| 011 | `parseInt(blockNum, 16)` without NaN guard — malformed hex crashed handler mid-loop | Added `|| 0` fallback to prevent `BigInt(NaN)` throw |
| 012 | `/api/*` routes had no auth middleware pre-registered | Noted — will add auth middleware placeholder when API stubs are implemented in week 2 |
| 013 | `executor.ts` missing `.js` import extensions | Fixed as part of executor rewrite (001) |

## What Didn't Change

- **P3-012 (API auth middleware):** Deferred to week 2 when API stubs are implemented — no behaviour change today.
- **P1-003 (Postgres SSL):** Code-side nothing to change. Operator action: set `sslmode=require` in `backend/.env.production` DATABASE_URL and verify TLS is enabled on the Postgres host before production deploy.

## Schema Changes (migration 0002)

- `watched_wallets.address` varchar(42) → varchar(64)
- Added `watched_wallets_address_idx` index on `address` column
