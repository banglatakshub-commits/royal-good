ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "activation_fee" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "nek_api_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "nek_secret_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT false NOT NULL;