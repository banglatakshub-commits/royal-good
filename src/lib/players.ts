import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/database";
import { players } from "../../drizzle/schema";
import { requireTelegramUser, telegramIdentityMatches } from "@/lib/telegram-auth.server";

export interface PlayerRow {
  name: string;
  photo_url: string | null;
  balance: number;
  isMe: boolean;
}

const identity = z.object({
  initData: z.string().max(8192).optional(),
  tgId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100).optional(),
  username: z.string().trim().max(64).nullable().optional(),
  photo: z.string().url().max(500).nullable().optional(),
});

function authenticatedId(
  data: z.infer<typeof identity>,
): ReturnType<typeof requireTelegramUser>["id"] {
  const user = requireTelegramUser(data.initData, {
    tgId: data.tgId,
    name: data.name,
    username: data.username,
    photoUrl: data.photo,
  });
  if (!telegramIdentityMatches(user, data.tgId))
    throw new Error("Telegram identity does not match the request.");
  return user.id;
}

/** Create/refresh the signed-in Telegram user's profile without ever changing their balance. */
export const syncPlayer = createServerFn({ method: "POST" })
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
    const profile = {
      name: user.name || data.name || "User",
      username: user.username,
      photo_url: user.photoUrl,
      chat_id: user.chatId,
      updated_at: new Date(),
    };
    const [row] = await db
      .insert(players)
      .values({ tg_id: user.id, ...profile, balance: 0 })
      .onConflictDoUpdate({ target: players.tg_id, set: profile })
      .returning({ balance: players.balance });
    return { balance: row?.balance ?? 0 };
  });

/** Read the authenticated user's balance from PostgreSQL. */
export const fetchMyBalance = createServerFn({ method: "POST" })
  .validator((data) =>
    identity
      .pick({ initData: true, tgId: true, name: true, username: true, photo: true })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const tgId = authenticatedId(data);
    const db = getDb();
    const [row] = await db
      .select({ balance: players.balance })
      .from(players)
      .where(eq(players.tg_id, tgId))
      .limit(1);
    return row?.balance ?? 0;
  });

/** Public leaderboard; profile identifiers and contact details are not exposed. */
export const fetchLeaderboard = createServerFn({ method: "POST" })
  .validator((data) =>
    identity.extend({ limit: z.number().int().min(1).max(100).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const tgId = authenticatedId(data);
    const db = getDb();
    const rows = await db
      .select({
        tg_id: players.tg_id,
        name: players.name,
        photo_url: players.photo_url,
        balance: players.balance,
      })
      .from(players)
      .orderBy(desc(players.balance), desc(players.updated_at))
      .limit(data.limit ?? 50);
    return rows.map(({ tg_id, ...row }) => ({ ...row, isMe: tg_id === tgId })) as PlayerRow[];
  });
