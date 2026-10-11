import { createServerFn } from "@tanstack/react-start";
import { desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/database";
import { app_settings, players, referrals } from "../../drizzle/schema";
import { creditWithin, type BalanceExecutor } from "./balance.server";
import { requireTelegramUser, telegramIdentityMatches } from "./telegram-auth.server";

/**
 * TEMPORARY (testing): count a referral even for existing users and create the referrer's profile
 * stub if missing. Set to false once referral counting is verified to restore anti-farming.
 */
export const FORCE_REFERRAL = true;

/** Outcome of a referral attempt, with a reason so the webhook/debug log can show what happened. */
export type RefResult = { recorded: boolean; reason: string; referrerId?: string };

/**
 * The single source of truth for recording a referral — used by both the Telegram /start webhook
 * and the Mini App client. Creates the referred user's profile, applies the referral under a row
 * lock (force mode: existing users allowed, referrer stub created if missing), credits the bonus,
 * and returns a detailed result. Idempotent: a repeat delivery reports "duplicate" without crediting.
 */
export async function recordReferralFor(opts: {
  referredId: string;
  code: string;
  referredName?: string | null;
  username?: string | null;
  chatId?: number | null;
  photoUrl?: string | null;
}): Promise<RefResult> {
  const referredId = opts.referredId.trim();
  const code = (opts.code ?? "").trim().replace(/^@/, "");
  if (!referredId || !code) return { recorded: false, reason: "no-code" };
  if (code === referredId) return { recorded: false, reason: "self" };
  if (opts.username && code.toLowerCase() === opts.username.toLowerCase())
    return { recorded: false, reason: "self-username" };

  const db = getDb();
  // Ensure the referred user has a profile row (also stores chat_id for broadcasts).
  await db
    .insert(players)
    .values({
      tg_id: referredId,
      name: opts.referredName || "User",
      username: opts.username ?? null,
      chat_id: opts.chatId ?? null,
      photo_url: opts.photoUrl ?? null,
      balance: 0,
    })
    .onConflictDoNothing();

  return db.transaction(async (tx): Promise<RefResult> => {
    const [me] = await tx
      .select({ balance: players.balance, blocked: players.blocked })
      .from(players)
      .where(eq(players.tg_id, referredId))
      .for("update")
      .limit(1);
    if (!me) return { recorded: false, reason: "no-referred" };
    if (me.blocked) return { recorded: false, reason: "referred-blocked" };
    // FORCE_REFERRAL: existing users (balance > 0) are allowed. Set false to restore anti-farming.
    if (!FORCE_REFERRAL && me.balance > 0) return { recorded: false, reason: "already-earning" };

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
    // Create a stub profile for a numeric referrer id that hasn't opened the app yet.
    if (!referrer && /^\d+$/.test(code)) {
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
    if (!referrer) return { recorded: false, reason: "no-referrer" };
    if (referrer.blocked) return { recorded: false, reason: "referrer-blocked" };
    if (referrer.tg_id === referredId) return { recorded: false, reason: "self" };

    const [setting] = await tx
      .select({ ref_bonus: app_settings.ref_bonus })
      .from(app_settings)
      .where(eq(app_settings.id, 1))
      .limit(1);

    const [inserted] = await tx
      .insert(referrals)
      .values({
        referred_id: referredId,
        referrer_id: referrer.tg_id,
        referred_name: opts.referredName ?? null,
        photo_url: opts.photoUrl ?? null,
      })
      .onConflictDoNothing()
      .returning({ referred_id: referrals.referred_id });
    if (!inserted) return { recorded: false, reason: "duplicate", referrerId: referrer.tg_id };

    const balance = await creditWithin(
      tx as unknown as BalanceExecutor,
      referrer.tg_id,
      setting?.ref_bonus ?? 5,
    );
    if (balance === null) throw new Error("Referral bonus could not be credited.");
    return { recorded: true, reason: "recorded", referrerId: referrer.tg_id };
  });
}

/** Records a referral from a Telegram /start event (server-trusted, no Mini App needed). */
export async function recordReferralForTelegramUser(opts: {
  referredId: string;
  referrerCode: string;
  referredName?: string | null;
  username?: string | null;
  chatId?: number | null;
}): Promise<RefResult> {
  return recordReferralFor({
    referredId: opts.referredId,
    code: opts.referrerCode,
    referredName: opts.referredName ?? null,
    username: opts.username ?? null,
    chatId: opts.chatId ?? null,
  });
}

const identity = z.object({
  initData: z.string().max(8192).optional(),
  tgId: z.string().trim().min(1).max(64),
  name: z.string().trim().max(100).optional(),
  username: z.string().trim().max(64).nullable().optional(),
  photo: z.string().url().max(500).nullable().optional(),
});

export const getMyReferrals = createServerFn({ method: "POST" })
  .validator((data) => identity.parse(data))
  .handler(async ({ data }) => {
    const user = requireTelegramUser(data.initData, {
      tgId: data.tgId,
      name: data.name,
      username: data.username,
      photoUrl: data.photo,
    });
    if (!telegramIdentityMatches(user, data.tgId))
      throw new Error("Telegram identity does not match the request.");

    const db = getDb();
    const rows = await db
      .select({
        referred_id: referrals.referred_id,
        referred_name: referrals.referred_name,
        photo_url: referrals.photo_url,
        created_at: referrals.created_at,
      })
      .from(referrals)
      .where(eq(referrals.referrer_id, user.id))
      .orderBy(desc(referrals.created_at));

    return rows.map((row) => ({ ...row, created_at: row.created_at.toISOString() }));
  });
