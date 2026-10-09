import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, History, Smartphone, XCircle } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/AppShell";
import { useBalance, setServerBalance } from "@/lib/wallet";
import { getMyWithdrawalHistory, requestWithdraw, generatePaymentUrl } from "@/lib/earn.functions";
import { settings, loadSettings } from "@/lib/settings";
import { getTgIdentity } from "@/lib/telegram";

export const Route = createFileRoute("/withdraw")({
  head: () => ({
    meta: [
      { title: "Withdraw — Life Good" },
      {
        name: "description",
        content: "Life Good থেকে বিকাশ বা নগদে উইথড্র অনুরোধ করুন এবং পেমেন্টের অবস্থা দেখুন।",
      },
      { property: "og:title", content: "Withdraw — Life Good" },
      { property: "og:description", content: "বিকাশ বা নগদে উইথড্র অনুরোধ এবং পেমেন্টের ইতিহাস।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WithdrawPage,
});

const methods = ["bKash", "Nagad"];
const HKEY = "lg_withdraws";
type Req = {
  amount: number;
  method: string;
  number: string;
  at: number;
  status?: string;
  note?: string | null;
};

function loadHistory(): Req[] {
  try {
    return JSON.parse(localStorage.getItem(HKEY) || "[]");
  } catch {
    return [];
  }
}

function WithdrawPage() {
  const balance = useBalance();
  const navigate = useNavigate();
  const [method, setMethod] = useState("bKash");
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [history, setHistory] = useState<Req[]>([]);
  const [MIN, setMin] = useState(settings.min_withdraw);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [activationFee, setActivationFee] = useState(100);
  const [showActivationPopup, setShowActivationPopup] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  // প্রতিটি রিজেক্টেড উইথড্রের জন্য সর্বনিম্ন উইথড্র ডাবল হয় (সর্বোচ্চ ৮ গুণ)
  const effectiveMin = MIN * Math.min(2 ** rejectedCount, 8);
  useEffect(() => {
    setHistory(loadHistory());
    void loadSettings().then((x) => setMin(x.min_withdraw));
    void getMyWithdrawalHistory({ data: getTgIdentity() })
      .then(({ rows, rejectedCount: count, isActive, activationFee }) => {
        setHistory(
          rows.map((row) => ({
            amount: row.amount,
            method: row.method,
            number: row.number,
            at: new Date(row.created_at).getTime(),
            status: row.status,
            note: row.note,
          })),
        );
        setRejectedCount(count);
        setIsActive(isActive);
        setActivationFee(activationFee);
      })
      .catch((historyError: unknown) =>
        console.error("Withdrawal history load error:", historyError),
      );
  }, []);

  const submit = async () => {
    if (!isActive) {
      setShowActivationPopup(true);
      return;
    }
    const amt = Number(amount);
    if (amt < effectiveMin) return setError(`সর্বনিম্ন উইথড্র ৳${effectiveMin}`);
    if (amt > balance) return setError("পর্যাপ্ত ব্যালেন্স নেই");
    if (number.length < 11) return setError("সঠিক মোবাইল নম্বর দিন");
    let r;
    try {
      r = await requestWithdraw({
        data: {
          ...getTgIdentity(),
          amount: Math.floor(amt),
          method: method as "bKash" | "Nagad",
          number: number.trim(),
        },
      });
    } catch {
      return setError("সঠিক তথ্য দিন, তারপর আবার চেষ্টা করুন");
    }
    if (!r.ok) return setError(r.error ?? "সমস্যা হয়েছে");
    setServerBalance(r.balance);
    const next = [{ amount: amt, method, number, at: Date.now() }, ...loadHistory()];
    localStorage.setItem(HKEY, JSON.stringify(next));
    setHistory(next);
    setError("");
    setDone(true);
  };

  const handlePayment = async () => {
    setIsProcessingPayment(true);
    try {
      const res = await generatePaymentUrl({ data: getTgIdentity() });
      if (res.ok) {
        window.location.href = res.url;
        return;
      }
      alert(res.error);
    } catch {
      alert("সমস্যা হয়েছে");
    }
    setIsProcessingPayment(false);
  };

  if (showActivationPopup) {
    return (
      <PageShell title="অ্যাকাউন্ট অ্যাক্টিভ করুন">
        <div className="flex flex-col items-center px-6 pt-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <XCircle className="h-8 w-8" />
          </div>
          <h2 className="font-display text-2xl font-bold text-primary-deep">
            অ্যাকাউন্ট অ্যাক্টিভ নয়
          </h2>
          <p className="mt-4 text-sm text-muted-foreground">
            উইথড্র করার জন্য আপনার অ্যাকাউন্ট অ্যাক্টিভ করতে হবে। অ্যাকাউন্ট অ্যাক্টিভ ফি ৳
            {activationFee}।
          </p>
          <div className="mt-8 w-full max-w-sm space-y-3">
            <button
              onClick={handlePayment}
              disabled={isProcessingPayment}
              className="header-grad flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-primary-foreground shadow-card disabled:opacity-60"
            >
              {isProcessingPayment
                ? "অপেক্ষা করুন..."
                : `বিকাশ/নগদ দিয়ে পে করুন (৳${activationFee})`}
            </button>
            <button
              onClick={() => setShowActivationPopup(false)}
              className="w-full rounded-xl border bg-card py-3.5 text-sm font-bold text-muted-foreground shadow-sm"
            >
              ফিরে যান
            </button>
          </div>
        </div>
        <BottomNav active="withdraw" />
      </PageShell>
    );
  }

  if (done) {
    return (
      <PageShell title="Withdraw">
        <div className="flex flex-col items-center px-6 pt-20 text-center">
          <CheckCircle2 className="mb-4 h-16 w-16 text-primary" />
          <h2 className="font-display text-2xl font-bold text-primary-deep">রিকোয়েস্ট সফল!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            ৳{amount} উইথড্র রিকোয়েস্ট {method} ({number}) নম্বরে পাঠানো হয়েছে। ২৪ ঘন্টার মধ্যে
            পেমেন্ট পাবেন।
          </p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="header-grad mt-8 rounded-xl px-8 py-3 text-sm font-bold text-primary-foreground shadow-card"
          >
            হোমে ফিরে যান
          </button>
        </div>
        <BottomNav active="withdraw" />
      </PageShell>
    );
  }

  return (
    <PageShell title="Withdraw">
      <div className="space-y-5 px-6 pt-6">
        {/* Balance */}
        <div className="rounded-2xl border bg-card p-5 text-center shadow-card">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary-deep/60">
            বর্তমান ব্যালেন্স
          </p>
          <p className="font-display text-3xl font-bold text-primary">৳ {balance}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">সর্বনিম্ন উইথড্র ৳{effectiveMin}</p>
          {rejectedCount > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-destructive">
              আপনার {rejectedCount} টি উইথড্র রিজেক্ট হয়েছে — তাই সর্বনিম্ন সীমা{" "}
              {Math.min(2 ** rejectedCount, 8)} গুণ বেড়েছে
            </p>
          )}
        </div>

        {/* Method */}
        <div>
          <p className="mb-2 text-xs font-bold text-primary-deep">পেমেন্ট মেথড</p>
          <div className="grid grid-cols-2 gap-2">
            {methods.map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${
                  method === m
                    ? "border-primary bg-tile text-primary"
                    : "bg-card text-muted-foreground"
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Number */}
        <div>
          <p className="mb-2 text-xs font-bold text-primary-deep">মোবাইল নম্বর</p>
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="01XXXXXXXXX"
            inputMode="numeric"
            className="w-full rounded-xl border bg-card px-4 py-3 text-sm font-semibold outline-none focus:border-primary"
          />
        </div>

        {/* Amount */}
        <div>
          <p className="mb-2 text-xs font-bold text-primary-deep">পরিমাণ (৳)</p>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            placeholder={`সর্বনিম্ন ৳${effectiveMin}`}
            inputMode="numeric"
            className="w-full rounded-xl border bg-card px-4 py-3 text-sm font-semibold outline-none focus:border-primary"
          />
        </div>

        {error && (
          <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-center text-xs font-bold text-destructive">
            {error}
          </p>
        )}

        <button
          onClick={submit}
          className="header-grad w-full rounded-xl py-3.5 text-sm font-bold text-primary-foreground shadow-card active:scale-[0.98]"
        >
          উইথড্র করুন
        </button>

        {/* History */}
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <p className="font-display text-base text-primary-deep">উইথড্র হিস্টোরি</p>
          </div>
          {history.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              এখনো কোনো উইথড্র করা হয়নি
            </p>
          ) : (
            <ul className="divide-y">
              {history.map((h) => (
                <li
                  key={`${h.at}-${h.amount}`}
                  className="flex items-center justify-between py-2.5"
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      ৳{h.amount} • {h.method}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {h.number ? `${h.number} • ` : ""}
                      {new Date(h.at).toLocaleDateString("bn-BD")}
                    </p>
                    {h.status === "rejected" && h.note && (
                      <p className="text-[11px] text-destructive">কারণ: {h.note}</p>
                    )}
                  </div>
                  {h.status === "approved" ? (
                    <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
                      <CheckCircle2 className="h-3 w-3" /> পেইড
                    </span>
                  ) : h.status === "rejected" ? (
                    <span
                      title={h.note ?? ""}
                      className="flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-bold text-destructive"
                    >
                      <XCircle className="h-3 w-3" /> রিজেক্ট
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold text-accent-foreground">
                      <Clock className="h-3 w-3" /> পেন্ডিং
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <BottomNav active="withdraw" />
    </PageShell>
  );
}
