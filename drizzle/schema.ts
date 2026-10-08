import { pgTable, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';

export const players = pgTable('players', {
  tg_id: text('tg_id').primaryKey(),
  name: text('name').notNull(),
  username: text('username'),
  photo_url: text('photo_url'),
  balance: integer('balance').notNull().default(0),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const referrals = pgTable('referrals', {
  id: text('id').primaryKey(),
  referrer_tg_id: text('referrer_tg_id').notNull(),
  referred_tg_id: text('referred_tg_id').notNull(),
  bonus_amount: integer('bonus_amount').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const withdrawals = pgTable('withdrawals', {
  id: text('id').primaryKey(),
  player_tg_id: text('player_tg_id').notNull(),
  amount: integer('amount').notNull(),
  method: text('method').notNull(),
  account: text('account').notNull(),
  status: text('status').notNull(),
  note: text('note'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const custom_tasks = pgTable('custom_tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  icon: text('icon').notNull(),
  reward: integer('reward').notNull(),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const app_settings = pgTable('app_settings', {
  id: integer('id').primaryKey(),
  task_reward: integer('task_reward').notNull().default(5),
  ref_bonus: integer('ref_bonus').notNull().default(5),
  min_withdraw: integer('min_withdraw').notNull().default(50),
  daily_spins: integer('daily_spins').notNull().default(2),
  ads_script_id: text('ads_script_id').notNull().default('8416'),
  daily_ads: integer('daily_ads').notNull().default(10),
  ad_reward: integer('ad_reward').notNull().default(5),
  ad_seconds: integer('ad_seconds').notNull().default(15),
  support_telegram_username: text('support_telegram_username').notNull().default('')
});

export const ads_limits = pgTable('ads_limits', {
  player_tg_id: text('player_tg_id').primaryKey(),
  daily_count: integer('daily_count').notNull().default(0),
  last_reset: timestamp('last_reset', { withTimezone: true }).notNull().defaultNow()
});

export const ad_views = pgTable('ad_views', {
  id: text('id').primaryKey(),
  player_tg_id: text('player_tg_id').notNull(),
  reward: integer('reward').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const job_daily_limits = pgTable('job_daily_limits', {
  player_tg_id: text('player_tg_id').primaryKey(),
  typing_count: integer('typing_count').notNull().default(0),
  quiz_count: integer('quiz_count').notNull().default(0),
  last_reset: timestamp('last_reset', { withTimezone: true }).notNull().defaultNow()
});
