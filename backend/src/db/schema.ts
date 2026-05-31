import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

// ── networks ──────────────────────────────────────────────────
export const networks = pgTable('networks', {
  chainId: integer('chain_id').primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  rpcUrl: varchar('rpc_url', { length: 256 }).notNull(),
  explorerUrl: varchar('explorer_url', { length: 256 }).notNull(),
  nativeCurrencyCode: varchar('native_currency_code', { length: 16 }),
  isTestnet: boolean('is_testnet').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
});

// ── assets ────────────────────────────────────────────────────
// Unified registry for both crypto tokens and fiat currencies.
// coingeckoId: the asset's CoinGecko coin ID (e.g. 'mantle', 'tether') — used as the `ids` param.
// vsCurrency:  the CoinGecko vs_currency param (e.g. 'idr', 'usd') — used for fiat price quotes.
// NOTE: numeric columns (amountDecimal, amountFiat, rateAtTime) return string in Drizzle. Use parseFloat().
export const assets = pgTable(
  'assets',
  {
    code: varchar('code', { length: 16 }).primaryKey(),
    name: varchar('name', { length: 64 }).notNull(),
    symbol: varchar('symbol', { length: 8 }).notNull(),
    decimals: integer('decimals').notNull(),
    assetType: varchar('asset_type', { length: 16 }).notNull(), // native | erc20 | fiat | stablecoin
    coingeckoId: varchar('coingecko_id', { length: 64 }),       // CoinGecko coin ID for price lookups
    vsCurrency: varchar('vs_currency', { length: 16 }),         // CoinGecko vs_currency (fiat quote)
    chainId: integer('chain_id').references(() => networks.chainId),
    tokenAddress: varchar('token_address', { length: 64 }),     // null for native tokens and fiat
  },
  (t) => ({
    tokenAddressUnique: uniqueIndex('assets_token_address_unique')
      .on(t.chainId, t.tokenAddress)
      .where(sql`${t.tokenAddress} IS NOT NULL`),
    decimalsCheck: check('assets_decimals_range', sql`${t.decimals} >= 0 AND ${t.decimals} <= 77`),
  }),
);

// ── users ─────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  linkedUserId: varchar('linked_user_id', { length: 128 }).notNull().unique(),
  email: varchar('email', { length: 256 }).notNull().unique(),
  lang: varchar('lang', { length: 8 }).notNull().default('en'),
  linkedWalletId: varchar('linked_wallet_id', { length: 128 }).unique(),
  walletAddress: varchar('wallet_address', { length: 64 }).unique(),
  preferredCurrency: varchar('preferred_currency', { length: 16 })
    .notNull()
    .default('IDR')
    .references(() => assets.code),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ── watched_wallets ───────────────────────────────────────────
export const watchedWallets = pgTable(
  'watched_wallets',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull().references(() => users.id),
    chainId: integer('chain_id').notNull().references(() => networks.chainId),
    address: varchar('address', { length: 64 }).notNull(),
    label: varchar('label', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userChainAddress: uniqueIndex('watched_user_chain_address').on(t.userId, t.chainId, t.address),
    addressIdx: index('watched_wallets_address_idx').on(t.address),
  }),
);

// ── onchain_events ────────────────────────────────────────────
// amountRaw:     lossless source of truth (raw uint256 string from chain)
// amountDecimal: pre-parsed convenience cache (amountRaw / 10^assets.decimals)
//                Drizzle returns this as string — callers must parseFloat()
export const onchainEvents = pgTable(
  'onchain_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull().references(() => users.id),
    chainId: integer('chain_id').notNull().references(() => networks.chainId),
    txHash: varchar('tx_hash', { length: 66 }).notNull(),
    logIndex: integer('log_index').notNull().default(0), // 0 for native transfers (no log emitted)
    blockNumber: bigint('block_number', { mode: 'bigint' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    kind: varchar('kind', { length: 32 }),           // open: transfer | swap | bridge | yield | ...
    direction: varchar('direction', { length: 8 }),  // inflow | outflow | neutral
    assetCode: varchar('asset_code', { length: 16 }).references(() => assets.code),
    amountRaw: varchar('amount_raw', { length: 80 }),
    amountDecimal: numeric('amount_decimal', { precision: 20, scale: 8 }),
    tokenAddress: varchar('token_address', { length: 64 }),
    fromAddress: varchar('from_address', { length: 64 }),
    toAddress: varchar('to_address', { length: 64 }),
    source: varchar('source', { length: 64 }),
    rawPayload: jsonb('raw_payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    onchainIdempotency: uniqueIndex('onchain_events_idempotency').on(t.chainId, t.txHash, t.logIndex),
    userCreatedAt: index('onchain_events_user_created_at').on(t.userId, t.createdAt),
    userChainCreatedAt: index('onchain_events_user_chain_created_at').on(t.userId, t.chainId, t.createdAt),
    tokenAddressIdx: index('onchain_events_token_address_idx').on(t.tokenAddress),
    directionCheck: check(
      'onchain_events_direction_check',
      sql`${t.direction} IN ('inflow', 'outflow', 'neutral')`,
    ),
  }),
);

// ── offchain_entries ──────────────────────────────────────────
// amountFiat: settled fiat amount — 0 decimal scale because IDR/VND have no minor units.
//             For currencies with cents (SGD, PHP, THB), store in whole units too (e.g. SGD 15).
// rateAtTime: exchange rate snapshot at entry time (numeric(24,12) handles tiny micro-cap rates).
export const offchainEntries = pgTable(
  'offchain_entries',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull().references(() => users.id),
    kind: varchar('kind', { length: 64 }),            // open: p2p_trade | bank_transfer | ewallet | expense | income | ...
    direction: varchar('direction', { length: 8 }),   // inflow | outflow | neutral
    amountFiat: numeric('amount_fiat', { precision: 20, scale: 0 }),
    currencyCode: varchar('currency_code', { length: 16 }).references(() => assets.code),
    rateAtTime: numeric('rate_at_time', { precision: 24, scale: 12 }),
    assetCode: varchar('asset_code', { length: 16 }).references(() => assets.code),
    amountDecimal: numeric('amount_decimal', { precision: 20, scale: 8 }),
    note: text('note'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    source: varchar('source', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedAt: index('offchain_entries_user_created_at').on(t.userId, t.createdAt),
    userOccurredAt: index('offchain_entries_user_occurred_at').on(t.userId, t.occurredAt),
    directionCheck: check(
      'offchain_entries_direction_check',
      sql`${t.direction} IN ('inflow', 'outflow', 'neutral')`,
    ),
  }),
);

// ── event_reconciliations ─────────────────────────────────────
// M:N junction linking onchain events to offchain entries.
// Unlink by soft-deleting (set deletedAt) — both parent rows survive intact.
// ON DELETE CASCADE: if a parent event is deleted, its reconciliation links auto-clean.
// Partial unique index ensures only one active reconciliation per (onchain, offchain) pair.
export const eventReconciliations = pgTable(
  'event_reconciliations',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    onchainEventId: uuid('onchain_event_id').references(() => onchainEvents.id, { onDelete: 'cascade' }),
    offchainEntryId: uuid('offchain_entry_id').references(() => offchainEntries.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    onchainIdx: index('recon_onchain_event_id_idx').on(t.onchainEventId),
    offchainIdx: index('recon_offchain_entry_id_idx').on(t.offchainEntryId),
    activePairUnique: uniqueIndex('recon_active_pair_unique')
      .on(t.onchainEventId, t.offchainEntryId)
      .where(sql`${t.deletedAt} IS NULL`),
  }),
);

// ── type exports ──────────────────────────────────────────────
export type Network = typeof networks.$inferSelect;
export type NewNetwork = typeof networks.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type WatchedWallet = typeof watchedWallets.$inferSelect;
export type NewWatchedWallet = typeof watchedWallets.$inferInsert;
export type OnchainEvent = typeof onchainEvents.$inferSelect;
export type NewOnchainEvent = typeof onchainEvents.$inferInsert;
export type OffchainEntry = typeof offchainEntries.$inferSelect;
export type NewOffchainEntry = typeof offchainEntries.$inferInsert;
export type EventReconciliation = typeof eventReconciliations.$inferSelect;
export type NewEventReconciliation = typeof eventReconciliations.$inferInsert;
