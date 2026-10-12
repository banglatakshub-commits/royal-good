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
import {
  claimAdReward,
  createAdWatchAttempt,
  getAdWatchSecondsLeft,
  markAdWatched,
  type AdWatchAttempt,
} from "@/lib/ad-watch";

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
// How long to wait for the GigaPub script to define window.showGiga before giving up.
const GIGA_READY_TIMEOUT_MS = 8000;
// GigaPub's documented fallback domains: the second is tried if the first fails to load.
const GIGA_DOMAINS = ["https://ad.gigapub.tech", "https://ru-ad.gigapub.tech"];
const GIGA_DOMAIN_TIMEOUT_MS = 15000;

type GigaWindow = Window & { showGiga?: () => Promise<void> };

function loadGigaScript(sid: string, domainIndex = 0) {
  const existing = document.getElementById("gigapub-script");
  if (existing) existing.remove();
  const s = document.createElement("script");
  s.id = "gigapub-script";
  s.dataset["sid"] = sid;
  s.src = `${GIGA_DOMAINS[domainIndex]}/script?id=${sid}`;
  s.async = true;
  const tryNext = () => {
    if (domainIndex + 1 < GIGA_DOMAINS.length) loadGigaScript(sid, domainIndex + 1);
  };
  s.onerror = tryNext;
  // If the script loads but never defines showGiga (blocked or stalled), try the next domain.
  setTimeout(() => {
    if (!(window as GigaWindow).showGiga && document.getElementById("gigapub-script") === s) {
      tryNext();
    }
  }, GIGA_DOMAIN_TIMEOUT_MS);
  document.head.appendChild(s);
}

// GigaPub ad network script — defines window.showGiga.
// Script ID comes from app_settings so it can be changed from the admin panel.
function useGigaPubScript() {
  useEffect(() => {
    // GigaPub only works inside Telegram.
    const webApp = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram
      ?.WebApp;
    if (!webApp?.initData) return;
    loadSettings().then(() => {
      const sid = (settings.ads_script_id || "8594").replace(/\D/g, "") || "8594";
      const existing = document.getElementById("gigapub-script") as HTMLScriptElement | null;
      if (existing?.dataset["sid"] === sid) return;
      loadGigaScript(sid);
    });
  }, []);
}

/** Resolve with window.showGiga once the GigaPub script defines it, or null after the timeout. */
function waitForShowGiga(timeoutMs: number): Promise<(() => Promise<void>) | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      const giga = (window as GigaWindow).showGiga;
      if (typeof giga === "function") {
        resolve(() => giga.call(window));
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

/** Telegram Mini App initData is only present when the app is opened inside Telegram. */
function readTelegramInitData(): string {
  const webApp = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram
    ?.WebApp;
  return webApp?.initData ?? "";
}

function getAdClaimErrorNotice(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("expired")) {
    return {
      icon: "🔄",
      title: "Telegram সেশন মেয়াদ শেষ",
      desc: "Telegram থেকে অ্যাপটি বন্ধ করে আবার খুলুন, তারপর রিওয়ার্ডটি যাচাই করুন। বিজ্ঞাপনটি আবার দেখতে হবে না।",
    };
  }
  if (
    message.includes("telegram authentication") ||
    message.includes("open this app inside telegram") ||
    message.includes("identity does not match")
  ) {
    return {
      icon: "📱",
      title: "Telegram সেশন যাচাই হয়নি",
      desc: "অ্যাপটি Telegram-এর ভিতর থেকে আবার খুলে রিওয়ার্ড যাচাই করুন। বিজ্ঞাপনটি আবার দেখতে হবে না।",
    };
  }
  if (message.includes("account is blocked")) {
    return {
      icon: "⚠️",
      title: "অ্যাকাউন্ট সীমাবদ্ধ",
      desc: "আপনার অ্যাকাউন্টে রিওয়ার্ড যোগ করা যায়নি। সহায়তার জন্য অ্যাডমিনের সঙ্গে যোগাযোগ করুন।",
    };
  }
  return {
    icon: "🔄",
    title: "রিওয়ার্ড সংরক্ষিত আছে",
    desc: "নিচের যেকোনো একটি বাটন চাপুন: রিওয়ার্ড যাচাই করতে চেষ্টা করুন অথবা নতুন এড দেখুন।",
  };
}

function getAdPreflightErrorNotice(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("expired")) {
    return {
      icon: "🔄",
      title: "Telegram সেশন মেয়াদ শেষ",
      desc: "Telegram থেকে অ্যাপটি বন্ধ করে আবার খুলুন। সেশন যাচাই না হওয়ায় বিজ্ঞাপন শুরু করা হয়নি।",
    };
  }
  if (
    message.includes("telegram authentication") ||
    message.includes("open this app inside telegram") ||
    message.includes("identity does not match")
  ) {
    return {
      icon: "📱",
      title: "Telegram সেশন যাচাই হয়নি",
      desc: "অ্যাপটি Telegram-এর ভিতর থেকে আবার খুলুন। সেশন যাচাই না হওয়ায় বিজ্ঞাপন শুরু করা হয়নি।",
    };
  }
  if (message.includes("account is blocked")) {
    return {
      icon: "⚠️",
      title: "অ্যাকাউন্ট সীমাবদ্ধ",
      desc: "আপনার অ্যাকাউন্টে বিজ্ঞাপন দেখানো যাবে না। সহায়তার জন্য অ্যাডমিনের সঙ্গে যোগাযোগ করুন।",
    };
  }
  return {
    icon: "⚠️",
    title: "এড শুরু করা যায়নি",
    desc: "রিওয়ার্ড সার্ভার যাচাই করা যায়নি, তাই বিজ্ঞাপন শুরু করিনি। ইন্টারনেট দেখে একটু পরে আবার চেষ্টা করুন।",
  };
}

const PENDING_AD_CLAIM_KEY = "lg_pending_ad_claim_";

function AdsPage() {
  const [stage, setStage] = useState<"intro" | "loading" | "watch" | "done">("intro");
  // null = not checked yet (SSR/first paint); false = opened outside Telegram, so rewards can't be verified.
  const [inTelegram, setInTelegram] = useState<boolean | null>(null);
  useEffect(() => {
    setInTelegram(Boolean(readTelegramInitData()));
  }, []);
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
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [verifyingClaim, setVerifyingClaim] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const persistPendingClaim = useCallback(
    (claimId: string | null) => {
      setPendingClaimId(claimId);
      try {
        const key = `${PENDING_AD_CLAIM_KEY}${identity().tgId}`;
        if (claimId) window.localStorage.setItem(key, claimId);
        else window.localStorage.removeItem(key);
      } catch {
        // The claim can still be retried while this page remains open if storage is unavailable.
      }
    },
    [identity],
  );
  useEffect(() => {
    try {
      const key = `${PENDING_AD_CLAIM_KEY}${identity().tgId}`;
      const stored = window.localStorage.getItem(key);
      if (
        stored &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)
      ) {
        setPendingClaimId(stored);
      } else if (stored) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Storage can be disabled in embedded browsers; the ad flow still works in memory.
    }
  }, [identity]);
  const finish = useCallback(
    async (claimId: string) => {
      persistPendingClaim(claimId);
      setNotice(null);
      setVerifyingClaim(true);
      setStage("loading");
      try {
        // recordAdView creates a first-time profile and credits the reward in one transaction.
        // Reusing this claim ID makes retry safe if the database committed but the response was lost.
        const claim = { data: { ...identity(), claimId } };
        let r: Awaited<ReturnType<typeof recordFn>>;
        try {
          r = await recordFn(claim);
        } catch (firstError) {
          console.warn("Ad reward request failed; retrying the same claim:", firstError);
          try {
            r = await recordFn(claim);
          } catch (secondError) {
            console.error("Ad reward retry also failed:", secondError);
            throw secondError;
          }
        }
        setWatched(r.watched);
        setResetAt(r.resetAt);
        setCfg((c) => ({ ...c, limit: r.limit }));
        setVerifyingClaim(false);
        if (r.ok) {
          setServerBalance(r.balance);
          persistPendingClaim(null);
          setStage("done");
        } else {
          persistPendingClaim(null);
          setStage("intro");
        }
      } catch (error) {
        console.error("Ad reward error:", error);
        setVerifyingClaim(false);
        // Clear pending claim and return to intro - no popup, just silently allow retry
        persistPendingClaim(null);
        setStage("intro");
        // User can immediately watch another ad, no blocking popup
      }
    },
    [identity, persistPendingClaim, recordFn],
  );
  const remaining = Math.max(0, cfg.limit - watched);
  const [total, setTotal] = useState(settings.ad_seconds ?? WATCH_SECONDS);
  const [left, setLeft] = useState(total);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeAttempt = useRef<AdWatchAttempt | null>(null);
  useGigaPubScript();
  useEffect(() => {
    loadSettings().then((st) => setTotal(st.ad_seconds ?? WATCH_SECONDS));
  }, []);

  const tryFinish = useCallback(
    (attempt: AdWatchAttempt) => {
      if (activeAttempt.current !== attempt || !claimAdReward(attempt)) return;
      activeAttempt.current = null;
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      void finish(attempt.claimId);
    },
    [finish],
  );
  const cancel = (attempt: AdWatchAttempt, n?: { icon: string; title: string; desc: string }) => {
    if (activeAttempt.current !== attempt) return;
    activeAttempt.current = null;
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setStage("intro");
    // Only show notice if explicitly provided (for important cases like daily limit)
    if (n) setNotice(n);
  };

  const start = async () => {
    if (pendingClaimId) {
      void finish(pendingClaimId);
      return;
    }
    const requestIdentity = identity();
    // Never start a paid impression with a missing or fallback client identity. The server
    // verifies the signed initData and requires its user ID to match this Telegram user ID.
    if (!readTelegramInitData() || !/^\d+$/.test(requestIdentity.tgId)) {
      setNotice({
        icon: "📱",
        title: "Telegram-এ খুলুন",
        desc: "এড দেখে reward পেতে এই অ্যাপটি সঠিক Telegram Mini App সেশন থেকে খুলুন।",
      });
      return;
    }

    // Check the signed session and fresh daily limit before opening an ad. If authentication,
    // database access, or the daily limit is already a problem, avoid making the user watch an ad
    // that the server cannot reward.
    setVerifyingClaim(false);
    setCheckingSession(true);
    setStage("loading");
    try {
      const status = await statusFn({ data: requestIdentity });
      setWatched(status.watched);
      setCfg((c) => ({ ...c, limit: status.limit }));
      setResetAt(status.resetAt);
      if (status.watched >= status.limit) {
        setStage("intro");
        setNotice({
          icon: "⏳",
          title: "আজকের এড লিমিট শেষ",
          desc: status.resetAt
            ? `আবার এড দেখতে পারবেন: ${new Date(status.resetAt).toLocaleString("bn-BD", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}`
            : "দুপুর ১২টার পর আবার এড দেখতে পারবেন।",
        });
        return;
      }
    } catch (error) {
      setStage("intro");
      // Silently fail - no popup, user can try again
      console.warn("Ad preflight check failed:", error);
      return;
    } finally {
      setCheckingSession(false);
    }

    const showAd = await waitForShowGiga(GIGA_READY_TIMEOUT_MS);
    // No ad available: silently return to intro, user can try again
    if (!showAd) {
      setStage("intro");
      return;
    }
    const attempt = createAdWatchAttempt(total);
    activeAttempt.current = attempt;
    setLeft(total);
    setStage("watch");
    // Call synchronously inside the tap handler to preserve Telegram/browser user activation.
    // The promise callback may race React's countdown (hidden webviews throttle timers),
    // so completion checks the absolute deadline instead of a timer-state flag.
    try {
      void Promise.resolve(showAd())
        .then(() => {
          if (activeAttempt.current !== attempt) return;
          // GigaPub resolves when it has a completed impression. Some ads finish before the
          // configured minimum countdown, so remember the success and let the timer finish;
          // rejecting here would discard a valid impression and never send its reward claim.
          markAdWatched(attempt);
          tryFinish(attempt);
        })
        .catch(() => {
          // Silently cancel - user can try again without popup
          if (activeAttempt.current !== attempt) return;
          activeAttempt.current = null;
          if (timer.current) {
            clearInterval(timer.current);
            timer.current = null;
          }
          setStage("intro");
        });
    } catch {
      // Silently cancel - user can try again without popup
      if (activeAttempt.current !== attempt) return;
      activeAttempt.current = null;
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      setStage("intro");
    }
  };

  useEffect(() => {
    if (stage !== "watch") return;
    const attempt = activeAttempt.current;
    if (!attempt) return;

    const updateCountdown = () => {
      if (activeAttempt.current !== attempt) return true;
      const next = getAdWatchSecondsLeft(attempt);
      setLeft(next);
      if (next === 0) {
        tryFinish(attempt);
        return true;
      }
      return false;
    };

    if (!updateCountdown()) {
      timer.current = setInterval(() => {
        if (updateCountdown() && timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      }, 1000);
    }
    return () => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, [stage, tryFinish]);

  return (
    <PageShell title="Ads Video">
      {stage === "intro" && (
        <p className="mb-3 rounded-xl bg-card p-3 text-center text-sm shadow-card">
          আজ দেখেছেন <b>{watched}</b> / {cfg.limit} টি এড · বাকি <b>{remaining}</b>
        </p>
      )}
      {stage === "intro" && remaining <= 0 && !pendingClaimId && (
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
      {stage === "intro" && pendingClaimId && (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-4xl">🔄</p>
          <h2 className="mt-2 font-display text-xl">রিওয়ার্ড যাচাই বাকি</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            বিজ্ঞাপনটি দেখা হয়েছে। একই বিজ্ঞাপন আবার না দেখে রিওয়ার্ড যাচাই করুন।
          </p>
          <button
            onClick={() => void finish(pendingClaimId)}
            className="mt-5 w-full rounded-xl header-grad py-3 font-semibold text-primary-foreground shadow-card"
          >
            রিওয়ার্ড আবার যাচাই করুন
          </button>
        </div>
      )}
      {stage === "intro" && !pendingClaimId && remaining > 0 && inTelegram === false && (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-4xl">📱</p>
          <h2 className="mt-2 font-display text-xl">Telegram-এ খুলুন</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            এড দেখে reward পেতে এই অ্যাপটি Telegram Mini App এর ভিতর থেকে খুলুন।
          </p>
        </div>
      )}
      {stage === "intro" && !pendingClaimId && remaining > 0 && inTelegram !== false && (
        <JobIntro
          title="Ads Video"
          desc={`${total} সেকেন্ড পুরো এড দেখলেই ৳${cfg.reward} পাবেন।`}
          cta="ভিডিও শুরু করুন"
          onStart={start}
        />
      )}
      {stage === "intro" && <HowItWorks kind="ads" />}

      {stage === "loading" && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/50 p-6">
          <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-card">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl header-grad text-3xl">
              📺
            </div>
            <h2 className="mt-4 font-display text-xl">
              {verifyingClaim
                ? "রিওয়ার্ড যাচাই হচ্ছে…"
                : checkingSession
                  ? "Telegram সেশন যাচাই হচ্ছে…"
                  : "এড লোড হচ্ছে…"}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">একটু অপেক্ষা করুন।</p>
          </div>
        </div>
      )}

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
            {pendingClaimId ? (
              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={() => {
                    const claimId = pendingClaimId;
                    setNotice(null);
                    if (claimId) void finish(claimId);
                  }}
                  className="w-full rounded-xl header-grad py-3 font-semibold text-primary-foreground shadow-card"
                >
                  রিওয়ার্ড আবার যাচাই করুন
                </button>
                <button
                  onClick={() => {
                    persistPendingClaim(null);
                    setNotice(null);
                  }}
                  className="w-full rounded-xl bg-tile py-3 font-semibold text-foreground"
                >
                  নতুন এড দেখুন
                </button>
              </div>
            ) : (
              <button
                onClick={() => setNotice(null)}
                className="mt-5 w-full rounded-xl header-grad py-3 font-semibold text-primary-foreground shadow-card"
              >
                ঠিক আছে
              </button>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
