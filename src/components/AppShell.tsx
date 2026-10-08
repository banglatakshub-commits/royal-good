import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <div className="mx-auto min-h-screen max-w-md">
      <header className="header-grad flex items-center gap-3 px-4 py-4 text-primary-foreground">
        <button onClick={() => router.history.back()} aria-label="Back">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="font-display text-xl font-semibold">{title}</h1>
      </header>
      <main className="sheet min-h-[calc(100vh-64px)] p-4 pb-28">{children}</main>
    </div>
  );
}

export function JobIntro({
  title, desc, onStart, cta,
}: { title: string; desc: string; onStart: () => void; cta: string }) {
  return (
    <div className="rounded-2xl bg-card p-6 text-center shadow-card">
      <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-accent text-3xl">📢</div>
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      <button onClick={onStart} className="mt-5 w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground shadow-card">
        {cta}
      </button>
    </div>
  );
}

export { Link };
