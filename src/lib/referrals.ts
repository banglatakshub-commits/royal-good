import { useQuery } from "@tanstack/react-query";
import { getTgIdentity, getTgId } from "@/lib/telegram";
import { getMyReferrals } from "@/lib/referral.functions";
import { recordReferral } from "@/lib/earn.functions";

export const REF_BONUS = 5;
export const BOT_USERNAME = "Royal_goodbot";

export interface ReferralRow {
  referred_id: string;
  referred_name: string | null;
  photo_url: string | null;
  created_at: string;
}

export function myRefCode() {
  return getTgId();
}

export function myRefLink() {
  // ?startapp= launches the Mini App directly and ALWAYS passes start_param — including for accounts
  // that already started the bot before (for those, a ?start= link sends no /start to the webhook, so
  // the referral never records — confirmed via live data). startReferralTracking reads start_param
  // on app open and records the referral client-side. Needs the bot's Main Mini App enabled in BotFather.
  return `https://t.me/${BOT_USERNAME}?startapp=${encodeURIComponent(myRefCode())}`;
}

function incomingRefCode(): string | null {
  if (typeof window === "undefined") return null;
  const startParam = (
    window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } } }
  ).Telegram?.WebApp?.initDataUnsafe?.start_param;
  const params = new URLSearchParams(window.location.search);
  const queryCode = params.get("ref") || params.get("tgWebAppStartParam");
  return startParam || queryCode || null;
}

const RETRY_MS = 2000;

function readPending(tgId: string): string | null {
  try {
    return sessionStorage.getItem(`lg_ref_pending_${tgId}`);
  } catch {
    return null;
  }
}
function writePending(tgId: string, code: string) {
  try {
    sessionStorage.setItem(`lg_ref_pending_${tgId}`, code);
  } catch {
    /* webview storage may be unavailable */
  }
}
function clearPending(tgId: string) {
  try {
    sessionStorage.removeItem(`lg_ref_pending_${tgId}`);
  } catch {
    /* ignore */
  }
}

/**
 * Starts recording the incoming Telegram referral code. Captures the code as soon as it appears
 * (the URL may change afterwards), waits for Telegram auth (initData) to be ready, then records it —
 * retrying transient failures. The code is retained in sessionStorage so it survives navigation.
 * PostgreSQL's unique constraint on referred_id prevents any double credit. Returns a stop function.
 */
export function startReferralTracking(): () => void {
  let stopped = false;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let code: string | null = null;

  const schedule = () => {
    if (!stopped && !done) timer = setTimeout(tick, RETRY_MS);
  };

  function tick() {
    if (stopped || done) return;
    const identity = getTgIdentity();

    // Capture the referral code the first time we see it (from URL or a saved pending value).
    if (!code) {
      code = incomingRefCode();
      if (!code && identity.tgId) code = readPending(identity.tgId);
    }
    if (code && identity.tgId) writePending(identity.tgId, code);

    // Wait until both a referral code and Telegram auth (initData) are available.
    if (!code || !identity.tgId || !identity.initData) {
      schedule();
      return;
    }

    // Never record a self-referral.
    if (
      code === identity.tgId ||
      (identity.username && code.toLowerCase() === identity.username.toLowerCase())
    ) {
      done = true;
      clearPending(identity.tgId);
      return;
    }

    recordReferral({ data: { ...identity, code } })
      .then((result) => {
        if (result?.ok) {
          done = true;
          clearPending(identity.tgId);
        } else {
          schedule();
        }
      })
      .catch((error) => {
        console.error("Referral recording error:", error);
        schedule();
      });
  }

  tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

export function useReferrals() {
  const identity = getTgIdentity();
  const { data = [] } = useQuery({
    queryKey: ["my-referrals", identity.tgId],
    queryFn: async () => getMyReferrals({ data: identity }),
    refetchInterval: 8000,
  });
  return data;
}
