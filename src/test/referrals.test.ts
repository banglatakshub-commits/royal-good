import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startReferralTracking } from "@/lib/referrals";
import { getTgIdentity } from "@/lib/telegram";
import { recordReferral } from "@/lib/earn.functions";

vi.mock("@/lib/telegram", () => ({ getTgIdentity: vi.fn(), getTgId: vi.fn() }));
vi.mock("@/lib/earn.functions", () => ({ recordReferral: vi.fn() }));
vi.mock("@/lib/referral.functions", () => ({ getMyReferrals: vi.fn() }));

let stop: (() => void) | undefined;
const identity = {
  initData: "signed",
  tgId: "222",
  username: "invitee",
  name: "User",
  photo: null,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/?ref=111");
  vi.mocked(getTgIdentity).mockReturnValue(identity);
  vi.mocked(recordReferral).mockResolvedValue({ ok: true });
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("referral tracking", () => {
  it("waits for Telegram authentication and retains the code across navigation", async () => {
    vi.mocked(getTgIdentity).mockReturnValue({ ...identity, initData: "" });
    stop = startReferralTracking();
    expect(recordReferral).not.toHaveBeenCalled();
    window.history.replaceState({}, "", "/refer");
    vi.mocked(getTgIdentity).mockReturnValue(identity);
    await vi.advanceTimersByTimeAsync(8000);
    expect(recordReferral).toHaveBeenCalledWith({ data: { ...identity, code: "111" } });
    await vi.advanceTimersByTimeAsync(16000);
    expect(recordReferral).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures and clears pending attribution after success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(recordReferral).mockRejectedValueOnce(new Error("offline"));
    stop = startReferralTracking();
    await vi.advanceTimersByTimeAsync(0);
    expect(sessionStorage.getItem("lg_ref_pending_222")).toBe("111");
    await vi.advanceTimersByTimeAsync(8000);
    expect(recordReferral).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem("lg_ref_pending_222")).toBeNull();
  });

  it("works when webview storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    stop = startReferralTracking();
    await vi.advanceTimersByTimeAsync(0);
    expect(recordReferral).toHaveBeenCalledTimes(1);
  });

  it("accepts Telegram's launch query parameter", async () => {
    window.history.replaceState({}, "", "/?tgWebAppStartParam=333");
    stop = startReferralTracking();
    await vi.advanceTimersByTimeAsync(0);
    expect(recordReferral).toHaveBeenCalledWith({ data: { ...identity, code: "333" } });
  });

  it("does not record self referrals and stops retries on unmount", async () => {
    window.history.replaceState({}, "", "/?ref=222");
    stop = startReferralTracking();
    await vi.advanceTimersByTimeAsync(8000);
    expect(recordReferral).not.toHaveBeenCalled();
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
