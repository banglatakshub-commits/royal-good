import { HowItWorks } from "@/components/HowItWorks";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { PageShell, JobIntro } from "@/components/AppShell";
import { RewardDone } from "@/components/RewardDone";
import { useJobLimit, LimitInfo } from "@/components/JobLimit";

export const Route = createFileRoute("/typing")({
  head: () => ({
    meta: [
      { title: "Typing Job — Life Good" },
      { name: "description", content: "৩টি অংক সঠিকভাবে সমাধান করে পুরস্কার জিতুন।" },
      { property: "og:title", content: "Typing Job — Life Good" },
      { property: "og:description", content: "৩টি অংক সমাধান করে আয় করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Typing,
});

const rnd = () => Math.floor(Math.random() * 10);
const make = () => Array.from({ length: 3 }, () => [rnd(), rnd()] as const);

function Typing() {
  const [started, setStarted] = useState(false);
  const [qs] = useState(make);
  const [i, setI] = useState(0);
  const [ans, setAns] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [done, setDone] = useState(false);
  const job = useJobLimit("typing");
  const finish = async () => {
    if (await job.record()) setDone(true);
    else setStarted(false);
  };

  const [a, b] = qs[Math.min(i, 2)] ?? [0, 0];
  const last = i === 2;

  const next = async () => {
    if (busy) return;
    if (Number(ans) !== a + b) {
      setErr(true);
      return;
    }
    setErr(false);
    setBusy(true);
    setAns("");
    try {
      if (last) await finish();
      else setI(i + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title={!started ? "Typing Job" : done ? "Typing Complete" : `Typing ${i + 1}/3`}>
      {!started ? (
        <>
          <LimitInfo st={job.st} left={job.left} />
          {job.left !== 0 && (
            <JobIntro
              title="Typing Job"
              desc="Solve 3 math problems correctly and earn rewards! Test your skills and get paid."
              cta="Start Typing"
              onStart={() => setStarted(true)}
            />
          )}
          <HowItWorks kind="typing" />
        </>
      ) : done ? (
        <RewardDone text="You solved all 3 problems correctly!" score="3/3" />
      ) : (
        <div className="rounded-2xl bg-card p-4 shadow-card">
          <div className="mb-4 h-2 rounded-full bg-secondary">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${((i + 1) / 3) * 100}%` }}
            />
          </div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tile font-semibold text-primary">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">Typing {i + 1}</p>
                <p className="text-xs text-muted-foreground">{i} completed</p>
              </div>
            </div>
            {i > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">
                <CheckCircle2 className="h-3 w-3" /> {i} Done
              </span>
            )}
          </div>
          <div className="rounded-xl border bg-accent p-4 text-center">
            <p className="font-display text-4xl font-bold">
              {a} <span className="text-primary">+</span> {b}
            </p>
            <p className="mt-2 border-t pt-2 text-2xl font-bold text-muted-foreground">?</p>
          </div>
          <label className="mt-4 block text-sm font-medium">Your Answer</label>
          <input
            inputMode="numeric"
            value={ans}
            onChange={(e) => {
              setAns(e.target.value.replace(/\D/g, ""));
              setErr(false);
            }}
            placeholder="Enter answer"
            className="mt-1 w-full rounded-xl border bg-card py-3 text-center text-lg outline-none focus:border-primary"
          />
          {err && <p className="mt-2 text-sm text-destructive">ভুল উত্তর! আবার চেষ্টা করুন।</p>}
          <button
            disabled={!ans || busy}
            onClick={next}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Processing...
              </>
            ) : (
              <>
                {last ? "Submit Typing" : "Next Typing"} <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      )}
    </PageShell>
  );
}
