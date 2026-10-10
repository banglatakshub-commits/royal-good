import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * PostgreSQL schema used by the Railway deployment. Keep this in sync with
 * drizzle/migrations/0000_railway_postgres.sql.
 */
export const players = pgTable("players", {
  tg_id: text("tg_id").primaryKey(),
  name: text("name").notNull(),
  username: text("username"),
  photo_url: text("photo_url"),
  balance: integer("balance").notNull().default(0),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  chat_id: bigint("chat_id", { mode: "number" }),
  blocked: boolean("blocked").notNull().default(false),
  is_active: boolean("is_active").notNull().default(false),
});

export const referrals = pgTable(
  "referrals",
  {
    referred_id: text("referred_id").primaryKey(),
    referrer_id: text("referrer_id").notNull(),
    referred_name: text("referred_name"),
    photo_url: text("photo_url"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("referrals_referrer_idx").on(table.referrer_id)],
);

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tg_id: text("tg_id").notNull(),
    name: text("name"),
    amount: integer("amount").notNull(),
    method: text("method").notNull(),
    number: text("number").notNull(),
    status: text("status").notNull().default("pending"),
    note: text("note"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("withdrawals_tg_created_idx").on(table.tg_id, table.created_at)],
);

export const custom_tasks = pgTable(
  "custom_tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    description: text("description"),
    icon: text("icon").notNull().default("⭐"),
    link: text("link"),
    reward: integer("reward").notNull().default(5),
    wait_seconds: integer("wait_seconds").notNull().default(10),
    active: boolean("active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("custom_tasks_active_created_idx").on(table.active, table.created_at)],
);

export const app_settings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  task_reward: integer("task_reward").notNull().default(5),
  ref_bonus: integer("ref_bonus").notNull().default(5),
  min_withdraw: integer("min_withdraw").notNull().default(50),
  daily_spins: integer("daily_spins").notNull().default(2),
  ads_script_id: text("ads_script_id").notNull().default("8416"),
  daily_ads: integer("daily_ads").notNull().default(10),
  ad_reward: integer("ad_reward").notNull().default(5),
  ad_seconds: integer("ad_seconds").notNull().default(15),
  daily_typing: integer("daily_typing").notNull().default(5),
  daily_quiz: integer("daily_quiz").notNull().default(5),
  support_telegram_username: text("support_telegram_username").notNull().default(""),
  activation_fee: integer("activation_fee").notNull().default(100),
  nek_api_key: text("nek_api_key").notNull().default(""),
  nek_secret_key: text("nek_secret_key").notNull().default(""),
  nek_withdraw_key: text("nek_withdraw_key").notNull().default(""),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ad_views = pgTable(
  "ad_views",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tg_id: text("tg_id").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ad_views_tg_created_idx").on(table.tg_id, table.created_at)],
);

export const job_views = pgTable(
  "job_views",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tg_id: text("tg_id").notNull(),
    kind: text("kind").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("job_views_tg_kind_created_idx").on(table.tg_id, table.kind, table.created_at)],
);

export const task_claims = pgTable(
  "task_claims",
  {
    tg_id: text("tg_id").notNull(),
    task_id: text("task_id").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tg_id, table.task_id] })],
);

export const admin_telegram_ids = pgTable("admin_telegram_ids", {
  tg_id: text("tg_id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payment_transactions = pgTable(
  "payment_transactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tg_id: text("tg_id").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("pending"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payment_transactions_tg_idx").on(table.tg_id)],
);
