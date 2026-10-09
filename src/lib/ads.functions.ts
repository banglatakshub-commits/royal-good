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

function authenticatedId(data: z.infer<typeof input>): string {
  const user = requireTelegramUser(data.initData, {
    tgId: data.tgId,
    name: data.name,
    username: data.username,
    photoUrl: data.photo,
  });
  if (!telegramIdentityMatches(user, data.tgId))
    throw new Error("Telegram identity does not match the request.");
  return user.id;
}

async function getStatus(tgId: string) {
  const db = getDb();
  const { since, resetAt } = getDhakaNoonWindow();
  const [[result], [config]] = await Promise.all([
    db
      .select({ watched: count(ad_views.id) })
      .from(ad_views)
      .where(and(eq(ad_views.tg_id, tgId), gte(ad_views.created_at, since))),
    db.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
  ]);
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
    const { watched, limit, resetAt } = await getStatus(authenticatedId(data));
    return { watched, limit, resetAt: resetAt.toISOString() };
  });

/** Atomically enforce the daily ad limit, record a view, and credit the reward. */
export const recordAdView = createServerFn({ method: "POST" })
  .validator((data) => input.parse(data))
  .handler(async ({ data }) => {
    const tgId = authenticatedId(data);
    const db = getDb();
    const { since, resetAt } = getDhakaNoonWindow();

    return db.transaction(async (tx) => {
      const [player] = await tx
        .select({ blocked: players.blocked })
        .from(players)
        .where(eq(players.tg_id, tgId))
        .for("update")
        .limit(1);
      if (!player) throw new Error("Player profile is not ready.");
      if (player.blocked) throw new Error("Your account is blocked.");

      const [[result], [config]] = await Promise.all([
        tx
          .select({ watched: count(ad_views.id) })
          .from(ad_views)
          .where(and(eq(ad_views.tg_id, tgId), gte(ad_views.created_at, since))),
        tx.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
      ]);
      const watched = result?.watched ?? 0;
      const limit = config?.daily_ads ?? 10;
      if (watched >= limit) {
        return {
          ok: false,
          watched,
          limit,
          resetAt: resetAt.toISOString(),
          balance: null as number | null,
        };
      }

      await tx.insert(ad_views).values({ tg_id: tgId });
      const balance = await creditWithin(
        tx as unknown as BalanceExecutor,
        tgId,
        config?.ad_reward ?? 5,
      );
      if (balance === null) throw new Error("Reward could not be credited.");
      return { ok: true, watched: watched + 1, limit, resetAt: resetAt.toISOString(), balance };
    });
  });
