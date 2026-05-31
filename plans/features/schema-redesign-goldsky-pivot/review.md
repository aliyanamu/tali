# Review: Schema redesign + Goldsky Mirror webhook pivot

**Branch:** `chore/schema-restructure-tidy-up`
**Reviewed:** 2026-05-31
**Agents:** security-sentinel · data-integrity-guardian · kieran-typescript-reviewer · architecture-strategist · performance-oracle · code-simplicity-reviewer

---

## Findings and resolutions

### 🔴 P1 — Critical (all fixed)

| # | File | Finding | Fix |
|---|---|---|---|
| 001 | `goldsky/pipeline.yaml` | URL was a hardcoded placeholder — pipeline not deployable | URL now reads from `${TALI_WEBHOOK_URL}` Goldsky secret; removed SQL address filter so watch/unwatch works without redeployment |
| 002 | `schema.ts` | Idempotency index `(chain_id, tx_hash, log_index)` missing `user_id` — two users watching the same wallet silently drop the second user's event | Added `user_id` to index; regenerated migration |
| 003 | `goldsky.ts` | Asset lookup filtered only on `token_address`, not `chain_id` — seq scan + non-deterministic across chains | Added `chainId` to both ERC-20 and native asset lookups |
| 004 | `networth.ts` CLI | `walletNormalized` computed but DB query used `opts.wallet` (mixed-case) — checksummed addresses would miss the user row | Use `walletAddr` (lowercase) in query and `fetchNetworth` call; seed stores lowercase too |
| 005 | `goldsky.ts` | `BigInt()` throws on hex/scientific/empty `amount` strings — webhook crash with unstructured 500 | Added Zod `.regex(/^\d{1,78}$/)` on `amount`; also `.regex()` + `.int()` on `tx_hash`, `address`, `block_number` |
| 006 | `networth.ts` CLI | No try/catch around async action — Commander silently swallows rejections, exits 0 with no message | Wrapped entire action in try/catch with `console.error` + `process.exit(1)` |

---

### 🟡 P2 — Important (all fixed)

| # | File | Finding | Fix |
|---|---|---|---|
| 007 | `seed.ts` | Real email, wallet address, and Privy IDs hardcoded — risk if repo goes public | Seed values now read from env vars (`SEED_USER_EMAIL`, `SEED_USER_WALLET_ADDRESS`, etc.) with safe placeholder defaults; added to `.env.example` |
| 008 | `app.ts` | No body size limit on webhook — full body buffered before auth check | Added Hono `bodyLimit` middleware (512 KB) before `handleGoldskyWebhook` |
| 009 | `goldsky.ts` | N+1 inserts — one `db.insert` per matched wallet per row | Replaced with single bulk `db.insert(...).values([...]).onConflictDoNothing()` |
| 010 | `goldsky.ts` | Duplicate detection via `err.message` string-match — locale/version fragile | Replaced by `onConflictDoNothing()` (resolves 009 and 010 together) |
| 011 | `goldsky.ts` | No outer try/catch — DB errors produce unstructured 500 with no pino log | Wrapped processing loop in try/catch; returns `{ error: 'internal error' }` + logs with pino |
| 012 | `reset.ts` | `DROP SCHEMA public CASCADE` with no production guard | Added `NODE_ENV === 'production'` guard that exits with code 1 |

---

### 🔵 P3 — Nice to have (fixed)

| # | Finding | Fix |
|---|---|---|
| Early-return timing leak in `verifyGoldskySecret` | Pad both buffers to 64 bytes before `timingSafeEqual`; length checked separately to prevent truncation bypass |
| `Number(env.MANTLE_CHAIN_ID)` on every webhook request | Moved to module-level `const CHAIN_ID` |
| `rawPayload: row as unknown as Record` double cast | Replaced with `{ ...row }` spread — no cast needed |
| Helius RPC `.env.example` had `?api-key=` with no placeholder | Changed to `?api-key=YOUR_HELIUS_API_KEY_HERE` |
| `pipeline.yaml` `start_at: latest` undocumented gap | Added comment explaining pre-deployment history is not backfilled, and that `networth` covers historical balances via RPC |

---

## Intentional design decisions (not changed)

These were flagged by reviewers but kept as deliberate choices:

| Finding | Rationale |
|---|---|
| `networks.native_currency_code` has no FK (circular dependency with `assets`) | Postgres deferred constraints require hand-editing generated SQL on every `db:generate`. The nullable column + 4-step seed order is the pragmatic Drizzle workaround. Acceptable for hackathon. |
| `amountFiat numeric(20,0)` truncates SGD/PHP/THB sub-units | IDR and VND are the primary currencies (0 decimal places). SGD/PHP callers are expected to round before insert. Documented in schema comment. |
| `event_reconciliations` one-sided NULL pairs allow duplicates via NULL distinctness | Low risk — reconciliation is a manual user action, not high-frequency. Partial unique index handles the common case. |
| `offchain_entries.kind` and `direction` are nullable | `kind` is intentionally open (no enum). `direction` nullable allows future `neutral` entries from sources that don't determine direction at write time. |
| `assets.code` conflates `coingeckoId` and `vsCurrency` concepts | `coingeckoId` column added to `assets` to separate the two. `vsCurrency` = quote currency for CoinGecko `vs_currencies` param. Distinct columns now. |
| `getDemoUserId()` in `wallet.ts` has no production guard | Single-user hackathon. Acceptable risk; documented as demo-only. |

---

## Architecture notes

**Goldsky address filter removed:** The original plan used a SQL `WHERE sender IN (...)` transform in `pipeline.yaml` to pre-filter transfers. This was removed because it required a pipeline redeploy on every `wallet watch`. All Mantle ERC-20 transfers are now delivered to the webhook; the handler discards non-watched addresses via `watched_wallets` DB lookup. No redeployment needed for watch/unwatch.

**Native MNT gap:** `mantle.erc20_transfers` does not include native MNT transfers (no ERC-20 log emitted). Native MNT is tracked via direct RPC balance calls in `tali-cli networth`. Historical MNT transfers will not appear in `onchain_events`.

**Pre-deployment history:** `start_at: latest` in `pipeline.yaml` means only transfers after pipeline deployment are delivered. Historical balances are accurate via RPC; event history starts from deployment date.
