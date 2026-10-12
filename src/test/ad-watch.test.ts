import { describe, expect, it } from "vitest";
import {
  claimAdReward,
  createAdWatchAttempt,
  getAdWatchSecondsLeft,
  markAdWatched,
} from "@/lib/ad-watch";

describe("rewarded ad completion", () => {
  it("awards when the timer expires before the user closes the completed ad", () => {
    const attempt = createAdWatchAttempt(10, 1_000);

    // The countdown can reach zero while the ad's close callback is still pending.
    expect(getAdWatchSecondsLeft(attempt, 11_000)).toBe(0);
    expect(claimAdReward(attempt, 11_000)).toBe(false);

    markAdWatched(attempt);
    expect(claimAdReward(attempt, 11_001)).toBe(true);
    expect(claimAdReward(attempt, 11_002)).toBe(false);
  });

  it("awards when the ad closes after the deadline even if a throttled timer did not tick", () => {
    const attempt = createAdWatchAttempt(10, 1_000);

    // The SDK callback itself checks the deadline instead of trusting a React timer flag.
    markAdWatched(attempt);
    expect(getAdWatchSecondsLeft(attempt, 11_001)).toBe(0);
    expect(claimAdReward(attempt, 11_001)).toBe(true);
  });

  it("creates a stable UUID claim ID that can safely be reused for a retry", () => {
    const attempt = createAdWatchAttempt(10, 1_000);

    expect(attempt.claimId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(createAdWatchAttempt(10, 1_000).claimId).not.toBe(attempt.claimId);
  });

  it("does not award before the required watch duration", () => {
    const attempt = createAdWatchAttempt(10, 1_000);
    markAdWatched(attempt);

    expect(getAdWatchSecondsLeft(attempt, 10_999)).toBe(1);
    expect(claimAdReward(attempt, 10_999)).toBe(false);
  });
});
