import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTgUser } from "@/lib/telegram";
import { recordReferral } from "@/lib/earn.functions";
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
 * The referrals table has a UNIQUE constraint on referred_id, so the insert
 * succeeds only the very first time this user joins. Only on that first
 * successful insert do we credit the referrer's bonus — repeat opens,
 * reinstalled apps, or other devices can never grant the bonus twice.
 */
export async function recordIncomingReferral() {
  const code = incomingRefCode();
  const me = getTgUser();
  if (!code || code === myRefCode() || code === me.username) return;
  const key = `lg_ref_done_${code}`;
  if (localStorage.getItem(key)) return;
  try {
    await syncPlayer();
    await recordReferral({ data: { tgId: me.username, code, name: me.name, photo: me.photo } });
    localStorage.setItem(key, "1");
  } catch {
    // offline — ignore
  }
}

export async function fetchMyReferrals(): Promise<ReferralRow[]> {
  const { data } = await supabase
    .from("referrals")
    .select("referred_id, referred_name, photo_url, created_at")
    .eq("referrer_id", getTgUser().username)
    .order("created_at", { ascending: false });
  return (data as ReferralRow[]) ?? [];
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
    const t = setInterval(run, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return list;
}
