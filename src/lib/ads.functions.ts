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
    console.log("🚀 claimAdReward called with data:", data);
    
    const db = getDb();
    
    // Get reward amount from settings
    console.log("📊 Getting reward amount from settings...");
    const [settingRow] = await db.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1);
    const reward = settingRow?.ad_reward ?? 5;
    console.log("💰 Reward amount:", reward);

    // Create player profile if not exists
    console.log("👤 Creating/updating player profile...");
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
    console.log("✅ Player profile handled");

    // Give reward
    console.log("💳 Crediting reward...");
    const balance = await credit(data.tgId, reward);
    console.log(`💰 Credit successful! New balance: ${balance}`);
    
    console.log(`🎉 Ad reward complete for ${data.tgId}: +${reward}. New balance: ${balance}`);
    
    return { 
      success: true, 
      balance, 
      reward 
    };
  });