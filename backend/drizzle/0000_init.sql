CREATE TABLE IF NOT EXISTS "assets" (
	"code" varchar(16) PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"symbol" varchar(8) NOT NULL,
	"decimals" integer NOT NULL,
	"asset_type" varchar(16) NOT NULL,
	"coingecko_id" varchar(64),
	"vs_currency" varchar(16),
	"chain_id" integer,
	"token_address" varchar(64),
	CONSTRAINT "assets_decimals_range" CHECK ("assets"."decimals" >= 0 AND "assets"."decimals" <= 77),
	CONSTRAINT "assets_asset_type_check" CHECK ("assets"."asset_type" IN ('native', 'erc20', 'fiat', 'stablecoin'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_reconciliations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"onchain_event_id" uuid,
	"offchain_entry_id" uuid,
	"kind" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "networks" (
	"chain_id" integer PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"rpc_url" varchar(256) NOT NULL,
	"explorer_url" varchar(256) NOT NULL,
	"native_currency_code" varchar(16),
	"is_testnet" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offchain_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(64),
	"direction" varchar(8),
	"fiat_amount" numeric(20, 6),
	"currency_code" varchar(16),
	"note" text,
	"occurred_at" timestamp with time zone,
	"source" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offchain_entries_direction_check" CHECK ("offchain_entries"."direction" IN ('inflow', 'outflow', 'neutral'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onchain_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"tx_hash" varchar(66) NOT NULL,
	"log_index" integer DEFAULT 0 NOT NULL,
	"block_number" bigint,
	"confirmed_at" timestamp with time zone,
	"kind" varchar(32),
	"direction" varchar(8),
	"asset_code" varchar(16),
	"amount_raw" varchar(80),
	"amount_decimal" numeric(20, 8),
	"token_address" varchar(64),
	"from_address" varchar(64),
	"to_address" varchar(64),
	"source" varchar(64),
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onchain_events_direction_check" CHECK ("onchain_events"."direction" IN ('inflow', 'outflow', 'neutral'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"linked_user_id" varchar(128) NOT NULL,
	"email" varchar(256),
	"lang" varchar(8) DEFAULT 'en' NOT NULL,
	"linked_wallet_id" varchar(128),
	"wallet_address" varchar(64),
	"preferred_currency" varchar(16) DEFAULT 'IDR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_linked_user_id_unique" UNIQUE("linked_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_linked_wallet_id_unique" UNIQUE("linked_wallet_id"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watched_wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"address" varchar(64) NOT NULL,
	"label" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_chain_id_networks_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."networks"("chain_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_reconciliations" ADD CONSTRAINT "event_reconciliations_onchain_event_id_onchain_events_id_fk" FOREIGN KEY ("onchain_event_id") REFERENCES "public"."onchain_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_reconciliations" ADD CONSTRAINT "event_reconciliations_offchain_entry_id_offchain_entries_id_fk" FOREIGN KEY ("offchain_entry_id") REFERENCES "public"."offchain_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offchain_entries" ADD CONSTRAINT "offchain_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offchain_entries" ADD CONSTRAINT "offchain_entries_currency_code_assets_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."assets"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onchain_events" ADD CONSTRAINT "onchain_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onchain_events" ADD CONSTRAINT "onchain_events_chain_id_networks_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."networks"("chain_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onchain_events" ADD CONSTRAINT "onchain_events_asset_code_assets_code_fk" FOREIGN KEY ("asset_code") REFERENCES "public"."assets"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_preferred_currency_assets_code_fk" FOREIGN KEY ("preferred_currency") REFERENCES "public"."assets"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watched_wallets" ADD CONSTRAINT "watched_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watched_wallets" ADD CONSTRAINT "watched_wallets_chain_id_networks_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."networks"("chain_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assets_token_address_unique" ON "assets" USING btree ("chain_id","token_address") WHERE "assets"."token_address" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recon_onchain_event_id_idx" ON "event_reconciliations" USING btree ("onchain_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recon_offchain_entry_id_idx" ON "event_reconciliations" USING btree ("offchain_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recon_active_pair_unique" ON "event_reconciliations" USING btree ("onchain_event_id","offchain_entry_id") WHERE "event_reconciliations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recon_active_onchain_only" ON "event_reconciliations" USING btree ("onchain_event_id") WHERE "event_reconciliations"."deleted_at" IS NULL AND "event_reconciliations"."offchain_entry_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recon_active_offchain_only" ON "event_reconciliations" USING btree ("offchain_entry_id") WHERE "event_reconciliations"."deleted_at" IS NULL AND "event_reconciliations"."onchain_event_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offchain_entries_user_created_at" ON "offchain_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offchain_entries_user_occurred_at" ON "offchain_entries" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onchain_events_idempotency" ON "onchain_events" USING btree ("user_id","chain_id","tx_hash","log_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onchain_events_user_created_at" ON "onchain_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onchain_events_user_chain_created_at" ON "onchain_events" USING btree ("user_id","chain_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onchain_events_token_address_idx" ON "onchain_events" USING btree ("token_address");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watched_user_chain_address" ON "watched_wallets" USING btree ("user_id","chain_id","address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watched_wallets_address_idx" ON "watched_wallets" USING btree ("address");
--> statement-breakpoint
ALTER TABLE "event_reconciliations" ADD CONSTRAINT "reconciliation_has_at_least_one_side" CHECK (onchain_event_id IS NOT NULL OR offchain_entry_id IS NOT NULL);
--> statement-breakpoint
CREATE VIEW "reconciled_pairs" AS
  SELECT
    er.id               AS reconciliation_id,
    er.kind             AS reconciliation_kind,
    er.created_at       AS reconciled_at,
    oe.id               AS onchain_id,
    oe.tx_hash,
    oe.direction        AS onchain_direction,
    oe.asset_code,
    oe.amount_decimal   AS onchain_amount,
    off.id              AS offchain_id,
    off.kind            AS offchain_kind,
    off.fiat_amount,
    off.currency_code,
    off.note
  FROM event_reconciliations er
  LEFT JOIN onchain_events oe  ON oe.id  = er.onchain_event_id
  LEFT JOIN offchain_entries off ON off.id = er.offchain_entry_id
  WHERE er.deleted_at IS NULL;
