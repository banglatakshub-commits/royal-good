import { HowItWorks } from "@/components/HowItWorks";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell, JobIntro } from "@/components/AppShell";
import { RewardDone } from "@/components/RewardDone";
import { loadSettings, settings } from "@/lib/settings";
import { useServerFn } from "@tanstack/react-start";
import { getAdStatus, recordAdView } from "@/lib/ads.functions";
import { getTgIdentity } from "@/lib/telegram";
import { setServerBalance } from "@/lib/wallet";

export const Route = createFileRoute("/ads")({
  head: () => ({
    meta: [
      { title: "Ads Video — Life Good" },
      { name: "description", content: "ভিডিও দেখে আয় করুন।" },
      { property: "og:title", content: "Ads Video — Life Good" },
      { property: "og:description", content: "ভিডিও দেখে আয় করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdsPage,
});

const WATCH_SECONDS = 10;

// GigaPub ad network script — loads window.showGiga
// Script ID comes from app_settings so it can be changed from the admin panel.
function useGigaPubScript() {
  useEffect(() => {
    // GigaPub only works inside Telegram; outside it shows a browser alert.
    const webApp = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram
      ?.WebApp;
    if (!webApp?.initData) return;
    loadSettings().then(() => {
      const sid = (settings.ads_script_id || "8416").replace(/\D/g, "") || "8416";
      const src = `https://ad.gigapub.tech/script?id=${sid}`;
      const existing = document.getElementById("gigapub-script") as HTMLScriptElement | null;
      if (existing) {
        if (existing.src === src) return;
        existing.remove();
      }
      const s = document.createElement("script");
      s.id = "gigapub-script";
      s.src = src;
      s.async = true;
      document.head.appendChild(s);
    });
  }, []);
}

function AdsPage() {
  const [stage, setStage] = useState<"intro" | "watch" | "done">("intro");
  const [cfg, setCfg] = useState({ limit: settings.daily_ads, reward: settings.ad_reward });
  const [watched, setWatched] = useState(0);
  const [resetAt, setResetAt] = useState<string | null>(null);
  const statusFn = useServerFn(getAdStatus);
  const recordFn = useServerFn(recordAdView);
  const identity = useCallback(() => getTgIdentity(), []);
  useEffect(() => {
    loadSettings().then((st) => setCfg((c) => ({ ...c, reward: st.ad_reward })));
    statusFn({ data: identity() })
      .then((r) => {
        setWatched(r.watched);
        setCfg((c) => ({ ...c, limit: r.limit }));
        setResetAt(r.resetAt);
      })
      .catch(() => {});
  }, [identity, statusFn]);
  const [notice, setNotice] = useState<{ icon: string; title: string; desc: string } | null>(null);
  const finish = useCallback(async () => {
    try {
      const r = await recordFn({ data: identity() });
      setWatched(r.watched);
      setResetAt(r.resetAt);
      setCfg((c) => ({ ...c, limit: r.limit }));
      if (r.ok) setServerBalance(r.balance);
      setStage(r.ok ? "done" : "intro");
    } catch {
      setNotice({ icon: "⚠️", title: "সমস্যা হয়েছে", desc: "একটু পরে আবার চেষ্টা করুন।" });
      setStage("intro");
    }
  }, [identity, recordFn]);
  const remaining = Math.max(0, cfg.limit - watched);
  const [total, setTotal] = useState(settings.ad_seconds ?? WATCH_SECONDS);
  const [left, setLeft] = useState(total);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const adDone = useRef(false);
  const timeDone = useRef(false);
  const finished = useRef(false);
  useGigaPubScript();
  useEffect(() => {
    loadSettings().then((st) => setTotal(st.ad_seconds ?? WATCH_SECONDS));
  }, []);

  const tryFinish = useCallback(() => {
    if (finished.current || !adDone.current || !timeDone.current) return;
    finished.current = true;
    finish();
  }, [finish]);
  const cancel = (n: { icon: string; title: string; desc: string }) => {
    if (finished.current) return;
    finished.current = true;
    if (timer.current) clearInterval(timer.current);
    setStage("intro");
    setNotice(n);
  };

  const start = () => {
    adDone.current = false;
    timeDone.current = total <= 0;
    finished.current = false;
    setLeft(total);
    setStage("watch");
    const giga = (window as Window & { showGiga?: () => Promise<void> }).showGiga;
    if (typeof giga === "function") {
      giga()
        .then(() => {
          adDone.current = true;
          if (!timeDone.current)
            cancel({
              icon: "⏱️",
              title: "সময় শেষ হয়নি",
              desc: "এড বন্ধ করার আগে পুরো সময় দেখতে হবে — এবার রিওয়ার্ড পাবেন না।",
            });
          else tryFinish();
        })
        .catch(() =>
          cancel({
            icon: "📭",
            title: "এড পাওয়া যায়নি",
            desc: "এখন কোনো বিজ্ঞাপন নেই, একটু পরে আবার চেষ্টা করুন।",
          }),
        );
    } else {
      adDone.current = true;
    }
    if (total <= 0) tryFinish();
  };

  useEffect(() => {
    if (stage !== "watch") return;
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          if (timer.current) clearInterval(timer.current);
          timeDone.current = true;
          tryFinish();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [stage, tryFinish]);

  return (
    <PageShell title="Ads Video">
      {stage === "intro" && (
        <p className="mb-3 rounded-xl bg-card p-3 text-center text-sm shadow-card">
          আজ দেখেছেন <b>{watched}</b> / {cfg.limit} টি এড · বাকি <b>{remaining}</b>
        </p>
      )}
      {stage === "intro" && remaining <= 0 && (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-4xl">⏳</p>
          <h2 className="mt-2 font-display text-xl">আজকের এড লিমিট শেষ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {resetAt
              ? `আবার এড দেখতে পারবেন: ${new Date(resetAt).toLocaleString("bn-BD", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}`
              : "দুপুর ১২টার পর আবার এড দেখতে পারবেন।"}
          </p>
        </div>
      )}
      {stage === "intro" && remaining > 0 && (
        <JobIntro
          title="Ads Video"
          desc={`${total} সেকেন্ড পুরো এড দেখলেই ৳${cfg.reward} পাবেন।`}
          cta="ভিডিও শুরু করুন"
          onStart={start}
        />
      )}
      {stage === "intro" && <HowItWorks kind="ads" />}

      {stage === "watch" && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/50 p-6">
          <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-card">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl header-grad text-3xl">
              ⏱️
            </div>
            <h2 className="mt-4 font-display text-xl">এড দেখছেন…</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Reward পেতে আরো <b className="text-2xl text-foreground">{left}s</b>
            </p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-tile">
              <div
                className="h-full bg-primary transition-all duration-1000"
                style={{ width: `${total > 0 ? ((total - left) / total) * 100 : 100}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              এখন বন্ধ করবেন না — আগে বন্ধ করলে reward পাবেন না।
            </p>
          </div>
        </div>
      )}

      {stage === "done" && (
        <RewardDone text="ভিডিও দেখা সম্পন্ন!" score={`+৳${cfg.reward}`} amount={cfg.reward} />
      )}

      {notice && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/50 p-6">
          <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-card">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-tile text-3xl">
              {notice.icon}
            </div>
            <h2 className="mt-4 font-display text-xl">{notice.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{notice.desc}</p>
            <button
              onClick={() => setNotice(null)}
              className="mt-5 w-full rounded-xl header-grad py-3 font-semibold text-primary-foreground shadow-card"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
