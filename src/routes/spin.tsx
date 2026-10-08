import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/AppShell";
import { setServerBalance } from "@/lib/wallet";
import { doSpin, getSpinStatus } from "@/lib/earn.functions";
import { getTgUser } from "@/lib/telegram";
import { settings, loadSettings } from "@/lib/settings";

export const Route = createFileRoute("/spin")({
  head: () => ({
    meta: [
      { title: "Daily Spin — Life Good" },
      { name: "description", content: "প্রতিদিন ২টি ফ্রি স্পিন — ৳20 থেকে ৳300 পর্যন্ত জিতুন।" },
      { property: "og:title", content: "Daily Spin — Life Good" },
      { property: "og:description", content: "প্রতিদিন ২টি ফ্রি স্পিন — ৳20 থেকে ৳300 পর্যন্ত জিতুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpinPage,
});

// Most spins land on 20–50
const SEGMENTS = [
  { amount: 20, weight: 30 },
  { amount: 100, weight: 5 },
  { amount: 30, weight: 25 },
  { amount: 150, weight: 3 },
  { amount: 40, weight: 20 },
  { amount: 200, weight: 1.5 },
  { amount: 50, weight: 15 },
  { amount: 300, weight: 0.5 },
];
const SEG = 360 / SEGMENTS.length;

function SpinPage() {
  const [used, setUsed] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<number | null>(null);

  const [DAILY, setDaily] = useState(settings.daily_spins);
  useEffect(() => {
    void loadSettings().then((x) => setDaily(x.daily_spins));
    void getSpinStatus({ data: { tgId: getTgUser().username } })
      .then((r) => { setUsed(r.used); setDaily(r.limit); })
      .catch(() => {});
  }, []);

  const left = Math.max(0, DAILY - used);

  const spin = async () => {
    if (spinning || left <= 0) return;
    setSpinning(true);
    let r;
    try {
      r = await doSpin({ data: { tgId: getTgUser().username } });
    } catch {
      setSpinning(false);
      return;
    }
    setUsed(r.used);
    setDaily(r.limit);
    if (!r.ok) { setSpinning(false); return; }
    const idx = r.index;
    const amount = r.amount;
    const target = 360 - (idx * SEG + SEG / 2);
    const base = rotation - (rotation % 360);
    setRotation(base + 360 * 6 + target);
    setWon(null);
    setTimeout(() => {
      setServerBalance(r.balance);
      setWon(amount);
      setSpinning(false);
    }, 4200);
  };

  const gradient = `conic-gradient(${SEGMENTS.map(
    (_, i) =>
      `${i % 2 ? "var(--gold)" : "var(--primary)"} ${i * SEG}deg ${(i + 1) * SEG}deg`,
  ).join(",")})`;

  return (
    <PageShell title="Daily Spin">
      <div className="rounded-2xl bg-card p-5 text-center shadow-card">
        <p className="text-sm text-muted-foreground">আজকের বাকি স্পিন</p>
        <p className="font-display text-3xl text-primary">
          {left} / {DAILY}
        </p>

        <div className="relative mx-auto mt-6 h-64 w-64">
          <div className="absolute left-1/2 top-[-6px] z-10 h-0 w-0 -translate-x-1/2 border-x-[12px] border-t-[20px] border-x-transparent border-t-primary-deep" />
          <div
            className="h-full w-full rounded-full border-[6px] border-primary-deep shadow-card"
            style={{
              background: gradient,
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? "transform 4s cubic-bezier(0.17,0.67,0.2,1)" : "none",
            }}
          >
            {SEGMENTS.map((s, i) => (
              <div
                key={i}
                className="absolute left-1/2 top-0 h-1/2 origin-bottom -translate-x-1/2 pt-3"
                style={{ transform: `translateX(-50%) rotate(${i * SEG + SEG / 2}deg)` }}
              >
                <span
                  className={`text-sm font-bold ${i % 2 ? "text-primary-deep" : "text-primary-foreground"}`}
                >
                  ৳{s.amount}
                </span>
              </div>
            ))}
          </div>
          <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-gold bg-primary-deep" />
        </div>

        {won !== null && (
          <p className="mt-5 font-display text-2xl text-primary">🎉 আপনি ৳{won} জিতেছেন!</p>
        )}

        <button
          onClick={spin}
          disabled={spinning || left <= 0}
          className="mt-5 w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground disabled:opacity-50"
        >
          {spinning ? "ঘুরছে..." : left > 0 ? "Spin করুন" : "আজকের স্পিন শেষ — কাল আবার আসুন"}
        </button>
      </div>
    </PageShell>
  );
}
