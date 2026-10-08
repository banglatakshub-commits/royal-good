import { db } from "@/lib/database";
import { players } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { getTgUser } from "@/lib/telegram";

export interface PlayerRow {
  tg_id: string;
  name: string;
  username: string | null;
  photo_url: string | null;
  balance: number;
}

/** Create/refresh the current Telegram user's profile on the server; returns their balance. */
export async function syncPlayer(): Promise<number | null> {
  const user = getTgUser();
  if (!user.id) return null;
  
  try {
    // Check if user exists
    const existingUser = await db.select().from(players).where(eq(players.tg_id, String(user.id))).limit(1);
    
    if (existingUser.length === 0) {
      // Create new user
      await db.insert(players).values({
        tg_id: String(user.id),
        name: user.name,
        username: user.username,
        photo_url: user.photo,
        balance: 0
      });
      return 0;
    } else {
      // Update existing user info
      await db.update(players)
        .set({
          name: user.name,
          username: user.username,
          photo_url: user.photo,
          updated_at: new Date()
        })
        .where(eq(players.tg_id, String(user.id)));
      
      return existingUser[0].balance;
    }
  } catch (error) {
    console.error("Profile sync error:", error);
    return null;
  }
}

/** Fetch top earners, highest balance first. */
export async function fetchLeaderboard(limit = 50): Promise<PlayerRow[]> {
  try {
    const data = await db.select({
      tg_id: players.tg_id,
      name: players.name,
      username: players.username,
      photo_url: players.photo_url,
      balance: players.balance
    })
    .from(players)
    .orderBy(desc(players.balance))
    .limit(limit);
    
    return data;
  } catch (error) {
    console.error("Leaderboard fetch error:", error);
    return [];
  }
}

/** Read the current user's saved balance from the server. */
export async function fetchMyBalance(): Promise<number | null> {
  const user = getTgUser();
  if (!user.id) return null;
  
  try {
    const result = await db.select({ balance: players.balance })
      .from(players)
      .where(eq(players.tg_id, String(user.id)))
      .limit(1);
    
    return result[0]?.balance || 0;
  } catch (error) {
    console.error("Balance fetch error:", error);
    return null;
  }
}
