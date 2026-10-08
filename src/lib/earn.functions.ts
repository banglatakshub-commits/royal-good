import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// All balance changes happen here on the server. The browser can never set a balance directly.

const tg = z.string().trim().min(1).max(64);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

import { credit } from "./balance.server";

const DHAKA = 6 * 3600 * 1000;
function windowStart() {
  const now = new Date(Date.now() + DHAKA);
  const mid = new Date(now);
  mid.setUTCHours(0, 0, 0, 0);
  const beforeNoon = now.getTime() - mid.getTime() < 12 * 3600 * 1000;
  const start = mid.getTime() - DHAKA + (beforeNoon ? -12 : 12) * 3600 * 1000;
  return { since: new Date(start).toISOString(), resetAt: new Date(start + 86400000).toISOString() };
}

/** Create/refresh the player's profile (never touches balance) and return their balance. */
export const syncProfile = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        tgId: tg,
        name: z.string().trim().min(1).max(100),
        username: z.string().trim().max(64).nullable(),
        photo: z.string().url().max(500).nullable(),
        chatId: z.number().int().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: existing } = await db.from("players").select("balance").eq("tg_id", data.tgId).maybeSingle();
    const row = {
      tg_id: data.tgId,
      name: data.name,
      username: data.username,
      photo_url: data.photo,
      updated_at: new Date().toISOString(),
      ...(data.chatId ? { chat_id: data.chatId } : {}),
    };
    if (existing) await db.from("players").update(row).eq("tg_id", data.tgId);
    else await db.from("players").insert({ ...row, balance: 0 });
    return { balance: existing?.balance ?? 0 };
  });

export const getMyBalance = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ tgId: tg }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: p } = await db.from("players").select("balance").eq("tg_id", data.tgId).maybeSingle();
    return { balance: p?.balance ?? 0 };
  });

/** One-time reward for a custom task. */
export const claimTask = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ tgId: tg, taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: task } = await db.from("custom_tasks").select("reward, active").eq("id", data.taskId).maybeSingle();
    if (!task || !task.active) return { ok: false, balance: null };
    const { error } = await db.from("task_claims").insert({ tg_id: data.tgId, task_id: data.taskId });
    if (error) return { ok: false, balance: null, already: true };
    return { ok: true, balance: await credit(data.tgId, task.reward), reward: task.reward };
  });

const SEGMENTS = [20, 100, 30, 150, 40, 200, 50, 300];
const WEIGHTS = [30, 5, 25, 3, 20, 1.5, 15, 0.5];

export const getSpinStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ tgId: tg }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { since } = windowStart();
    const [cleanup, views, config] = await Promise.all([
      db.from("job_views").delete().eq("tg_id", data.tgId).eq("kind", "spin").lt("created_at", since),
      db.from("job_views").select("id", { count: "exact", head: true }).eq("tg_id", data.tgId).eq("kind", "spin").gte("created_at", since),
      db.from("app_settings").select("daily_spins").eq("id", 1).maybeSingle(),
    ]);
    if (cleanup.error || views.error || config.error) throw new Error("Spin status unavailable");
    return { used: views.count ?? 0, limit: config.data?.daily_spins ?? 2 };
  });

/** Server decides the spin result and credits it. */
export const doSpin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ tgId: tg }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { since } = windowStart();
    const [cleanup, views, config] = await Promise.all([
      db.from("job_views").delete().eq("tg_id", data.tgId).eq("kind", "spin").lt("created_at", since),
      db.from("job_views").select("id", { count: "exact", head: true }).eq("tg_id", data.tgId).eq("kind", "spin").gte("created_at", since),
      db.from("app_settings").select("daily_spins").eq("id", 1).maybeSingle(),
    ]);
    if (cleanup.error || views.error || config.error) throw new Error("Spin status unavailable");
    const limit = config.data?.daily_spins ?? 2;
    const used = views.count ?? 0;
    if (used >= limit) return { ok: false, used, limit, index: -1, amount: 0, balance: null };
    const { error } = await db.from("job_views").insert({ tg_id: data.tgId, kind: "spin" });
    if (error) throw new Error("Spin could not be recorded");
    const total = WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let index = 0;
    for (let i = 0; i < WEIGHTS.length; i++) {
      r -= WEIGHTS[i] ?? 0;
      if (r <= 0) { index = i; break; }
    }
    const amount = SEGMENTS[index] ?? SEGMENTS[0] ?? 20;
    return { ok: true, used: used + 1, limit, index, amount, balance: await credit(data.tgId, amount) };
  });

/** Validate and create a withdrawal, deducting balance on the server. */
export const requestWithdraw = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        tgId: tg,
        name: z.string().trim().min(1).max(100),
        amount: z.number().int().positive().max(10_000_000),
        method: z.enum(["bKash", "Nagad"]),
        number: z.string().trim().regex(/^\d{11,14}$/),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const [{ data: p }, { data: s }, { count }] = await Promise.all([
      db.from("players").select("blocked, balance").eq("tg_id", data.tgId).maybeSingle(),
      db.from("app_settings").select("min_withdraw").eq("id", 1).maybeSingle(),
      db.from("withdrawals").select("id", { count: "exact", head: true }).eq("tg_id", data.tgId).eq("status", "rejected"),
    ]);
    if (!p) return { ok: false, error: "অ্যাকাউন্ট পাওয়া যায়নি" };
    if (p.blocked) return { ok: false, error: "আপনার অ্যাকাউন্ট ব্লক করা হয়েছে" };
    const min = (s?.min_withdraw ?? 50) * Math.min(2 ** (count ?? 0), 8);
    if (data.amount < min) return { ok: false, error: `সর্বনিম্ন উইথড্র ৳${min}` };
    const nb = await credit(data.tgId, -data.amount);
    if (nb === null) return { ok: false, error: "পর্যাপ্ত ব্যালেন্স নেই" };
    const { error } = await db.from("withdrawals").insert({
      tg_id: data.tgId, name: data.name, amount: data.amount, method: data.method, number: data.number,
    });
    if (error) {
      await credit(data.tgId, data.amount);
      return { ok: false, error: "সমস্যা হয়েছে, আবার চেষ্টা করুন" };
    }
    return { ok: true, balance: nb };
  });

/** Record a referral once per new user and credit the referrer. */
export const recordReferral = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        tgId: tg,
        code: tg,
        name: z.string().trim().max(100).nullable(),
        photo: z.string().url().max(500).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.code === data.tgId) return { ok: false };
    const db = await admin();
    let { data: referrer } = await db.from("players").select("tg_id").eq("tg_id", data.code).maybeSingle();
    if (!referrer && /^\d+$/.test(data.code)) {
      ({ data: referrer } = await db.from("players").select("tg_id").eq("chat_id", Number(data.code)).maybeSingle());
    }
    if (!referrer || referrer.tg_id === data.tgId) return { ok: false };
    // Only players who haven't earned anything yet can be referred.
    const { data: me } = await db.from("players").select("balance").eq("tg_id", data.tgId).maybeSingle();
    if (me && me.balance > 0) return { ok: false };
    const { error } = await db.from("referrals").insert({
      referred_id: data.tgId, referrer_id: referrer.tg_id, referred_name: data.name, photo_url: data.photo,
    });
    if (error) return { ok: false };
    const { data: s } = await db.from("app_settings").select("ref_bonus").eq("id", 1).maybeSingle();
    await credit(referrer.tg_id, s?.ref_bonus ?? 5);
    return { ok: true };
  });
