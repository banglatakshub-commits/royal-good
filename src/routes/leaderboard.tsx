import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLeaderboard, type PlayerRow } from "@/lib/players";
import { getTgIdentity } from "@/lib/telegram";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leader Board — Life Good" },
      { name: "description", content: "সবচেয়ে বেশি ইনকাম করছে কে — লিডার বোড দেখুন।" },
      { property: "og:title", content: "Leader Board — Life Good" },
      { property: "og:description", content: "টপ ইনারদের র‍্যাংকিং দেখুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Leaderboard,
});

function rankColor(rank: number) {
  if (rank === 1) return "bg-gold/20 text-primary-deep border-gold/50";
  if (rank === 2) return "bg-slate-100 text-slate-600 border-slate-300";
  if (rank === 3) return "bg-orange-100 text-orange-700 border-orange-300";
  return "bg-tile text-primary-deep/70 border-transparent";
}

type Row = Omit<PlayerRow, "isMe"> & { rank: number; me: boolean };

function Leaderboard() {
  const [identity, setIdentity] = useState(getTgIdentity);
  useEffect(() => setIdentity(getTgIdentity()), []);

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", identity.tgId],
    queryFn: () => fetchLeaderboard({ data: identity }),
    refetchInterval: 15000,
  });

  const rows: Row[] = (data ?? []).map((p, i) => {
    const { isMe, ...player } = p;
    return { ...player, rank: i + 1, me: isMe };
  });

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const podiumOrder = top3.length === 3 ? [top3[1]!, top3[0]!, top3[2]!] : top3;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <header className="header-grad flex items-center justify-center px-6 py-5 text-primary-foreground">
        <h1 className="font-display text-xl font-semibold">Leader Board</h1>
      </header>

      <main className="px-6 pt-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center shadow-card">
            <p className="text-sm font-semibold text-primary-deep">এখনো কোনো ইউজার নেই</p>
            <p className="mt-1 text-xs text-muted-foreground">
              টাস্ক করে আয় করলেই আপনার নাম এখানে উঠে আসবে!
            </p>
          </div>
        ) : (
          <>
            {/* Podium */}
            <div className="mb-6 flex items-end justify-center gap-3">
              {podiumOrder.map((r) => (
                <div
                  key={r.rank}
                  className={`flex w-1/3 min-w-0 flex-col items-center overflow-hidden rounded-2xl border bg-card p-3 shadow-card ${
                    r.rank === 1 ? "-translate-y-2 border-gold/60" : ""
                  } ${r.me ? "ring-2 ring-primary/40" : ""}`}
                >
                  {r.photo_url ? (
                    <img
                      src={r.photo_url}
                      alt={r.name}
                      className="mb-1 h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-tile text-lg font-bold text-primary">
                      {r.name.charAt(0)}
                    </div>
                  )}
                  <span
                    title={r.name}
                    className="mb-0.5 w-full min-w-0 truncate text-center text-[10px] font-bold text-primary-deep"
                  >
                    {r.name}
                  </span>
                  {r.me && (
                    <span className="mb-0.5 block text-[9px] font-semibold text-primary">
                      (আপনি)
                    </span>
                  )}
                  <span className="max-w-full truncate font-display text-sm font-bold text-primary">
                    ৳{r.balance}
                  </span>
                  {r.rank === 1 && <Crown className="mt-1 h-4 w-4 text-gold" />}
                </div>
              ))}
            </div>

            {/* Ranking list */}
            <div className="rounded-2xl border bg-card p-3 shadow-card">
              {rest.map((r) => (
                <div
                  key={r.rank}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                    r.me ? "bg-primary/10 ring-1 ring-primary/30" : ""
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${rankColor(r.rank)}`}
                  >
                    {r.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-primary-deep">
                    {r.name}{" "}
                    {r.me && <em className="not-italic text-[9px] text-primary">(আপনি)</em>}
                  </span>
                  <span className="font-display text-sm font-bold text-primary">৳{r.balance}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          টাস্ক করে আয় বাড়াউন — র‍্যাংক উপরে উঠবো।{" "}
          <Link to="/" className="font-bold text-primary">
            এখনই করুন
          </Link>
        </p>
      </main>

      <BottomNav active="leader" />
    </div>
  );
}
