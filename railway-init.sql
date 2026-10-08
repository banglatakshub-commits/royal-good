-- Railway PostgreSQL Database Initialization
-- Life Good Telegram Mini App

-- Create players table
CREATE TABLE IF NOT EXISTS players (
    tg_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT,
    photo_url TEXT,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create app_settings table
CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY,
    task_reward INTEGER NOT NULL DEFAULT 5,
    ref_bonus INTEGER NOT NULL DEFAULT 5,
    min_withdraw INTEGER NOT NULL DEFAULT 50,
    daily_spins INTEGER NOT NULL DEFAULT 2,
    ads_script_id TEXT NOT NULL DEFAULT '8416',
    daily_ads INTEGER NOT NULL DEFAULT 10,
    ad_reward INTEGER NOT NULL DEFAULT 5,
    ad_seconds INTEGER NOT NULL DEFAULT 15,
    support_telegram_username TEXT NOT NULL DEFAULT ''
);

-- Insert default settings
INSERT INTO app_settings (id, task_reward, ref_bonus, min_withdraw, daily_spins, ads_script_id, daily_ads, ad_reward, ad_seconds, support_telegram_username) 
VALUES (1, 5, 5, 50, 2, '8416', 10, 5, 15, '') 
ON CONFLICT (id) DO NOTHING;

-- Create referrals table
CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    referrer_tg_id TEXT NOT NULL,
    referred_tg_id TEXT NOT NULL,
    bonus_amount INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create withdrawals table
CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    player_tg_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    method TEXT NOT NULL,
    account TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create custom_tasks table
CREATE TABLE IF NOT EXISTS custom_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    icon TEXT NOT NULL,
    reward INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create ads_limits table
CREATE TABLE IF NOT EXISTS ads_limits (
    player_tg_id TEXT PRIMARY KEY,
    daily_count INTEGER NOT NULL DEFAULT 0,
    last_reset TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create ad_views table
CREATE TABLE IF NOT EXISTS ad_views (
    id TEXT PRIMARY KEY,
    player_tg_id TEXT NOT NULL,
    reward INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create job_daily_limits table
CREATE TABLE IF NOT EXISTS job_daily_limits (
    player_tg_id TEXT PRIMARY KEY,
    typing_count INTEGER NOT NULL DEFAULT 0,
    quiz_count INTEGER NOT NULL DEFAULT 0,
    last_reset TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Show all tables
\dt