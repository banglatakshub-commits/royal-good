import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Wallet, Disc3, Keyboard, HelpCircle, MonitorPlay } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/database";
import { custom_tasks } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { useBalance } from "@/lib/wallet";
import { useLiveSettings } from "@/lib/settings";
import { getTgUser } from "@/lib/telegram";
import { TaskIcon } from "@/lib/taskIcons";
import { BottomNav } from "@/components/BottomNav";
import { WithdrawBanner } from "@/components/WithdrawBanner";
import { ScrollReveal } from "@/components/ScrollReveal";

const RoyalSculpture = lazy(() => import("@/components/RoyalSculpture"));

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Life Good — Telegram Earning Mini App" },
      { name: "description", content: "সহজ টাস্ক করে আয় করুন: Typing, Quiz এবং Ads Video।" },
      { property: "og:title", content: "Life Good — Earning Mini App" },
      { property: "og:description", content: "সহজ টাস্ক করে আয় করুন Telegram থেকেই।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const jobs = [
  { to: "/typing" as const, icon: Keyboard, title: "Typing Job", reward: "task" },
  { to: "/quiz" as const, icon: HelpCircle, title: "Quiz Job", reward: "task" },
  { to: "/ads" as const, icon: MonitorPlay, title: "Ads Video", reward: "ad" },
  { to: "/spin" as const, icon: Disc3, title: "Daily Spin", reward: "৳20-300" },
];

function Index() {
  const balance = useBalance();
  const cfg = useLiveSettings();
  const [user, setUser] = useState(getTgUser);
  
  const { data: custom = [] } = useQuery({
    queryKey: ["custom-tasks"],
    queryFn: async () => {
      try {
        const data = await db.select({
          id: custom_tasks.id,
          title: custom_tasks.title,
          icon: custom_tasks.icon,
          reward: custom_tasks.reward
        })
        .from(custom_tasks)
        .where(eq(custom_tasks.active, true))
        .orderBy(custom_tasks.created_at);
        
        return data;
      } catch (error) {
        console.error("Custom tasks fetch error:", error);
        return [];
      }
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    setUser(getTgUser());
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      {/* Header */}
      <header className="header-grad relative px-6 pb-16 pt-8 text-primary-foreground">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {user.photo ? (
              <img
                src={user.photo}
                alt={user.name}
                className="h-12 w-12 rounded-full border-2 border-gold object-cover shadow-md"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-card text-xl shadow-md">
                👤
              </div>
            )}
            <div>
              <h1 className="font-display text-lg leading-tight">{user.name}</h1>
            </div>
          </div>
          <button aria-label="Notifications" className="mt-1 text-primary-foreground/80">
            <Bell className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mt-2 text-center">
          <Suspense fallback={<div className="h-[138px]" />}><RoyalSculpture /></Suspense>
          <p className="pointer-events-none font-display text-2xl leading-tight">Royal Good</p>
        </div>

        {/* Balance card (overlapping) */}
        <div className="absolute inset-x-6 -bottom-8 flex items-center justify-between rounded-2xl border bg-card p-5 shadow-card">
          <div>
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-primary-deep/60">
              মোট ইনকাম (ব্যালেন্স)
            </p>
            <p className="font-display text-3xl font-bold text-primary">৳ {balance}</p>
          </div>
          <Link
            to="/withdraw"
            className="header-grad flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm active:scale-95"
          >
            <Wallet className="h-4 w-4" />
            Withdraw
          </Link>
        </div>
      </header>

      {/* Income projects */}
      <main className="mt-14 px-6">
        <ScrollReveal className="mb-4 flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-gold" />
          <h2 className="font-display text-base font-semibold text-primary-deep">
            Our Active Income Projects
          </h2>
        </ScrollReveal>

        <div className="home-project-grid grid grid-cols-2 gap-3">
          {jobs.map((j) => (
            <ScrollReveal key={j.title}>
            <Link
              to={j.to}
              className="flex flex-col items-center rounded-2xl border bg-card p-3 shadow-sm transition-transform active:scale-95"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-tile text-primary">
                <j.icon className="h-5 w-5" />
              </div>
              <span className="mb-2 text-center text-[10px] font-bold text-primary-deep">
                {j.title}
              </span>
              <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] font-bold text-primary-deep">
                {j.reward === "task" ? `৳${cfg.task_reward}` : j.reward === "ad" ? `৳${cfg.ad_reward}` : j.reward}
              </span>
            </Link>
            </ScrollReveal>
          ))}
          {custom.map((t) => (
            <ScrollReveal key={t.id}>
            <Link
              to="/task/$id"
              params={{ id: t.id }}
              className="flex flex-col items-center rounded-2xl border bg-card p-3 shadow-sm transition-transform active:scale-95"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-tile"><TaskIcon icon={t.icon} size={20} /></div>
              <span className="mb-2 text-center text-[10px] font-bold text-primary-deep">{t.title}</span>
              <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] font-bold text-primary-deep">৳{t.reward}</span>
            </Link>
            </ScrollReveal>
          ))}
        </div>
      </main>

      {/* সফল উইথড্র ব্যানার */}
      <section className="px-6">
        <ScrollReveal><WithdrawBanner /></ScrollReveal>
      </section>

      <BottomNav active="home" />
    </div>
  );
}
