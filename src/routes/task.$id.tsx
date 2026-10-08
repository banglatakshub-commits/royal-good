import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { setServerBalance } from "@/lib/wallet";
import { claimTask } from "@/lib/earn.functions";
import { getTgUser } from "@/lib/telegram";
import { TaskIcon } from "@/lib/taskIcons";

export const Route = createFileRoute("/task/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "কাজ — Life Good" },
      { name: "description", content: "কাজটি সম্পন্ন করে ব্যালেন্সে টাকা নিন।" },
      { property: "og:title", content: "কাজ — Life Good" },
      { property: "og:description", content: "কাজটি সম্পন্ন করে ব্যালেন্সে টাকা নিন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaskPage,
});

function TaskPage() {
  const { id } = Route.useParams();
  const doneKey = `lg_task_done_${id}`;
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const { data: task, isLoading } = useQuery({
    queryKey: ["task", id],
    queryFn: async () => (await supabase.from("custom_tasks").select("*").eq("id", id).maybeSingle()).data,
  });

  useEffect(() => setDone(localStorage.getItem(doneKey) === "1"), [doneKey]);

  useEffect(() => {
    if (left === null || !task) return;
    if (left <= 0) {
      if (localStorage.getItem(doneKey) !== "1") {
        localStorage.setItem(doneKey, "1");
        void claimTask({ data: { tgId: getTgUser().username, taskId: id } }).then((r) => setServerBalance(r.balance));
      }
      setDone(true);
      setLeft(null);
      return;
    }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, task, doneKey]);

  const start = () => {
    if (!task) return;
    if (task.link) {
      const tg = (window as any).Telegram?.WebApp;
      if (task.link.includes("t.me/") && tg?.openTelegramLink) tg.openTelegramLink(task.link);
      else window.open(task.link, "_blank");
    }
    setLeft(task.wait_seconds);
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background">
      <header className="header-grad flex items-center gap-3 px-4 py-4 text-primary-foreground">
        <Link to="/" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="font-display text-lg">{task?.title ?? "কাজ"}</h1>
      </header>
      <main className="p-6">
        {isLoading ? (
          <p className="text-center text-muted-foreground">লোড হচ্ছে...</p>
        ) : !task || !task.active ? (
          <p className="text-center text-muted-foreground">এই কাজটি এখন পাওয়া যাচ্ছে না।</p>
        ) : (
          <div className="rounded-2xl border bg-card p-6 text-center shadow-card">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-tile"><TaskIcon icon={task.icon} size={32} /></div>
            <p className="font-display text-xl text-primary-deep">{task.title}</p>
            {task.description && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{task.description}</p>}
            <p className="mt-3 inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-sm font-bold text-primary-deep">রিওয়ার্ড ৳{task.reward}</p>
            <div className="mt-6">
              {done ? (
                <p className="flex items-center justify-center gap-2 font-bold text-primary">
                  <CheckCircle2 className="h-5 w-5" /> সম্পন্ন — ৳{task.reward} ব্যালেন্সে যোগ হয়েছে
                </p>
              ) : left !== null ? (
                <p className="font-bold text-primary-deep">অপেক্ষা করুন... {left} সেকেন্ড</p>
              ) : (
                <button onClick={start} className="header-grad flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-primary-foreground">
                  {task.link && <ExternalLink className="h-4 w-4" />} কাজ শুরু করুন
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
