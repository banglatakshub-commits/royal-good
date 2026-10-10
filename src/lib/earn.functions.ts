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
import { generateNekSign, resolveNekPayType, NEK_DEFAULT_PUBLIC_DOMAIN } from "./nekpayment";
import { getRequest } from "@tanstack/react-start/server";
import {
  effectiveMinWithdraw,
  validateWithdraw,
  WITHDRAW_MESSAGES,
  withdrawRequestSchema,
  type WithdrawErrorCode,
} from "./withdraw-validation";
import { payment_transactions } from "../../drizzle/schema";

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
      const reason = dbError instanceof Error ? dbError.message : "অজানা সমস্যা";
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

export type PaymentStart = { ok: true; url: string } | { ok: false; error: string };

/** Derives the public host (for the callback URL) from the incoming request headers. */
function requestPublicHost(): string {
  try {
    const headers = getRequest().headers;
    const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    return (forwarded || headers.get("host")?.trim() || "").replace(/^https?:\/\//, "");
  } catch {
    return "";
  }
}

const paymentStartSchema = identity.extend({
  payMethod: z.enum(["bkash", "nagad"]).optional(),
});

/** Starts the existing account-activation payment through NekPay collection API. */
export const generatePaymentUrl = createServerFn({ method: "POST" })
  .validator((data) => paymentStartSchema.parse(data))
  .handler(async ({ data }): Promise<PaymentStart> => {
    const user = authenticatedUser(data);
    const db = getDb();
    const [[player], [settingRow]] = await Promise.all([
      db
        .select({ is_active: players.is_active, blocked: players.blocked })
        .from(players)
        .where(eq(players.tg_id, user.id))
        .limit(1),
      db
        .select({
          activation_fee: app_settings.activation_fee,
          nek_api_key: app_settings.nek_api_key,
          nek_secret_key: app_settings.nek_secret_key,
        })
        .from(app_settings)
        .where(eq(app_settings.id, 1))
        .limit(1),
    ]);

    if (!player) return { ok: false, error: "অ্যাকাউন্ট পাওয়া যায়নি" };
    if (player.blocked) return { ok: false, error: "আপনার অ্যাকাউন্ট ব্লক করা হয়েছে" };
    if (player.is_active) return { ok: false, error: "আপনার অ্যাকাউন্ট ইতিমধ্যে অ্যাক্টিভ" };

    const merchantId = settingRow?.nek_api_key.trim() ?? "";
    const secretKey = settingRow?.nek_secret_key.trim() ?? "";
    if (!merchantId || !secretKey) {
      return { ok: false, error: "NekPay Merchant ID ও Collection Key অ্যাডমিন সেটিংসে দিতে হবে।" };
    }

    // Pay type is built in (bKash/Nagad/Bank codes); an optional NEKPAY_PAY_TYPE env still overrides.
    const payType = process.env["NEKPAY_PAY_TYPE"]?.trim() || resolveNekPayType(data.payMethod);

    // Callback host: RAILWAY_PUBLIC_DOMAIN if set, else the request host, else the baked-in domain.
    const configuredDomain = process.env["RAILWAY_PUBLIC_DOMAIN"]?.trim() ?? "";
    const rawDomain = (
      configuredDomain ||
      requestPublicHost() ||
      NEK_DEFAULT_PUBLIC_DOMAIN
    ).replace(/^https?:\/\//, "");
    const callbackHost = rawDomain.endsWith("/") ? rawDomain.slice(0, -1) : rawDomain;

    const activationFee = settingRow?.activation_fee ?? 100;
    const notifyUrl = `https://${callbackHost}/api/public/nekpayment-webhook`;
    const orderId = `act_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const params: Record<string, string> = {
      version: "1.0",
      mch_id: merchantId,
      notify_url: notifyUrl,
      mch_order_no: orderId,
      pay_type: payType,
      trade_amount: String(activationFee),
      order_date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .format(new Date())
        .replace(",", ""),
      goods_name: "Account Activation",
      sign_type: "MD5",
    };
    // Bracket access: `params` is a Record, and the project forbids dot access on index signatures.
    params["sign"] = generateNekSign(params, secretKey);

    // Create the pending row before contacting the gateway, so an immediate callback can find it.
    await db.insert(payment_transactions).values({
      id: orderId,
      tg_id: user.id,
      amount: activationFee,
      status: "pending",
    });

    try {
      const response = await fetch("https://api.nekpayment.com/pay/web", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(15000),
      });
      const raw = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error("NekPay returned an unreadable response");
      }
      if (!response.ok) throw new Error(`NekPay request failed (HTTP ${response.status})`);
      const paymentUrl = findNekPayPaymentUrl(payload);
      if (!paymentUrl) throw new Error(`NekPay: ${nekPayErrorMessage(payload)}`);
      return { ok: true, url: paymentUrl };
    } catch (error) {
      await db
        .update(payment_transactions)
        .set({ status: "failed", updated_at: new Date() })
        .where(eq(payment_transactions.id, orderId));
      console.error("NekPay activation request error:", error);
      // Surface NekPay's real reason so merchant/key/pay_type issues are visible.
      const reason = error instanceof Error ? error.message : "পেমেন্ট শুরু করা যায়নি";
      return { ok: false, error: reason };
    }
  });

/** Pulls a human-readable error out of a NekPay response (respCode / errorMsg / tradeMsg). */
function nekPayErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "অপ্রত্যাশিত রেসপন্স";
  const o = payload as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  return (
    pick("errorMsg") ??
    pick("tradeMsg") ??
    pick("respMsg") ??
    pick("message") ??
    pick("msg") ??
    pick("respCode") ??
    "পেমেন্ট লিংক পাওয়া যায়নি"
  );
}

function findNekPayPaymentUrl(value: unknown, depth = 0): string | null {
  if (depth > 5 || !value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  // NekPay returns the cashier link in `payInfo`; keep the other common names too.
  for (const key of [
    "payInfo",
    "pay_url",
    "payUrl",
    "payment_url",
    "paymentUrl",
    "cashierUrl",
    "payment_link",
    "url",
    "redirect_url",
  ]) {
    const candidate = object[key];
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  // Fallback: any string value on this object that is itself a URL.
  for (const candidate of Object.values(object)) {
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  for (const nested of Object.values(object)) {
    const found = findNekPayPaymentUrl(nested, depth + 1);
    if (found) return found;
  }
  return null;
}
