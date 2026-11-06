CREATE TABLE "verification_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tg_id" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"recipient_number" text NOT NULL,
	"sender_number" text NOT NULL,
	"transaction_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "bkash_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "nagad_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "verification_transaction_unique" ON "verification_requests" USING btree ("method",upper("transaction_id"));--> statement-breakpoint
CREATE UNIQUE INDEX "verification_pending_user_unique" ON "verification_requests" USING btree ("tg_id") WHERE "verification_requests"."status" = 'pending';