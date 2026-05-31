CREATE TABLE IF NOT EXISTS "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" varchar(32) NOT NULL,
	"onchain_chain_id" integer,
	"onchain_tx_hash" varchar(66),
	"onchain_log_index" integer,
	"onchain_block_number" bigint,
	"onchain_amount" varchar(80),
	"onchain_token" varchar(42),
	"onchain_from" varchar(42),
	"onchain_to" varchar(42),
	"offchain_amount_idr_micro" bigint,
	"offchain_source" varchar(64),
	"offchain_note" varchar(512),
	"link_id" varchar(64),
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"linked_user_id" varchar(128) NOT NULL,
	"email" varchar(256) NOT NULL,
	"lang" varchar(8) DEFAULT 'en' NOT NULL,
	"linked_wallet_id" varchar(128),
	"wallet_address" varchar(42),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_linked_user_id_unique" UNIQUE("linked_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_linked_wallet_id_unique" UNIQUE("linked_wallet_id"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watched_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"address" varchar(64) NOT NULL,
	"label" varchar(64),
	"chain_id" integer DEFAULT 5000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watched_wallets" ADD CONSTRAINT "watched_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "events_onchain_idempotency" ON "events" USING btree ("onchain_chain_id","onchain_tx_hash","onchain_log_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_user_created_at" ON "events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_link_id" ON "events" USING btree ("link_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watched_user_chain_address" ON "watched_wallets" USING btree ("user_id","chain_id","address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watched_wallets_address_idx" ON "watched_wallets" USING btree ("address");