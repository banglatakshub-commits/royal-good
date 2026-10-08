import { useEffect } from "react";
import { Crown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CinematicIntro({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(onComplete, reducedMotion ? 700 : 2800);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onComplete();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onComplete]);

  return (
    <div className="royal-intro" role="dialog" aria-modal="true" aria-label="Royal Good">
      <div className="royal-intro-frame" aria-hidden="true" />
      <div className="royal-intro-brand">
        <Crown className="royal-intro-crown" aria-hidden="true" strokeWidth={1.2} />
        <div className="royal-intro-rule" aria-hidden="true" />
        <h1 className="royal-intro-title font-display">Royal Good</h1>
        <div className="royal-intro-rule royal-intro-rule-bottom" aria-hidden="true" />
      </div>
      <Button autoFocus variant="ghost" onClick={onComplete} className="royal-intro-skip">
        এগিয়ে যান <ArrowRight />
      </Button>
    </div>
  );
}