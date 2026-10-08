import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { credit } from "./balance.server";

const input = z.object({ tgId: z.string().trim().min(1).max(64) });

// Ad limit resets every day at 12:00 PM (noon) Bangladesh time (UTC+6).
// Each window runs from one Dhaka noon to the next.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

function dhakaDayBounds() {
  const nowDhaka = new Date(Date.now() + DHAKA_OFFSET_MS);
  const midnight = new Date(nowDhaka);
  midnight.setUTCHours(0, 0, 0, 0); // Dhaka clock midnight (12:00 AM)
  // If it's still before noon today, the current window started yesterday at noon.
  const beforeNoon = nowDhaka.getTime() - midnight.getTime() < 12 * 60 * 60 * 1000;
  const startUtc = beforeNoon
    ? midnight.getTime() - DHAKA_OFFSET_MS - 12 * 60 * 60 * 1000
    : midnight.getTime() - DHAKA_OFFSET_MS + 12 * 60 * 60 * 1000;
  return {
    since: new Date(startUtc).toISOString(),
    resetAt: new Date(startUtc + 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function status(tgId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { since, resetAt } = dhakaDayBounds();
  // Count only this noon-to-noon window; old rows can be cleaned in parallel.
  const [cleanup, views, config] = await Promise.all([
    db.from("ad_views").delete().eq("tg_id", tgId).lt("created_at", since),
    db.from("ad_views").select("id", { count: "exact", head: true }).eq("tg_id", tgId).gte("created_at", since),
    db.from("app_settings").select("daily_ads, ad_reward").eq("id", 1).maybeSingle(),
  ]);
  if (cleanup.error || views.error || config.error) throw new Error("Ad status unavailable");
  const watched = views.count ?? 0;
  const limit = config.data?.daily_ads ?? 10;
  return { db, watched, limit, resetAt, reward: config.data?.ad_reward ?? 5 };
}

export const getAdStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }) => {
    const { watched, limit, resetAt } = await status(data.tgId);
    return { watched, limit, resetAt };
  });

export const recordAdView = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }) => {
    const st = await status(data.tgId);
    if (st.watched >= st.limit) return { ok: false, watched: st.watched, limit: st.limit, resetAt: st.resetAt };
    const { error } = await st.db.from("ad_views").insert({ tg_id: data.tgId });
    if (error) throw new Error("Ad view could not be recorded");
    const balance = await credit(data.tgId, st.reward);
    return { ok: true, balance, watched: st.watched + 1, limit: st.limit, resetAt: st.resetAt };
  });
