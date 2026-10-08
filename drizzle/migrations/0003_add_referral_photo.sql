ALTER TABLE public.referrals ADD COLUMN photo_url TEXT;
COMMENT ON COLUMN public.referrals.photo_url IS 'Profile photo URL of the referred user, captured at join time';