-- Optional manual bootstrap for a Railway PostgreSQL database.
-- The app normally runs the canonical versioned migration at startup with `bun run db:migrate`.
-- Keep this file in sync with drizzle/migrations/0000_railway_postgres.sql.
-- Disable legacy row policies before touching tables created by earlier deployments.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'players', 'app_settings', 'referrals', 'withdrawals', 'custom_tasks',
    'ad_views', 'job_views', 'task_claims', 'admin_telegram_ids', 'user_roles'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', table_name);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.players (
  tg_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT,
  photo_url TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  chat_id BIGINT,
  blocked BOOLEAN NOT NULL DEFAULT false
);
--> statement-breakpoint
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS chat_id BIGINT;
--> statement-breakpoint
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
UPDATE public.players SET chat_id = tg_id::bigint
WHERE chat_id IS NULL AND tg_id ~ '^[0-9]{1,18}$';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  task_reward INTEGER NOT NULL DEFAULT 5,
  ref_bonus INTEGER NOT NULL DEFAULT 5,
  min_withdraw INTEGER NOT NULL DEFAULT 50,
  daily_spins INTEGER NOT NULL DEFAULT 2,
  ads_script_id TEXT NOT NULL DEFAULT '8416',
  daily_ads INTEGER NOT NULL DEFAULT 10,
  ad_reward INTEGER NOT NULL DEFAULT 5,
  ad_seconds INTEGER NOT NULL DEFAULT 15,
  daily_typing INTEGER NOT NULL DEFAULT 5,
  daily_quiz INTEGER NOT NULL DEFAULT 5,
  support_telegram_username TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS task_reward INTEGER NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS ref_bonus INTEGER NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS min_withdraw INTEGER NOT NULL DEFAULT 50;
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS daily_spins INTEGER NOT NULL DEFAULT 2;
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS ads_script_id TEXT NOT NULL DEFAULT '8416';
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS daily_ads INTEGER NOT NULL DEFAULT 10;
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS ad_reward INTEGER NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS ad_seconds INTEGER NOT NULL DEFAULT 15;
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS daily_typing INTEGER NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS daily_quiz INTEGER NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS support_telegram_username TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS activation_fee INTEGER NOT NULL DEFAULT 100;
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS nek_api_key TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS nek_secret_key TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS nek_withdraw_key TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id TEXT PRIMARY KEY,
    tg_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_transactions_tg_idx ON public.payment_transactions (tg_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.referrals (
  referred_id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL,
  referred_name TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referred_id TEXT;
--> statement-breakpoint
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referrer_id TEXT;
--> statement-breakpoint
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referred_name TEXT;
--> statement-breakpoint
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS photo_url TEXT;
--> statement-breakpoint
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'referred_tg_id') THEN
    EXECUTE 'UPDATE public.referrals SET referred_id = COALESCE(referred_id, referred_tg_id)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'referrer_tg_id') THEN
    EXECUTE 'UPDATE public.referrals SET referrer_id = COALESCE(referrer_id, referrer_tg_id)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'id') THEN
    EXECUTE 'UPDATE public.referrals SET referred_id = COALESCE(referred_id, id::text)';
  END IF;
END $$;
--> statement-breakpoint
UPDATE public.referrals SET referred_id = 'legacy-' || ctid::text WHERE referred_id IS NULL;
--> statement-breakpoint
UPDATE public.referrals SET referrer_id = 'unknown' WHERE referrer_id IS NULL;
--> statement-breakpoint
DELETE FROM public.referrals a USING public.referrals b
WHERE a.referred_id = b.referred_id AND a.ctid > b.ctid;
--> statement-breakpoint
ALTER TABLE public.referrals ALTER COLUMN referred_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.referrals ALTER COLUMN referrer_id SET NOT NULL;
--> statement-breakpoint
DO $$
DECLARE
  primary_key_name TEXT;
  primary_key_definition TEXT;
BEGIN
  SELECT conname, pg_get_constraintdef(oid)
  INTO primary_key_name, primary_key_definition
  FROM pg_constraint
  WHERE conrelid = 'public.referrals'::regclass AND contype = 'p';

  IF primary_key_name IS NULL OR primary_key_definition <> 'PRIMARY KEY (referred_id)' THEN
    IF primary_key_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.referrals DROP CONSTRAINT %I', primary_key_name);
    END IF;
    ALTER TABLE public.referrals ADD CONSTRAINT referrals_pkey PRIMARY KEY (referred_id);
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tg_id TEXT NOT NULL,
  name TEXT,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS tg_id TEXT;
--> statement-breakpoint
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS name TEXT;
--> statement-breakpoint
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS amount INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS number TEXT;
--> statement-breakpoint
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS note TEXT;
--> statement-breakpoint
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'withdrawals' AND column_name = 'player_tg_id') THEN
    EXECUTE 'UPDATE public.withdrawals SET tg_id = COALESCE(tg_id, player_tg_id)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'withdrawals' AND column_name = 'account') THEN
    EXECUTE 'UPDATE public.withdrawals SET number = COALESCE(number, account)';
  END IF;
END $$;
--> statement-breakpoint
UPDATE public.withdrawals SET tg_id = 'unknown' WHERE tg_id IS NULL;
--> statement-breakpoint
UPDATE public.withdrawals SET number = '' WHERE number IS NULL;
--> statement-breakpoint
ALTER TABLE public.withdrawals ALTER COLUMN tg_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.withdrawals ALTER COLUMN number SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.withdrawals ALTER COLUMN id DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE public.withdrawals ALTER COLUMN id TYPE TEXT USING id::text;
--> statement-breakpoint
ALTER TABLE public.withdrawals ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS withdrawals_tg_created_idx ON public.withdrawals (tg_id, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.custom_tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT '⭐',
  link TEXT,
  reward INTEGER NOT NULL DEFAULT 5,
  wait_seconds INTEGER NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.custom_tasks ADD COLUMN IF NOT EXISTS description TEXT;
--> statement-breakpoint
ALTER TABLE public.custom_tasks ADD COLUMN IF NOT EXISTS link TEXT;
--> statement-breakpoint
ALTER TABLE public.custom_tasks ADD COLUMN IF NOT EXISTS wait_seconds INTEGER NOT NULL DEFAULT 10;
--> statement-breakpoint
ALTER TABLE public.custom_tasks ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE public.custom_tasks ALTER COLUMN id DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE public.custom_tasks ALTER COLUMN id TYPE TEXT USING id::text;
--> statement-breakpoint
ALTER TABLE public.custom_tasks ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS custom_tasks_active_created_idx ON public.custom_tasks (active, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.ad_views (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tg_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.ad_views ADD COLUMN IF NOT EXISTS tg_id TEXT;
--> statement-breakpoint
ALTER TABLE public.ad_views ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ad_views' AND column_name = 'player_tg_id') THEN
    EXECUTE 'UPDATE public.ad_views SET tg_id = COALESCE(tg_id, player_tg_id)';
  END IF;
END $$;
--> statement-breakpoint
UPDATE public.ad_views SET tg_id = 'unknown' WHERE tg_id IS NULL;
--> statement-breakpoint
ALTER TABLE public.ad_views ALTER COLUMN tg_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.ad_views ALTER COLUMN id DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE public.ad_views ALTER COLUMN id TYPE TEXT USING id::text;
--> statement-breakpoint
ALTER TABLE public.ad_views ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ad_views_tg_created_idx ON public.ad_views (tg_id, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.job_views (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tg_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.job_views ADD COLUMN IF NOT EXISTS tg_id TEXT;
--> statement-breakpoint
ALTER TABLE public.job_views ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'typing';
--> statement-breakpoint
ALTER TABLE public.job_views ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE public.job_views ALTER COLUMN id DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE public.job_views ALTER COLUMN id TYPE TEXT USING id::text;
--> statement-breakpoint
ALTER TABLE public.job_views ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS job_views_tg_kind_created_idx ON public.job_views (tg_id, kind, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.task_claims (
  tg_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tg_id, task_id)
);
--> statement-breakpoint
ALTER TABLE public.task_claims ADD COLUMN IF NOT EXISTS tg_id TEXT;
--> statement-breakpoint
ALTER TABLE public.task_claims ADD COLUMN IF NOT EXISTS task_id TEXT;
--> statement-breakpoint
ALTER TABLE public.task_claims ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE public.task_claims ALTER COLUMN task_id TYPE TEXT USING task_id::text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.admin_telegram_ids (
  tg_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.admin_telegram_ids ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
--> statement-breakpoint
INSERT INTO public.admin_telegram_ids (tg_id) VALUES ('shanto_as') ON CONFLICT (tg_id) DO NOTHING;
--> statement-breakpoint

-- The app now authenticates Telegram Mini App requests in server functions.
-- Remove legacy public policies and role/auth hooks from previously used databases.
DO $$
DECLARE policy RECORD;
BEGIN
  FOR policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'players', 'app_settings', 'referrals', 'withdrawals', 'custom_tasks',
        'ad_views', 'job_views', 'task_claims', 'admin_telegram_ids', 'user_roles'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', policy.policyname, policy.schemaname, policy.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users';
  END IF;
END $$;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.handle_first_admin();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.add_balance(TEXT, INTEGER);
--> statement-breakpoint
DROP TABLE IF EXISTS public.user_roles;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regtype('public.app_role') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role)';
    EXECUTE 'DROP TYPE public.app_role';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public.players DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.referrals DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.withdrawals DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.custom_tasks DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.ad_views DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.job_views DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.task_claims DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.admin_telegram_ids DISABLE ROW LEVEL SECURITY;
