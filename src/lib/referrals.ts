import { useEffect, useState } from "react";
import { db } from "@/lib/database";
import { referrals, players } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { getTgUser } from "@/lib/telegram";
import { syncPlayer } from "@/lib/players";

export const REF_BONUS = 5;
export const BOT_USERNAME = "Royal_goodbot";

export interface ReferralRow {
  referred_id: string;
  referred_name: string | null;
  photo_url: string | null;
  created_at: string;
}

export function myRefCode() {
  const u = getTgUser();
  return u.id ? String(u.id) : u.username;
}

export function myRefLink() {
  return `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(myRefCode())}`;
}

function incomingRefCode(): string | null {
  if (typeof window === "undefined") return null;
  const sp = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param;
  const q = new URLSearchParams(window.location.search).get("ref");
  return sp || q || null;
}

/**
 * Record that the current user joined via someone's link.
 */
export async function recordIncomingReferral() {
  const code = incomingRefCode();
  const me = getTgUser();
  if (!code || code === myRefCode() || code === me.username) return;
  
  const key = `lg_ref_done_${code}`;
  if (localStorage.getItem(key)) return;
  
  try {
    await syncPlayer();
    
    // Check if referral already exists
    const existingReferral = await db.select()
      .from(referrals)
      .where(eq(referrals.referred_tg_id, String(me.id || me.username)))
      .limit(1);
    
    if (existingReferral.length === 0) {
      // Create referral record
      const referralId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await db.insert(referrals).values({
        id: referralId,
        referrer_tg_id: code,
        referred_tg_id: String(me.id || me.username),
        bonus_amount: REF_BONUS
      });
      
      // Update referrer balance
      await db.update(players)
        .set({
          balance: players.balance + REF_BONUS
        })
        .where(eq(players.tg_id, code));
      
      localStorage.setItem(key, "1");
    }
  } catch (error) {
    console.error("Referral recording error:", error);
  }
}

export async function fetchMyReferrals(): Promise<ReferralRow[]> {
  try {
    const data = await db.select({
      referred_id: referrals.referred_tg_id,
      referred_name: players.name,
      photo_url: players.photo_url,
      created_at: referrals.created_at
    })
    .from(referrals)
    .leftJoin(players, eq(referrals.referred_tg_id, players.tg_id))
    .where(eq(referrals.referrer_tg_id, getTgUser().username || String(getTgUser().id)))
    .orderBy(desc(referrals.created_at));
    
    return data.map(row => ({
      referred_id: row.referred_id,
      referred_name: row.referred_name,
      photo_url: row.photo_url,
      created_at: row.created_at?.toISOString() || new Date().toISOString()
    }));
  } catch (error) {
    console.error("Fetch referrals error:", error);
    return [];
  }
}

/** Load my referrals (bonus is credited by recordIncomingReferral, once per join). */
export function useReferrals() {
  const [list, setList] = useState<ReferralRow[]>([]);
  
  useEffect(() => {
    let alive = true;
    
    const run = async () => {
      await recordIncomingReferral();
      const rows = await fetchMyReferrals();
      if (alive) setList(rows);
    };
    
    void run();
    const interval = setInterval(run, 8000);
    
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);
  
  return list;
}
