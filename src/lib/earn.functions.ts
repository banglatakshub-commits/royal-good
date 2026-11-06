import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, gte, or, sql } from "drizzle-orm";
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
import {
  effectiveMinWithdraw,
  validateWithdraw,
  WITHDRAW_MESSAGES,
  withdrawRequestSchema,
  type WithdrawErrorCode,
} from "./withdraw-validation";
import { verification_requests } from "../../drizzle/schema";

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

/** Result of a withdrawal attempt; always carries the state the client needs to correct itself. */
export type WithdrawResult = {
  ok: boolean;
  /** User-facing Bengali reason; null when the request succeeded. */
  error: string | null;
  /** Machine-readable reason, so the page can react (open activation, fix a field). */
  code: WithdrawErrorCode | null;
  /** Authoritative main balance, even on failure, so the wallet cache is never left stale. */
  balance: number | null;
  /** Minimum this user must withdraw right now (admin setting × rejected-withdrawal escalation). */
  minimum: number;
  isActive: boolean;
};

/** Validate and create a withdrawal, deducting the balance in the same transaction. */
export const requestWithdraw = createServerFn({ method: "POST" })
  .validator((data) => identity.extend(withdrawRequestSchema.shape).parse(data))
  .handler(async ({ data }): Promise<WithdrawResult> => {
    let user: ReturnType<typeof authenticatedUser>;
    try {
      user = authenticatedUser(data);
    } catch (authError: unknown) {
      console.error("requestWithdraw auth error:", authError);
      return {
        ok: false,
        error: "টেলিগ্রাম সেশন মেয়াদোত্তীর্ণ — অ্যাপটি বন্ধ করে আবার খুলে চেষ্টা করুন।",
        code: null,
        balance: null,
        minimum: 0,
        isActive: true,
      };
    }
    const db = getDb();

    try {
      return await db.transaction(async (tx) => {
        const [player] = await tx
          .select({
            blocked: players.blocked,
            balance: players.balance,
            is_active: players.is_active,
          })
          .from(players)
          .where(eq(players.tg_id, user.id))
          .for("update")
          .limit(1);

        const [[config], [rejected]] = await Promise.all([
          tx.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
          tx
            .select({ count: count(withdrawals.id) })
            .from(withdrawals)
            .where(and(eq(withdrawals.tg_id, user.id), eq(withdrawals.status, "rejected"))),
        ]);
        const minWithdraw = config?.min_withdraw ?? 50;
        const rejectedCount = rejected?.count ?? 0;
        const activationFee = config?.activation_fee ?? 100;
        const minimum = effectiveMinWithdraw(minWithdraw, rejectedCount);

        const refuse = (
          code: WithdrawErrorCode,
          error: string,
          balance: number | null,
          isActive: boolean,
        ): WithdrawResult => ({ ok: false, error, code, balance, minimum, isActive });

        if (!player)
          return refuse("account_missing", WITHDRAW_MESSAGES.account_missing, null, false);
        // Enforced here, not only in the UI: activation and blocks gate withdrawals on the server.
        if (player.blocked)
          return refuse(
            "account_blocked",
            WITHDRAW_MESSAGES.account_blocked,
            player.balance,
            false,
          );

        const check = validateWithdraw({
          amount: data.amount,
          number: data.number,
          method: data.method,
          balance: player.balance,
          minWithdraw,
          rejectedCount,
          isActive: player.is_active,
          activationFee,
        });
        if (!check.ok || check.method === null) {
          return refuse(
            check.code ?? "amount_invalid",
            check.message,
            player.balance,
            player.is_active,
          );
        }

        const newBalance = await creditWithin(
          tx as unknown as BalanceExecutor,
          user.id,
          -check.amount,
        );
        // The row was locked above, so this only fails if the balance moved under us.
        if (newBalance === null) {
          return refuse(
            "balance_insufficient",
            `${WITHDRAW_MESSAGES.balance_insufficient}। আপনার মেইন ব্যালেন্স ৳${player.balance}।`,
            player.balance,
            player.is_active,
          );
        }
        await tx.insert(withdrawals).values({
          tg_id: user.id,
          name: user.name,
          amount: check.amount,
          method: check.method,
          number: check.number,
          status: "pending",
        });
        return {
          ok: true,
          error: null,
          code: null,
          balance: newBalance,
          minimum: check.minimum,
          isActive: true,
        };
      });
    } catch (dbError: unknown) {
      // Surface the real reason instead of a generic "try again", so a config/DB
      // problem is visible rather than hidden behind the form's catch-all.
      console.error("requestWithdraw db error:", dbError);
      // Drizzle wraps the driver error; the real Postgres reason is on `.cause`.
      const cause = (dbError as { cause?: unknown })?.cause;
      const reason =
        cause instanceof Error
          ? cause.message
          : dbError instanceof Error
            ? dbError.message
            : "অজানা সমস্যা";
      return {
        ok: false,
        error: `উইথড্র ব্যর্থ: ${reason}`,
        code: null,
        balance: null,
        minimum: 0,
        isActive: true,
      };
    }
  });

/**
 * Read only the signed-in user's withdrawal history (including their own payout number) plus the
 * server-side withdrawal state the form validates against: main balance, minimum, activation.
 */
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
        .select({
          is_active: players.is_active,
          blocked: players.blocked,
          balance: players.balance,
        })
        .from(players)
        .where(eq(players.tg_id, user.id))
        .limit(1),
      db
        .select({
          activation_fee: app_settings.activation_fee,
          min_withdraw: app_settings.min_withdraw,
        })
        .from(app_settings)
        .where(eq(app_settings.id, 1))
        .limit(1),
    ]);
    const rejectedCount = rejectedRows[0]?.count ?? 0;
    const minWithdraw = settingRow?.min_withdraw ?? 50;
    return {
      rows: rows.map((row) => ({ ...row, created_at: row.created_at.toISOString() })),
      rejectedCount,
      isActive: playerRow?.is_active ?? false,
      isBlocked: playerRow?.blocked ?? false,
      activationFee: settingRow?.activation_fee ?? 100,
      /** Main balance straight from PostgreSQL; the client cache is seeded from this. */
      balance: playerRow?.balance ?? 0,
      minWithdraw,
      /** What this user must reach right now, after the rejected-withdrawal escalation. */
      minimum: effectiveMinWithdraw(minWithdraw, rejectedCount),
    };
  });

/** Record a referral once and atomically credit the referring Telegram user. */
/**
 * TEMPORARY (testing): count a referral without the usual guards — credit the referrer even if the
 * new user already has a balance, and create the referrer's profile stub if they haven't opened the
 * app yet. Set this to false once referral counting is verified to restore anti-farming protection.
 */
export const FORCE_REFERRAL = true;

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
      if (!me || me.blocked) return { ok: false };
      if (!FORCE_REFERRAL && me.balance > 0) return { ok: false };

      let [referrer] = await tx
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
      // Force mode: if the referrer hasn't opened the app yet but the code is a numeric Telegram id,
      // create a stub profile so the referral still counts during testing.
      if (!referrer && FORCE_REFERRAL && /^\d+$/.test(code)) {
        await tx
          .insert(players)
          .values({ tg_id: code, name: "User", balance: 0 })
          .onConflictDoNothing();
        [referrer] = await tx
          .select({ tg_id: players.tg_id, blocked: players.blocked })
          .from(players)
          .where(eq(players.tg_id, code))
          .limit(1);
      }
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
      // Already referred (duplicate /start or re-open): acknowledge success so the client stops
      // retrying, but don't credit the bonus again.
      if (!inserted) return { ok: true };

      const balance = await creditWithin(
        tx as unknown as BalanceExecutor,
        referrer.tg_id,
        setting?.ref_bonus ?? 5,
      );
      if (balance === null) throw new Error("Referral bonus could not be credited.");
      return { ok: true };
    });
  });

/** Manual verification requests never activate an account until an admin reviews them. */
export const getVerificationInfo = createServerFn({ method: "POST" })
  .validator((data) => identity.parse(data))
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    const db = getDb();
    const [[config], [latest]] = await Promise.all([
      db
        .select({
          fee: app_settings.activation_fee,
          bkash: app_settings.bkash_number,
          nagad: app_settings.nagad_number,
        })
        .from(app_settings)
        .where(eq(app_settings.id, 1))
        .limit(1),
      db
        .select()
        .from(verification_requests)
        .where(eq(verification_requests.tg_id, user.id))
        .orderBy(desc(verification_requests.created_at))
        .limit(1),
    ]);
    return {
      fee: config?.fee ?? 100,
      bkash: config?.bkash ?? "",
      nagad: config?.nagad ?? "",
      latest: latest ?? null,
    };
  });

export const submitVerification = createServerFn({ method: "POST" })
  .validator((data) =>
    identity
      .extend({
        method: z.enum(["bkash", "nagad"]),
        expectedRecipient: z.string().max(20),
        expectedFee: z.number().int().min(0),
        sender: z
          .string()
          .trim()
          .regex(/^01[3-9]\d{8}$/),
        transactionId: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9-]{4,40}$/),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    const db = getDb();
    try {
      return await db.transaction(async (tx) => {
        const [player] = await tx
          .select()
          .from(players)
          .where(eq(players.tg_id, user.id))
          .for("update");
        if (!player || player.blocked || player.is_active)
          throw new Error("অ্যাকাউন্ট সক্রিয়, ব্লকড বা পাওয়া যায়নি।");
        const [pending] = await tx
          .select({ id: verification_requests.id })
          .from(verification_requests)
          .where(
            and(
              eq(verification_requests.tg_id, user.id),
              eq(verification_requests.status, "pending"),
            ),
          )
          .limit(1);
        if (pending) throw new Error("আপনার একটি অনুরোধ ইতিমধ্যে পর্যালোচনাধীন।");
        const [config] = await tx
          .select()
          .from(app_settings)
          .where(eq(app_settings.id, 1))
          .limit(1);
        const recipient = data.method === "bkash" ? config?.bkash_number : config?.nagad_number;
        if (!recipient) throw new Error("এই পেমেন্ট পদ্ধতি সেট করা নেই।");
        if (
          recipient !== data.expectedRecipient ||
          (config?.activation_fee ?? 100) !== data.expectedFee
        )
          throw new Error("পেমেন্ট তথ্য পরিবর্তিত হয়েছে। আবার খুলে যাচাই করুন।");
        await tx
          .insert(verification_requests)
          .values({
            tg_id: user.id,
            amount: config?.activation_fee ?? 100,
            method: data.method,
            recipient_number: recipient,
            sender_number: data.sender,
            transaction_id: data.transactionId.toUpperCase(),
          });
        return { ok: true as const };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("অ্যাকাউন্ট") ||
          error.message.includes("অনুরোধ") ||
          error.message.includes("পদ্ধতি") ||
          error.message.includes("পেমেন্ট তথ্য"))
      )
        return { ok: false as const, error: error.message };
      return {
        ok: false as const,
        error: "অনুরোধ জমা হয়নি। এই ট্রানজেকশন আইডি আগে ব্যবহৃত হতে পারে।",
      };
    }
  });
