CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"contract_rule_id" bigint NOT NULL,
	"agent_id" bigint NOT NULL,
	"nl_text" text NOT NULL,
	"trigger_hash" varchar(66) NOT NULL,
	"action_hash" varchar(66) NOT NULL,
	"contract_address" varchar(42) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rules" ADD CONSTRAINT "rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "rules_contract_rule_idx" ON "rules" USING btree ("contract_address","contract_rule_id");
--> statement-breakpoint
CREATE INDEX "rules_user_active_idx" ON "rules" USING btree ("user_id","active");
