import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Users table — one row per OpenClaw skill user.
 * Single-user for MVP; id=1 is the default user.
 * walletAddress is the Tier 2 Privy wallet address (same on all EVM chains).
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  handle: varchar('handle', { length: 128 }).notNull().unique().default('default'),
  lang: varchar('lang', { length: 8 }).notNull().default('en'),
  privyWalletId: varchar('privy_wallet_id', { length: 128 }),
  walletAddress: varchar('wallet_address', { length: 42 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Unified event ledger — one row per logical financial event.
 * A row may have an onchain side (tx hash + log index on a chain),
 * an offchain side (IDR amount, source, note), or both linked by linkId.
 *
 * IDR amounts use micros (×10^6) to avoid float rounding.
 *
 * Idempotency: onchain events are deduped via (chainId, txHash, logIndex) unique index.
 * NULLs are distinct in Postgres unique indexes, so offchain-only rows don't conflict.
 */
export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    kind: varchar('kind', { length: 32 }).notNull(),
    // Onchain side
    onchainChainId: integer('onchain_chain_id'),
    onchainTxHash: varchar('onchain_tx_hash', { length: 66 }),
    onchainLogIndex: integer('onchain_log_index'),
    onchainBlockNumber: bigint('onchain_block_number', { mode: 'bigint' }),
    onchainAmount: varchar('onchain_amount', { length: 80 }), // wei-style string, lossless
    onchainToken: varchar('onchain_token', { length: 42 }),
    onchainFrom: varchar('onchain_from', { length: 42 }),
    onchainTo: varchar('onchain_to', { length: 42 }),
    // Offchain side
    offchainAmountIdrMicro: bigint('offchain_amount_idr_micro', { mode: 'bigint' }),
    offchainSource: varchar('offchain_source', { length: 64 }),
    offchainNote: varchar('offchain_note', { length: 512 }),
    // Grouping + reconciliation
    linkId: varchar('link_id', { length: 64 }),
    rawPayload: jsonb('raw_payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    onchainIdempotency: uniqueIndex('events_onchain_idempotency').on(
      t.onchainChainId,
      t.onchainTxHash,
      t.onchainLogIndex,
    ),
    userCreatedAt: index('events_user_created_at').on(t.userId, t.createdAt),
    linkIdx: index('events_link_id').on(t.linkId),
  }),
);

/**
 * Watched wallets — Tier 1 addresses the user wants visible but not signed against.
 * Same address may exist on multiple chains; (userId, chainId, address) is unique.
 */
export const watchedWallets = pgTable(
  'watched_wallets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    address: varchar('address', { length: 64 }).notNull(),
    label: varchar('label', { length: 64 }),
    chainId: integer('chain_id').notNull().default(5000),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userAddress: uniqueIndex('watched_user_chain_address').on(t.userId, t.chainId, t.address),
    addressIdx: index('watched_wallets_address_idx').on(t.address),
  }),
);

// Type exports for use in queries
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type WatchedWallet = typeof watchedWallets.$inferSelect;
export type NewWatchedWallet = typeof watchedWallets.$inferInsert;
