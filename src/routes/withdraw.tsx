import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  Lock,
  ShieldAlert,
  Smartphone,
  XCircle,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/AppShell";
import { getBalance, refreshBalance, setServerBalance, useBalance } from "@/lib/wallet";
import { generatePaymentUrl, getMyWithdrawalHistory, requestWithdraw } from "@/lib/earn.functions";
import { loadSettings, settings } from "@/lib/settings";
import { getTgIdentity } from "@/lib/telegram";
import {
  effectiveMinWithdraw,
  MAX_MIN_WITHDRAW_STEPS,
  sanitizeWithdrawNumberInput,
  validateWithdraw,
  WITHDRAW_METHODS,
  type WithdrawField,
  type WithdrawMethod,
} from "@/lib/withdraw-validation";

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

const HKEY = "lg_withdraws";
type Req = {
  amount: number;
  method: string;
  number: string;
  at: number;
  status?: string;
  note?: string | null;
};

/** Offline copy of the last known history so the page paints something before the server replies. */
function loadHistory(): Req[] {
  if (typeof window === "undefined") return [];
  try {
    const rows = JSON.parse(localStorage.getItem(HKEY) || "[]");
    return Array.isArray(rows) ? (rows as Req[]) : [];
  } catch {
    return [];
  }
}

function cacheHistory(rows: Req[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HKEY, JSON.stringify(rows.slice(0, 30)));
  } catch {
    // A full or blocked localStorage must never stop a withdrawal.
  }
}

function WithdrawPage() {
  const balance = useBalance();
  const navigate = useNavigate();
  const [method, setMethod] = useState<WithdrawMethod>("bKash");
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [history, setHistory] = useState<Req[]>([]);
  const [done, setDone] = useState<Req | null>(null);
  // Server-side withdrawal state; the form validates against it, not against guesses.
  const [minWithdraw, setMinWithdraw] = useState(settings.min_withdraw);
  const [serverMinimum, setServerMinimum] = useState<number | null>(null);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [activationFee, setActivationFee] = useState(100);
  const [ready, setReady] = useState(false);
  // Form feedback: field errors come from live validation, the banner from the last attempt.
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Record<WithdrawField, boolean>>({
    method: false,
    number: false,
    amount: false,
  });
  const [submitMessage, setSubmitMessage] = useState("");
  const [showActivationPopup, setShowActivationPopup] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // প্রতিটি রিজেক্টেড উইথড্রের জন্য সর্বনিম্ন উইথড্র ডাবল হয় (সর্বোচ্চ ৮ গুণ)
  const minimum = serverMinimum ?? effectiveMinWithdraw(minWithdraw, rejectedCount);

  const validation = useMemo(
    () =>
      validateWithdraw({
        amount,
        number,
        method,
        balance,
        minWithdraw,
        rejectedCount,
        minimum: serverMinimum,
        isActive,
        isBlocked,
        activationFee,
      }),
    [
      amount,
      number,
      method,
      balance,
      minWithdraw,
      rejectedCount,
      serverMinimum,
      isActive,
      isBlocked,
      activationFee,
    ],
  );

  /** Balance still needed before any withdrawal is possible at all. */
  const balanceShortfall = validation.balanceShortfall;
  const belowMinimum = balance < minimum;
  const banner = submitMessage || (attempted && !validation.ok ? validation.message : "");

  const errorFor = (field: WithdrawField) =>
    attempted || touched[field] ? validation.fieldErrors[field] : undefined;

  const loadState = useCallback(async () => {
    try {
      const [state, live] = await Promise.all([
        getMyWithdrawalHistory({ data: getTgIdentity() }),
        loadSettings(),
      ]);
      const rows: Req[] = state.rows.map((row) => ({
        amount: row.amount,
        method: row.method,
        number: row.number,
        at: new Date(row.created_at).getTime(),
        status: row.status,
        note: row.note,
      }));
      setHistory(rows);
      cacheHistory(rows);
      setRejectedCount(state.rejectedCount);
      setIsActive(state.isActive);
      setIsBlocked(state.isBlocked);
      setActivationFee(state.activationFee);
      setServerMinimum(state.minimum);
      setMinWithdraw(state.minWithdraw || live.min_withdraw);
      // Seed the wallet cache with the main balance so validation uses the server's number.
      setServerBalance(state.balance);
    } catch (stateError: unknown) {
      console.error("Withdrawal state load error:", stateError);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    setHistory(loadHistory());
    void loadState();
  }, [loadState]);

  const markTouched = (field: WithdrawField) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
    setSubmitMessage("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setAttempted(true);
    setSubmitMessage("");
    setTouched({ method: true, number: true, amount: true });

    if (!ready) {
      setSubmitMessage("উইথড্র তথ্য লোড হচ্ছে — এক মুহূর্ত পরে আবার চেষ্টা করুন।");
      return;
    }

    // The cached balance can lag the server by seconds; the main balance decides, so re-read it.
    let mainBalance = balance;
    try {
      await refreshBalance();
      mainBalance = getBalance();
    } catch (refreshError: unknown) {
      console.error("Balance refresh error:", refreshError);
    }

    const check = validateWithdraw({
      amount,
      number,
      method,
      balance: mainBalance,
      minWithdraw,
      rejectedCount,
      minimum: serverMinimum,
      isActive,
      isBlocked,
      activationFee,
    });

    if (!check.ok || check.method === null) {
      setSubmitMessage(check.message);
      // অ্যাকাউন্ট অ্যাক্টিভ না থাকলে উইথড্রের বদলে অ্যাক্টিভেশন সিস্টেম দেখানো হয়
      if (check.code === "account_inactive") setShowActivationPopup(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await requestWithdraw({
        data: {
          ...getTgIdentity(),
          amount: check.amount,
          method: check.method,
          number: check.number,
        },
      });
      // The server stays authoritative even when it refuses: resync balance, minimum, activation.
      if (typeof result.balance === "number") setServerBalance(result.balance);
      if (typeof result.minimum === "number") setServerMinimum(result.minimum);
      setIsActive(result.isActive);

      if (!result.ok) {
        setSubmitMessage(result.error ?? "সমস্যা হয়েছে, আবার চেষ্টা করুন");
        if (result.code === "account_inactive") setShowActivationPopup(true);
        return;
      }

      const request: Req = {
        amount: check.amount,
        method: check.method,
        number: check.number,
        at: Date.now(),
        status: "pending",
      };
      const next = [request, ...loadHistory()];
      cacheHistory(next);
      setHistory(next);
      setDone(request);
      setNumber("");
      setAmount("");
      setAttempted(false);
      setTouched({ method: false, number: false, amount: false });
      setSubmitMessage("");
      // Pull the authoritative pending row and the refreshed rejected-count/minimum.
      void loadState();
    } catch (requestError: unknown) {
      console.error("Withdraw request error:", requestError);
      setSubmitMessage("সঠিক তথ্য দিন, তারপর আবার চেষ্টা করুন");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayment = async () => {
    setIsProcessingPayment(true);
    setPaymentError("");
    try {
      const res = await generatePaymentUrl({ data: getTgIdentity() });
      if (res.ok) {
        window.location.href = res.url;
        return;
      }
      setPaymentError(res.error);
    } catch (paymentStartError: unknown) {
      console.error("Activation payment error:", paymentStartError);
      setPaymentError("পেমেন্ট লিংক তৈরি করা যায়নি। একটু পরে আবার চেষ্টা করুন।");
    }
    setIsProcessingPayment(false);
  };

  if (showActivationPopup) {
    return (
      <PageShell title="অ্যাকাউন্ট অ্যাক্টিভ করুন">
        <div className="flex flex-col items-center px-6 pt-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <XCircle className="h-8 w-8" />
          </div>
          <h2 className="font-display text-2xl font-bold text-primary-deep">
            অ্যাকাউন্ট অ্যাক্টিভ নয়
          </h2>
          <p className="mt-4 text-sm text-muted-foreground">
            উইথড্র করার জন্য আপনার অ্যাকাউন্ট অ্যাক্টিভ করতে হবে। একবারই অ্যাক্টিভেশন ফি ৳
            {activationFee} পে করলে উইথড্র খুলে যাবে।
          </p>
          {amount && (
            <p className="mt-3 rounded-xl border bg-card px-4 py-2.5 text-xs font-semibold text-primary-deep">
              আপনার ফর্মের তথ্য সংরক্ষিত আছে: ৳{amount} • {method}
              {number ? ` • ${number}` : ""}
            </p>
          )}
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
              onClick={() => {
                setShowActivationPopup(false);
                setPaymentError("");
              }}
              className="w-full rounded-xl border bg-card py-3.5 text-sm font-bold text-muted-foreground shadow-sm"
            >
              ফিরে যান
            </button>
            {paymentError && (
              <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-xs font-bold text-destructive">
                {paymentError}
              </p>
            )}
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
            ৳{done.amount} উইথড্র রিকোয়েস্ট {done.method} ({done.number}) নম্বরে পাঠানো হয়েছে। ২৪
            ঘন্টার মধ্যে পেমেন্ট পাবেন।
          </p>
          <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
            <button
              onClick={() => navigate({ to: "/" })}
              className="header-grad rounded-xl px-8 py-3 text-sm font-bold text-primary-foreground shadow-card"
            >
              হোমে ফিরে যান
            </button>
            <button
              onClick={() => setDone(null)}
              className="rounded-xl border bg-card px-8 py-3 text-sm font-bold text-muted-foreground shadow-sm"
            >
              উইথড্র হিস্টোরি দেখুন
            </button>
          </div>
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
          <p className="mt-1 text-[11px] text-muted-foreground">সর্বনিম্ন উইথড্র ৳{minimum}</p>
          {rejectedCount > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-destructive">
              আপনার {rejectedCount} টি উইথড্র রিজেক্ট হয়েছে — তাই সর্বনিম্ন সীমা{" "}
              {Math.min(2 ** rejectedCount, MAX_MIN_WITHDRAW_STEPS)} গুণ বেড়েছে
            </p>
          )}
          {belowMinimum && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-left text-[11px] font-semibold text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                আপনার মেইন ব্যালেন্স ৳{balance}, কিন্তু সর্বনিম্ন উইথড্র ৳{minimum} — আরও ৳
                {balanceShortfall} জমা হলে উইথড্র করতে পারবেন।
              </span>
            </p>
          )}
        </div>

        {/* Account status gates */}
        {isBlocked ? (
          <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs font-bold">
              আপনার অ্যাকাউন্ট ব্লক করা হয়েছে — উইথড্র করা যাবে না। সাপোর্টে যোগাযোগ করুন।
            </p>
          </div>
        ) : (
          !isActive && (
            <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary-deep" />
                <p className="text-xs font-semibold text-primary-deep">
                  অ্যাকাউন্ট অ্যাক্টিভ নয়। উইথড্র করতে অ্যাক্টিভেশন ফি ৳{activationFee} পে করতে
                  হবে।
                </p>
              </div>
              <button
                onClick={() => setShowActivationPopup(true)}
                className="header-grad mt-3 w-full rounded-xl py-2.5 text-xs font-bold text-primary-foreground shadow-sm"
              >
                অ্যাকাউন্ট অ্যাক্টিভ করুন
              </button>
            </div>
          )
        )}

        {/* Withdraw form: one submit handler validates method, number, minimum and balance. */}
        <form onSubmit={submit} noValidate className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-bold text-primary-deep" id="withdraw-method-label">
              পেমেন্ট মেথড
            </p>
            <div
              className="grid grid-cols-2 gap-2"
              role="group"
              aria-labelledby="withdraw-method-label"
            >
              {WITHDRAW_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMethod(m);
                    markTouched("method");
                  }}
                  aria-pressed={method === m}
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
            {errorFor("method") && (
              <p className="mt-1.5 text-[11px] font-semibold text-destructive">
                {errorFor("method")}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="withdraw-number"
              className="mb-2 block text-xs font-bold text-primary-deep"
            >
              মোবাইল নম্বর
            </label>
            <input
              id="withdraw-number"
              name="number"
              value={number}
              onChange={(e) => {
                setNumber(sanitizeWithdrawNumberInput(e.target.value));
                markTouched("number");
              }}
              onBlur={() => markTouched("number")}
              placeholder="01XXXXXXXXX"
              inputMode="tel"
              autoComplete="tel"
              maxLength={14}
              aria-invalid={Boolean(errorFor("number"))}
              aria-describedby={errorFor("number") ? "withdraw-number-error" : undefined}
              className={`w-full rounded-xl border bg-card px-4 py-3 text-sm font-semibold outline-none focus:border-primary ${
                errorFor("number") ? "border-destructive" : ""
              }`}
            />
            {errorFor("number") ? (
              <p
                id="withdraw-number-error"
                className="mt-1.5 text-[11px] font-semibold text-destructive"
              >
                {errorFor("number")}
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                বিকাশ/নগদ অ্যাকাউন্টের ১১ সংখ্যার নম্বর (যেমন 01712345678)
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="withdraw-amount"
              className="mb-2 block text-xs font-bold text-primary-deep"
            >
              পরিমাণ (৳)
            </label>
            <input
              id="withdraw-amount"
              name="amount"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/\D/g, "").slice(0, 8));
                markTouched("amount");
              }}
              onBlur={() => markTouched("amount")}
              placeholder={`সর্বনিম্ন ৳${minimum}`}
              inputMode="numeric"
              maxLength={8}
              aria-invalid={Boolean(errorFor("amount"))}
              aria-describedby={errorFor("amount") ? "withdraw-amount-error" : undefined}
              className={`w-full rounded-xl border bg-card px-4 py-3 text-sm font-semibold outline-none focus:border-primary ${
                errorFor("amount") ? "border-destructive" : ""
              }`}
            />
            {errorFor("amount") ? (
              <p
                id="withdraw-amount-error"
                className="mt-1.5 text-[11px] font-semibold text-destructive"
              >
                {errorFor("amount")}
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                সর্বনিম্ন ৳{minimum} • সর্বোচ্চ ৳{Math.max(0, balance)} (আপনার মেইন ব্যালেন্স)
              </p>
            )}
          </div>

          {banner && (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-4 py-2.5 text-center text-xs font-bold text-destructive"
            >
              {banner}
            </p>
          )}

          <button
            id="withdraw-submit"
            type="submit"
            disabled={!ready || isSubmitting || isBlocked}
            className="header-grad w-full rounded-xl py-3.5 text-sm font-bold text-primary-foreground shadow-card active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {!ready
              ? "লোড হচ্ছে..."
              : isSubmitting
                ? "পাঠানো হচ্ছে..."
                : isBlocked
                  ? "অ্যাকাউন্ট ব্লকড"
                  : isActive
                    ? belowMinimum
                      ? `উইথড্র করতে কমপক্ষে ৳${minimum} লাগবে`
                      : "উইথড্র করুন"
                    : `অ্যাক্টিভ করে উইথড্র করুন (৳${activationFee})`}
          </button>
        </form>

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
