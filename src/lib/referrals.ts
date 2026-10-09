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
  const queryCode = new URLSearchParams(window.location.search).get("ref");
  return startParam || queryCode || null;
}

/** Record the incoming Telegram start parameter once; PostgreSQL enforces uniqueness too. */
export async function recordIncomingReferral() {
  const code = incomingRefCode();
  if (!code) return;
  const identity = getTgIdentity();
  if (
    code === identity.tgId ||
    (identity.username && code.toLowerCase() === identity.username.toLowerCase())
  )
    return;

  const key = `lg_ref_done_${identity.tgId}_${code}`;
  if (localStorage.getItem(key)) return;
  try {
    const result = await recordReferral({ data: { ...identity, code } });
    if (result.ok && typeof localStorage !== "undefined") localStorage.setItem(key, "1");
  } catch (error) {
    console.error("Referral recording error:", error);
  }
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
