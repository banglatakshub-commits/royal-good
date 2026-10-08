import { useEffect, useState } from "react";

type Kind = "ads" | "quiz" | "typing";

const STEPS: Record<Kind, { icon: string; title: string }[]> = {
  ads: [
    { icon: "▶️", title: "“ভিডিও শুরু করুন” চাপুন" },
    { icon: "⏱️", title: "কাউন্টডাউন শেষ পর্যন্ত এড দেখুন" },
    { icon: "🚫", title: "মাঝপথে বন্ধ করবেন না" },
    { icon: "💰", title: "রিওয়ার্ড ব্যালেন্সে যোগ হবে" },
  ],
  quiz: [
    { icon: "🚀", title: "“Start Quiz” চাপুন" },
    { icon: "❓", title: "প্রশ্ন পড়ে সঠিক উত্তর বাছুন" },
    { icon: "✅", title: "৩টি প্রশ্নের সঠিক উত্তর দিন" },
    { icon: "💰", title: "রিওয়ার্ড ব্যালেন্সে যোগ হবে" },
  ],
  typing: [
    { icon: "🚀", title: "“Start Typing” চাপুন" },
    { icon: "➕", title: "অঙ্কটি দেখে উত্তর লিখুন" },
    { icon: "✅", title: "৩টি অঙ্ক সঠিকভাবে সমাধান করুন" },
    { icon: "💰", title: "রিওয়ার্ড ব্যালেন্সে যোগ হবে" },
  ],
};

function Screen({ kind, step }: { kind: Kind; step: number }) {
  if (step === 3)
    return (
      <div className="hiw-pop flex flex-col items-center">
        <div className="text-4xl">🎉</div>
        <p className="mt-1 font-display text-2xl text-primary">+৳</p>
        <p className="text-[10px] text-muted-foreground">ব্যালেন্সে যোগ হয়েছে</p>
      </div>
    );
  if (kind === "ads") {
    if (step === 0) return <div className="hiw-tap rounded-lg header-grad px-3 py-2 text-xs font-semibold text-primary-foreground">▶ ভিডিও শুরু করুন</div>;
    return (
      <div className="w-full px-3 text-center">
        <div className="text-2xl">{step === 1 ? "📺" : "⛔"}</div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-tile">
          <div key={step} className="hiw-bar h-full bg-primary" />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">{step === 1 ? "এড চলছে…" : "আগে বন্ধ = রিওয়ার্ড নেই"}</p>
      </div>
    );
  }
  if (kind === "quiz") {
    if (step === 0) return <div className="hiw-tap rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Start Quiz</div>;
    return (
      <div className="w-full space-y-1 px-3">
        {["A", "B", "C"].map((o, i) => (
          <div key={o} className={`rounded-md border px-2 py-1 text-[10px] ${i === 1 ? "hiw-pick" : ""}`}>{o}. উত্তর</div>
        ))}
      </div>
    );
  }
  if (step === 0) return <div className="hiw-tap rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Start Typing</div>;
  return (
    <div className="text-center">
      <p className="font-display text-xl">7 <span className="text-primary">+</span> 5</p>
      <div className="mt-1 rounded-md border px-4 py-1 text-sm"><span className="hiw-type inline-block overflow-hidden whitespace-nowrap align-bottom">12</span></div>
    </div>
  );
}

export function HowItWorks({ kind }: { kind: Kind }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % 4), 2600);
    return () => clearInterval(t);
  }, []);
  const steps = STEPS[kind];
  return (
    <div className="mt-4 rounded-2xl bg-card p-4 shadow-card">
      <p className="mb-3 text-center font-display text-lg">কিভাবে কাজ করবেন</p>
      <div className="flex items-center gap-4">
        <div className="relative flex h-40 w-24 shrink-0 items-center justify-center rounded-2xl border-4 border-foreground/80 bg-background">
          <div className="absolute top-1 h-1 w-6 rounded-full bg-foreground/60" />
          <div key={step} className="hiw-fade flex w-full justify-center">
            <Screen kind={kind} step={step} />
          </div>
        </div>
        <ol className="flex-1 space-y-2">
          {steps.map((s, i) => (
            <li key={i} className={`flex items-center gap-2 rounded-lg p-1.5 text-xs transition-all duration-500 ${i === step ? "bg-tile font-semibold text-foreground scale-[1.03]" : "text-muted-foreground"}`}>
              <span className="text-base">{s.icon}</span>
              {s.title}
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {steps.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === step ? "w-5 bg-primary" : "w-1.5 bg-tile"}`} />
        ))}
      </div>
      <style>{`
        .hiw-fade{animation:hiwFade .5s ease}
        @keyframes hiwFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .hiw-tap{animation:hiwTap 1.2s ease-in-out infinite}
        @keyframes hiwTap{0%,100%{transform:scale(1)}50%{transform:scale(.9)}}
        .hiw-bar{animation:hiwBar 2.4s linear forwards;width:0}
        @keyframes hiwBar{to{width:100%}}
        .hiw-pick{animation:hiwPick 2.4s ease forwards}
        @keyframes hiwPick{0%,40%{}60%,100%{border-color:var(--color-primary);background:var(--color-primary);color:var(--color-primary-foreground)}}
        .hiw-type{animation:hiwType 1.6s steps(2) forwards;width:0}
        @keyframes hiwType{to{width:1.2em}}
        .hiw-pop{animation:hiwPop .6s cubic-bezier(.3,1.6,.5,1)}
        @keyframes hiwPop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
      `}</style>
    </div>
  );
}
