import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/database";
import {
  ad_views,
  admin_telegram_ids,
  app_settings,
  custom_tasks,
  job_views,
  payment_transactions,
  players,
  referrals,
  task_claims,
  withdrawals,
} from "../../drizzle/schema";
import { creditWithin, type BalanceExecutor } from "./balance.server";
import { sendNekPayout, queryNekBalance, NEK_DEFAULT_PUBLIC_DOMAIN } from "./nekpayment";
import {
  requireTelegramUser,
  telegramIdentityMatches,
  type TelegramUser,
} from "./telegram-auth.server";

const identitySchema = z.object({
  initData: z.string().max(8192).optional(),
  tgId: z.string().trim().min(1).max(64),
  name: z.string().trim().max(100).optional(),
  username: z.string().trim().max(64).nullable().optional(),
  photo: z.string().url().max(500).nullable().optional(),
});
type Identity = z.infer<typeof identitySchema>;

function authenticatedUser(data: Identity): TelegramUser {
  const user = requireTelegramUser(data.initData, {
    tgId: data.tgId,
    name: data.name,
    username: data.username,
    photoUrl: data.photo,
  });
  if (!telegramIdentityMatches(user, data.tgId))
    throw new Error("Telegram identity does not match the request.");
  return user;
}

function normalized(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

async function assertTgAdmin(data: Identity): Promise<TelegramUser> {
  const user = authenticatedUser(data);
  const db = getDb();
  const rows = await db.select({ tg_id: admin_telegram_ids.tg_id }).from(admin_telegram_ids);
  const configured = new Set([
    ...rows.map((row) => normalized(row.tg_id)),
    ...(process.env["ADMIN_TELEGRAM_IDS"] ?? "").split(",").map(normalized).filter(Boolean),
  ]);
  const identities = [user.id, user.username]
    .filter((value): value is string => !!value)
    .map(normalized);
  if (!identities.some((value) => configured.has(value))) throw new Error("Forbidden");
  return user;
}

// Bind the configured username alias to the authenticated user's numeric Telegram id.
export const bindAdminId = createServerFn({ method: "POST" })
  .validator((data) => identitySchema.parse(data))
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    if (!user.username) return { bound: false };
    const db = getDb();
    const alias = normalized(user.username);
    const envAliases = (process.env["ADMIN_TELEGRAM_IDS"] ?? "").split(",").map(normalized);
    const [row] = await db
      .select({ tg_id: admin_telegram_ids.tg_id })
      .from(admin_telegram_ids)
      .where(sql`lower(replace(${admin_telegram_ids.tg_id}, '@', '')) = ${alias}`)
      .limit(1);
    if (!row && !envAliases.includes(alias)) return { bound: false };

    if (row) {
      await db.transaction(async (tx) => {
        await tx.insert(admin_telegram_ids).values({ tg_id: user.id }).onConflictDoNothing();
        await tx.delete(admin_telegram_ids).where(eq(admin_telegram_ids.tg_id, row.tg_id));
      });
    }
    return { bound: true };
  });

export const ensureTgAdmin = createServerFn({ method: "POST" })
  .validator((data) => identitySchema.parse(data))
  .handler(async ({ data }) => {
    try {
      await assertTgAdmin(data);
      return { isAdmin: true };
    } catch (error) {
      if (error instanceof Error && error.message === "Forbidden") return { isAdmin: false };
      throw error;
    }
  });

export const adminGetDashboard = createServerFn({ method: "POST" })
  .validator((data) => identitySchema.parse(data))
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Start of "today" in Bangladesh (UTC+6, no DST), as a UTC instant for the query.
    const dhakaDayMs = 24 * 60 * 60 * 1000;
    const todayStart = new Date(
      Math.floor((Date.now() + 6 * 60 * 60 * 1000) / dhakaDayMs) * dhakaDayMs - 6 * 60 * 60 * 1000,
    );
    const [[playerStats], [withdrawalStats], [referralStats], [depositStats]] = await Promise.all([
      db
        .select({
          users: sql<number>`count(*)::int`,
          active24h: sql<number>`count(*) FILTER (WHERE ${players.updated_at} > ${dayAgo})::int`,
          balance: sql<number>`coalesce(sum(${players.balance}), 0)::int`,
        })
        .from(players),
      db
        .select({
          pending: sql<number>`count(*) FILTER (WHERE ${withdrawals.status} = 'pending')::int`,
          paid: sql<number>`coalesce(sum(${withdrawals.amount}) FILTER (WHERE ${withdrawals.status} = 'approved'), 0)::int`,
        })
        .from(withdrawals),
      db.select({ refs: count(referrals.referred_id) }).from(referrals),
      db
        .select({
          today: sql<number>`coalesce(sum(${payment_transactions.amount}) FILTER (WHERE ${payment_transactions.status} = 'success' AND ${payment_transactions.created_at} >= ${todayStart}), 0)::int`,
          todayCount: sql<number>`count(*) FILTER (WHERE ${payment_transactions.status} = 'success' AND ${payment_transactions.created_at} >= ${todayStart})::int`,
        })
        .from(payment_transactions),
    ]);
    return {
      users: playerStats?.users ?? 0,
      active24h: playerStats?.active24h ?? 0,
      balance: playerStats?.balance ?? 0,
      pending: withdrawalStats?.pending ?? 0,
      paid: withdrawalStats?.paid ?? 0,
      refs: referralStats?.refs ?? 0,
      todayDeposit: depositStats?.today ?? 0,
      todayDepositCount: depositStats?.todayCount ?? 0,
    };
  });

export const adminGetUsers = createServerFn({ method: "POST" })
  .validator((data) => identitySchema.parse(data))
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    return db
      .select({
        tg_id: players.tg_id,
        name: players.name,
        username: players.username,
        photo_url: players.photo_url,
        balance: players.balance,
        blocked: players.blocked,
        is_active: players.is_active,
      })
      .from(players)
      .orderBy(desc(players.balance), desc(players.updated_at));
  });

export const adminGetReferrals = createServerFn({ method: "POST" })
  .validator((data) => identitySchema.parse(data))
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    const rows = await db
      .select({
        referred_id: referrals.referred_id,
        referrer_id: referrals.referrer_id,
        referred_name: referrals.referred_name,
        photo_url: referrals.photo_url,
        created_at: referrals.created_at,
      })
      .from(referrals)
      .orderBy(desc(referrals.created_at));
    return rows.map((row) => ({ ...row, created_at: row.created_at.toISOString() }));
  });

export const adminGetSettings = createServerFn({ method: "POST" })
  .validator((data) => identitySchema.parse(data))
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    const [row] = await db
      .select({
        task_reward: app_settings.task_reward,
        ref_bonus: app_settings.ref_bonus,
        min_withdraw: app_settings.min_withdraw,
        daily_spins: app_settings.daily_spins,
        ads_script_id: app_settings.ads_script_id,
        daily_ads: app_settings.daily_ads,
        ad_reward: app_settings.ad_reward,
        ad_seconds: app_settings.ad_seconds,
        daily_typing: app_settings.daily_typing,
        daily_quiz: app_settings.daily_quiz,
        support_telegram_username: app_settings.support_telegram_username,
        activation_fee: app_settings.activation_fee,
        nek_api_key: app_settings.nek_api_key,
        nek_secret_key: app_settings.nek_secret_key,
        nek_withdraw_key: app_settings.nek_withdraw_key,
      })
      .from(app_settings)
      .where(eq(app_settings.id, 1))
      .limit(1);
    return (
      row ?? {
        task_reward: 5,
        ref_bonus: 5,
        min_withdraw: 50,
        daily_spins: 2,
        ads_script_id: "8416",
        daily_ads: 10,
        ad_reward: 5,
        ad_seconds: 15,
        daily_typing: 5,
        daily_quiz: 5,
        support_telegram_username: "",
        activation_fee: 100,
        nek_api_key: "",
        nek_secret_key: "",
        nek_withdraw_key: "",
      }
    );
  });

export const adminGetTasks = createServerFn({ method: "POST" })
  .validator((data) => identitySchema.parse(data))
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    return db
      .select({
        id: custom_tasks.id,
        title: custom_tasks.title,
        description: custom_tasks.description,
        icon: custom_tasks.icon,
        link: custom_tasks.link,
        reward: custom_tasks.reward,
        wait_seconds: custom_tasks.wait_seconds,
        active: custom_tasks.active,
      })
      .from(custom_tasks)
      .orderBy(desc(custom_tasks.created_at));
  });

export const adminUpdateBalance = createServerFn({ method: "POST" })
  .validator((data) =>
    identitySchema
      .extend({
        targetTgId: z.string().trim().min(1).max(64),
        balance: z.number().int().min(0).max(100_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    const [row] = await db
      .update(players)
      .set({ balance: data.balance, updated_at: new Date() })
      .where(eq(players.tg_id, data.targetTgId))
      .returning({ tg_id: players.tg_id });
    if (!row) throw new Error("Player not found.");
    return { ok: true };
  });

export const adminToggleBlock = createServerFn({ method: "POST" })
  .validator((data) =>
    identitySchema
      .extend({ targetTgId: z.string().trim().min(1).max(64), blocked: z.boolean() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    const [row] = await db
      .update(players)
      .set({ blocked: data.blocked, updated_at: new Date() })
      .where(eq(players.tg_id, data.targetTgId))
      .returning({ tg_id: players.tg_id });
    if (!row) throw new Error("Player not found.");
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .validator((data) =>
    identitySchema.extend({ targetTgId: z.string().trim().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    const target = data.targetTgId;
    await db.transaction(async (tx) => {
      await tx.delete(withdrawals).where(eq(withdrawals.tg_id, target));
      await tx.delete(ad_views).where(eq(ad_views.tg_id, target));
      await tx.delete(job_views).where(eq(job_views.tg_id, target));
      await tx.delete(task_claims).where(eq(task_claims.tg_id, target));
      await tx.delete(admin_telegram_ids).where(eq(admin_telegram_ids.tg_id, target));
      await tx
        .delete(referrals)
        .where(or(eq(referrals.referrer_id, target), eq(referrals.referred_id, target)));
      await tx.delete(players).where(eq(players.tg_id, target));
    });
    return { ok: true };
  });

export const adminSetWithdrawal = createServerFn({ method: "POST" })
  .validator((data) =>
    identitySchema
      .extend({
        id: z.string().trim().min(1).max(100),
        status: z.enum(["approved", "rejected"]),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    return db.transaction(async (tx) => {
      const [withdrawal] = await tx
        .select({
          tg_id: withdrawals.tg_id,
          amount: withdrawals.amount,
          status: withdrawals.status,
        })
        .from(withdrawals)
        .where(eq(withdrawals.id, data.id))
        .for("update")
        .limit(1);
      if (!withdrawal || withdrawal.status !== "pending") return { ok: false };

      await tx
        .update(withdrawals)
        .set({ status: data.status, note: data.reason || null })
        .where(eq(withdrawals.id, data.id));
      if (data.status === "rejected") {
        const balance = await creditWithin(
          tx as unknown as BalanceExecutor,
          withdrawal.tg_id,
          withdrawal.amount,
        );
        if (balance === null) throw new Error("Withdrawal refund could not be credited.");
      }
      return { ok: true };
    });
  });

export const adminEditWithdrawalNumber = createServerFn({ method: "POST" })
  .validator((data) =>
    identitySchema
      .extend({
        id: z.string().trim().min(1).max(100),
        number: z.string().trim().min(3).max(30),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    const [row] = await db
      .update(withdrawals)
      .set({ number: data.number })
      .where(and(eq(withdrawals.id, data.id), eq(withdrawals.status, "pending")))
      .returning({ id: withdrawals.id });
    if (!row) throw new Error("Pending withdrawal not found.");
    return { ok: true };
  });

/** Fixed password that gates the admin "Send via API" auto-payout action. */
const NEK_API_PASSWORD = "8888";

/** Builds the NEKpay callback URL (used as the payout back_url). Falls back to the baked-in domain. */
function nekCallbackUrl(): string {
  const publicDomain =
    (process.env["RAILWAY_PUBLIC_DOMAIN"] ?? "").trim() || NEK_DEFAULT_PUBLIC_DOMAIN;
  const host = publicDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${host}/api/public/nekpayment-webhook`;
}

/** Reads the current NEKpay merchant API balance for the admin panel. */
export const adminGetNekBalance = createServerFn({ method: "POST" })
  .validator((data) => identitySchema.parse(data))
  .handler(async ({ data }): Promise<{ balance: number | null }> => {
    await assertTgAdmin(data);
    const db = getDb();
    const [row] = await db
      .select({
        nek_api_key: app_settings.nek_api_key,
        nek_secret_key: app_settings.nek_secret_key,
        nek_withdraw_key: app_settings.nek_withdraw_key,
      })
      .from(app_settings)
      .where(eq(app_settings.id, 1))
      .limit(1);
    const merchantId = row?.nek_api_key.trim() ?? "";
    if (!merchantId) return { balance: null };
    const balance = await queryNekBalance({
      merchantId,
      keys: [row?.nek_withdraw_key ?? "", row?.nek_secret_key ?? ""],
    });
    return { balance };
  });

/**
 * Sends a pending withdrawal to NEKpay as an auto payout. Guarded by the 8888 password.
 * The withdrawal stays pending until the payout back_url callback finalises it
 * (success -> approved, failure -> rejected + refund), so money never double-sends.
 */
export const adminSendNekPayout = createServerFn({ method: "POST" })
  .validator((data) =>
    identitySchema
      .extend({
        id: z.string().trim().min(1).max(100),
        password: z.string().trim().max(20),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await assertTgAdmin(data);
    if (data.password !== NEK_API_PASSWORD) {
      return { ok: false, error: "ভুল পাসওয়ার্ড" };
    }
    const db = getDb();
    const [[withdrawal], [settingRow]] = await Promise.all([
      db
        .select({
          id: withdrawals.id,
          tg_id: withdrawals.tg_id,
          name: withdrawals.name,
          amount: withdrawals.amount,
          method: withdrawals.method,
          number: withdrawals.number,
          status: withdrawals.status,
          note: withdrawals.note,
        })
        .from(withdrawals)
        .where(eq(withdrawals.id, data.id))
        .limit(1),
      db
        .select({
          nek_api_key: app_settings.nek_api_key,
          nek_withdraw_key: app_settings.nek_withdraw_key,
        })
        .from(app_settings)
        .where(eq(app_settings.id, 1))
        .limit(1),
    ]);

    if (!withdrawal) return { ok: false, error: "উইথড্র পাওয়া যায়নি" };
    if (withdrawal.status !== "pending") return { ok: false, error: "এটি আর পেন্ডিং নেই" };
    if ((withdrawal.note ?? "").startsWith("API:")) {
      return { ok: false, error: "এটি ইতিমধ্যে API-তে পাঠানো হয়েছে" };
    }

    const merchantId = settingRow?.nek_api_key.trim() ?? "";
    const withdrawKey = settingRow?.nek_withdraw_key.trim() ?? "";
    if (!merchantId || !withdrawKey) {
      return { ok: false, error: "সেটিংসে NEKpay API Key ও Withdraw Key দিন।" };
    }

    const result = await sendNekPayout({
      merchantId,
      withdrawKey,
      transferId: withdrawal.id,
      amount: withdrawal.amount,
      method: withdrawal.method,
      receiveName: withdrawal.name ?? "User",
      receiveAccount: withdrawal.number,
      backUrl: nekCallbackUrl(),
    });
    if (!result.success) return { ok: false, error: result.message };

    // Accepted by NEKpay: mark it so it is not sent twice; it stays pending until the callback.
    await db
      .update(withdrawals)
      .set({ note: `API: sent${result.tradeNo ? ` (TID ${result.tradeNo})` : ""}` })
      .where(and(eq(withdrawals.id, withdrawal.id), eq(withdrawals.status, "pending")));
    return { ok: true };
  });

const settingsSchema = z.object({
  task_reward: z.number().int().min(0).max(100_000),
  ref_bonus: z.number().int().min(0).max(100_000),
  min_withdraw: z.number().int().min(0).max(10_000_000),
  daily_spins: z.number().int().min(0).max(1000),
  ads_script_id: z
    .string()
    .trim()
    .regex(/^\d{1,12}$/),
  daily_ads: z.number().int().min(0).max(1000),
  ad_reward: z.number().int().min(0).max(100_000),
  ad_seconds: z.number().int().min(0).max(600),
  daily_typing: z.number().int().min(0).max(1000),
  daily_quiz: z.number().int().min(0).max(1000),
  support_telegram_username: z
    .string()
    .trim()
    .max(33)
    .transform((value) => value.replace(/^@/, ""))
    .pipe(z.string().regex(/^(?:[A-Za-z][A-Za-z0-9_]{4,31})?$/)),
  activation_fee: z.number().int().min(0).max(10_000_000).default(100),
  nek_api_key: z.string().optional().default(""),
  nek_secret_key: z.string().optional().default(""),
  nek_withdraw_key: z.string().optional().default(""),
});

export const adminSaveSettings = createServerFn({ method: "POST" })
  .validator((data) => identitySchema.extend(settingsSchema.shape).parse(data))
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    const {
      initData: _initData,
      tgId: _tgId,
      name: _name,
      username: _username,
      photo: _photo,
      ...fields
    } = data;
    await db
      .insert(app_settings)
      .values({ id: 1, ...fields, updated_at: new Date() })
      .onConflictDoUpdate({ target: app_settings.id, set: { ...fields, updated_at: new Date() } });
    return { ok: true };
  });

export const adminBroadcast = createServerFn({ method: "POST" })
  .validator((data) =>
    identitySchema.extend({ text: z.string().trim().min(1).max(3500) }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const botToken = process.env["TELEGRAM_API_KEY"]?.trim();
    if (!botToken) throw new Error("TELEGRAM_API_KEY is not configured.");
    const db = getDb();
    const rows = await db
      .select({ tg_id: players.tg_id, chat_id: players.chat_id })
      .from(players)
      .where(and(eq(players.blocked, false), isNotNull(players.chat_id)));
    const chatIds = [
      ...new Set(rows.map((row) => row.chat_id).filter((id): id is number => id !== null)),
    ];
    let sent = 0;
    let failed = 0;
    for (const chat_id of chatIds) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id, text: data.text }),
        });
        if (response.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
    return { total: chatIds.length, sent, failed };
  });

const taskSchema = z.object({
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().min(1).max(8),
  link: z.string().trim().url().max(500).optional().or(z.literal("")),
  reward: z.number().int().min(0).max(100_000),
  wait_seconds: z.number().int().min(0).max(600),
});

export const adminAddTask = createServerFn({ method: "POST" })
  .validator((data) => identitySchema.extend({ task: taskSchema }).parse(data))
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    await db.insert(custom_tasks).values({
      title: data.task.title,
      description: data.task.description || null,
      icon: data.task.icon,
      link: data.task.link || null,
      reward: data.task.reward,
      wait_seconds: data.task.wait_seconds,
      active: true,
    });
    return { ok: true };
  });

export const adminUpdateTask = createServerFn({ method: "POST" })
  .validator((data) =>
    identitySchema
      .extend({
        id: z.string().trim().min(1).max(100),
        active: z.boolean().optional(),
        remove: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    if (data.remove) {
      await db.delete(custom_tasks).where(eq(custom_tasks.id, data.id));
    } else {
      await db
        .update(custom_tasks)
        .set({ active: !!data.active })
        .where(eq(custom_tasks.id, data.id));
    }
    return { ok: true };
  });

/** Full payout data is returned only after the authenticated admin check. */
export const adminListWithdrawals = createServerFn({ method: "POST" })
  .validator((data) => identitySchema.parse(data))
  .handler(async ({ data }) => {
    await assertTgAdmin(data);
    const db = getDb();
    const rows = await db.select().from(withdrawals).orderBy(desc(withdrawals.created_at));
    return rows.map((row) => ({ ...row, created_at: row.created_at.toISOString() }));
  });
