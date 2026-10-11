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
  return `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(myRefCode())}`;
}

function incomingRefCode(): string | null {
  if (typeof window === "undefined") return null;
  const startParam = (
    window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } } }
  ).Telegram?.WebApp?.initDataUnsafe?.start_param;
  const query = new URLSearchParams(window.location.search);
  return startParam || query.get("tgWebAppStartParam") || query.get("ref") || null;
}

/** Retry until acknowledged; uniqueness and crediting are enforced by PostgreSQL. */
export function startReferralTracking() {
  let code = incomingRefCode();
  let stopped = false;
  let busy = false;
  let complete = false;

  const attempt = async () => {
    if (stopped || busy || complete) return;
    code ||= incomingRefCode();
    const identity = getTgIdentity();
    // Never submit the preview identity while the Telegram SDK is still loading.
    if (!identity.initData) return;
    const key = `lg_ref_pending_${identity.tgId}`;
    try {
      code ||= sessionStorage.getItem(key);
      if (code) sessionStorage.setItem(key, code);
    } catch {
      // Storage can be disabled in Telegram's webview; keep the code in memory.
    }
    if (!code) return;
    if (
      code === identity.tgId ||
      (identity.username && code.toLowerCase() === identity.username.toLowerCase())
    ) {
      complete = true;
      return;
    }
    busy = true;
    try {
      const result = await recordReferral({ data: { ...identity, code } });
      if (result.ok) {
        complete = true;
        try {
          sessionStorage.removeItem(key);
        } catch {
          // A repeated request is safe even if storage is unavailable.
        }
      }
    } catch (error) {
      console.error("Referral recording error:", error);
    } finally {
      busy = false;
    }
  };

  void attempt();
  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible") void attempt();
  }, 8000);
  const onFocus = () => void attempt();
  window.addEventListener("focus", onFocus);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener("focus", onFocus);
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
