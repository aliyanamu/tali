# Review: Schema redesign + Goldsky Mirror webhook pivot

**Branch:** `chore/schema-restructure-tidy-up`
**Reviewed:** 2026-05-31
**Agents:** security-sentinel · data-integrity-guardian · kieran-typescript-reviewer · architecture-strategist · performance-oracle · code-simplicity-reviewer

---

## Round 1 findings and resolutions

### 🔴 P1 — Critical (all fixed)

| # | File | Finding | Fix |
|---|---|---|---|
| 001 | `goldsky/pipeline.yaml` | URL was a hardcoded placeholder — pipeline not deployable | URL now reads from `${TALI_WEBHOOK_URL}` Goldsky secret; removed SQL address filter so watch/unwatch works without redeployment |
| 002 | `schema.ts` | Idempotency index `(chain_id, tx_hash, log_index)` missing `user_id` — two users watching the same wallet silently drop the second user's event | Added `user_id` to index; regenerated migration |
| 003 | `goldsky.ts` | Asset lookup filtered only on `token_address`, not `chain_id` — seq scan + non-deterministic across chains | Added `chainId` to both ERC-20 and native asset lookups |
| 004 | `networth.ts` CLI | `walletNormalized` computed but DB query used `opts.wallet` (mixed-case) — checksummed addresses would miss the user row | Use `walletAddr` (lowercase) in query and `fetchNetworth` call; seed stores lowercase too |
| 005 | `goldsky.ts` | `BigInt()` throws on hex/scientific/empty `amount` strings — webhook crash with unstructured 500 | Added Zod `.regex(/^\d{1,78}$/)` on `amount`; also `.regex()` + `.int()` on `tx_hash`, `address`, `block_number` |
| 006 | `networth.ts` CLI | No try/catch around async action — Commander silently swallows rejections, exits 0 with no message | Wrapped entire action in try/catch with `console.error` + `process.exit(1)` |

### 🟡 P2 — Important (all fixed)

| # | File | Finding | Fix |
|---|---|---|---|
| 007 | `seed.ts` | Real email, wallet address, and Privy IDs hardcoded — risk if repo goes public | Seed values now read from env vars (`SEED_USER_EMAIL`, `SEED_USER_WALLET_ADDRESS`, etc.) with safe placeholder defaults; added to `.env.example` |
| 008 | `app.ts` | No body size limit on webhook — full body buffered before auth check | Added Hono `bodyLimit` middleware (512 KB) before `handleGoldskyWebhook` |
| 009 | `goldsky.ts` | N+1 inserts — one `db.insert` per matched wallet per row | Replaced with single bulk `db.insert(...).values([...]).onConflictDoNothing()` |
| 010 | `goldsky.ts` | Duplicate detection via `err.message` string-match — locale/version fragile | Replaced by `onConflictDoNothing()` (resolves 009 and 010 together) |
| 011 | `goldsky.ts` | No outer try/catch — DB errors produce unstructured 500 with no pino log | Wrapped processing loop in try/catch; returns `{ error: 'internal error' }` + logs with pino |
| 012 | `reset.ts` | `DROP SCHEMA public CASCADE` with no production guard | Added `NODE_ENV === 'production'` guard that exits with code 1 |

### 🔵 P3 — Nice to have (fixed)

| # | Finding | Fix |
|---|---|---|
| Early-return timing leak in `verifyGoldskySecret` | Pad both buffers to 64 bytes before `timingSafeEqual`; length checked separately to prevent truncation bypass |
| `Number(env.MANTLE_CHAIN_ID)` on every webhook request | Moved to module-level `const CHAIN_ID` |
| `rawPayload: row as unknown as Record` double cast | Replaced with `{ ...row }` spread — no cast needed |
| Helius RPC `.env.example` had `?api-key=` with no placeholder | Changed to `?api-key=YOUR_HELIUS_API_KEY_HERE` |
| `pipeline.yaml` `start_at: latest` undocumented gap | Added comment explaining pre-deployment history is not backfilled, and that `networth` covers historical balances via RPC |

---

## Round 2 findings and resolutions

### 🔴 P1 — Critical (all fixed)

| # | File | Finding | Fix |
|---|---|---|---|
| 001 | `goldsky.ts`, `pipeline.yaml` | Webhook secret passed as `?secret=` query param — leaks into server logs, proxy logs, ngrok | Secret moved to `X-Goldsky-Secret` request header in both handler and pipeline YAML |
| 002 | `goldsky.ts` | `receipt_status` parsed but never checked — failed native txs ingested as real transfers | Added `if (row.receipt_status !== 1) continue` guard before `ingestTransfer` |
| 003 | `goldsky.ts` | `GoldskyNativeTxSchema.value`, `from_address`, `to_address` had no regex — `BigInt()` throws on malformed input | Added `/^\d{1,78}$/` to `value`; added `/^0x[0-9a-fA-F]{40}$/` to both address fields |
| 004 | `mantleTestnet.ts` | Unbounded block range after RPC outage — thousands of `getBlock(includeTransactions:true)` in one `Promise.all` | Capped per-poll block range at `MAX_BLOCKS_PER_POLL = 100n`; catch-up spreads across cycles |
| 005 | `cli/` | `onchain_events` table write-only from agent — no CLI command to query transfer history | Implemented `tali-cli history` with `--asset`, `--from`, `--to`, `--wallet`, `--chain-id` filters; `id` exposed in JSON output for reconciliation |

### 🟡 P2 — Important (all fixed)

| # | File | Finding | Fix |
|---|---|---|---|
| 006 | `transferIngestion.ts` | Self-transfer (`from === to`) classified as `inflow` instead of `neutral` | Added `fromAddress === toAddress ? 'neutral'` branch before inflow/outflow check |
| 007 | `mantleTestnet.ts` | `Promise.all` on receipt fetches — one flaky RPC call stalls the entire poll cycle | Replaced with `Promise.allSettled`; failed receipts logged at warn, poller advances `lastBlock` |
| 008 | `mantleTestnet.ts` | `as Transaction[]` unsafe cast suppressed viem's null checks | Changed to `includeTransactions: true as const`; removed cast; guarded null fields explicitly |
| 009 | `schema.ts` | `event_reconciliations` partial unique index vacuous for NULL-sided rows — duplicate half-reconciliations possible | Added `recon_active_onchain_only` and `recon_active_offchain_only` partial unique indexes |
| 010 | `schema.ts`, migration | `ON DELETE NO ACTION` on user FK columns — user deletion throws at runtime, blocks GDPR compliance | Changed to `ON DELETE CASCADE` on `watched_wallets.user_id` and `onchain_events.user_id` and `offchain_entries.user_id` |
| 011 | `schema.ts`, migration | `users.email NOT NULL` blocks wallet-only Privy sign-in | Made `email` nullable |
| 012 | `wallet.ts` | `unwatch` deleted by address only — silently removed watches on all chains | Added `--chain-id` option; delete now filters by `(address, chainId)` |
| 013 | `schema.ts`, migration | `assets.asset_type` had no CHECK constraint | Added `CHECK asset_type IN ('native', 'erc20', 'fiat', 'stablecoin')` |

### 🔵 P3 — Nice to have (fixed)

| # | Finding | Fix |
|---|---|---|
| `verifyGoldskySecret` compared character lengths but `timingSafeEqual` operates on byte buffers | Rewrote to compare `Buffer.byteLength` of both sides before `timingSafeEqual` |
| `GoldskyPayloadSchema` array branch unbounded | Added `.max(500)` |
| `wallet.ts` used `String(env.MANTLE_CHAIN_ID)` at option-definition time — env load failure broke both watch and unwatch | Replaced with literal `'5000'` default; removed `env` import from module |
| `transferIngestion.ts` `rawPayload: object` too broad | Changed to `Record<string, unknown>` |
| `SKILL.md` stale — referenced Alchemy, omitted real-time ingestion, listed stub commands as live | Updated: Goldsky event delivery, "What Tali Records Automatically" section, `log`/`rules` marked week 2 |

---

## Schema design decisions (round 2)

**`offchain_entries` redesigned as fiat-only ledger:**
- Dropped `assetCode` and `amountDecimal` — the crypto side lives in `onchain_events`; both sides are accessible via the reconciliation join, no duplication needed
- Renamed `amountFiat` → `fiatAmount` for consistency with column pairs (`fiatAmount`/`currencyCode`)
- Changed `numeric(20,0)` → `numeric(20,6)` — scale 0 truncated USD cents; 6 decimal places covers all real fiat currencies
- Dropped `rateAtTime` — derived at query time from `onchain_events.amountDecimal / offchain_entries.fiatAmount` via reconciliation join; not worth storing on every fiat entry

**`tali-cli log` implemented (was stub):**
Agent flow: Claude parses natural language → calls `tali-cli history --asset X --from Y --to Y -o json` to find the onchain event ID → calls `tali-cli log --onchain-event-id <uuid>` to create the offchain entry + reconciliation link in one shot. UUIDs are agent-internal; user never handles them.

---

## Intentional design decisions (not changed)

| Finding | Rationale |
|---|---|
| `networks.native_currency_code` has no FK (circular dependency with `assets`) | Postgres deferred constraints require hand-editing generated SQL on every `db:generate`. The nullable column + 4-step seed order is the pragmatic Drizzle workaround. Acceptable for hackathon. |
| `event_reconciliations` and `offchain_entries` tables kept despite no current writer | Intentional week-2 scaffolding. Schema is designed now while the migration is clean; adding them later would require an additive migration. |
| `offchain_entries.kind` and `direction` nullable | `kind` is open (no enum enforced). `direction` nullable allows future entries where direction isn't determined at write time. |
| `getDemoUserId()` duplicated in `wallet.ts` and `log.ts` | Single-user hackathon. Acceptable duplication; shared helper would be premature. |
