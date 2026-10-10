import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, CreditCard, LoaderCircle, ShieldCheck } from "lucide-react";
import { createDepositOrder } from "@/lib/deposit.functions";
import { getTgIdentity } from "@/lib/telegram";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/deposit")({
  ssr: false,
  component: DepositPage,
});

function DepositPage() {
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function startPayment() {
    const parsed = Number(amount);
    if (!Number.isInteger(parsed) || parsed < 10 || parsed > 50000) {
      setError("১০ থেকে ৫০,০০০ টাকার মধ্যে পূর্ণ সংখ্যা লিখুন।");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await createDepositOrder({ data: { ...getTgIdentity(), amount: parsed } });
      setNotice("পেমেন্ট পেজ খোলা হচ্ছে…");
      window.location.assign(result.paymentUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "পেমেন্ট অর্ডার তৈরি করা যায়নি। পরে আবার চেষ্টা করুন।");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background px-5 pb-24 pt-6">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">
        <ArrowLeft className="h-4 w-4" /> হোমে ফিরুন
      </Link>
      <div className="rounded-3xl border bg-card p-6 shadow-card">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-tile text-primary">
          <CreditCard className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-bold text-primary-deep">Deposit Balance</h1>
        <p className="mt-2 text-sm text-muted-foreground">NekPay-এর মাধ্যমে আপনার অ্যাকাউন্টে টাকা জমা দিন।</p>
        <label htmlFor="deposit-amount" className="mt-6 block text-sm font-semibold">পরিমাণ (BDT)</label>
        <input
          id="deposit-amount"
          type="number"
          min={10}
          max={50000}
          step={1}
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[100, 200, 500].map((value) => (
            <button key={value} type="button" onClick={() => setAmount(String(value))}
              className="rounded-xl border bg-background py-2 text-sm font-bold hover:bg-muted">
              ৳{value}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {notice && <p className="mt-4 text-sm text-primary">{notice}</p>}
        <button type="button" disabled={busy} onClick={() => void startPayment()}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-60">
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          {busy ? "অপেক্ষা করুন…" : "NekPay দিয়ে Deposit করুন"}
        </button>
        <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <p>পেমেন্ট নিশ্চিত হলে ব্যালেন্স স্বয়ংক্রিয়ভাবে যোগ হবে। শুধু সফলভাবে যাচাইকৃত পেমেন্টই গণনা করা হবে।</p>
        </div>
      </div>
      <BottomNav active="home" />
    </div>
  );
}
