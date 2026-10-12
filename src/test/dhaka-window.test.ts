import { describe, expect, it } from "vitest";
import { getDhakaNoonWindow } from "@/lib/dhaka-window";

describe("Bangladesh earning-day window", () => {
  it("keeps the previous window open until noon in Dhaka", () => {
    const { since, resetAt } = getDhakaNoonWindow(new Date("2026-10-09T05:59:59.000Z").getTime());

    expect(since.toISOString()).toBe("2026-10-08T06:00:00.000Z");
    expect(resetAt.toISOString()).toBe("2026-10-09T06:00:00.000Z");
  });

  it("starts a new window at exactly noon in Dhaka", () => {
    const { since, resetAt } = getDhakaNoonWindow(new Date("2026-10-09T06:00:00.000Z").getTime());

    expect(since.toISOString()).toBe("2026-10-09T06:00:00.000Z");
    expect(resetAt.toISOString()).toBe("2026-10-10T06:00:00.000Z");
  });
});
