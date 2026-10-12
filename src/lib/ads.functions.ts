import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "./database";
import { players, app_settings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { credit } from "./balance.server";

const adClaimInput = z.object({
  tgId: z.string().trim().min(1).max(64),
  name: z.string().optional(),
  username: z.string().optional(),
  photoUrl: z.string().optional(),
});

export const claimAdReward = createServerFn({ method: "POST" })
  .validator((data) => adClaimInput.parse(data))
  .handler(async ({ data }) => {
    const db = getDb();
    
    // Get reward amount from settings
    const [settingRow] = await db.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1);
    const reward = settingRow?.ad_reward ?? 5;

    // Create player profile if not exists
    await db
      .insert(players)
      .values({
        tg_id: data.tgId,
        name: data.name || "User",
        username: data.username,
        photo_url: data.photoUrl,
        balance: 0,
      })
      .onConflictDoNothing({ target: players.tg_id });

    // Give reward
    const balance = await credit(data.tgId, reward);
    
    console.log(`💰 Ad reward given to ${data.tgId}: +${reward}. New balance: ${balance}`);
    
    return { 
      success: true, 
      balance, 
      reward 
    };
  });