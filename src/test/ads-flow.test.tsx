import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  page: null as null | ComponentType,
  getAdStatus: vi.fn(async (..._args: unknown[]) => ({
    watched: 0,
    limit: 10,
    resetAt: "2026-10-12T06:00:00.000Z",
  })),
  recordAdView: vi.fn(async (..._args: unknown[]) => ({
    ok: true,
    watched: 1,
    limit: 10,
    resetAt: "2026-10-12T06:00:00.000Z",
    balance: 25,
    alreadyRewarded: false,
  })),
  showGiga: vi.fn(async () => {}),
  setServerBalance: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    h.page = options.component;
    return {};
  },
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@/components/AppShell", () => ({
  PageShell: ({ children }: { title: string; children: ReactNode }) => <main>{children}</main>,
  JobIntro: ({ onStart, cta }: { onStart: () => void; cta: string }) => (
    <button onClick={onStart}>{cta}</button>
  ),
}));

vi.mock("@/components/HowItWorks", () => ({ HowItWorks: () => null }));
vi.mock("@/components/RewardDone", () => ({
  RewardDone: ({ text }: { text: string }) => <div data-testid="reward-done">{text}</div>,
}));
vi.mock("@/lib/settings", () => ({
  settings: { daily_ads: 10, ad_reward: 5, ad_seconds: 10, ads_script_id: "8594" },
  loadSettings: async () => ({
    daily_ads: 10,
    ad_reward: 5,
    ad_seconds: 10,
    ads_script_id: "8594",
  }),
}));
vi.mock("@/lib/ads.functions", () => ({
  getAdStatus: h.getAdStatus,
  recordAdView: h.recordAdView,
}));
vi.mock("@/lib/telegram", () => ({
  getTgIdentity: () => ({
    initData: "signed-telegram-init-data",
    tgId: "12345",
    name: "Tester",
    username: "tester",
    photo: null,
  }),
}));
vi.mock("@/lib/wallet", () => ({ setServerBalance: h.setServerBalance }));

async function flushMicrotasks() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

async function renderAdsPage() {
  if (!h.page) await import("@/routes/ads");
  const Page = h.page;
  if (!Page) throw new Error("The ads route did not register its page component");
  await act(async () => {
    render(<Page />);
    await flushMicrotasks();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T05:00:00.000Z"));
  h.getAdStatus.mockResolvedValue({
    watched: 0,
    limit: 10,
    resetAt: "2026-10-12T06:00:00.000Z",
  });
  h.recordAdView.mockResolvedValue({
    ok: true,
    watched: 1,
    limit: 10,
    resetAt: "2026-10-12T06:00:00.000Z",
    balance: 25,
    alreadyRewarded: false,
  });
  h.showGiga.mockResolvedValue(undefined);
  Object.defineProperty(window, "Telegram", {
    configurable: true,
    value: { WebApp: { initData: "signed-telegram-init-data" } },
  });
  Object.defineProperty(window, "showGiga", {
    configurable: true,
    value: h.showGiga,
  });
});

afterEach(() => {
  vi.useRealTimers();
  document.getElementById("gigapub-script")?.remove();
  Reflect.deleteProperty(window, "Telegram");
  Reflect.deleteProperty(window, "showGiga");
});

describe("Ads Video reward flow", () => {
  it("keeps a successful ad completion and claims after the configured minimum watch time", async () => {
    let completeAd!: () => void;
    const adCompleted = new Promise<void>((resolve) => {
      completeAd = resolve;
    });
    h.showGiga.mockReturnValue(adCompleted);

    await renderAdsPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ভিডিও শুরু করুন" }));
      await flushMicrotasks();
    });
    expect(screen.getByText("এড দেখছেন…")).toBeInTheDocument();

    // GigaPub confirms the ad before the app's configured 10-second minimum elapses.
    await act(async () => {
      completeAd();
      await adCompleted;
      await flushMicrotasks();
    });
    expect(screen.getByText("এড দেখছেন…")).toBeInTheDocument();
    expect(h.recordAdView).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await flushMicrotasks();
    });

    expect(h.recordAdView).toHaveBeenCalledTimes(1);
    expect(h.recordAdView).toHaveBeenCalledWith({
      data: expect.objectContaining({ tgId: "12345", claimId: expect.any(String) }),
    });
    expect(h.setServerBalance).toHaveBeenCalledWith(25);
    expect(screen.getByTestId("reward-done")).toHaveTextContent("ভিডিও দেখা সম্পন্ন!");
  });

  it("does not open an ad if the Telegram session cannot be verified first", async () => {
    h.getAdStatus.mockRejectedValue(new Error("Telegram authentication is required."));

    await renderAdsPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ভিডিও শুরু করুন" }));
      await flushMicrotasks();
    });

    expect(screen.getByText("Telegram সেশন যাচাই হয়নি")).toBeInTheDocument();
    expect(h.showGiga).not.toHaveBeenCalled();
    expect(h.recordAdView).not.toHaveBeenCalled();
  });
});
