import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, gte, count, and } from "drizzle-orm";
import { getDb } from "./database";
import { players, ad_views, app_settings } from "../../drizzle/schema";
import { authenticatedUser } from "./telegram-auth.server";
import { getDhakaNoonWindow } from "./dhaka-window";
import { credit } from "./balance.server";

const adClaimInput = z.object({
  tgId: z.string().trim().min(1).max(64),
  username: z.string().optional(),
  name: z.string().optional(),
  photoUrl: z.string().optional(),
  chatId: z.number().optional(),
});

export const getAdStatus = createServerFn({ method: "POST" })
  .validator((data) => adClaimInput.parse(data))
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    const db = getDb();
    const { since, resetAt } = getDhakaNoonWindow();

    const [result, config] = await Promise.all([
      db
        .select({ watched: count(ad_views.id) })
        .from(ad_views)
        .where(and(eq(ad_views.tg_id, user.id), gte(ad_views.created_at, since))),
      db.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
    ]);

    const watched = result[0]?.watched ?? 0;
    const limit = config[0]?.daily_ads ?? 10;

    return { watched, limit, resetAt: resetAt.toISOString() };
  });

export const recordAdView = createServerFn({ method: "POST" })
  .validator((data) => adClaimInput.parse(data))
  .handler(async ({ data }) => {
    const user = authenticatedUser(data);
    const db = getDb();
    const { since, resetAt } = getDhakaNoonWindow();

    // Get current status
    const [result, config] = await Promise.all([
      db
        .select({ watched: count(ad_views.id) })
        .from(ad_views)
        .where(and(eq(ad_views.tg_id, user.id), gte(ad_views.created_at, since))),
      db.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
    ]);

    const watched = result[0]?.watched ?? 0;
    const limit = config[0]?.daily_ads ?? 10;
    const reward = config[0]?.ad_reward ?? 5;

    // Check daily limit
    if (watched >= limit) {
      return { 
        ok: false, 
        watched, 
        limit, 
        resetAt: resetAt.toISOString() 
      };
    }

    // Create player profile if not exists
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
      .onConflictDoNothing({ target: players.tg_id });

    // Record the ad view
    await db.insert(ad_views).values({ tg_id: user.id });
    
    // Credit the reward
    const balance = await credit(user.id, reward);
    
    console.log(`💰 Rewarded user ${user.id} with ${reward}. New balance: ${balance}`);
    
    return { 
      ok: true, 
      balance, 
      watched: watched + 1, 
      limit, 
      resetAt: resetAt.toISOString() 
    };
  });