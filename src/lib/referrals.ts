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
  // startapp opens the Mini App directly and always passes start_param — even for users who
  // already started the bot before. (The old ?start= link only re-sent the code to brand-new
  // users, so returning users were never counted.) Needs the bot's Main Mini App enabled in BotFather.
  return `https://t.me/${BOT_USERNAME}?startapp=${encodeURIComponent(myRefCode())}`;
}

function incomingRefCode(): string | null {
  if (typeof window === "undefined") return null;
  const startParam = (
    window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } } }
  ).Telegram?.WebApp?.initDataUnsafe?.start_param;
  const queryCode = new URLSearchParams(window.location.search).get("ref");
  return startParam || queryCode || null;
}

/**
 * Record the incoming Telegram referral code. Retries briefly because Telegram's initData /
 * start_param may not be ready the instant the app mounts. PostgreSQL's unique constraint on
 * referred_id stops any double credit, so no local dedup flag is kept — which also means
 * delete-and-retry testing works.
 */
export async function recordIncomingReferral() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const identity = getTgIdentity();
    const code = incomingRefCode();
    if (identity.tgId && code) {
      if (
        code === identity.tgId ||
        (identity.username && code.toLowerCase() === identity.username.toLowerCase())
      )
        return;
      try {
        await recordReferral({ data: { ...identity, code } });
      } catch (error) {
        console.error("Referral recording error:", error);
      }
      return;
    }
    // No referral code present at all — give the WebApp a moment, then stop.
    if (!code && attempt > 2) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
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
