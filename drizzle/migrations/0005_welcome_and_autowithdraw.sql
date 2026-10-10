ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "welcome_message" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "wd_amount" integer;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "wd_method" text;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "wd_number" text;