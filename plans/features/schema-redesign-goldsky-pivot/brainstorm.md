# Brainstorm: Schema Redesign + Goldsky Mirror Pivot

**Date:** 2026-05-31
**Status:** Ready for planning

---

## What We're Building

Replace the current single-table `events` ledger with a split-table schema (`onchain_events` + `offchain_entries` + `event_reconciliations` + unified `assets`) and swap the Alchemy Notify webhook for Goldsky Mirror as the onchain event delivery mechanism.

**Triggers:**
- Alchemy Notify hit free-tier webhook limits mid-session ("webhook paused").
- Schema review revealed: single-table with ~8 nullable columns, IDR-hardcoded amounts, and no decimal metadata for crypto amounts.

---

## Why This Approach

### Schema: split tables + M:N junction + unified asset registry

The current `events` table has four problems:
1. Merges onchain and offchain into one row with ~8 nullable `onchain_*` / `offchain_*` columns — noise for agent-generated SQL
2. `kind` encodes both channel (`onchain` vs `offchain`) and direction — semantic ambiguity
3. `offchain_amount_idr_micro bigint` is IDR-locked — blocks SGD, MYR, PHP, THB, VND users
4. `amount_raw` has no decimals context — "1000000" could be 1 USDT (6 decimals) or 0.000001 MNT (18 decimals)

**Chosen design:** Six tables.

```
networks                     chain registry
────────
chain_id int PK               EVM chain ID: 5000 Mantle mainnet, 5003 Mantle Sepolia
name varchar(64)              "Mantle Mainnet", "Mantle Sepolia"
rpc_url varchar               https://rpc.mantle.xyz
explorer_url varchar          https://explorer.mantle.xyz (for tx links in agent responses)
native_currency_code varchar FK → assets.code   (MNT for Mantle)
is_testnet boolean
is_active boolean             false = archived / not actively watched


assets                       unified registry for crypto + fiat
──────
code varchar(16) PK           MNT, USDT, USDC, IDR, SGD, VND, BTC...
name varchar(64)              "Mantle", "Tether USD", "Indonesian Rupiah"
symbol varchar(8)             display: MNT, Rp, S$, ฿, ₫
decimals int                  18 for MNT/ETH, 6 for USDT/USDC, 0 for IDR/VND, 2 for SGD
asset_type varchar(16)        native | erc20 | fiat | stablecoin
vs_currency varchar(16)       CoinGecko vs_currency param (idr, usd, mantle, tether...)
chain_id int nullable FK → networks.chain_id   ERC-20 tokens only; null for fiat/native
token_address varchar(64) nullable   ERC-20 contract address; null for native/fiat


onchain_events
──────────────
id uuid PK (v7), user_id uuid FK → users
chain_id FK → networks.chain_id
tx_hash, log_index            (idempotency key)
block_number
confirmed_at                  block timestamp — not webhook arrival time
kind varchar                  open: transfer | swap | bridge | yield | approval | ...
direction                     inflow | outflow | neutral
asset_code varchar FK → assets.code
amount_raw varchar            raw integer string — lossless (e.g. "1000000")
amount_decimal numeric(20,8)  parsed at ingestion: amount_raw / 10^assets.decimals
from_address, to_address
source varchar                goldsky | manual | ...
raw_payload jsonb
created_at


offchain_entries
────────────────
id uuid PK (v7), user_id uuid FK → users
kind varchar                  open: p2p_trade, bank_transfer, ewallet,
                              expense, income, peer_loan, peer_repayment, manual...
direction                     inflow | outflow | neutral
amount_fiat numeric(20,6)     fiat side — exact decimal
currency_code varchar FK → assets.code   (fiat asset, e.g. IDR)
rate_at_time numeric(20,8)    fiat/USD rate snapshot at entry time (optional)
asset_code varchar nullable FK → assets.code   crypto side of a trade
amount_decimal numeric(20,8) nullable           crypto amount, human-readable
note text                     NL log entry or user note
occurred_at timestamptz       user-stated time (not ingestion time)
source varchar                tali_cli | bank_csv | manual | ...
created_at


event_reconciliations         M:N junction
─────────────────────
id uuid PK (v7)
onchain_event_id  uuid FK → onchain_events  ON DELETE CASCADE  (nullable)
offchain_entry_id uuid FK → offchain_entries ON DELETE CASCADE (nullable)
kind varchar                  p2p_trade | withdrawal | deposit | swap | ...
created_at
deleted_at timestamptz nullable   soft delete — preserves unlink audit trail
```

**Why `networks` table:**
`chain_id` as a bare integer in three tables with no FK enforcement means the RPC URL, explorer URL, and native token are hardcoded in `env.ts` and `chain.ts`. A `networks` table makes chain metadata a first-class registry — the agent can say "show me a link to this tx on the explorer" by joining `networks.explorer_url`, and adding a new chain is a seed row not a code change. One circular dependency: `networks.native_currency_code → assets` and `assets.chain_id → networks`; resolved by inserting assets first with `chain_id null`, then networks, then patching.

**Why one unified `assets` table (not separate `currencies` + loose `asset_symbol`):**
Both crypto and fiat are units of value with a name, symbol, and decimal precision. Splitting them into two registries means maintaining two sources of truth. A single `assets` table with `asset_type` covers both — `currencies` is absorbed, and `asset_symbol` free strings become FK-enforced references.

**Why `amount_raw` + `amount_decimal` on `onchain_events`:**
`amount_raw` is the lossless source of truth from the chain. `amount_decimal` is pre-parsed at ingestion (`amount_raw / 10^assets.decimals`) so the agent can query `WHERE amount_decimal > 100` directly without a division join. Both are stored — raw for auditability, decimal for queries.

**Why `rate_at_time` on `offchain_entries`:**
Historical P2P trade analysis needs the rate at trade time, not today's rate. Optional — omit if unknown.

**Why UUID v7 for surrogate PKs:**
`serial` int exposes record counts (user #1, user #2 are enumerable — a security smell for API-facing IDs). UUID v4 is non-guessable but random inserts cause index page splits. UUID v7 is time-sortable (timestamp prefix) so it has the same sequential index performance as `serial` while being non-enumerable and safe to expose. Generated in the application layer via the `uuidv7` npm package. Natural PKs (`assets.code`, `networks.chain_id`) stay as-is — they're meaningful identifiers, not surrogates.

**Why M:N junction with soft delete + CASCADE:**
One P2P trade can span multiple partial onchain fills. FK enforcement over `link_id varchar`. Unlinking = `DELETE FROM event_reconciliations WHERE id = ?` — both parent records survive. `ON DELETE CASCADE` on both FKs means if a parent event is ever deleted, its orphaned junction rows are cleaned automatically. `deleted_at` soft delete preserves unlink history so the agent can answer "why was this reconciliation removed?" without losing the record permanently.

---

### Webhook: Goldsky Mirror

Goldsky Mirror pushes decoded onchain events to an HTTP endpoint — same push-webhook pattern as Alchemy Notify, different HMAC scheme and payload shape.

**Key differences from Alchemy:**
- HMAC: Goldsky sends `X-Goldsky-Signature` with a `sha256=` prefix (must be stripped before comparison)
- Payload shape: Goldsky Mirror delivers subgraph entity events, not Alchemy's `ADDRESS_ACTIVITY` envelope
- Address registration: static pipeline filter at creation time — not a dynamic address list API

**Implication for `tali-cli wallet watch`:** Dynamic address add/remove doesn't map to Goldsky's static pipeline. For hackathon: pipeline watches the seed wallet. Week 2: re-deploy pipeline via Goldsky CLI.

---

## Currency/Asset-Agnostic Audit

All IDR-specific references that must change:

| Location | Current | Fix |
|---|---|---|
| `events.offchain_amount_idr_micro` | IDR bigint | → `offchain_entries.amount_fiat` + `currency_code` FK → assets |
| `services/networth.ts` | IDR price fetch + "IDR total" | → accept `currency_code` param, default `'IDR'` |
| `lib/prices.ts` | `getPrice(asset)` → IDR | → `getPrice(assetCode, vsCurrency)` using `assets.vs_currency` |
| `cli/commands/networth.ts` | Hardcoded "IDR" output label | → read from `users.preferred_currency` |
| `users` table | No currency preference | → add `preferred_currency varchar(16)` default `'IDR'` FK → assets |

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Table model | 6 tables | Clean column semantics; no nullable noise |
| Surrogate PKs | UUID v7 | Non-enumerable for API safety; time-sortable for index performance; generated via `uuidv7` npm package |
| Natural PKs | `assets.code`, `networks.chain_id` | Meaningful identifiers — no surrogate needed |
| Asset registry | Unified `assets` (crypto + fiat) | One source of truth for decimals, symbol, vs_currency |
| `amount_raw` + `amount_decimal` | Both on `onchain_events` | Raw = lossless audit; decimal = agent-queryable without join |
| `amount_fiat` on `offchain_entries` | `numeric(20,6)` | Already human-readable; fiat has no raw hex representation |
| `offchain_entries.kind` | Open varchar | Too many real SEA finance flows to enumerate upfront |
| `onchain_events.kind` | Open varchar | All hackathon events are `transfer`; ready for swap/bridge/yield |
| `direction` | Explicit on both tables | `inflow` / `outflow` / `neutral`; clean agent SQL |
| Reconciliation | M:N junction `event_reconciliations` | FK enforcement; handles partial fills; unlink = row delete |
| Junction soft delete | `deleted_at` on `event_reconciliations` | Preserves unlink audit trail; parent rows survive |
| Junction FK cascade | `ON DELETE CASCADE` on both FKs | No orphaned junction rows if parent is deleted |
| Webhook provider | Goldsky Mirror | No free-tier quotas; same push-webhook pattern |
| `tali-cli wallet watch` | Static Goldsky pipeline for hackathon | Dynamic re-registration deferred to week 2 |
| Migration strategy | Drop-and-recreate (dev only) | No prod data; clean slate is faster |
| `confirmed_at` | In `onchain_events` | Block timestamp from Goldsky payload; accurate history |
| `networks` table | Seed with Mantle mainnet + Sepolia | chain_id FK-enforced across all tables; RPC/explorer in DB not hardcoded in env |
| `users.preferred_currency` | FK → assets, default `'IDR'` | Drives networth display without hardcoding |

---

## What Changes

**New files:**
- `backend/src/server/routes/webhooks/goldsky.ts` — Goldsky Mirror HMAC + payload → inserts `onchain_events`
- `backend/src/integrations/goldsky.ts` — pipeline management stubs (week 2)

**Modified files:**
- `backend/src/db/schema.ts` — full redesign: 5 tables, drop old `events`
- `backend/drizzle/` — new migration (drop-and-recreate)
- `backend/src/db/seed.ts` — seed `assets` table (SEA fiat + Mantle tokens)
- `backend/src/server/app.ts` — swap `/webhooks/alchemy` → `/webhooks/goldsky`
- `backend/src/lib/env.ts` — swap `ALCHEMY_WEBHOOK_*` → `GOLDSKY_WEBHOOK_SECRET`
- `backend/.env.example` — update env vars
- `backend/src/lib/prices.ts` — `getPrice(assetCode, vsCurrency)`
- `backend/src/services/networth.ts` — currency-agnostic networth
- `backend/src/cli/commands/networth.ts` — use `preferred_currency`

**Deleted:**
- `backend/src/server/routes/webhooks/alchemy.ts`
- `backend/src/integrations/alchemy.ts`

---

## Resolved Questions

- **M:N or 1:1 junction?** → M:N. One P2P trade can span multiple partial onchain fills.
- **Goldsky Mirror vs Subgraph?** → Mirror. Same push-webhook pattern; less setup; no polling.
- **Full redesign or additive?** → Full redesign. Clean slate on dev; no prod data at risk.
- **offchain_entries.kind enum or open varchar?** → Open varchar. Too many real SEA finance flows to enumerate upfront.
- **IDR-specific amounts?** → `amount_fiat numeric(20,6)` + `currency_code` FK → assets.
- **Separate currencies vs unified asset registry?** → Unified `assets` table. One source of truth for decimals, symbol, and vs_currency for both crypto and fiat.
- **amount_raw: raw only or raw + decimal?** → Both. `amount_raw` for lossless audit; `amount_decimal` pre-parsed at ingestion for agent queries.
- **Integer IDs or UUID?** → UUID v7 for all surrogate PKs. Time-sortable (good index perf), non-enumerable (API-safe). Natural PKs (`assets.code`, `networks.chain_id`) stay as meaningful identifiers.
- **How to unlink reconciliations?** → Delete the `event_reconciliations` row. Parent records survive. `ON DELETE CASCADE` auto-cleans orphans. `deleted_at` soft delete preserves unlink audit trail.

---

## Open Questions

_None — ready for planning._
