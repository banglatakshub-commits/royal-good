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

/**
 * Records a referral straight from a Telegram /start event (server-trusted, no Mini App needed),
 * so a referral link counts the moment the new user opens the bot. Idempotent and self-referral-safe.
 */
export async function recordReferralForTelegramUser(opts: {
  referredId: string;
  referrerCode: string;
  referredName?: string | null;
  username?: string | null;
  chatId?: number | null;
}): Promise<void> {
  const referredId = opts.referredId.trim();
  const code = opts.referrerCode.trim().replace(/^@/, "");
  if (!referredId || !code || code === referredId) return;
  if (opts.username && code.toLowerCase() === opts.username.toLowerCase()) return;

  const db = getDb();
  // Ensure the new user has a player row (also stores chat_id for broadcasts).
  await db
    .insert(players)
    .values({
      tg_id: referredId,
      name: opts.referredName || "User",
      username: opts.username ?? null,
      chat_id: opts.chatId ?? null,
      balance: 0,
    })
    .onConflictDoNothing();

  await db.transaction(async (tx) => {
    const [me] = await tx
      .select({ balance: players.balance, blocked: players.blocked })
      .from(players)
      .where(eq(players.tg_id, referredId))
      .for("update")
      .limit(1);
    if (!me || me.blocked) return;
    // FORCE_REFERRAL: count the referral even for existing users (balance > 0). Set to false to
    // restore anti-farming (only brand-new, zero-balance users get referred).
    if (!FORCE_REFERRAL && me.balance > 0) return;

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
    // Force mode: create a stub profile for a numeric referrer id that hasn't opened the app yet,
    // so the referral still counts.
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
    if (!referrer || referrer.blocked || referrer.tg_id === referredId) return;

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
      })
      .onConflictDoNothing()
      .returning({ referred_id: referrals.referred_id });
    if (!inserted) return;

    const balance = await creditWithin(
      tx as unknown as BalanceExecutor,
      referrer.tg_id,
      setting?.ref_bonus ?? 5,
    );
    if (balance === null) throw new Error("Referral bonus could not be credited.");
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
