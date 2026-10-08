import { supabase } from "@/integrations/supabase/client";
import { getTgUser } from "@/lib/telegram";
import { syncProfile, getMyBalance } from "@/lib/earn.functions";

export interface PlayerRow {
  tg_id: string;
  name: string;
  username: string | null;
  photo_url: string | null;
  balance: number;
}

/** Create/refresh the current Telegram user's profile on the server; returns their balance. */
export async function syncPlayer(): Promise<number | null> {
  const u = getTgUser();
  try {
    const r = await syncProfile({ data: { tgId: u.username, name: u.name, username: u.username, photo: u.photo, chatId: u.id ?? null } });
    return r.balance;
  } catch {
    return null;
  }
}

/** Fetch top earners, highest balance first. */
export async function fetchLeaderboard(limit = 50): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from("players")
    .select("tg_id, name, username, photo_url, balance")
    .order("balance", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as PlayerRow[];
}

/** Read the current user's saved balance from the server. */
export async function fetchMyBalance(): Promise<number | null> {
  try {
    return (await getMyBalance({ data: { tgId: getTgUser().username } })).balance;
  } catch {
    return null;
  }
}
