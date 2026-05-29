-- Replace telegram_id (bigint, Telegram-specific) with handle (varchar, provider-agnostic)
-- Single-user MVP: existing row gets handle='default'

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_telegram_id_unique";
ALTER TABLE "users" DROP COLUMN IF EXISTS "telegram_id";
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "handle" varchar(128) NOT NULL DEFAULT 'default';
ALTER TABLE "users" ADD CONSTRAINT "users_handle_unique" UNIQUE("handle");
