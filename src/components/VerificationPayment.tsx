import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Clock3,
  Copy,
  Info,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type PayMethod = "bkash" | "nagad";

/** Only the fields this sheet paints; the route owns the data and the submission. */
export type VerificationSnapshot = {
  fee: number;
  bkash: string;
  nagad: string;
  latest: { status?: string | null; note?: string | null } | null;
} | null;

type Props = {
  /** `null` while the payment details are still loading. */
  verification: VerificationSnapshot;
  /** Fallback fee from the withdrawal state, used until `verification` arrives. */
  fallbackFee: number;
  method: PayMethod;
  onMethodChange: (method: PayMethod) => void;
  sender: string;
  onSenderChange: (value: string) => void;
  transactionId: string;
  onTransactionIdChange: (value: string) => void;
  submitting: boolean;
  error: string;
  onSubmit: () => void;
  onBack: () => void;
};

const METHODS: { id: PayMethod; label: string; logo: string }[] = [
  {
    id: "bkash",
    label: "bKash",
    logo: "https://i.ibb.co/vCZhxW5T/b-Kash-Logo.png",
  },
  {
    id: "nagad",
    label: "Nagad",
    logo: "https://www.google.com/s2/favicons?domain=nagad.com.bd&sz=128",
  },
];

const STEPS = ["পেমেন্ট", "তথ্য", "যাচাই"];

/**
 * Account-verification payment sheet shown before the first withdrawal.
 * Design language is deliberately its own — midnight-green glass, mint/aqua
 * accents and a copper fee figure — so it never reads as the rest of the app.
 */
export function VerificationPayment({
  verification,
  fallbackFee,
  method,
  onMethodChange,
  sender,
  onSenderChange,
  transactionId,
  onTransactionIdChange,
  submitting,
  error,
  onSubmit,
  onBack,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const fee = verification?.fee ?? fallbackFee;
  const recipient = verification ? (verification[method] ?? "") : "";
  const pending = verification?.latest?.status === "pending";
  const rejected = verification?.latest?.status === "rejected";
  const canSubmit = Boolean(verification) && Boolean(recipient) && !submitting;
  const activeMethod = METHODS.find((m) => m.id === method) ?? METHODS[0]!;

  const copyNumber = async () => {
    if (!recipient) return;
    try {
      await navigator.clipboard?.writeText(recipient);
    } catch {
      // Clipboard can be blocked inside the Telegram webview; the number stays visible.
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="vpay-sheet">
      <span className="vpay-orb vpay-orb-a" aria-hidden="true" />
      <span className="vpay-orb vpay-orb-b" aria-hidden="true" />

      <div className="relative z-10 px-5 pb-5 pt-6">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="vpay-section flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-gradient-to-br from-[#8bffe0] via-[#5fe6df] to-[#4ac9f2] text-[#03231b] shadow-[0_12px_26px_-12px_rgba(110,246,214,0.95)]">
            <ShieldCheck className="h-6 w-6" strokeWidth={2.3} />
          </span>
          <div className="min-w-0 flex-1 pr-7">
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#7fe3c8]">
              Secure verification
            </p>
            <DialogTitle className="mt-1 font-display text-[21px] font-bold leading-tight text-white">
              অ্যাকাউন্ট ভেরিফিকেশন
            </DialogTitle>
          </div>
        </div>

        <DialogDescription className="vpay-section mt-3 text-[12.5px] leading-6 text-[#a9cabe]">
          উইথড্র চালু করতে একবার ফি দিয়ে অ্যাকাউন্ট ভেরিফাই করুন — অনুমোদনের পর আর কোনো ফি নেই।
        </DialogDescription>

        {/* ── Fee hero ───────────────────────────────────────────── */}
        <div className="vpay-section relative mt-4 overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.045] p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#8db6a9]">
                ভেরিফিকেশন ফি
              </p>
              <p className="mt-1 font-display text-[34px] leading-none text-[#ffd28a]">
                ৳{fee}
                <span className="ml-0.5 align-top text-[13px] font-semibold text-[#d9a765]">
                  .00
                </span>
              </p>
            </div>
            <span className="mb-1 rounded-full border border-[#8bffe0]/30 bg-[#8bffe0]/10 px-2.5 py-1 text-[9px] font-bold tracking-wide text-[#a6f7e1]">
              শুধু একবার
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {["উইথড্র চালু", "ফি একবার", "ম্যানুয়াল যাচাই"].map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#06201a]/70 px-2 py-[3px] text-[9.5px] font-semibold text-[#b9ded2]"
              >
                <Check className="h-2.5 w-2.5 text-[#8bffe0]" strokeWidth={3} />
                {item}
              </span>
            ))}
          </div>

          {/* progress rail */}
          <div className="mt-3.5 flex items-center gap-1.5 border-t border-white/10 pt-3">
            {STEPS.map((step, index) => (
              <div key={step} className="flex flex-1 items-center gap-1.5 last:flex-none">
                <span
                  className={
                    index === 0
                      ? "grid h-[17px] w-[17px] place-items-center rounded-full bg-gradient-to-br from-[#8bffe0] to-[#4ac9f2] text-[9px] font-extrabold text-[#03231b]"
                      : "grid h-[17px] w-[17px] place-items-center rounded-full border border-white/15 text-[9px] font-bold text-[#7d9c93]"
                  }
                >
                  {index + 1}
                </span>
                <span
                  className={
                    index === 0
                      ? "text-[9.5px] font-bold text-[#c9f4e6]"
                      : "text-[9.5px] font-medium text-[#77948c]"
                  }
                >
                  {step}
                </span>
                {index < STEPS.length - 1 && (
                  <span className="mx-0.5 h-px flex-1 bg-gradient-to-r from-white/20 to-white/5" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        {!verification ? (
          <div className="vpay-section mt-4 space-y-2.5" aria-live="polite">
            <div className="vpay-skeleton h-12 rounded-xl" />
            <div className="vpay-skeleton h-[86px] rounded-[18px]" />
            <div className="vpay-skeleton h-11 rounded-xl" />
            <p className="pt-1 text-center text-[11px] text-[#8db6a9]">পেমেন্ট তথ্য লোড হচ্ছে...</p>
          </div>
        ) : pending ? (
          <div className="vpay-section mt-4 rounded-[18px] border border-[#8bffe0]/25 bg-[#07271f] px-4 py-5 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#8bffe0]/12 text-[#8bf5d6]">
              <Clock3 className="h-6 w-6" />
            </span>
            <p className="mt-2.5 font-display text-base font-bold text-white">পেমেন্ট যাচাই চলছে</p>
            <p className="mt-1.5 text-[11.5px] leading-5 text-[#a9cabe]">
              আপনার ভেরিফিকেশন অনুরোধ পর্যালোচনাধীন। অ্যাডমিন অনুমোদনের পর আবার উইথড্র করুন।
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#8bf5d6]">
              <BadgeCheck className="h-3.5 w-3.5" /> সাধারণত ২৪ ঘণ্টার মধ্যে
            </p>
          </div>
        ) : (
          <>
            {rejected && (
              <div className="vpay-section mt-3 flex items-start gap-2 rounded-xl border border-[#ffc46b]/25 bg-[#3a2a10]/60 px-3 py-2 text-[11px] leading-5 text-[#ffd9a3]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  আগের অনুরোধটি রিজেক্ট হয়েছে।
                  {verification.latest?.note && ` কারণ: ${verification.latest.note}`} নতুন
                  ট্রানজেকশন দিয়ে আবার জমা দিন।
                </span>
              </div>
            )}

            {/* method picker */}
            <div className="vpay-section mt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#cfeae1]">
                  পেমেন্ট অ্যাপ
                </p>
                <span className="text-[9.5px] font-medium tracking-wide text-[#7d9c93]">
                  Send Money
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="পেমেন্ট অ্যাপ">
                {METHODS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={method === item.id}
                    data-active={method === item.id}
                    onClick={() => onMethodChange(item.id)}
                    className="vpay-method flex items-center gap-2.5 px-3 py-2.5 text-left"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-white shadow-sm">
                      <img
                        src={item.logo}
                        alt=""
                        className="h-5 w-5 object-contain"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-bold text-white">
                        {item.label}
                      </span>
                      <span className="block text-[9px] font-medium text-[#8db6a9]">
                        সেন্ড মানি
                      </span>
                    </span>
                    <span className="vpay-dot shrink-0">
                      {method === item.id && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* recipient + amount */}
            <div className="vpay-section mt-3 rounded-[18px] border border-[#8bffe0]/25 bg-[#062a23]/70 p-4">
              <div className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#7fe3c8]">
                <Smartphone className="h-3.5 w-3.5" />
                {activeMethod.label} নম্বরে সেন্ড মানি
              </div>

              <div className="mt-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 font-mono text-[21px] font-bold leading-tight tracking-[0.04em] text-white">
                  {recipient || "সেট করা নেই"}
                </p>
                <button
                  type="button"
                  onClick={copyNumber}
                  disabled={!recipient}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#8bffe0]/30 bg-[#8bffe0]/10 px-2.5 py-1.5 text-[10px] font-bold text-[#a6f7e1] transition-colors hover:bg-[#8bffe0]/20 disabled:opacity-40"
                >
                  {copied ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copied ? "কপি হয়েছে" : "কপি"}
                </button>
              </div>

              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#04150f]/60 px-2.5 py-2 text-[10px] leading-4 text-[#9dbfb4]">
                <Info className="mt-0.5 h-3 w-3 shrink-0 text-[#8bf5d6]" />
                Cash Out নয় — Send Money অপশনেই পাঠান, নইলে পেমেন্ট যাচাই করা যাবে না।
              </p>

              <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2.5">
                <span className="text-[11px] text-[#9dbfb4]">পাঠাতে হবে</span>
                <span className="text-[13px] font-extrabold text-[#ffd28a]">৳{fee}</span>
              </div>
            </div>

            {/* proof fields */}
            <div className="vpay-section mt-3 grid gap-2.5">
              <label className="block" htmlFor="verify-sender">
                <span className="mb-1.5 flex items-center justify-between text-[10.5px] font-bold tracking-wide text-[#cfeae1]">
                  যে নম্বর থেকে পাঠিয়েছেন
                  <span className="font-medium normal-case text-[#7d9c93]">01XXXXXXXXX</span>
                </span>
                <input
                  id="verify-sender"
                  name="verify-sender"
                  value={sender}
                  onChange={(event) =>
                    onSenderChange(event.target.value.replace(/[^\d]/g, "").slice(0, 11))
                  }
                  placeholder="01XXXXXXXXX"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={11}
                  className="vpay-field font-mono tracking-wide"
                />
              </label>

              <label className="block" htmlFor="verify-trx">
                <span className="mb-1.5 flex items-center justify-between text-[10.5px] font-bold tracking-wide text-[#cfeae1]">
                  ট্রানজেকশন আইডি
                  <span className="font-medium normal-case text-[#7d9c93]">TrxID</span>
                </span>
                <input
                  id="verify-trx"
                  name="verify-trx"
                  value={transactionId}
                  onChange={(event) =>
                    onTransactionIdChange(
                      event.target.value
                        .replace(/[^A-Za-z0-9-]/g, "")
                        .toUpperCase()
                        .slice(0, 40),
                    )
                  }
                  placeholder="যেমন 9F2K7X1A"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={40}
                  className="vpay-field font-mono uppercase tracking-[0.12em]"
                />
              </label>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-2.5 flex items-start gap-2 rounded-xl border border-[#ff8f8f]/30 bg-[#3d1216]/70 px-3 py-2 text-[11px] font-semibold leading-5 text-[#ffb4ac]"
              >
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="vpay-cta mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[13px] font-extrabold tracking-wide"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" strokeWidth={2.4} />
              )}
              {submitting ? "অপেক্ষা করুন..." : "ভেরিফিকেশনের জন্য জমা দিন"}
            </button>

            {!recipient && (
              <p className="mt-2 text-center text-[10px] font-semibold text-[#ffb4ac]">
                এই অ্যাপে নম্বর সেট করা নেই — অন্য পেমেন্ট অ্যাপ বেছে নিন।
              </p>
            )}

            <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[9.5px] leading-4 text-[#7d9c93]">
              <Lock className="h-3 w-3 shrink-0" />
              অ্যাডমিন পেমেন্ট যাচাই করে অনুমোদন দেবেন। অনুমোদনের পর আবার উইথড্র অনুরোধ করুন।
            </p>
          </>
        )}

        <button
          type="button"
          onClick={onBack}
          className="vpay-section mt-3 w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-[12px] font-bold text-[#bcd8cf] transition-colors hover:border-white/20 hover:bg-white/[0.06]"
        >
          ফিরে যান
        </button>
      </div>
    </div>
  );
}
