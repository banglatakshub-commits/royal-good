import { createFileRoute } from "@tanstack/react-router";
import { Users, Copy, Share2, Check, Gift } from "lucide-react";
import { useEffect, useState } from "react";
import { getTgUser } from "@/lib/telegram";
import { BottomNav } from "@/components/BottomNav";
import { useReferrals, myRefLink } from "@/lib/referrals";
import { useLiveSettings } from "@/lib/settings";

export const Route = createFileRoute("/refer")({
  head: () => ({
    meta: [
      { title: "Refer & Earn — Life Good" },
      { name: "description", content: "বন্ধুকে রেফার করুন — রেফার করে বোনাস জিতুন।" },
      { property: "og:title", content: "Refer & Earn — Life Good" },
      { property: "og:description", content: "বন্ধুকেকে অ্যাপে আনুন, রেফার করে বোনাস পান।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Refer,
});

function Refer() {
  const [user, setUser] = useState(getTgUser);
  const [refLink, setRefLink] = useState("");
  const [copied, setCopied] = useState(false);
  const referrals = useReferrals();
  const REF_BONUS = useLiveSettings().ref_bonus;

  useEffect(() => {
    setUser(getTgUser());
    setRefLink(myRefLink());
  }, []);

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = refLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shareRef = () => {
    const text = encodeURIComponent(
      `Life Good অ্যাপে জয়েন করে টাস্ক করে আয় করুন! আমার রেফার লিংক: ${refLink}`,
    );
    window.open(`https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${text}`, "_blank");
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <header className="header-grad px-6 pb-14 pt-8 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/25 text-gold">
            <Gift className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-lg leading-tight">Refer &amp; Earn</h1>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gold">
              বন্ধুকে আনুন, বোনাস পান
            </p>
          </div>
        </div>
      </header>

      <main className="-mt-8 px-6">
        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border bg-card p-4 text-center shadow-card">
            <p className="font-display text-2xl font-bold text-primary">{referrals.length}</p>
            <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">মোট রেফার</p>
          </div>
          <div className="rounded-2xl border bg-card p-4 text-center shadow-card">
            <p className="font-display text-2xl font-bold text-primary">
              ৳{referrals.length * REF_BONUS}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">রেফার আয়</p>
          </div>
        </div>

        {/* Share card */}
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tile text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-primary-deep">আপনার রেফার লিংক</p>
              <p className="text-[10px] text-muted-foreground">
                প্রতি রেফারে <span className="font-bold text-primary">৳{REF_BONUS}</span> বোনাস
                জিতুন
              </p>
            </div>
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] font-bold text-primary-deep">
              ৳{REF_BONUS}
            </span>
          </div>

          <div className="mb-3 flex items-center gap-2 rounded-xl border bg-background px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-primary-deep/80">
              {refLink || "লিংক লোড হচ্ছে..."}
            </span>
            <button
              onClick={copyRef}
              aria-label="Copy refer link"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground active:scale-95"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          <button
            onClick={shareRef}
            className="header-grad flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-primary-foreground shadow-sm active:scale-95"
          >
            <Share2 className="h-4 w-4" />
            Telegram-এ শেয়ার করুন
          </button>
        </div>

        {/* How it works */}
        <div className="mt-4 rounded-2xl border bg-card p-4 shadow-card">
          <h2 className="mb-3 font-display text-sm font-semibold text-primary-deep">
            কিভাবে কাজ করবো
          </h2>
          <ol className="space-y-2">
            {[
              "নিচের বাটনে চাপে রেফার লিংকটা শেয়াৰ করুন",
              "বন্ধু ওই লিংক থেকে অ্যাপ খুললেই জয়েন হবো",
              `নতুন বন্ধু জয়েন করলেই আপনার ব্যালেন্সে ৳${REF_BONUS} যোগ হবে`,
            ].map((s, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tile text-[10px] font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-[11px] text-primary-deep/80">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Referral list */}
        <div className="mt-4 rounded-2xl border bg-card p-4 shadow-card">
          <h2 className="mb-3 font-display text-sm font-semibold text-primary-deep">
            আমার রেফার তালিকা
          </h2>
          <div className="space-y-2">
            {referrals.length === 0 ? (
              <p className="text-center text-[11px] text-muted-foreground">
                এখনো কেউ আপনার লিংকে জয়েন করেনি
              </p>
            ) : (
              referrals.map((r) => (
                <div
                  key={r.referred_id}
                  className="flex items-center justify-between rounded-lg border bg-background px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {r.photo_url ? (
                      <img
                        src={r.photo_url}
                        alt={r.referred_name ?? r.referred_id}
                        className="h-8 w-8 shrink-0 rounded-full border border-gold/60 object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/60 bg-tile text-sm">
                        👤
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-primary-deep">
                        {r.referred_name ?? r.referred_id}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("bn-BD", {
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-primary">+৳{REF_BONUS}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <BottomNav active="refer" />
    </div>
  );
}
