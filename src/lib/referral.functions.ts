import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/database";
import { referrals } from "../../drizzle/schema";
import { requireTelegramUser, telegramIdentityMatches } from "./telegram-auth.server";

const identity = z.object({
  initData: z.string().max(8192).optional(),
  tgId: z.string().trim().min(1).max(64),
  name: z.string().trim().max(100).optional(),
  username: z.string().trim().max(64).nullable().optional(),
  photo: z.string().url().max(500).nullable().optional(),
});

export const getMyReferrals = createServerFn({ method: "POST" })
  .validator((data) => identity.parse(data))
  .handler(async ({ data }) => {
    const user = requireTelegramUser(data.initData, {
      tgId: data.tgId,
      name: data.name,
      username: data.username,
      photoUrl: data.photo,
    });
    if (!telegramIdentityMatches(user, data.tgId))
      throw new Error("Telegram identity does not match the request.");

    const db = getDb();
    const rows = await db
      .select({
        referred_id: referrals.referred_id,
        referred_name: referrals.referred_name,
        photo_url: referrals.photo_url,
        created_at: referrals.created_at,
      })
      .from(referrals)
      .where(eq(referrals.referrer_id, user.id))
      .orderBy(desc(referrals.created_at));

    return rows.map((row) => ({ ...row, created_at: row.created_at.toISOString() }));
  });
