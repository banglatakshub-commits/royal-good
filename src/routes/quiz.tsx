import { HowItWorks } from "@/components/HowItWorks";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { XCircle } from "lucide-react";
import { PageShell, JobIntro } from "@/components/AppShell";
import { RewardDone } from "@/components/RewardDone";
import { useJobLimit, LimitInfo } from "@/components/JobLimit";

export const Route = createFileRoute("/quiz")({
  head: () => ({
    meta: [
      { title: "Quiz Job — Life Good" },
      { name: "description", content: "৩টি প্রশ্নের সঠিক উত্তর দিয়ে পুরস্কার জিতুন।" },
      { property: "og:title", content: "Quiz Job — Life Good" },
      { property: "og:description", content: "কুইজ খেলে আয় করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Quiz,
});

type Q = { q: string; o: string[]; c: number };

const QUESTIONS: Q[] = [
  { q: "নবী করিম (সা.) এর জন্ম তারিখ কত?", o: ["১২ রবিউল আউয়াল", "১৭ রমজান", "১০ মহররম", "১৫ শাবান"], c: 0 },
  { q: "আসহাবে কাহফ কত বছর ঘুমিয়েছিলেন?", o: ["২০০ বছর", "৩০০ বছর", "৩০৯ বছর", "৪০০ বছর"], c: 2 },
  { q: "কুরআন শরীফে মোট কতটি সূরা আছে?", o: ["১১৪টি", "১২০টি", "১০০টি", "১১২টি"], c: 0 },
  { q: "ইসলামের প্রথম ক্বিবলা কোনটি ছিল?", o: ["কাবা শরীফ", "বাইতুল মুকাদ্দাস", "মসজিদে নববী", "মসজিদুল আকসা"], c: 1 },
  { q: "কুরআনের সবচেয়ে বড় সূরা কোনটি?", o: ["সূরা ইয়াসিন", "সূরা আল-ইমরান", "সূরা বাকারা", "সূরা নিসা"], c: 2 },
  { q: "প্রথম ওহী কোন গুহায় নাজিল হয়েছিল?", o: ["সাওর গুহা", "হেরা গুহা", "উহুদ পাহাড়", "আরাফাত ময়দান"], c: 1 },
  { q: "ইসলামের স্তম্ভ কয়টি?", o: ["৪টি", "৫টি", "৬টি", "৭টি"], c: 1 },
  { q: "কোন নবীকে 'কালিমুল্লাহ' বলা হয়?", o: ["হযরত ঈসা (আ.)", "হযরত মূসা (আ.)", "হযরত ইব্রাহিম (আ.)", "হযরত নূহ (আ.)"], c: 1 },
  { q: "পবিত্র কুরআন কত বছরে নাজিল হয়েছে?", o: ["১০ বছরে", "২০ বছরে", "২৩ বছরে", "৪০ বছরে"], c: 2 },
  { q: "জান্নাতের দরজা কয়টি?", o: ["৭টি", "৮টি", "৯টি", "১০টি"], c: 1 },
  { q: "কোন মাসে রোজা ফরজ?", o: ["শাওয়াল", "রজব", "রমজান", "শাবান"], c: 2 },
  { q: "প্রথম মুয়াজ্জিন কে ছিলেন?", o: ["হযরত উমর (রা.)", "হযরত বিলাল (রা.)", "হযরত আলী (রা.)", "হযরত আবু বকর (রা.)"], c: 1 },
  { q: "বদরের যুদ্ধ কোন হিজরিতে হয়েছিল?", o: ["১ হিজরি", "২ হিজরি", "৩ হিজরি", "৫ হিজরি"], c: 1 },
  { q: "সূরা ফাতিহাকে কী বলা হয়?", o: ["কুরআনের হৃদয়", "কুরআনের মা", "কুরআনের রাজা", "কুরআনের চাবি"], c: 1 },
  { q: "হযরত মুহাম্মদ (সা.) এর পিতার নাম কী?", o: ["আবু তালিব", "আব্দুল্লাহ", "আব্দুল মুত্তালিব", "হামজা"], c: 1 },
];

const PICK = 3;

function pickQuestions(): Q[] {
  const pool = [...QUESTIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, PICK);
}

function Quiz() {
  const [started, setStarted] = useState(false);
  const [qs, setQs] = useState<Q[]>([]);
  const [i, setI] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [wrong, setWrong] = useState(false);
  const [done, setDone] = useState(false);
  const job = useJobLimit("quiz");
  const finish = async () => { if (await job.record()) setDone(true); else setStarted(false); };
  const q = qs[i];
  const last = i === qs.length - 1;

  const start = () => {
    setQs(pickQuestions());
    setI(0); setSel(null); setWrong(false); setDone(false);
    setStarted(true);
  };

  const next = () => {
    if (!q) return;
    if (sel !== q.c) { setWrong(true); return; }
    setWrong(false); setSel(null);
    if (last) void finish(); else setI(i + 1);
  };

  return (
    <PageShell title={!started ? "Quiz Job" : done ? "Quiz Complete" : `Question ${i + 1}/${PICK}`}>
      {!started ? (
        <>
        <LimitInfo st={job.st} left={job.left} />
        {job.left !== 0 && <JobIntro title="Quiz Job" desc="Answer 3 questions correctly and earn rewards! Test your knowledge and get paid." cta="Start Quiz" onStart={start} />}
        <HowItWorks kind="quiz" />
        </>
      ) : done ? (
        <RewardDone text="You answered all 3 questions correctly!" score="3/3" />
      ) : q ? (
        <div className="space-y-4">
          <div className="h-2 rounded-full bg-card">
            <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${((i + 1) / PICK) * 100}%` }} />
          </div>
          <div className="rounded-2xl bg-card p-4 shadow-card">
            <h2 className="mb-4 text-lg font-bold">{q.q}</h2>
            {wrong && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-tile-4 p-3 text-sm text-destructive">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> Wrong answer! Please select another option and try again.
              </div>
            )}
            <div className="space-y-3">
              {q.o.map((opt, idx) => {
                const active = sel === idx;
                return (
                  <button
                    key={opt}
                    onClick={() => { setSel(idx); setWrong(false); }}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${active ? "border-primary bg-tile" : "bg-card"}`}
                  >
                    <span className={`h-5 w-5 rounded-full border-2 ${active ? "border-primary bg-primary" : "border-muted-foreground/40"}`} />
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            disabled={sel === null}
            onClick={next}
            className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground"
          >
            {last ? "Submit Quiz" : "Next Question"}
          </button>
        </div>
      ) : null}
    </PageShell>
  );
}
