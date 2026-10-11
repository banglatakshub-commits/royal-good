import { createFileRoute } from "@tanstack/react-router";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/database";
import { players, referrals } from "../../../../drizzle/schema";

/**
 * Read-only referral diagnostics. No secrets, no writes.
 *   /api/public/referral-debug            → totals + last 10 referrals
 *   /api/public/referral-debug?ref=<id>   → also: does that referrer exist, how many referrals it has
 */
export const Route = createFileRoute("/api/public/referral-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body, null, 2), {
            status,
            headers: { "content-type": "application/json" },
          });
        try {
          const db = getDb();
          const url = new URL(request.url);
          const ref = (url.searchParams.get("ref") ?? "").trim().replace(/^@/, "");

          const [{ c: totalPlayers }] = await db
            .select({ c: sql<number>`count(*)::int` })
            .from(players);
          const [{ c: totalReferrals }] = await db
            .select({ c: sql<number>`count(*)::int` })
            .from(referrals);

          const recent = await db
            .select({
              referred_id: referrals.referred_id,
              referrer_id: referrals.referrer_id,
              referred_name: referrals.referred_name,
              created_at: referrals.created_at,
            })
            .from(referrals)
            .orderBy(desc(referrals.created_at))
            .limit(10);

          let referrer: unknown = null;
          if (ref) {
            const [row] = await db
              .select({
                tg_id: players.tg_id,
                name: players.name,
                username: players.username,
                balance: players.balance,
                blocked: players.blocked,
              })
              .from(players)
              .where(eq(players.tg_id, ref))
              .limit(1);
            const [{ c: refCount }] = await db
              .select({ c: sql<number>`count(*)::int` })
              .from(referrals)
              .where(eq(referrals.referrer_id, ref));
            referrer = {
              code: ref,
              foundAsPlayer: Boolean(row),
              player: row ?? null,
              referralsForThisReferrer: refCount,
            };
          }

          return json({
            ok: true,
            totalPlayers,
            totalReferrals,
            recentReferrals: recent.map((r) => ({
              ...r,
              created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
            })),
            referrer,
          });
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : String(error) },
            500,
          );
        }
      },
    },
  },
});
