-- Let a completed ad claim be safely retried if the server commits its reward but
-- the Telegram WebView loses the response. Legacy rows keep NULL claim IDs.
ALTER TABLE public.ad_views ADD COLUMN IF NOT EXISTS claim_id TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ad_views_tg_claim_id_unique_idx
  ON public.ad_views (tg_id, claim_id);
