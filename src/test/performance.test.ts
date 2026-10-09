import { describe, expect, it } from "vitest";
import { getRouter } from "@/router";

describe("Performance defaults", () => {
  it("reuses briefly cached reads and preloads navigation intent", () => {
    const router = getRouter();
    const options = router.options.context?.queryClient.getDefaultOptions().queries;
    expect(options?.staleTime).toBe(20_000);
    expect(options?.refetchOnWindowFocus).toBe(false);
    expect(options?.retry).toBe(1);
    expect(router.options.defaultPreload).toBe("intent");
  });
});
