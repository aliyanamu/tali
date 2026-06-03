-- Add decoded trigger/action param columns to rules table.
-- Nullable for backward compat — existing rows have NULL, matcher skips them via partial index.
ALTER TABLE "rules" ADD COLUMN "trigger_token_address" varchar(64);
--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "trigger_direction" varchar(4);
--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "trigger_threshold_raw" varchar(80);
--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "action_type" varchar(16);
--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "action_target_pct" integer;
--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "action_max_slippage_bps" integer;
--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_trigger_direction_check" CHECK (trigger_direction IS NULL OR trigger_direction IN ('IN', 'OUT', 'BOTH'));
--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_action_type_check" CHECK (action_type IS NULL OR action_type IN ('FARM', 'SWAP', 'DCA'));
--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_action_target_pct_check" CHECK (action_target_pct IS NULL OR (action_target_pct >= 1 AND action_target_pct <= 100));
--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_action_max_slippage_bps_check" CHECK (action_max_slippage_bps IS NULL OR (action_max_slippage_bps >= 0 AND action_max_slippage_bps <= 1000));
--> statement-breakpoint
-- Partial index for fast rule matching — only active rules with decoded params
CREATE INDEX "rules_matcher_idx" ON "rules" USING btree ("trigger_token_address","trigger_direction") WHERE active = true AND trigger_token_address IS NOT NULL;
--> statement-breakpoint
-- Audit trail for every autonomous rule execution attempt
CREATE TABLE "rule_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rule_id" uuid NOT NULL,
	"trigger_tx_hash" varchar(66) NOT NULL,
	"chain_id" integer NOT NULL,
	"trigger_amount_raw" varchar(80) NOT NULL,
	"execution_amount_usd" numeric(20, 6),
	"byreal_cli_command" text,
	"byreal_cli_output" text,
	"solana_tx_sig" varchar(128),
	"mantle_attest_tx_hash" varchar(66),
	"status" varchar(16) DEFAULT 'executing' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attested_at" timestamp with time zone,
	CONSTRAINT "rule_executions_status_check" CHECK (status IN ('executing', 'executed', 'attested', 'failed'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX "rule_executions_rule_id_idx" ON "rule_executions" USING btree ("rule_id");
--> statement-breakpoint
-- Idempotency: one execution attempt per (rule, trigger tx) — prevents double-execution
CREATE UNIQUE INDEX "rule_executions_idempotency" ON "rule_executions" USING btree ("rule_id","trigger_tx_hash");
