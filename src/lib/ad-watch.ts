/** The client-side state for one rewarded-ad watch attempt. */
export type AdWatchAttempt = {
  claimId: string;
  deadline: number;
  adWatched: boolean;
  rewardClaimed: boolean;
};

function createClaimId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Older Telegram WebViews may not expose randomUUID; the UUID is an idempotency key,
  // not an authentication token, so retain a format-compatible fallback for those clients.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

/** Use an absolute deadline so timer throttling while an ad is open cannot lose elapsed time. */
export function createAdWatchAttempt(
  seconds: number,
  startedAt = Date.now(),
  claimId = createClaimId(),
): AdWatchAttempt {
  return {
    claimId,
    deadline: startedAt + Math.max(0, seconds) * 1000,
    adWatched: false,
    rewardClaimed: false,
  };
}

export function getAdWatchSecondsLeft(attempt: AdWatchAttempt, now = Date.now()): number {
  return Math.max(0, Math.ceil((attempt.deadline - now) / 1000));
}

export function markAdWatched(attempt: AdWatchAttempt): void {
  attempt.adWatched = true;
}

/** 
 * Atomically allow one client-side completion when EITHER:
 * 1. Ad network confirms completion (adWatched=true), OR
 * 2. Minimum watch time is reached (deadline passed)
 */
export function claimAdReward(attempt: AdWatchAttempt, now = Date.now()): boolean {
  if (attempt.rewardClaimed) return false;
  // Allow reward if ad network confirmed OR minimum time elapsed
  if (!attempt.adWatched && now < attempt.deadline) return false;
  attempt.rewardClaimed = true;
  return true;
}
