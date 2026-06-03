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
  // No FK to assets.code — circular dependency (assets.chainId → networks). Validated at seed time.
  nativeCurrencyCode: varchar('native_currency_code', { length: 16 }),
  isTestnet: boolean('is_testnet').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
});

// ── assets ────────────────────────────────────────────────────
// Unified registry for both crypto tokens and fiat currencies.
// coingeckoId: the asset's CoinGecko coin ID (e.g. 'mantle', 'tether') — used as the `ids` param.
// vsCurrency:  the CoinGecko vs_currency param (e.g. 'idr', 'usd') — used for fiat price quotes.
// NOTE: numeric columns (amountDecimal) return string in Drizzle. Use parseFloat().
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
    assetTypeCheck: check(
      'assets_asset_type_check',
      sql`${t.assetType} IN ('native', 'erc20', 'fiat', 'stablecoin')`,
    ),
  }),
);

// ── users ─────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  linkedUserId: varchar('linked_user_id', { length: 128 }).notNull().unique(),
  // Nullable: Privy supports wallet-only sign-in with no email
  email: varchar('email', { length: 256 }).unique(),
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
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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

// ── rules ─────────────────────────────────────────────────────
// contractRuleId: the uint256 ruleId returned by AutonomousRule.setRule() on Mantle
// agentId:        the Mantle-issued ERC-8004 NFT token ID stored in the contract rule
// triggerHash / actionHash: keccak256 anchors matching the on-chain struct — full params in nlText
// contractAddress: AUTONOMOUS_RULE_CONTRACT address the rule was set on (for multi-deploy safety)
// Decoded params (triggerToken* / action*): populated at rules add time; nullable for pre-migration rows.
// The matcher uses these columns via a partial index — rows with null triggerTokenAddress are skipped.
export const rules = pgTable(
  'rules',
  {
    id:              uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    userId:          uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    contractRuleId:  bigint('contract_rule_id', { mode: 'bigint' }).notNull(),
    agentId:         bigint('agent_id', { mode: 'bigint' }).notNull(),
    nlText:          text('nl_text').notNull(),
    triggerHash:     varchar('trigger_hash', { length: 66 }).notNull(),
    actionHash:      varchar('action_hash', { length: 66 }).notNull(),
    contractAddress: varchar('contract_address', { length: 42 }).notNull(),
    active:          boolean('active').notNull().default(true),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt:       timestamp('expires_at', { withTimezone: true }), // null = never expires
    // Decoded trigger params — enables matcher SQL without recomputing keccak256 hashes
    triggerTokenAddress:  varchar('trigger_token_address', { length: 64 }),
    triggerDirection:     varchar('trigger_direction', { length: 4 }),    // 'IN' | 'OUT' | 'BOTH'
    triggerThresholdRaw:  varchar('trigger_threshold_raw', { length: 80 }),
    // Decoded action params
    actionType:           varchar('action_type', { length: 16 }),         // 'FARM' | 'SWAP' | 'DCA'
    actionTargetPct:      integer('action_target_pct'),                   // 1–100
    actionMaxSlippageBps: integer('action_max_slippage_bps'),             // 0–1000
  },
  (t) => ({
    uniqueContractRule: uniqueIndex('rules_contract_rule_idx').on(t.contractAddress, t.contractRuleId),
    userActiveIdx:      index('rules_user_active_idx').on(t.userId, t.active),
    // Partial index for rule matcher — skips null rows (pre-migration rules), avoids bool leading col
    matcherIdx: index('rules_matcher_idx')
      .on(t.triggerTokenAddress, t.triggerDirection)
      .where(sql`${t.active} = true AND ${t.triggerTokenAddress} IS NOT NULL`),
    // CHECK constraints — guard enum-like columns at DB level
    triggerDirectionCheck: check(
      'rules_trigger_direction_check',
      sql`${t.triggerDirection} IS NULL OR ${t.triggerDirection} IN ('IN', 'OUT', 'BOTH')`,
    ),
    actionTypeCheck: check(
      'rules_action_type_check',
      sql`${t.actionType} IS NULL OR ${t.actionType} IN ('FARM', 'SWAP', 'DCA')`,
    ),
    actionTargetPctCheck: check(
      'rules_action_target_pct_check',
      sql`${t.actionTargetPct} IS NULL OR (${t.actionTargetPct} >= 1 AND ${t.actionTargetPct} <= 100)`,
    ),
    actionMaxSlippageBpsCheck: check(
      'rules_action_max_slippage_bps_check',
      sql`${t.actionMaxSlippageBps} IS NULL OR (${t.actionMaxSlippageBps} >= 0 AND ${t.actionMaxSlippageBps} <= 1000)`,
    ),
  }),
);

// ── onchain_events ────────────────────────────────────────────
// amountRaw:     lossless source of truth (raw uint256 string from chain)
// amountDecimal: pre-parsed convenience cache (amountRaw / 10^assets.decimals)
//                Drizzle returns this as string — callers must parseFloat()
// logIndex -1:   sentinel for native transfers (no ERC-20 log emitted)
export const onchainEvents = pgTable(
  'onchain_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    chainId: integer('chain_id').notNull().references(() => networks.chainId),
    txHash: varchar('tx_hash', { length: 66 }).notNull(),
    logIndex: integer('log_index').notNull().default(0),
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
    // userId is part of the idempotency key because the same tx can appear for both sender and
    // receiver (different users watching the same wallet). Goldsky retries are handled by onConflictDoNothing.
    onchainIdempotency: uniqueIndex('onchain_events_idempotency').on(t.userId, t.chainId, t.txHash, t.logIndex),
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
// fiatAmount: human-readable decimal (numeric(20,6) covers all real fiat currencies — max 3 decimals in practice).
// rateAtTime: exchange rate snapshot at entry time (numeric(24,12) handles tiny micro-cap rates).
// The crypto side lives in onchain_events; link via event_reconciliations to get both sides.
// NOTE: numeric columns return string in Drizzle. Use parseFloat().
export const offchainEntries = pgTable(
  'offchain_entries',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 64 }),            // open: p2p_trade | bank_transfer | ewallet | expense | income | ...
    direction: varchar('direction', { length: 8 }),   // inflow | outflow | neutral
    fiatAmount: numeric('fiat_amount', { precision: 20, scale: 6 }),
    currencyCode: varchar('currency_code', { length: 16 }).references(() => assets.code),
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
    // Full-pair unique: covers (onchain, offchain) rows — handles the most common case
    activePairUnique: uniqueIndex('recon_active_pair_unique')
      .on(t.onchainEventId, t.offchainEntryId)
      .where(sql`${t.deletedAt} IS NULL`),
    // Half-sided unique indexes: prevent duplicate active reconciliations for NULL-sided rows
    activeOnchainOnly: uniqueIndex('recon_active_onchain_only')
      .on(t.onchainEventId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.offchainEntryId} IS NULL`),
    activeOffchainOnly: uniqueIndex('recon_active_offchain_only')
      .on(t.offchainEntryId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.onchainEventId} IS NULL`),
  }),
);

// ── rule_executions ───────────────────────────────────────────
// Audit trail for every autonomous rule execution attempt.
// Status: executing → executed (byreal-cli ok) → attested (Mantle ok) | failed
// solanaTxSig: raw base58 Solana signature from byreal-cli stdout.
// mantleAttestTxHash: Mantle tx hash from attestExecution() — canonical on-chain proof.
// Idempotency: unique(ruleId, triggerTxHash) prevents double-execution on webhook retries.
export const ruleExecutions = pgTable(
  'rule_executions',
  {
    id:                  uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    ruleId:              uuid('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
    triggerTxHash:       varchar('trigger_tx_hash', { length: 66 }).notNull(),
    chainId:             integer('chain_id').notNull(),
    triggerAmountRaw:    varchar('trigger_amount_raw', { length: 80 }).notNull(),
    executionAmountUsd:  numeric('execution_amount_usd', { precision: 20, scale: 6 }),
    byreaCliCommand:     text('byreal_cli_command'),
    byreaCliOutput:      text('byreal_cli_output'),
    solanaTxSig:         varchar('solana_tx_sig', { length: 128 }),
    mantleAttestTxHash:  varchar('mantle_attest_tx_hash', { length: 66 }),
    status:              varchar('status', { length: 16 }).notNull().default('executing'),
    errorMessage:        text('error_message'),
    createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:           timestamp('updated_at', { withTimezone: true })
                           .notNull().defaultNow().$onUpdate(() => new Date()),
    attestedAt:          timestamp('attested_at', { withTimezone: true }),
  },
  (t) => ({
    ruleIdIdx:      index('rule_executions_rule_id_idx').on(t.ruleId),
    // Idempotency: one execution attempt per (rule, trigger tx)
    idempotencyIdx: uniqueIndex('rule_executions_idempotency').on(t.ruleId, t.triggerTxHash),
    statusCheck:    check(
      'rule_executions_status_check',
      sql`${t.status} IN ('executing', 'executed', 'attested', 'failed')`,
    ),
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
export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;
export type RuleExecution = typeof ruleExecutions.$inferSelect;
export type NewRuleExecution = typeof ruleExecutions.$inferInsert;
