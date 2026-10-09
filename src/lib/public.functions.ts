import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/database";
import { custom_tasks, players, withdrawals } from "../../drizzle/schema";

export const getCustomTasks = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  return db
    .select({
      id: custom_tasks.id,
      title: custom_tasks.title,
      icon: custom_tasks.icon,
      reward: custom_tasks.reward,
    })
    .from(custom_tasks)
    .where(eq(custom_tasks.active, true))
    .orderBy(custom_tasks.created_at);
});

export const getCustomTask = createServerFn({ method: "GET" })
  .validator((data) => z.object({ id: z.string().trim().min(1).max(100) }).parse(data))
  .handler(async ({ data }) => {
    const db = getDb();
    const [task] = await db
      .select({
        id: custom_tasks.id,
        title: custom_tasks.title,
        description: custom_tasks.description,
        icon: custom_tasks.icon,
        link: custom_tasks.link,
        reward: custom_tasks.reward,
        wait_seconds: custom_tasks.wait_seconds,
        active: custom_tasks.active,
      })
      .from(custom_tasks)
      .where(and(eq(custom_tasks.id, data.id), eq(custom_tasks.active, true)))
      .limit(1);
    return task ?? null;
  });

export const getRecentWithdrawals = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const rows = await db
    .select({
      name: withdrawals.name,
      amount: withdrawals.amount,
      method: withdrawals.method,
      photo: players.photo_url,
    })
    .from(withdrawals)
    .leftJoin(players, eq(withdrawals.tg_id, players.tg_id))
    .where(eq(withdrawals.status, "approved"))
    .orderBy(desc(withdrawals.created_at))
    .limit(20);

  return rows.map((row) => ({
    name: row.name || "ইউজার",
    amount: row.amount,
    photo: row.photo,
    method: row.method,
  }));
});
