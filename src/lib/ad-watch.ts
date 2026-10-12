/** The client-side state for one rewarded-ad watch attempt. */
export type AdWatchAttempt = {
  deadline: number;
  adWatched: boolean;
  rewardClaimed: boolean;
};

/** Use an absolute deadline so timer throttling while an ad is open cannot lose elapsed time. */
export function createAdWatchAttempt(seconds: number, startedAt = Date.now()): AdWatchAttempt {
  return {
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

/** Atomically allow one client-side completion only after both conditions are met. */
export function claimAdReward(attempt: AdWatchAttempt, now = Date.now()): boolean {
  if (attempt.rewardClaimed || !attempt.adWatched || now < attempt.deadline) return false;
  attempt.rewardClaimed = true;
  return true;
}
