import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getJobStatus, recordJob } from "@/lib/jobs.functions";
import { getTgUser } from "@/lib/telegram";
import { setServerBalance } from "@/lib/wallet";

export function useJobLimit(kind: "typing" | "quiz") {
  const statusFn = useServerFn(getJobStatus);
  const recordFn = useServerFn(recordJob);
  const queryClient = useQueryClient();
  const tgId = getTgUser().username;
  const queryKey = ["job-status", tgId, kind];
  const { data: st = null } = useQuery({
    queryKey,
    queryFn: () => statusFn({ data: { tgId, kind } }),
    staleTime: 15_000,
  });
  const record = async () => {
    try {
      const r = await recordFn({ data: { tgId, kind } });
      queryClient.setQueryData(queryKey, { ...st, done: r.done, limit: r.limit });
      if (r.ok) setServerBalance(r.balance);
      return r.ok;
    } catch {
      return false;
    }
  };
  const left = st ? Math.max(0, st.limit - st.done) : null;
  return { st, left, record };
}

export function LimitInfo({ st, left }: { st: { done: number; limit: number } | null; left: number | null }) {
  if (!st) return null;
  if (left === 0)
    return (
      <div className="mb-3 rounded-2xl border border-destructive/30 bg-card p-4 text-center shadow-card">
        <p className="font-semibold text-destructive">আজকের লিমিট শেষ</p>
        <p className="text-sm text-muted-foreground">দুপুর ১২টার পর আবার করতে পারবেন।</p>
      </div>
    );
  return (
    <p className="mb-3 rounded-xl bg-success-soft px-3 py-2 text-center text-sm text-success">
      আজ {st.done}/{st.limit} বার করেছেন — আর {left} বার বাকি
    </p>
  );
}
