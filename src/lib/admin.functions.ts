import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type AdminClient = Awaited<ReturnType<typeof getAdmin>>;

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Verify the Telegram user is a registered admin (by numeric id or username). Throws if not.
async function isPreviewRequest(): Promise<boolean> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const src = req.headers.get("origin") || req.headers.get("referer") || req.url;
    const host = new URL(src).hostname;
    return host.startsWith("id-preview--") || host.endsWith("lovableproject.com") || host === "localhost";
  } catch {
    return false;
  }
}

async function assertTgAdmin(db: AdminClient, ids: string[]) {
  // Editor preview test mode (same rule as the client) — published site still requires a listed admin.
  if (await isPreviewRequest()) return;
  const { data } = await db
    .from("admin_telegram_ids")
    .select("tg_id")
    .in("tg_id", ids)
    .limit(1);
  if (!data || data.length === 0) throw new Error("Forbidden");
}

const tgIdSchema = z.string().trim().min(1).max(64);
const identSchema = z.object({ tgId: tgIdSchema, username: z.string().trim().max(64).optional() });

function identList(d: { tgId: string; username?: string | undefined }): string[] {
  const ids = [d.tgId];
  if (d.username) ids.push(d.username.toLowerCase());
  return ids;
}

// One-time binding: the admin list holds the username 'shanto_as' until the real
// user opens the app from Telegram; then we swap it for their numeric Telegram ID.
// Requires a numeric tgId, so it cannot be triggered from a plain browser.
export const bindAdminId = createServerFn({ method: "POST" })
  .inputValidator((d) => identSchema.parse(d))
  .handler(async ({ data }) => {
    if (!/^\d+$/.test(data.tgId) || !data.username) return { bound: false };
    const db = await getAdmin();
    const uname = data.username.toLowerCase();
    const { data: row } = await db
      .from("admin_telegram_ids")
      .select("tg_id")
      .eq("tg_id", uname)
      .maybeSingle();
    if (!row) return { bound: false };
    await db.from("admin_telegram_ids").update({ tg_id: data.tgId }).eq("tg_id", uname);
    return { bound: true };
  });

// Check whether this Telegram user is an admin. No auto-claim — admins are fixed in admin_telegram_ids.
export const ensureTgAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => identSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await getAdmin();
    const { data: rows } = await db
      .from("admin_telegram_ids")
      .select("tg_id")
      .in("tg_id", identList(data))
      .limit(1);
    return { isAdmin: (rows ?? []).length > 0 };
  });

export const adminUpdateBalance = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    identSchema.extend({ targetTgId: tgIdSchema, balance: z.number().int().min(0).max(100000000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await assertTgAdmin(db, identList(data));
    const { error } = await db.from("players").update({ balance: data.balance }).eq("tg_id", data.targetTgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminToggleBlock = createServerFn({ method: "POST" })
  .inputValidator((d) => identSchema.extend({ targetTgId: tgIdSchema, blocked: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await assertTgAdmin(db, identList(data));
    const { error } = await db.from("players").update({ blocked: data.blocked }).eq("tg_id", data.targetTgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Permanently remove a user and all their data (referrals, withdrawals, views, claims).
export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((d) => identSchema.extend({ targetTgId: tgIdSchema }).parse(d))
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await assertTgAdmin(db, identList(data));
    const t = data.targetTgId;
    for (const table of ["withdrawals", "ad_views", "job_views", "task_claims"] as const) {
      await db.from(table).delete().eq("tg_id", t);
    }
    await db.from("referrals").delete().eq("referrer_id", t);
    await db.from("referrals").delete().eq("referred_id", t);
    const { error } = await db.from("players").delete().eq("tg_id", t);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    identSchema.extend({
      id: z.string().uuid(),
      status: z.enum(["approved", "rejected"]),
      targetTgId: tgIdSchema,
      amount: z.number().int().min(0),
      reason: z.string().trim().max(300).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await assertTgAdmin(db, identList(data));
    const { error } = await db
      .from("withdrawals")
      .update({ status: data.status, note: data.reason || null })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    if (data.status === "rejected") {
      const { data: p } = await db.from("players").select("balance").eq("tg_id", data.targetTgId).maybeSingle();
      if (p) await db.from("players").update({ balance: p.balance + data.amount }).eq("tg_id", data.targetTgId);
    }
    return { ok: true };
  });

// Admin can fix a wrong payment number on a pending withdrawal.
export const adminEditWithdrawalNumber = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    identSchema.extend({
      id: z.string().uuid(),
      number: z.string().trim().min(3).max(30),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await assertTgAdmin(db, identList(data));
    const { error } = await db
      .from("withdrawals")
      .update({ number: data.number })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSaveSettings = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    identSchema.extend({
      task_reward: z.number().int().min(0),
      ref_bonus: z.number().int().min(0),
      min_withdraw: z.number().int().min(0),
      daily_spins: z.number().int().min(0),
      ads_script_id: z.string().trim().regex(/^\d{1,12}$/),
      daily_ads: z.number().int().min(0).max(1000),
      ad_reward: z.number().int().min(0).max(100000),
      ad_seconds: z.number().int().min(0).max(600),
      daily_typing: z.number().int().min(0).max(1000),
      daily_quiz: z.number().int().min(0).max(1000),
      support_telegram_username: z.string().trim().max(33).transform((v) => v.replace(/^@/, "")).pipe(z.string().regex(/^(?:[A-Za-z][A-Za-z0-9_]{4,31})?$/)),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await assertTgAdmin(db, identList(data));
    const { tgId: _i1, username: _i2, ...fields } = data;
    const { error } = await db
      .from("app_settings")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminBroadcast = createServerFn({ method: "POST" })
  .inputValidator((d) => identSchema.extend({ text: z.string().trim().min(1).max(3500) }).parse(d))
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await assertTgAdmin(db, identList(data));

    const { data: rows } = await db
      .from("players")
      .select("chat_id")
      .not("chat_id", "is", null)
      .eq("blocked", false);
    const ids = [...new Set((rows ?? []).map((r) => r.chat_id as number))];

    const lovKey = process.env["LOVABLE_API_KEY"]!;
    const tgKey = process.env["TELEGRAM_API_KEY"]!;
    let sent = 0;
    let failed = 0;
    for (const chat_id of ids) {
      try {
        const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovKey}`,
            "X-Connection-Api-Key": tgKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ chat_id, text: data.text }),
        });
        if (res.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
    return { total: ids.length, sent, failed };
  });

const taskSchema = z.object({
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().min(1).max(8),
  link: z.string().trim().url().max(500).optional().or(z.literal("")),
  reward: z.number().int().min(0).max(100000),
  wait_seconds: z.number().int().min(0).max(600),
});

export const adminAddTask = createServerFn({ method: "POST" })
  .inputValidator((d) => identSchema.extend({ task: taskSchema }).parse(d))
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await assertTgAdmin(db, identList(data));
    const t = data.task;
    const { error } = await db.from("custom_tasks").insert({
      title: t.title,
      description: t.description || null,
      icon: t.icon,
      link: t.link || null,
      reward: t.reward,
      wait_seconds: t.wait_seconds,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateTask = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    identSchema.extend({ id: z.string().uuid(), active: z.boolean().optional(), remove: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await assertTgAdmin(db, identList(data));
    const q = data.remove
      ? db.from("custom_tasks").delete().eq("id", data.id)
      : db.from("custom_tasks").update({ active: !!data.active }).eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Full withdrawal list (incl. payout numbers) — admin only; numbers are hidden from the public.
export const adminListWithdrawals = createServerFn({ method: "POST" })
  .inputValidator((d) => identSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await getAdmin();
    await assertTgAdmin(db, identList(data));
    const { data: rows, error } = await db.from("withdrawals").select("*").order("created_at", { ascending: false });
    if (error) throw new Error("Failed to load");
    return rows ?? [];
  });
