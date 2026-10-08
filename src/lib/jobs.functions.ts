import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { credit } from "./balance.server";

const input = z.object({ tgId: z.string().trim().min(1).max(64), kind: z.enum(["typing", "quiz"]) });

// Same window as ads: resets daily at 12:00 PM (noon) Dhaka time.
const DHAKA = 6 * 3600 * 1000;
function bounds() {
  const now = new Date(Date.now() + DHAKA);
  const mid = new Date(now);
  mid.setUTCHours(0, 0, 0, 0);
  const beforeNoon = now.getTime() - mid.getTime() < 12 * 3600 * 1000;
  const start = mid.getTime() - DHAKA + (beforeNoon ? -12 : 12) * 3600 * 1000;
  return { since: new Date(start).toISOString(), resetAt: new Date(start + 86400000).toISOString() };
}

async function status(tgId: string, kind: "typing" | "quiz") {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { since, resetAt } = bounds();
  const [cleanup, views, config] = await Promise.all([
    db.from("job_views").delete().eq("tg_id", tgId).eq("kind", kind).lt("created_at", since),
    db.from("job_views").select("id", { count: "exact", head: true }).eq("tg_id", tgId).eq("kind", kind).gte("created_at", since),
    db.from("app_settings").select("daily_typing, daily_quiz, task_reward").eq("id", 1).maybeSingle(),
  ]);
  if (cleanup.error || views.error || config.error) throw new Error("Job status unavailable");
  const s = config.data;
  const limit = (kind === "typing" ? s?.daily_typing : s?.daily_quiz) ?? 5;
  return { db, done: views.count ?? 0, limit, resetAt, reward: s?.task_reward ?? 5 };
}

export const getJobStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }) => {
    const { done, limit, resetAt } = await status(data.tgId, data.kind);
    return { done, limit, resetAt };
  });

export const recordJob = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }) => {
    const st = await status(data.tgId, data.kind);
    if (st.done >= st.limit) return { ok: false, done: st.done, limit: st.limit };
    const { error } = await st.db.from("job_views").insert({ tg_id: data.tgId, kind: data.kind });
    if (error) throw new Error("Job could not be recorded");
    const balance = await credit(data.tgId, st.reward);
    return { ok: true, balance, done: st.done + 1, limit: st.limit };
  });
