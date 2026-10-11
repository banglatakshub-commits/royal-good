import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordReferral } from "@/lib/earn.functions";
import { getDb } from "@/lib/database";
import { creditWithin } from "@/lib/balance.server";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn() }));
vi.mock("@/lib/database", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/balance.server", () => ({ creditWithin: vi.fn() }));

const data = { tgId: "222", name: "Invitee", code: "111" };
let rows: unknown[][];
let inserted: unknown[];
let db: ReturnType<typeof mockDb>;
function mockDb() {
  const chain = {
    from: () => chain,
    where: () => chain,
    for: () => chain,
    limit: async () => rows.shift(),
    values: () => chain,
    onConflictDoNothing: () => chain,
    returning: async () => inserted,
  };
  const tx = { select: () => chain, insert: vi.fn(() => chain) };
  return { ...tx, transaction: (fn: (arg: typeof tx) => unknown) => fn(tx) };
}
beforeEach(() => {
  vi.clearAllMocks();
  rows = [
    [{ balance: 100, blocked: false }],
    [{ tg_id: "111", blocked: false }],
    [{ ref_bonus: 7 }],
  ];
  inserted = [{ referred_id: "222" }];
  db = mockDb();
  vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
  vi.mocked(creditWithin).mockResolvedValue(107);
});

describe("referral credit", () => {
  it("records and credits the configured bonus even when the invitee already earned", async () => {
    expect(await recordReferral({ data })).toEqual({ ok: true });
    expect(creditWithin).toHaveBeenCalledWith(expect.anything(), "111", 7);
  });
  it("acknowledges duplicate delivery without crediting twice", async () => {
    inserted = [];
    expect(await recordReferral({ data })).toEqual({ ok: true });
    expect(creditWithin).not.toHaveBeenCalled();
  });
  it("rejects self referrals", async () => {
    expect(await recordReferral({ data: { ...data, code: "222" } })).toEqual({ ok: false });
    expect(creditWithin).not.toHaveBeenCalled();
  });
  it("rejects blocked invitees", async () => {
    rows[0] = [{ blocked: true }];
    expect(await recordReferral({ data })).toEqual({ ok: false });
    expect(creditWithin).not.toHaveBeenCalled();
  });
  it("throws on failed credit so the transaction rolls back", async () => {
    vi.mocked(creditWithin).mockResolvedValue(null);
    await expect(recordReferral({ data })).rejects.toThrow("Referral bonus could not be credited");
  });
});
