import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, gte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/database";
import {
  app_settings,
  custom_tasks,
  job_views,
  players,
  referrals,
  task_claims,
  withdrawals,
} from "../../drizzle/schema";
import { creditWithin, type BalanceExecutor } from "./balance.server";
import { getDhakaNoonWindow } from "./dhaka-window";
import { requireTelegramUser, telegramIdentityMatches } from "./telegram-auth.server";

const identity = z.object({
  initData: z.string().max(8192).optional(),
  tgId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100).optional(),
  username: z.string().trim().max(64).nullable().optional(),
  photo: z.string().url().max(500).nullable().optional(),
});

function authenticatedUser(data: z.infer<typeof identity>) {
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

const SEGMENTS = [20, 100, 30, 150, 40, 200, 50, 300] as const;
const WEIGHTS = [30, 5, 25, 3, 20, 1.5, 15, 0.5] as const;

async function spinStatus(tgId: string) {
  const db = getDb();
  const { since } = getDhakaNoonWindow();
  const [[result], [config]] = await Promise.all([
    db
      .select({ used: count(job_views.id) })
      .from(job_views)
      .where(
        and(
          eq(job_views.tg_id, tgId),
          eq(job_views.kind, "spin"),
          gte(job_views.created_at, since),
        ),
      ),
    db.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
  ]);
  return { used: result?.used ?? 0, limit: config?.daily_spins ?? 2 };
}

/** One-time reward for a custom task. A unique claim row makes this atomic. */
export const claimTask = createServerFn({ method: "POST" })
  .validator((data) => identity.extend({ taskId: z.string().trim().min(1).max(100) }).parse(data))
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    const db = getDb();

    return db.transaction(async (tx) => {
      const [player] = await tx
        .select({ blocked: players.blocked })
        .from(players)
        .where(eq(players.tg_id, user.id))
        .for("update")
        .limit(1);
      if (!player) throw new Error("Player profile is not ready.");
      if (player.blocked) throw new Error("Your account is blocked.");

      const [task] = await tx
        .select({ reward: custom_tasks.reward, active: custom_tasks.active })
        .from(custom_tasks)
        .where(eq(custom_tasks.id, data.taskId))
        .limit(1);
      if (!task?.active) return { ok: false, balance: null as number | null };

      const [claim] = await tx
        .insert(task_claims)
        .values({ tg_id: user.id, task_id: data.taskId })
        .onConflictDoNothing()
        .returning({ tg_id: task_claims.tg_id });
      if (!claim) return { ok: false, balance: null as number | null, already: true };

      const balance = await creditWithin(tx as unknown as BalanceExecutor, user.id, task.reward);
      if (balance === null) throw new Error("Reward could not be credited.");
      return { ok: true, balance, reward: task.reward };
    });
  });

export const getSpinStatus = createServerFn({ method: "POST" })
  .validator((data) => identity.parse(data))
  .handler(async ({ data }) => spinStatus(authenticatedUser(data).id));

/** Server chooses the spin result and atomically records and credits it. */
export const doSpin = createServerFn({ method: "POST" })
  .validator((data) => identity.parse(data))
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    const db = getDb();
    const { since } = getDhakaNoonWindow();

    return db.transaction(async (tx) => {
      const [player] = await tx
        .select({ blocked: players.blocked })
        .from(players)
        .where(eq(players.tg_id, user.id))
        .for("update")
        .limit(1);
      if (!player) throw new Error("Player profile is not ready.");
      if (player.blocked) throw new Error("Your account is blocked.");

      const [[result], [config]] = await Promise.all([
        tx
          .select({ used: count(job_views.id) })
          .from(job_views)
          .where(
            and(
              eq(job_views.tg_id, user.id),
              eq(job_views.kind, "spin"),
              gte(job_views.created_at, since),
            ),
          ),
        tx.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
      ]);
      const used = result?.used ?? 0;
      const limit = config?.daily_spins ?? 2;
      if (used >= limit)
        return { ok: false, used, limit, index: -1, amount: 0, balance: null as number | null };

      const total = WEIGHTS.reduce((sum, weight) => sum + weight, 0);
      let roll = Math.random() * total;
      let index = 0;
      for (let candidate = 0; candidate < WEIGHTS.length; candidate++) {
        roll -= WEIGHTS[candidate] ?? 0;
        if (roll <= 0) {
          index = candidate;
          break;
        }
      }
      const amount = SEGMENTS[index] ?? SEGMENTS[0];
      await tx.insert(job_views).values({ tg_id: user.id, kind: "spin" });
      const balance = await creditWithin(tx as unknown as BalanceExecutor, user.id, amount);
      if (balance === null) throw new Error("Reward could not be credited.");
      return { ok: true, used: used + 1, limit, index, amount, balance };
    });
  });

/** Validate and create a withdrawal, deducting the balance in the same transaction. */
export const requestWithdraw = createServerFn({ method: "POST" })
  .validator((data) =>
    identity
      .extend({
        amount: z.number().int().positive().max(10_000_000),
        method: z.enum(["bKash", "Nagad"]),
        number: z
          .string()
          .trim()
          .regex(/^\d{11,14}$/),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    const db = getDb();

    return db.transaction(async (tx) => {
      const [player] = await tx
        .select({ blocked: players.blocked, balance: players.balance })
        .from(players)
        .where(eq(players.tg_id, user.id))
        .for("update")
        .limit(1);
      if (!player) return { ok: false, error: "অ্যাকাউন্ট পাওয়া যায়নি" };
      if (player.blocked) return { ok: false, error: "আপনার অ্যাকাউন্ট ব্লক করা হয়েছে" };

      const [[config], [rejected]] = await Promise.all([
        tx.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
        tx
          .select({ count: count(withdrawals.id) })
          .from(withdrawals)
          .where(and(eq(withdrawals.tg_id, user.id), eq(withdrawals.status, "rejected"))),
      ]);
      const baseMin = config?.min_withdraw ?? 50;
      const minimum = baseMin * Math.min(2 ** (rejected?.count ?? 0), 8);
      if (data.amount < minimum) return { ok: false, error: `সর্বনিম্ন উইথড্র ৳${minimum}` };
      if (data.amount > player.balance) return { ok: false, error: "পর্যাপ্ত ব্যালেন্স নেই" };

      const newBalance = await creditWithin(
        tx as unknown as BalanceExecutor,
        user.id,
        -data.amount,
      );
      if (newBalance === null) return { ok: false, error: "পর্যাপ্ত ব্যালেন্স নেই" };
      await tx.insert(withdrawals).values({
        tg_id: user.id,
        name: user.name,
        amount: data.amount,
        method: data.method,
        number: data.number,
        status: "pending",
      });
      return { ok: true, balance: newBalance };
    });
  });

/** Read only the signed-in user's withdrawal history (including their own payout number). */
export const getMyWithdrawalHistory = createServerFn({ method: "POST" })
  .validator((data) => identity.parse(data))
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    const db = getDb();
    const [rows, rejectedRows, [playerRow], [settingRow]] = await Promise.all([
      db
        .select({
          amount: withdrawals.amount,
          method: withdrawals.method,
          number: withdrawals.number,
          status: withdrawals.status,
          note: withdrawals.note,
          created_at: withdrawals.created_at,
        })
        .from(withdrawals)
        .where(eq(withdrawals.tg_id, user.id))
        .orderBy(sql`${withdrawals.created_at} DESC`)
        .limit(30),
      db
        .select({ count: count(withdrawals.id) })
        .from(withdrawals)
        .where(and(eq(withdrawals.tg_id, user.id), eq(withdrawals.status, "rejected"))),
      db
        .select({ is_active: players.is_active })
        .from(players)
        .where(eq(players.tg_id, user.id))
        .limit(1),
      db
        .select({ activation_fee: app_settings.activation_fee })
        .from(app_settings)
        .where(eq(app_settings.id, 1))
        .limit(1),
    ]);
    return {
      rows: rows.map((row) => ({ ...row, created_at: row.created_at.toISOString() })),
      rejectedCount: rejectedRows[0]?.count ?? 0,
      isActive: playerRow?.is_active ?? false,
      activationFee: settingRow?.activation_fee ?? 100,
    };
  });

/** Record a referral once and atomically credit the referring Telegram user. */
export const recordReferral = createServerFn({ method: "POST" })
  .validator((data) => identity.extend({ code: z.string().trim().min(1).max(64) }).parse(data))
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    const code = data.code.trim().replace(/^@/, "");
    if (code === user.id || (user.username && code.toLowerCase() === user.username.toLowerCase())) {
      return { ok: false };
    }

    const db = getDb();
    // Make sure the referred user's profile exists even if this call races the wallet sync.
    await db
      .insert(players)
      .values({
        tg_id: user.id,
        name: user.name,
        username: user.username,
        photo_url: user.photoUrl,
        chat_id: user.chatId,
        balance: 0,
      })
      .onConflictDoNothing();

    return db.transaction(async (tx) => {
      const [me] = await tx
        .select({ balance: players.balance, blocked: players.blocked })
        .from(players)
        .where(eq(players.tg_id, user.id))
        .for("update")
        .limit(1);
      if (!me || me.blocked || me.balance > 0) return { ok: false };

      const [referrer] = await tx
        .select({ tg_id: players.tg_id, blocked: players.blocked })
        .from(players)
        .where(
          or(
            eq(players.tg_id, code),
            eq(players.chat_id, /^\d+$/.test(code) ? Number(code) : -1),
            sql`lower(${players.username}) = lower(${code})`,
          ),
        )
        .limit(1);
      if (!referrer || referrer.blocked || referrer.tg_id === user.id) return { ok: false };

      const [setting] = await tx
        .select({ ref_bonus: app_settings.ref_bonus })
        .from(app_settings)
        .where(eq(app_settings.id, 1))
        .limit(1);
      const [inserted] = await tx
        .insert(referrals)
        .values({
          referred_id: user.id,
          referrer_id: referrer.tg_id,
          referred_name: user.name,
          photo_url: user.photoUrl,
        })
        .onConflictDoNothing()
        .returning({ referred_id: referrals.referred_id });
      if (!inserted) return { ok: false };

      const balance = await creditWithin(
        tx as unknown as BalanceExecutor,
        referrer.tg_id,
        setting?.ref_bonus ?? 5,
      );
      if (balance === null) throw new Error("Referral bonus could not be credited.");
      return { ok: true };
    });
  });

export const generatePaymentUrl = createServerFn({ method: "POST" })
  .validator((data) => identity.parse(data))
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    const db = getDb();
    const [settingRow] = await db
      .select({
        activation_fee: app_settings.activation_fee,
        nek_api_key: app_settings.nek_api_key,
        nek_secret_key: app_settings.nek_secret_key,
      })
      .from(app_settings)
      .where(eq(app_settings.id, 1))
      .limit(1);

    const fee = settingRow?.activation_fee ?? 100;

    // TODO: implement actual Nekpayment API call here using nek_api_key and nek_secret_key
    // Since API structure is unknown, just returning a placeholder or mimicking success.
    // Usually it returns a redirect_url.

    return { ok: true, url: `/api/pay?amount=${fee}&tg_id=${user.id}` };
  });
