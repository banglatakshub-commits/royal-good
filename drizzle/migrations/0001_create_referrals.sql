CREATE TABLE public.referrals (
  referred_id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL,
  referred_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_ref CHECK (referred_id <> referrer_id)
);
CREATE INDEX referrals_referrer_idx ON public.referrals(referrer_id);
GRANT SELECT, INSERT ON public.referrals TO anon, authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read referrals" ON public.referrals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert referrals" ON public.referrals FOR INSERT TO anon, authenticated WITH CHECK (true);