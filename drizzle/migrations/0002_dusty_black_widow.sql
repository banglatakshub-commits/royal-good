CREATE TABLE IF NOT EXISTS "payment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tg_id" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_transactions_tg_idx" ON "payment_transactions" USING btree ("tg_id");