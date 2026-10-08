import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { refreshBalance, useBalance } from "@/lib/wallet";
import { settings } from "@/lib/settings";

export function RewardDone({ text, score, amount }: { text: string; score: string; amount?: number }) {
  const credited = useRef(false);
  const balance = useBalance();
  const [amt] = useState(amount ?? settings.task_reward);
  useEffect(() => {
    if (credited.current) return;
    credited.current = true;
    void refreshBalance();
  }, []);
  return (
    <div className="rounded-2xl bg-card p-6 text-center shadow-card">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-soft">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success text-primary-foreground">
          <Check className="h-7 w-7" strokeWidth={3} />
        </div>
      </div>
      <h2 className="mt-4 font-display text-2xl font-bold">Congratulations!</h2>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      <p className="mt-4 font-semibold">Score: {score}</p>
      <p className="mt-3 font-display text-xl text-primary">+৳{amt} ব্যালেন্সে যোগ হয়েছে!</p>
      <p className="text-sm text-muted-foreground">বর্তমান ব্যালেন্স: ৳{balance}</p>
      <Link
        to="/"
        className="mt-5 flex w-full items-center justify-center rounded-xl bg-primary py-3 font-semibold text-primary-foreground"
      >
        হোমে ফিরে যান
      </Link>
    </div>
  );
}
