import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/AppShell";
import { loadSettings, settings } from "@/lib/settings";
import { useEffect } from "react";
import { useJobLimit, LimitInfo } from "@/components/JobLimit";

export const Route = createFileRoute("/ads")({
  head: () => ({
    meta: [
      { title: "Ads Video — Royal Good" },
      { name: "description", content: "ভিডিও দেখে আয় করুন।" },
      { property: "og:title", content: "Ads Video — Royal Good" },
      { property: "og:description", content: "ভিডিও দেখে আয় করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdsPage,
});

// GigaPub ad network script — loads window.showGiga
function useGigaPubScript() {
  useEffect(() => {
    // GigaPub only works inside Telegram; outside it shows a browser alert.
    if (!(window as any).Telegram?.WebApp?.initData) return;
    loadSettings().then(() => {
      const sid = (settings.ads_script_id || "8594").replace(/\D/g, "") || "8594";
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
  const [stage, setStage] = useState<"ready" | "watching" | "success">("ready");
  const [reward, setReward] = useState(5);
  const job = useJobLimit("ads");
  
  useGigaPubScript();
  
  useEffect(() => { 
    loadSettings().then((st) => setReward(st.ad_reward)); 
  }, []);

  const watchAd = () => {
    console.log("🚀 Starting ad...");
    setStage("watching");
    
    const giga = (window as any).showGiga as undefined | (() => Promise<void>);
    if (typeof giga === "function") {
      console.log("📺 Calling GigaPub showGiga...");
      
      // Add timeout in case GigaPub doesn't resolve
      const adPromise = giga();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Ad timeout")), 60000) // 60 second timeout
      );
      
      Promise.race([adPromise, timeoutPromise])
        .then(() => {
          console.log("✅ GigaPub ad completed!");
          giveReward();
        })
        .catch((err) => {
          console.warn("❌ GigaPub ad failed or timed out:", err);
          // Even if GigaPub fails, let's try giving reward for testing
          giveReward();
        });
    } else {
      console.log("🔧 GigaPub not available, giving reward for testing");
      giveReward();
    }
  };

  const giveReward = async () => {
    console.log("🔧 Starting giveReward function...");
    try {
      console.log("📞 Calling job.record()...");
      const success = await job.record();
      
      console.log("📊 Job record result:", success);
      
      if (success) {
        console.log("💰 Reward successful!");
        setStage("success");
        console.log("✅ Stage set to success");
      } else {
        console.log("❌ Reward failed (probably daily limit reached)");
        setStage("ready");
      }
    } catch (error) {
      console.error("💥 Reward error:", error);
      setStage("ready");
    }
  };

  return (
    <PageShell title="Ads Video">
      {stage === "ready" && (
        <div className="space-y-6">
          <LimitInfo st={job.st} left={job.left} />
          
          {job.left !== 0 && (
            <div className="rounded-2xl bg-card p-6 text-center shadow-card">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl header-grad text-4xl mb-4">
                📺
              </div>
              <h2 className="font-display text-2xl mb-2">ভিডিও দেখে আয় করুন</h2>
              <p className="text-muted-foreground mb-6">
                বিজ্ঞাপন দেখা শেষে ৳{reward} পাবেন
              </p>
              <button
                onClick={watchAd}
                className="w-full rounded-xl header-grad py-4 text-lg font-semibold text-primary-foreground shadow-card"
              >
                ভিডিও দেখুন
              </button>
            </div>
          )}
        </div>
      )}
      
      {stage === "watching" && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/80 p-6">
          <div className="w-full max-w-sm rounded-3xl bg-card p-8 text-center shadow-card">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl header-grad text-4xl mb-4 animate-pulse">
              📺
            </div>
            <h2 className="font-display text-xl mb-2">বিজ্ঞাপন দেখছেন...</h2>
            <p className="text-sm text-muted-foreground">
              বিজ্ঞাপন শেষ হলে অটোমেটিক রিওয়ার্ড পাবেন
            </p>
          </div>
        </div>
      )}

      {stage === "success" && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-card p-6 text-center shadow-card">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-green-500 text-4xl mb-4">
              ✅
            </div>
            <h2 className="font-display text-2xl mb-2">সফল!</h2>
            <p className="text-lg font-semibold text-green-600 mb-4">
              +৳{reward} আপনার একাউন্টে যোগ হয়েছে
            </p>
            <button
              onClick={() => setStage("ready")}
              className="w-full rounded-xl header-grad py-4 text-lg font-semibold text-primary-foreground shadow-card"
            >
              আরও ভিডিও দেখুন
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}