import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/database";
import { ad_views, app_settings, players } from "../../drizzle/schema";
import { creditWithin, type BalanceExecutor } from "./balance.server";
import { getDhakaNoonWindow } from "./dhaka-window";
import { requireTelegramUser, telegramIdentityMatches } from "./telegram-auth.server";

const input = z.object({
  initData: z.string().max(8192).optional(),
  tgId: z.string().trim().min(1).max(64),
  name: z.string().trim().max(100).optional(),
  username: z.string().trim().max(64).nullable().optional(),
  photo: z.string().url().max(500).nullable().optional(),
});
const adClaimInput = input.extend({ claimId: z.string().uuid() });

type AdInput = z.infer<typeof input>;

function authenticatedUser(data: AdInput) {
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

async function getStatus(tgId: string) {
  const db = getDb();
  const { since, resetAt } = getDhakaNoonWindow();
  const [[result], [config], [player]] = await Promise.all([
    db
      .select({ watched: count(ad_views.id) })
      .from(ad_views)
      .where(and(eq(ad_views.tg_id, tgId), gte(ad_views.created_at, since))),
    db.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
    db.select({ blocked: players.blocked }).from(players).where(eq(players.tg_id, tgId)).limit(1),
  ]);
  if (player?.blocked) throw new Error("Your account is blocked.");
  return {
    watched: result?.watched ?? 0,
    limit: config?.daily_ads ?? 10,
    reward: config?.ad_reward ?? 5,
    resetAt,
  };
}

export const getAdStatus = createServerFn({ method: "POST" })
  .validator((data) => input.parse(data))
  .handler(async ({ data }) => {
    const { watched, limit, resetAt } = await getStatus(authenticatedUser(data).id);
    return { watched, limit, resetAt: resetAt.toISOString() };
  });

/** Atomically enforce the daily ad limit, record a view, and credit the reward. */
export const recordAdView = createServerFn({ method: "POST" })
  .validator((data) => adClaimInput.parse(data))
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    const db = getDb();
    const { since, resetAt } = getDhakaNoonWindow();

    return db.transaction(async (tx) => {
      // Create a first-time profile in this transaction instead of relying on a separate
      // client request to syncPlayer before the reward can be recorded.
      await tx
        .insert(players)
        .values({
          tg_id: user.id,
          name: user.name,
          username: user.username,
          photo_url: user.photoUrl,
          chat_id: user.chatId,
          balance: 0,
        })
        .onConflictDoNothing({ target: players.tg_id });

      // Serialize claims for this user so simultaneous requests cannot exceed the limit
      // or credit the same claim twice.
      const [player] = await tx
        .select({ blocked: players.blocked, balance: players.balance })
        .from(players)
        .where(eq(players.tg_id, user.id))
        .for("update")
        .limit(1);
      if (!player) throw new Error("Player profile is not ready.");
      if (player.blocked) throw new Error("Your account is blocked.");

      // A network failure can happen after PostgreSQL commits but before the client gets
      // the response. Retrying the same claim ID must return the existing result, not pay twice.
      const [previousClaim] = await tx
        .select({ id: ad_views.id })
        .from(ad_views)
        .where(and(eq(ad_views.tg_id, user.id), eq(ad_views.claim_id, data.claimId)))
        .limit(1);

      const [[result], [config]] = await Promise.all([
        tx
          .select({ watched: count(ad_views.id) })
          .from(ad_views)
          .where(and(eq(ad_views.tg_id, user.id), gte(ad_views.created_at, since))),
        tx.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
      ]);
      const watched = result?.watched ?? 0;
      const limit = config?.daily_ads ?? 10;

      if (previousClaim) {
        return {
          ok: true,
          watched,
          limit,
          resetAt: resetAt.toISOString(),
          balance: player.balance,
          alreadyRewarded: true,
        };
      }

      if (watched >= limit) {
        return {
          ok: false,
          watched,
          limit,
          resetAt: resetAt.toISOString(),
          balance: null as number | null,
          alreadyRewarded: false,
        };
      }

      await tx.insert(ad_views).values({ tg_id: user.id, claim_id: data.claimId });
      const balance = await creditWithin(
        tx as unknown as BalanceExecutor,
        user.id,
        config?.ad_reward ?? 5,
      );
      if (balance === null) throw new Error("Reward could not be credited.");
      return {
        ok: true,
        watched: watched + 1,
        limit,
        resetAt: resetAt.toISOString(),
        balance,
        alreadyRewarded: false,
      };
    });
  });
