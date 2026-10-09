import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet, HelpCircle, ShieldCheck, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBalance } from "@/lib/wallet";
import { getTgUser } from "@/lib/telegram";
import { bindAdminId, ensureTgAdmin } from "@/lib/admin.functions";
import { BottomNav } from "@/components/BottomNav";
import { WithdrawBanner } from "@/components/WithdrawBanner";
import { supportUsernameSchema } from "@/lib/support";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Life Good" },
      { name: "description", content: "আপনার প্রোফাইল আর ইনকাম দেখুন।" },
      { property: "og:title", content: "Profile — Life Good" },
      { property: "og:description", content: "আপনার প্রোফাইল আর ইনকাম দেখুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Profile,
});

function Profile() {
  const balance = useBalance();
  const [user, setUser] = useState(getTgUser);

  useEffect(() => setUser(getTgUser()), []);

  const myId = user.id ? String(user.id) : user.username;
  const { data: supportUsername = "" } = useQuery({
    queryKey: ["support-telegram"],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("support_telegram_username").eq("id", 1).maybeSingle();
      if (error) throw error;
      const parsed = supportUsernameSchema.safeParse(data?.support_telegram_username ?? "");
      return parsed.success ? parsed.data : "";
    },
  });
  const supportUrl = supportUsername ? `https://t.me/${encodeURIComponent(supportUsername)}` : "";
  const { data: showAdmin } = useQuery({
    queryKey: ["is-admin", myId],
    queryFn: async () => {
      // Test mode: browser preview has no real Telegram user — show the card
      const h = window.location.hostname;
      const tgw = (window as any).Telegram?.WebApp;
      if (h.includes("id-preview--") || h.includes("lovableproject.com") || h === "localhost" || !tgw?.initData || !tgw?.initDataUnsafe?.user) return true;
      // One-time: swap the username placeholder for the real numeric Telegram ID
      await bindAdminId({ data: { tgId: myId, username: user.username } }).catch(() => null);
      const r = await ensureTgAdmin({ data: { tgId: myId, username: user.username } }).catch(() => null);
      return !!r?.isAdmin;
    },
  });

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <header className="header-grad flex flex-col items-center px-6 pb-14 pt-8 text-primary-foreground">
        {user.photo ? (
          <img
            src={user.photo}
            alt={user.name}
            className="h-20 w-20 rounded-full border-2 border-gold object-cover shadow-md"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-gold bg-card text-3xl shadow-md">
            👤
          </div>
        )}
        <h1 className="mt-3 font-display text-xl font-semibold">{user.name}</h1>
      </header>

      <main className="-mt-8 px-6">
        {/* Admin Panel */}
        {showAdmin && (
        <Link
          to="/admin"
          className="mb-4 flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card active:scale-[0.98]"
        >
          <div className="header-grad flex h-11 w-11 items-center justify-center rounded-full text-primary-foreground shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-primary-deep">Admin Panel</p>
            <p className="text-[10px] text-muted-foreground">অ্যাপ পরিচালনা করুন</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        )}

        {/* Balance card */}
        <div className="mb-4 flex items-center justify-between rounded-2xl border bg-card p-5 shadow-card">
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

        <a
          href={supportUrl || undefined}
          aria-disabled={!supportUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            if (!supportUrl) { event.preventDefault(); return; }
            const tg = (window as any).Telegram?.WebApp;
            if (tg?.openTelegramLink) { event.preventDefault(); tg.openTelegramLink(supportUrl); }
          }}
          className="mt-4 flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tile text-primary"><HelpCircle className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-primary-deep">Help &amp; Support</p>
            {supportUsername && (
              <p className="mt-1 break-all text-xs text-muted-foreground">@{supportUsername}</p>
            )}
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </a>

        {/* Withdraw marquee banner */}
        <WithdrawBanner />
      </main>

      <BottomNav active="profile" />
    </div>
  );
}
