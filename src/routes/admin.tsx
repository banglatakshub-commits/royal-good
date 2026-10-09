import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users,
  Wallet,
  Share2,
  Settings,
  Megaphone,
  Search,
  ShieldCheck,
  ListPlus,
  LayoutDashboard,
  Activity,
  AlertTriangle,
  CreditCard,
  Coins,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import { getTgIdentity } from "@/lib/telegram";
import { TaskIcon, TASK_ICON_OPTIONS } from "@/lib/taskIcons";
import { supportUsernameSchema } from "@/lib/support";
import {
  adminListWithdrawals,
  adminGetDashboard,
  adminGetUsers,
  adminGetReferrals,
  adminGetSettings,
  adminGetTasks,
  bindAdminId,
  ensureTgAdmin,
  adminUpdateBalance,
  adminToggleBlock,
  adminDeleteUser,
  adminSetWithdrawal,
  adminEditWithdrawalNumber,
  adminSaveSettings,
  adminBroadcast,
  adminAddTask,
  adminUpdateTask,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Panel — Life Good" },
      {
        name: "description",
        content: "Life Good অ্যাপ পরিচালনা: ইউজার, উইথড্র, রেফার, সেটিংস, ব্রডকাস্ট।",
      },
      { property: "og:title", content: "Admin Panel — Life Good" },
      { property: "og:description", content: "Life Good অ্যাপ পরিচালনা।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type Tab = "dashboard" | "tasks" | "users" | "withdraws" | "refs" | "settings" | "broadcast";
const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "dashboard", label: "ড্যাশবোর্ড", icon: LayoutDashboard },
  { key: "withdraws", label: "উইথড্র", icon: Wallet },
  { key: "users", label: "ইউজার", icon: Users },
  { key: "tasks", label: "কাজ", icon: ListPlus },
  { key: "refs", label: "রেফার", icon: Share2 },
  { key: "settings", label: "সেটিংস", icon: Settings },
  { key: "broadcast", label: "ব্রডকাস্ট", icon: Megaphone },
];

// Telegram identity: numeric id inside Telegram, username fallback in browser preview
function myTgId(): string {
  return getTgIdentity().tgId;
}

function myIdent() {
  return getTgIdentity();
}

function AdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const ensure = useServerFn(ensureTgAdmin);
  const bind = useServerFn(bindAdminId);

  useEffect(() => {
    void (async () => {
      const identity = myIdent();
      const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram
        ?.WebApp;
      if (!tg?.initData && !import.meta.env.DEV) {
        setIsAdmin(false);
        return;
      }
      try {
        await bind({ data: identity });
        const result = await ensure({ data: identity });
        setIsAdmin(result.isAdmin);
      } catch {
        setIsAdmin(false);
      }
    })();
  }, [ensure, bind]);

  if (isAdmin === null)
    return <div className="p-8 text-center text-muted-foreground">লোড হচ্ছে...</div>;
  if (!isAdmin)
    return (
      <div className="p-8 text-center">
        <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="font-display text-xl text-primary-deep">আপনার এডমিন অ্যাক্সেস নেই</p>
        <p className="mt-1 text-sm text-muted-foreground">
          এই প্যানেল শুধু এডমিনের টেলিগ্রাম অ্যাকাউন্ট থেকে খোলা যায়।
        </p>
      </div>
    );

  return (
    <div className="mx-auto min-h-screen max-w-5xl bg-background pb-24">
      <header className="header-grad flex items-center justify-between gap-2 px-4 py-4 text-primary-foreground">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            aria-label="অ্যাপে ফিরে যান"
            className="flex items-center gap-1 rounded-full bg-background/20 px-3 py-1.5 text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" /> অ্যাপে ফিরুন
          </Link>
          <h1 className="font-display text-lg">Admin</h1>
        </div>
        <span className="flex items-center gap-1 text-sm">
          <ShieldCheck className="h-4 w-4" /> @{myTgId()}
        </span>
      </header>
      <main className="p-4">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "users" && <UsersTab />}
        {tab === "tasks" && <TasksTab />}
        {tab === "withdraws" && <WithdrawsTab />}
        {tab === "refs" && <RefsTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "broadcast" && <BroadcastTab />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${tab === t.key ? "text-primary" : "text-muted-foreground"}`}
            >
              <t.icon className="h-5 w-5" />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function DashboardTab() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminGetDashboard({ data: myIdent() }),
    refetchInterval: 20000,
  });
  const cards = [
    { label: "মোট ইউজার", value: data?.users, icon: Users, tint: "bg-primary/10 text-primary" },
    {
      label: "সক্রিয় (২৪ ঘণ্টা)",
      value: data?.active24h,
      icon: Activity,
      tint: "bg-primary/10 text-primary",
    },
    {
      label: "পেন্ডিং উইথড্র",
      value: data?.pending,
      icon: AlertTriangle,
      tint: "bg-destructive/10 text-destructive",
    },
    {
      label: "মোট পেইড",
      value: data && `৳${data.paid.toLocaleString("en-US")}`,
      icon: CreditCard,
      tint: "bg-accent text-accent-foreground",
    },
    {
      label: "ইউজারদের মোট ব্যালেন্স",
      value: data && `৳${data.balance.toLocaleString("en-US")}`,
      icon: Coins,
      tint: "bg-accent text-accent-foreground",
    },
    { label: "মোট রেফার", value: data?.refs, icon: Share2, tint: "bg-primary/10 text-primary" },
  ];
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-2xl font-bold text-primary-deep">ড্যাশবোর্ড</h2>
        <p className="text-sm text-muted-foreground">অ্যাপের সার্বিক চিত্র এক নজরে</p>
      </div>
      {cards.map((c) => (
        <div key={c.label} className="flex items-center gap-4 rounded-2xl bg-card p-5 shadow-card">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${c.tint}`}
          >
            <c.icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="font-display text-2xl font-bold text-foreground">{c.value ?? "…"}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const updBalance = useServerFn(adminUpdateBalance);
  const toggle = useServerFn(adminToggleBlock);
  const delUser = useServerFn(adminDeleteUser);
  const { data = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminGetUsers({ data: myIdent() }),
  });
  const list = data.filter((u) => (u.name + " " + u.tg_id).toLowerCase().includes(q.toLowerCase()));

  const editBalance = async (tg_id: string, cur: number) => {
    const v = prompt("নতুন ব্যালেন্স লিখুন (৳)", String(cur));
    if (v === null || isNaN(Number(v)) || Number(v) < 0) return;
    try {
      await updBalance({
        data: { ...myIdent(), targetTgId: tg_id, balance: Math.floor(Number(v)) },
      });
      qc.invalidateQueries();
    } catch {
      alert("আপডেট হয়নি");
    }
  };
  const toggleBlock = async (tg_id: string, blocked: boolean) => {
    try {
      await toggle({ data: { ...myIdent(), targetTgId: tg_id, blocked: !blocked } });
      qc.invalidateQueries();
    } catch {
      alert("আপডেট হয়নি");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border bg-card px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="নাম বা ইউজারনেম খুঁজুন"
          className="w-full bg-transparent py-3 text-sm outline-none"
        />
      </div>
      {list.map((u) => (
        <div key={u.tg_id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm">
          {u.photo_url ? (
            <img src={u.photo_url} className="h-10 w-10 rounded-full object-cover" alt="" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tile">
              👤
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-primary-deep">
              {u.name} {u.blocked && <span className="text-xs text-destructive">(ব্লকড)</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">@{u.tg_id}</p>
          </div>
          <p className="font-display text-lg text-primary">৳{u.balance}</p>
          <button
            onClick={() => editBalance(u.tg_id, u.balance)}
            className="rounded-lg bg-tile px-3 py-1 text-xs font-semibold"
          >
            এডিট
          </button>
          <button
            onClick={() => toggleBlock(u.tg_id, u.blocked)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold ${u.blocked ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}
          >
            {u.blocked ? "আনব্লক" : "ব্লক"}
          </button>
          <button
            onClick={async () => {
              if (!confirm(`${u.name} কে স্থায়ীভাবে রিমুভ করবেন? সব ডেটা মুছে যাবে।`)) return;
              try {
                await delUser({ data: { ...myIdent(), targetTgId: u.tg_id } });
                qc.invalidateQueries();
              } catch {
                alert("রিমুভ হয়নি");
              }
            }}
            className="rounded-lg bg-destructive/10 p-1.5 text-destructive"
            aria-label="রিমুভ"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {list.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">কোনো ইউজার নেই</p>
      )}
    </div>
  );
}

function WithdrawsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [group, setGroup] = useState<"first" | "repeat">("first");
  const setWd = useServerFn(adminSetWithdrawal);
  const listWd = useServerFn(adminListWithdrawals);
  const { data = [] } = useQuery({
    queryKey: ["admin-withdraws"],
    queryFn: () => listWd({ data: myIdent() }),
    refetchInterval: 20000,
  });
  // প্রতিটি ইউজারের সবচেয়ে পুরনো উইথড্র = তার "প্রথম উইথড্র"
  const firstIds = new Map<string, string>();
  for (const w of [...data].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))) {
    if (!firstIds.has(w.tg_id)) firstIds.set(w.tg_id, w.id);
  }
  const isFirst = (w: (typeof data)[number]) => firstIds.get(w.tg_id) === w.id;
  const inStatus = (w: (typeof data)[number]) => filter === "all" || w.status === filter;
  const list = data.filter((w) => inStatus(w) && (group === "first" ? isFirst(w) : !isFirst(w)));
  const countFirst = data.filter((w) => inStatus(w) && isFirst(w)).length;
  const countRepeat = data.filter((w) => inStatus(w) && !isFirst(w)).length;

  const editNum = useServerFn(adminEditWithdrawalNumber);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newNumber, setNewNumber] = useState("");

  const setStatus = async (id: string, status: "approved" | "rejected", rejectReason?: string) => {
    try {
      await setWd({ data: { ...myIdent(), id, status, reason: rejectReason } });
      setRejectingId(null);
      setReason("");
      qc.invalidateQueries();
    } catch {
      alert("আপডেট হয়নি");
    }
  };

  const saveNumber = async (id: string) => {
    if (newNumber.trim().length < 3) return alert("সঠিক নাম্বার দিন");
    try {
      await editNum({ data: { ...myIdent(), id, number: newNumber.trim() } });
      setEditingId(null);
      setNewNumber("");
      qc.invalidateQueries();
    } catch {
      alert("নাম্বার বদলানো যায়নি");
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setGroup("first")}
          className={`rounded-2xl p-3 text-center shadow-sm ${group === "first" ? "bg-primary-deep text-primary-foreground" : "bg-card"}`}
        >
          <p className="text-sm font-bold">⭐ প্রথম উইথড্র</p>
          <p className="text-xs opacity-80">{countFirst} টি রিকোয়েস্ট</p>
        </button>
        <button
          onClick={() => setGroup("repeat")}
          className={`rounded-2xl p-3 text-center shadow-sm ${group === "repeat" ? "bg-primary-deep text-primary-foreground" : "bg-card"}`}
        >
          <p className="text-sm font-bold">🔁 পরবর্তী উইথড্র</p>
          <p className="text-xs opacity-80">{countRepeat} টি রিকোয়েস্ট</p>
        </button>
      </div>
      <div className="flex gap-2">
        {[
          ["pending", "পেন্ডিং"],
          ["approved", "অ্যাপ্রুভড"],
          ["rejected", "রিজেক্টেড"],
          ["all", "সব"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k!)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? "bg-primary-deep text-primary-foreground" : "bg-card"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {list.map((w) => (
        <div key={w.id} className="rounded-2xl bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-primary-deep">
                {w.name ?? w.tg_id}{" "}
                <span className="text-xs text-muted-foreground">@{w.tg_id}</span>
              </p>
              <p className="text-sm">
                {w.method} • <span className="font-mono">{w.number}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(w.created_at).toLocaleString("bn-BD")}
              </p>
            </div>
            <p className="font-display text-2xl text-primary">৳{w.amount}</p>
          </div>
          {w.status === "pending" && editingId === w.id && (
            <div className="mt-3 flex gap-2">
              <input
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="নতুন নাম্বার"
                className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={() => saveNumber(w.id)}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                সেভ
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="rounded-xl bg-muted px-3 py-2 text-sm"
              >
                ✕
              </button>
            </div>
          )}
          {w.status === "pending" && rejectingId === w.id && (
            <div className="mt-3 space-y-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="রিজেক্টের কারণ (ঐচ্ছিক)"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setStatus(w.id, "rejected", reason)}
                  className="flex-1 rounded-xl bg-destructive py-2 text-sm font-bold text-destructive-foreground"
                >
                  রিজেক্ট নিশ্চিত করুন
                </button>
                <button
                  onClick={() => {
                    setRejectingId(null);
                    setReason("");
                  }}
                  className="rounded-xl bg-muted px-4 py-2 text-sm"
                >
                  বাতিল
                </button>
              </div>
            </div>
          )}
          {w.status === "pending" && rejectingId !== w.id && editingId !== w.id ? (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setStatus(w.id, "approved")}
                className="flex-1 rounded-xl bg-primary py-2 text-sm font-bold text-primary-foreground"
              >
                Approve (পেইড)
              </button>
              <button
                onClick={() => {
                  setEditingId(w.id);
                  setNewNumber(w.number);
                }}
                className="rounded-xl bg-muted px-3 py-2 text-sm font-semibold"
              >
                ✏️ নাম্বার
              </button>
              <button
                onClick={() => setRejectingId(w.id)}
                className="flex-1 rounded-xl bg-destructive py-2 text-sm font-bold text-destructive-foreground"
              >
                Reject
              </button>
            </div>
          ) : w.status !== "pending" ? (
            <div className="mt-2">
              <p
                className={`text-sm font-semibold ${w.status === "approved" ? "text-primary" : "text-destructive"}`}
              >
                {w.status === "approved" ? "✓ অ্যাপ্রুভড" : "✗ রিজেক্টেড"}
              </p>
              {w.note && <p className="text-xs text-muted-foreground">কারণ: {w.note}</p>}
            </div>
          ) : null}
        </div>
      ))}
      {list.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">কোনো রিকোয়েস্ট নেই</p>
      )}
    </div>
  );
}

function RefsTab() {
  const { data = [] } = useQuery({
    queryKey: ["admin-refs"],
    queryFn: () => adminGetReferrals({ data: myIdent() }),
  });
  const counts = data.reduce<Record<string, number>>(
    (m, r) => ((m[r.referrer_id] = (m[r.referrer_id] ?? 0) + 1), m),
    {},
  );
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-4 shadow-sm">
        <p className="mb-2 font-display text-lg text-primary-deep">টপ রেফারার</p>
        {top.map(([id, c]) => (
          <div key={id} className="flex justify-between border-b py-1 text-sm last:border-0">
            <span>@{id}</span>
            <span className="font-bold">{c} জন</span>
          </div>
        ))}
        {top.length === 0 && <p className="text-sm text-muted-foreground">এখনো কোনো রেফার নেই</p>}
      </div>
      {data.map((r) => (
        <div
          key={r.referred_id}
          className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm"
        >
          {r.photo_url ? (
            <img src={r.photo_url} className="h-9 w-9 rounded-full object-cover" alt="" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tile">👤</div>
          )}
          <div className="flex-1 text-sm">
            <p className="font-semibold">{r.referred_name ?? r.referred_id}</p>
            <p className="text-xs text-muted-foreground">রেফার করেছে: @{r.referrer_id}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(r.created_at).toLocaleDateString("bn-BD")}
          </p>
        </div>
      ))}
    </div>
  );
}

function SettingsTab() {
  const saveFn = useServerFn(adminSaveSettings);
  const { data } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminGetSettings({ data: myIdent() }),
  });
  const [form, setForm] = useState({
    task_reward: 5,
    ref_bonus: 5,
    min_withdraw: 50,
    daily_spins: 2,
    ads_script_id: "8416",
    daily_ads: 10,
    ad_reward: 5,
    ad_seconds: 15,
    daily_typing: 5,
    daily_quiz: 5,
    support_telegram_username: "",
    activation_fee: 100,
    nek_api_key: "",
    nek_secret_key: "",
  });
  const [saved, setSaved] = useState("");
  // Shown to the admin so the Nekpayment callback URL can be copied; read after mount to stay SSR-safe.
  const [callbackUrl, setCallbackUrl] = useState("");
  useEffect(() => setCallbackUrl(window.location.origin), []);
  useEffect(() => {
    if (data)
      setForm({
        task_reward: data.task_reward,
        ref_bonus: data.ref_bonus,
        min_withdraw: data.min_withdraw,
        daily_spins: data.daily_spins,
        ads_script_id: data.ads_script_id ?? "8416",
        daily_ads: data.daily_ads ?? 10,
        ad_reward: data.ad_reward ?? 5,
        ad_seconds: data.ad_seconds ?? 15,
        daily_typing: data.daily_typing ?? 5,
        daily_quiz: data.daily_quiz ?? 5,
        support_telegram_username: data.support_telegram_username ?? "",
        activation_fee: data.activation_fee ?? 100,
        nek_api_key: data.nek_api_key ?? "",
        nek_secret_key: data.nek_secret_key ?? "",
      });
  }, [data]);
  const fields: [
    Exclude<
      keyof typeof form,
      "ads_script_id" | "support_telegram_username" | "nek_api_key" | "nek_secret_key"
    >,
    string,
  ][] = [
    ["activation_fee", "অ্যাকাউন্ট অ্যাক্টিভেশন ফি (৳)"],
    ["task_reward", "প্রতি কাজের রিওয়ার্ড (৳) — Typing / Quiz"],
    ["ad_reward", "প্রতি এড দেখলে বোনাস (৳)"],
    ["ad_seconds", "এড কাউন্টডাউন (সেকেন্ড) — এর আগে বন্ধ করলে রিওয়ার্ড নেই"],
    ["daily_ads", "প্রতিদিন সর্বোচ্চ কতটি এড"],
    ["daily_typing", "প্রতিদিন সর্বোচ্চ কতবার Typing"],
    ["daily_quiz", "প্রতিদিন সর্বোচ্চ কতবার Quiz"],
    ["ref_bonus", "প্রতি রেফারে বোনাস (৳)"],
    ["min_withdraw", "সর্বনিম্ন উইথড্র (৳)"],
    ["daily_spins", "প্রতিদিন কতটি স্পিন"],
  ];
  const save = async () => {
    const support = supportUsernameSchema.safeParse(form.support_telegram_username);
    if (!support.success) {
      setSaved("সঠিক টেলিগ্রাম ইউজারনেম দিন (যেমন @username)।");
      return;
    }
    try {
      await saveFn({ data: { ...myIdent(), ...form, support_telegram_username: support.data } });
      setSaved("✓ সেভ হয়েছে");
    } catch {
      setSaved("সেভ হয়নি");
    }
  };
  return (
    <div className="max-w-md space-y-4 rounded-2xl bg-card p-5 shadow-sm">
      {fields.map(([k, l]) => (
        <label key={k} className="block text-sm">
          <span className="text-muted-foreground">{l}</span>
          <input
            type="number"
            min={0}
            value={form[k]}
            onChange={(e) =>
              setForm({ ...form, [k]: Math.max(0, Math.floor(Number(e.target.value))) })
            }
            className="mt-1 w-full rounded-xl border bg-background px-3 py-2"
          />
        </label>
      ))}
      <label className="block text-sm">
        <span className="text-muted-foreground">GigaPub Script ID (Ads বিজ্ঞাপন নেটওয়ার্ক)</span>
        <input
          inputMode="numeric"
          value={form.ads_script_id}
          onChange={(e) =>
            setForm({ ...form, ads_script_id: e.target.value.replace(/\D/g, "").slice(0, 12) })
          }
          className="mt-1 w-full rounded-xl border bg-background px-3 py-2"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          বিজ্ঞাপন স্ক্রিপ্টের ID — GigaPub ড্যাশবোর্ড থেকে নতুন ID দিলে এখানে বদলে সেভ করুন।
        </span>
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Help &amp; Support — টেলিগ্রাম ইউজারনেম</span>
        <input
          aria-label="সাপোর্ট টেলিগ্রাম ইউজারনেম"
          maxLength={33}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="@username"
          value={form.support_telegram_username}
          onChange={(e) => setForm({ ...form, support_telegram_username: e.target.value })}
          className="mt-1 w-full rounded-xl border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Nekpayment API Key</span>
        <input
          value={form.nek_api_key}
          onChange={(e) => setForm({ ...form, nek_api_key: e.target.value })}
          placeholder="Enter API Key"
          className="mt-1 w-full rounded-xl border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Nekpayment Secret Key</span>
        <input
          value={form.nek_secret_key}
          onChange={(e) => setForm({ ...form, nek_secret_key: e.target.value })}
          placeholder="Enter Secret Key"
          className="mt-1 w-full rounded-xl border bg-background px-3 py-2"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Nekpayment dashboard-এ Callback URL হিসেবে এটি দিন:{" "}
        <code className="break-all text-foreground">
          {callbackUrl}/api/public/nekpayment-webhook
        </code>
      </p>
      <button
        onClick={save}
        className="header-grad w-full rounded-xl py-3 font-bold text-primary-foreground"
      >
        সেভ করুন
      </button>
      {saved && <p className="text-center text-sm text-primary">{saved}</p>}
    </div>
  );
}

function BroadcastTab() {
  const send = useServerFn(adminBroadcast);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const go = async () => {
    if (!text.trim()) return;
    if (!confirm("সব ইউজারকে মেসেজ পাঠাবেন?")) return;
    setBusy(true);
    setResult("");
    try {
      const r = await send({ data: { ...myIdent(), text } });
      setResult(`মোট ${r.total} জন — পাঠানো হয়েছে ${r.sent}, ব্যর্থ ${r.failed}`);
      setText("");
    } catch {
      setResult("পাঠানো যায়নি");
    }
    setBusy(false);
  };
  return (
    <div className="max-w-md space-y-3 rounded-2xl bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">
        এই মেসেজ Telegram বট (@Royal_goodbot) থেকে সব ইউজারের কাছে যাবে।
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={3500}
        rows={6}
        placeholder="মেসেজ লিখুন..."
        className="w-full rounded-xl border bg-background p-3 text-sm"
      />
      <button
        disabled={busy}
        onClick={go}
        className="header-grad w-full rounded-xl py-3 font-bold text-primary-foreground disabled:opacity-60"
      >
        {busy ? "পাঠানো হচ্ছে..." : "সবাইকে পাঠান"}
      </button>
      {result && <p className="text-center text-sm text-primary">{result}</p>}
    </div>
  );
}

function TasksTab() {
  const qc = useQueryClient();
  const add = useServerFn(adminAddTask);
  const upd = useServerFn(adminUpdateTask);
  const empty = {
    title: "",
    description: "",
    icon: "telegram",
    link: "",
    reward: 5,
    wait_seconds: 10,
  };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["admin-tasks"],
    queryFn: () => adminGetTasks({ data: myIdent() }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-tasks"] });
  const save = async () => {
    if (!f.title.trim()) return alert("কাজের নাম লিখুন");
    setBusy(true);
    try {
      await add({
        data: {
          ...myIdent(),
          task: { ...f, reward: Number(f.reward), wait_seconds: Number(f.wait_seconds) },
        },
      });
      setF(empty);
      refresh();
      alert("কাজ যোগ হয়েছে ✅");
    } catch (e) {
      alert("যোগ করা যায়নি — এডমিন টেলিগ্রাম থেকে চেষ্টা করুন। " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const act = async (id: string, opts: { active?: boolean; remove?: boolean }) => {
    if (opts.remove && !confirm("কাজটি মুছে ফেলবেন?")) return;
    try {
      await upd({ data: { ...myIdent(), id, ...opts } });
      refresh();
    } catch (e) {
      alert("ব্যর্থ: " + (e as Error).message);
    }
  };
  const inp = "w-full rounded-xl border bg-background px-3 py-2 text-sm";
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl bg-card p-4 shadow-card">
        <p className="font-display text-lg text-primary-deep">নতুন কাজ যোগ করুন</p>
        <input
          className={inp}
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          placeholder="কাজের নাম (যেমন: Join Channel)"
        />
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">লোগো বেছে নিন</p>
          <div className="flex flex-wrap gap-1.5">
            {TASK_ICON_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                title={o.label}
                onClick={() => setF({ ...f, icon: o.key })}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 bg-background ${f.icon === o.key ? "border-primary" : "border-transparent"}`}
              >
                <TaskIcon icon={o.key} size={20} />
              </button>
            ))}
          </div>
        </div>
        <textarea
          className={inp}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          placeholder="কাজের বিবরণ / নির্দেশনা"
        />
        <input
          className={inp}
          value={f.link}
          onChange={(e) => setF({ ...f, link: e.target.value })}
          placeholder="লিংক (https://...) — ঐচ্ছিক"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">
            রিওয়ার্ড (৳)
            <input
              type="number"
              className={inp}
              value={f.reward}
              onChange={(e) => setF({ ...f, reward: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            অপেক্ষা (সেকেন্ড)
            <input
              type="number"
              className={inp}
              value={f.wait_seconds}
              onChange={(e) => setF({ ...f, wait_seconds: Number(e.target.value) })}
            />
          </label>
        </div>
        <button
          disabled={busy}
          onClick={save}
          className="header-grad w-full rounded-xl py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "যোগ হচ্ছে..." : "কাজ যোগ করুন"}
        </button>
      </div>
      {data.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          এখনো কোনো নতুন কাজ যোগ করা হয়নি
        </p>
      )}
      {data.map((t) => (
        <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-tile">
            <TaskIcon icon={t.icon} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-primary-deep">{t.title}</p>
            <p className="text-xs text-muted-foreground">
              ৳{t.reward} • {t.wait_seconds}s • {t.active ? "চালু" : "বন্ধ"}
            </p>
          </div>
          <button
            onClick={() => act(t.id, { active: !t.active })}
            className="rounded-lg bg-tile px-3 py-1 text-xs font-semibold"
          >
            {t.active ? "বন্ধ" : "চালু"}
          </button>
          <button
            onClick={() => act(t.id, { remove: true })}
            className="rounded-lg bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground"
          >
            মুছুন
          </button>
        </div>
      ))}
    </div>
  );
}
