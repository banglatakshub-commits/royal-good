import { beforeEach, describe, expect, it, vi } from "vitest";
import { ad_views, players } from "../../drizzle/schema";
import { recordAdView } from "@/lib/ads.functions";
import { getDb } from "@/lib/database";
import { creditWithin } from "@/lib/balance.server";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@/lib/database", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/balance.server", () => ({ creditWithin: vi.fn() }));

class MockQuery implements PromiseLike<unknown[]> {
  constructor(private readonly result: unknown[]) {}

  from(_table: unknown) {
    return this;
  }

  where(_condition: unknown) {
    return this;
  }

  for(_mode: "update") {
    return this;
  }

  limit(_count: number) {
    return Promise.resolve(this.result);
  }

  values(_values: unknown) {
    return this;
  }

  onConflictDoNothing(_options?: unknown) {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function createMockDb(selectResults: unknown[][]) {
  let nextSelectResult = 0;
  const insertedTables: unknown[] = [];
  const tx = {
    select: () => new MockQuery(selectResults[nextSelectResult++] ?? []),
    insert: (table: unknown) => {
      insertedTables.push(table);
      return new MockQuery([]);
    },
  };
  const db = {
    transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx),
  };
  return { db, insertedTables };
}

const data = {
  tgId: "12345",
  name: "Test User",
  claimId: "00000000-0000-4000-8000-000000000001",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordAdView", () => {
  it("creates a missing profile and credits a completed ad in one transaction", async () => {
    const { db, insertedTables } = createMockDb([
      [{ blocked: false, balance: 20 }],
      [],
      [{ watched: 0 }],
      [{ daily_ads: 10, ad_reward: 5 }],
    ]);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    vi.mocked(creditWithin).mockResolvedValue(25);

    const result = await recordAdView({ data });

    expect(result).toMatchObject({ ok: true, watched: 1, limit: 10, balance: 25 });
    expect(insertedTables).toEqual([players, ad_views]);
    expect(creditWithin).toHaveBeenCalledWith(expect.anything(), "12345", 5);
  });

  it("returns an existing claim on retry without inserting another view or credit", async () => {
    const { db, insertedTables } = createMockDb([
      [{ blocked: false, balance: 25 }],
      [{ id: "already-recorded" }],
      [{ watched: 1 }],
      [{ daily_ads: 10, ad_reward: 5 }],
    ]);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    const result = await recordAdView({ data });

    expect(result).toMatchObject({
      ok: true,
      alreadyRewarded: true,
      watched: 1,
      balance: 25,
    });
    expect(insertedTables).toEqual([players]);
    expect(creditWithin).not.toHaveBeenCalled();
  });

  it("does not record or credit beyond the configured daily limit", async () => {
    const { db, insertedTables } = createMockDb([
      [{ blocked: false, balance: 20 }],
      [],
      [{ watched: 10 }],
      [{ daily_ads: 10, ad_reward: 5 }],
    ]);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

    const result = await recordAdView({ data });

    expect(result).toMatchObject({ ok: false, watched: 10, limit: 10 });
    expect(insertedTables).toEqual([players]);
    expect(creditWithin).not.toHaveBeenCalled();
  });

  it("rolls back the recorded view when the balance cannot be credited", async () => {
    const { db } = createMockDb([
      [{ blocked: false, balance: 20 }],
      [],
      [{ watched: 0 }],
      [{ daily_ads: 10, ad_reward: 5 }],
    ]);
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    vi.mocked(creditWithin).mockResolvedValue(null);

    await expect(recordAdView({ data })).rejects.toThrow("Reward could not be credited.");
  });
});
