import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Row = { name: string; amount: number; photo: string | null; method: string };

export function WithdrawBanner() {
  const { data: rows } = useQuery({
    queryKey: ["withdraw-banner"],
    queryFn: async (): Promise<Row[]> => {
      const { data: w } = await supabase
        .from("withdrawals")
        .select("tg_id, name, amount, method, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      const list = w ?? [];
      const ids = Array.from(new Set(list.map((r) => r.tg_id)));
      const photos = new Map<string, string>();
      if (ids.length) {
        const { data: p } = await supabase
          .from("players")
          .select("tg_id, photo_url")
          .in("tg_id", ids);
        for (const x of p ?? []) if (x.photo_url) photos.set(x.tg_id, x.photo_url);
      }
      // নাম্বার কখনো দেখানো হয় না — শুধু নাম, ছবি আর পরিমাণ
      return list.map((r) => ({
        name: r.name || "ইউজার",
        amount: r.amount,
        photo: photos.get(r.tg_id) ?? null,
        method: r.method,
      }));
    },
    refetchInterval: 60000,
    staleTime: 60_000,
  });

  const items = rows ?? [];

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="wb-spark text-lg">🎉</span>
        <h2 className="font-display text-sm font-semibold text-primary-deep">
          সফল উইথড্র
        </h2>
        <span className="ml-auto rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] font-bold text-primary-deep">
          রিয়েল টাইম
        </span>
      </div>

      {items.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          এখনো কোনো উইথড্র হয়নি — আপনিই প্রথম হয়ে যান!
        </p>
      ) : (
        <div className="relative overflow-hidden">
          {/* ডান দিকের ফেইড */}
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-card to-transparent" />
          <div className="wb-track flex w-max gap-2">
            {[...items, ...items].map((r, i) => (
              <div
                key={`${i}-${r.name}-${r.amount}`}
                className="flex items-center gap-2 whitespace-nowrap rounded-full border bg-tile px-3 py-1.5"
              >
                {r.photo ? (
                  <img
                    src={r.photo}
                    alt={r.name}
                    loading="lazy"
                    decoding="async"
                    className="h-6 w-6 rounded-full border border-gold/50 object-cover"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gold/50 bg-card text-[11px]">
                    👤
                  </span>
                )}
                <span className="max-w-[90px] truncate text-[11px] font-bold text-primary-deep">
                  {r.name}
                </span>
                <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-bold text-success">
                  ৳{r.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
