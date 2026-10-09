import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/database";
import { app_settings, job_views, players } from "../../drizzle/schema";
import { creditWithin, type BalanceExecutor } from "./balance.server";
import { getDhakaNoonWindow } from "./dhaka-window";
import { requireTelegramUser, telegramIdentityMatches } from "./telegram-auth.server";

const identity = z.object({
  initData: z.string().max(8192).optional(),
  tgId: z.string().trim().min(1).max(64),
  name: z.string().trim().max(100).optional(),
  username: z.string().trim().max(64).nullable().optional(),
  photo: z.string().url().max(500).nullable().optional(),
});
const input = identity.extend({ kind: z.enum(["typing", "quiz"]) });

type Kind = "typing" | "quiz";

function authenticatedId(data: z.infer<typeof identity>): string {
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

async function getStatus(tgId: string, kind: Kind) {
  const db = getDb();
  const { since, resetAt } = getDhakaNoonWindow();
  const [[result], [config]] = await Promise.all([
    db
      .select({ done: count(job_views.id) })
      .from(job_views)
      .where(
        and(eq(job_views.tg_id, tgId), eq(job_views.kind, kind), gte(job_views.created_at, since)),
      ),
    db.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
  ]);
  const limit = kind === "typing" ? (config?.daily_typing ?? 5) : (config?.daily_quiz ?? 5);
  return { done: result?.done ?? 0, limit, resetAt, reward: config?.task_reward ?? 5 };
}

export const getJobStatus = createServerFn({ method: "POST" })
  .validator((data) => input.parse(data))
  .handler(async ({ data }) => {
    const tgId = authenticatedId(data);
    const { done, limit, resetAt } = await getStatus(tgId, data.kind);
    return { done, limit, resetAt: resetAt.toISOString() };
  });

/** Atomically enforce the daily limit, record the job, and credit its reward. */
export const recordJob = createServerFn({ method: "POST" })
  .validator((data) => input.parse(data))
  .handler(async ({ data }) => {
    const tgId = authenticatedId(data);
    const db = getDb();
    const { since } = getDhakaNoonWindow();

    return db.transaction(async (tx) => {
      // Serialize actions for a user so simultaneous requests cannot exceed the limit.
      const [player] = await tx
        .select({ blocked: players.blocked })
        .from(players)
        .where(eq(players.tg_id, tgId))
        .for("update")
        .limit(1);
      if (!player) throw new Error("Player profile is not ready.");
      if (player.blocked) throw new Error("Your account is blocked.");

      const [[result], [config]] = await Promise.all([
        tx
          .select({ done: count(job_views.id) })
          .from(job_views)
          .where(
            and(
              eq(job_views.tg_id, tgId),
              eq(job_views.kind, data.kind),
              gte(job_views.created_at, since),
            ),
          ),
        tx.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1),
      ]);
      const limit =
        data.kind === "typing" ? (config?.daily_typing ?? 5) : (config?.daily_quiz ?? 5);
      const done = result?.done ?? 0;
      if (done >= limit) return { ok: false, done, limit, balance: null as number | null };

      await tx.insert(job_views).values({ tg_id: tgId, kind: data.kind });
      const balance = await creditWithin(
        tx as unknown as BalanceExecutor,
        tgId,
        config?.task_reward ?? 5,
      );
      if (balance === null) throw new Error("Reward could not be credited.");
      return { ok: true, done: done + 1, limit, balance };
    });
  });
