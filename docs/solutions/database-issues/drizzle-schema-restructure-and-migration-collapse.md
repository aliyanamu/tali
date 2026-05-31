---
title: "Schema Redesign and Goldsky Mirror Pivot"
date: "2026-05-31"
category: "schema"
tags: ["drizzle", "postgres", "schema", "goldsky", "alchemy", "events-ledger", "refactor"]
problem_type: "schema_issue"
component: "backend/src/db/schema.ts"
symptoms:
  - "Alchemy Notify free-tier webhook limit hit mid-session, causing webhook to be paused"
  - "Single events table merged onchain and offchain data into one row with ~8 nullable columns"
  - "kind column encoded both channel (onchain vs offchain) and direction, causing semantic ambiguity"
  - "offchain_amount_idr_micro bigint field was IDR-hardcoded, blocking multi-currency support"
  - "onchain_amount stored raw string with no decimals metadata, making token amounts ambiguous"
  - "Four incremental migrations existed before being collapsed into one clean 0000_init.sql"
  - "users table used Telegram-specific handle field and privyWalletId naming that was provider-coupled"
before:
  - "users table had handle (Telegram-specific) and privyWalletId fields"
  - "events table: single unified table with onchain_* and offchain_* nullable column groups"
  - "Three migration files: 0000_init_schema.sql, 0001_replace_telegram_id_with_handle.sql, 0002_address_index_varchar64.sql"
  - "No updatedAt on any table"
  - "No email field on users"
after:
  - "users table has linkedUserId (provider-agnostic), linkedWalletId, email NOT NULL UNIQUE, updatedAt on all tables"
  - "Four incremental migrations collapsed into single 0000_init.sql"
  - "seed.ts added with demo user upsert on linkedUserId"
  - "Planned: split into onchain_events + offchain_entries + event_reconciliations + assets + networks tables"
  - "Planned: swap Alchemy Notify for Goldsky Mirror as onchain event delivery"
---

## Problem

The original `users` table was designed around a Telegram bot identity model. The initial schema used `telegram_id` (bigint) as the primary external identifier, and `privy_wallet_id` as a Privy-specific field name. After the architectural pivot away from Telegram and toward an OpenClaw/Privy-based auth model, the schema was patched twice with incremental migrations (`0001`, `0002`) that renamed columns in place and added an address index. The result was a fragmented migration history with four files that obscured the actual intended schema, and a `users` table with provider-coupled naming that would mislead any contributor reading the code.

## Root Cause

Three compounding issues:

1. **Provider-coupled column names** — `telegram_id` and `privy_wallet_id` baked the auth provider's identity into the schema. When the auth model changed (Telegram dropped, Privy DID adopted), the names became misleading even after being patched to `handle` and `privy_wallet_id`.
2. **Missing `email` field** — The users table had no contact field at all. For a personal finance agent that needs to send alerts or confirm actions, this was a functional gap.
3. **Accumulated migration debt** — Four incremental migrations (rename, add index, etc.) on a pre-launch DB with no production data meant the migration chain was noise with no benefit.

## Investigation

The schema problems were discovered in two phases. The first was during a code review of `schema.ts` that revealed the nullable column grouping pattern in `events` — eight columns where roughly half are always NULL depending on row type, a clear signal of two entities collapsed into one table. The second was operational: Alchemy Notify's free-tier webhook paused mid-session due to quota limits, which forced a re-evaluation of the event delivery architecture and surfaced the tight coupling between the schema design and a single provider.

The `offchain_amount_idr_micro bigint` column name was identified as a forward-blocking issue: any future support for USD or SGD amounts would require either a new column (more sprawl) or a migration to rename the existing one. The `onchain_amount` raw string had no FK to token decimals, making it unqueryable by the agent without additional context lookups that weren't wired up.

## Solution

The schema was rewritten cleanly in a single pass: provider-agnostic naming throughout, `email` added as `NOT NULL UNIQUE`, `updatedAt` added to all three tables, and the four-migration chain was collapsed into a single `0000_init.sql`. A seed script was added for local dev and demo use.

The longer-term plan (tracked in `plans/features/schema-redesign-goldsky-pivot/plan.md`) splits the single `events` table into purpose-built tables: `onchain_events`, `offchain_entries`, `event_reconciliations`, `assets`, and `networks`. Alchemy Notify is replaced by Goldsky Mirror as the onchain event delivery mechanism to remove the free-tier quota constraint.

## Key Changes

**`users` table — before:**
```sql
"telegram_id" bigint NOT NULL UNIQUE,
"privy_wallet_id" varchar(128),
"wallet_address" varchar(42),
-- no email, no updatedAt
```

**`users` table — after:**
```typescript
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  linkedUserId: varchar('linked_user_id', { length: 128 }).notNull().unique(),  // Privy DID, provider-agnostic name
  email: varchar('email', { length: 256 }).notNull().unique(),
  lang: varchar('lang', { length: 8 }).notNull().default('en'),
  linkedWalletId: varchar('linked_wallet_id', { length: 128 }).unique(),
  walletAddress: varchar('wallet_address', { length: 42 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
```

**`watchedWallets.address` column** — widened from `varchar(42)` (EVM-only) to `varchar(64)` to accommodate Solana base58 addresses.

**`updatedAt` added** to all three tables (`users`, `events`, `watchedWallets`) using Drizzle's `.$onUpdate()` hook.

**Migration collapse** — Deleted `0001_replace_telegram_id_with_handle.sql`, `0002_address_index_varchar64.sql`, and their snapshot JSONs. Replaced `0000_init_schema.sql` with a clean `0000_init.sql` that reflects the final desired state. The journal was reset to a single entry.

**`watched_wallets_address_idx`** — Added a non-unique btree index on `address` alone (in addition to the existing composite unique index) to support fast lookups when routing incoming Alchemy webhook payloads to the correct user by wallet address.

**Seed script added** at `backend/src/db/seed.ts` — upserts a demo user on `linkedUserId` conflict, callable via `pnpm db:seed`.

## Prevention & Best Practices

### How to avoid needing large schema restructures mid-project

The schema-redesign-goldsky-pivot restructure was forced by three compounding problems: a single-table design that mixed concerns, IDR-locked amount storage, and an external provider (Alchemy Notify) hitting free-tier limits. Each was individually addressable earlier.

**Design decisions that prevent surprise restructures:**

1. **Model semantically distinct entities as distinct tables from the start.** The `events` single-table anti-pattern (onchain + offchain columns in one row with ~8 nullable columns depending on row type) should have been caught during schema review. If you have two row types that each make half the columns NULL, you have two tables, not one.

2. **Never hardcode a currency or chain identifier in a column name.** `offchain_amount_idr_micro` baked IDR into the column name, not the value. A column named after a specific currency requires a migration to add another. Use `amount_fiat numeric + currency_code FK` from day one.

3. **Store decimals context alongside raw amounts.** Raw uint256 strings with no FK to decimals metadata are unqueryable by an agent and ambiguous to any reader. The `assets` table with `decimals` + `amount_decimal` pre-computed at ingestion is the right model — commit to it before your first event row.

4. **Use FK-enforced registries for chain metadata, not env vars.** RPC URLs and explorer URLs in `env.ts` and `tokens.ts` means adding a chain is a code change. A `networks` table makes it a seed row. Introduce the registry before you have more than one chain.

5. **Validate your webhook provider's free-tier limits before building around it.** Alchemy Notify's "webhook paused" mid-session forced the Goldsky pivot. Check quotas on day one; the architecture around the provider should be swappable regardless.

6. **Prefer `uuid v7` for surrogate PKs from the start.** `serial` int IDs expose record counts and require a migration to change. UUID v7 is time-sortable (good index performance), non-enumerable (API-safe), and eliminates this class of migration.

---

### Best practices for Drizzle migration management in this project

1. **Rename random migration files immediately after `pnpm db:generate`.** Drizzle Kit generates names like `0002_fat_gideon.sql`. Rename to `0002_descriptive_name.sql` and update the `"tag"` in `backend/drizzle/meta/_journal.json` to match. The snapshot file (`meta/NNNN_snapshot.json`) does not need renaming.

2. **Drop-and-recreate is fine in dev, but establish the rule explicitly.** This project has no prod data yet. The plan documents this as intentional: delete `0000_init.sql` and `meta/`, rerun `db:generate`. Make this explicit in PR descriptions so no one is surprised.

3. **Keep `reset.ts` in sync with `schema.ts`.** When you add a table to `schema.ts`, add it to the `DROP TABLE IF EXISTS` list in `reset.ts` in the same commit. The seed + circular FK insertion order (assets first with `chainId: null`, then networks, then patch) must be documented in `seed.ts` with comments — the current plan's Phase 3 shows the right approach.

4. **Seed data belongs in version control, seeded to a known state.** `pnpm db:seed` should be idempotent (`ON CONFLICT DO NOTHING` or upsert). Seed inserts for `networks` and `assets` are reference data — they should not change between runs.

5. **One migration per meaningful change, not per session.** Resist running `db:generate` mid-feature and committing a partial migration. Generate once per logical unit of work, with a descriptive name.

6. **For `numeric` columns returned as strings by Drizzle:** document this in the type exports (`// Drizzle returns string; consumers must parseFloat()`). Undocumented `string` where callers expect `number` causes silent bugs.

---

### Checklist for schema changes going forward

Before touching `schema.ts`:

- [ ] Does the change introduce a new entity or just a new column? New entity = new table, not a new nullable column on an existing table.
- [ ] Does any column encode a specific currency, chain, or locale in its name? Restructure to use a `currency_code FK → assets` pattern instead.
- [ ] Does any raw amount column lack a corresponding decimals reference? Add `asset_code FK → assets` to provide decimals context.
- [ ] Are any new PKs using `serial`? Switch to `uuid().primaryKey().$defaultFn(() => uuidv7())`.
- [ ] Does the change require updates to `reset.ts`? Update the DROP list in the same commit.
- [ ] Does the change require new seed rows? Update `seed.ts` with correct insertion order for circular FKs.

After `pnpm db:generate`:

- [ ] Rename the generated migration file from Drizzle's random name to a descriptive slug.
- [ ] Update the `"tag"` field in `backend/drizzle/meta/_journal.json` to match the new filename (without `.sql`).
- [ ] Run `pnpm db:reset && pnpm db:migrate && pnpm db:seed` to confirm the migration applies cleanly.
- [ ] Run `pnpm typecheck` — zero errors before committing.

Before merging a schema PR:

- [ ] PR description documents what changed and why (decision log, not just action description).
- [ ] Any breaking changes to service-layer types (`NetworthResult`, `TokenBalance`, etc.) are updated in the same PR.
- [ ] No `serial` columns, no hardcoded currency strings in column names, no raw amounts without decimals context.

## Related Documentation

- `plans/features/schema-redesign-goldsky-pivot/brainstorm.md` — brainstorm that defined the scope of this restructure
- `plans/features/schema-redesign-goldsky-pivot/plan.md` — implementation plan; Phases 2 and 3 (table split + Goldsky) are still pending
- `plans/features/backend-refactor-alchemy-webhook/` — prior feature cycle; Alchemy webhook refactor that preceded the schema work
- `backend/src/db/schema.ts` — current schema definition
- `backend/drizzle/0000_init.sql` — collapsed migration (single source of truth for DB shape)
- `backend/src/db/seed.ts` — demo user seed; run via `pnpm db:seed`
- `docs/architecture.md` — system architecture overview
