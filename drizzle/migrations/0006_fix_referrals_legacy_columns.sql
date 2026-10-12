-- The live `referrals` table (created by an older Lovable migration via CREATE TABLE IF NOT EXISTS)
-- can carry extra NOT NULL columns that the current insert does not populate, so every referral
-- insert failed with a not-null violation (confirmed in the /start referral log). Make any such
-- leftover column nullable, and ensure created_at keeps its default, so inserts with only the
-- current columns (referred_id, referrer_id, referred_name, photo_url) succeed. Idempotent, data-safe.
ALTER TABLE public.referrals ALTER COLUMN created_at SET DEFAULT now();
--> statement-breakpoint
DO $$
DECLARE
  col text;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'referrals'
      AND is_nullable = 'NO'
      AND column_name NOT IN ('referred_id', 'referrer_id', 'created_at')
  LOOP
    EXECUTE format('ALTER TABLE public.referrals ALTER COLUMN %I DROP NOT NULL', col);
  END LOOP;
END $$;
