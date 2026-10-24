import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminRejectAllWithdrawals } from "@/lib/admin.functions";
import { getDb } from "@/lib/database";
import { creditWithin } from "@/lib/balance.server";
import { requireTelegramUser } from "@/lib/telegram-auth.server";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (parse: (data: unknown) => unknown) => ({
      handler: (fn: (arg: unknown) => unknown) => async (arg: { data: unknown }) =>
        fn({ data: parse(arg.data) }),
    }),
  }),
}));
vi.mock("@/lib/database", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/balance.server", () => ({ creditWithin: vi.fn() }));
vi.mock("@/lib/telegram-auth.server", () => ({
  requireTelegramUser: vi.fn(),
  telegramIdentityMatches: () => true,
}));

const data = { tgId: "123", reason: "  Incorrect details  " };
let rejected: { tg_id: string; amount: number }[];
let update: ReturnType<typeof vi.fn>;
let set: ReturnType<typeof vi.fn>;
let transaction: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTelegramUser).mockReturnValue({
    id: "123",
    username: null,
    name: "Admin",
    photoUrl: null,
    chatId: 123,
  });
  vi.mocked(creditWithin).mockResolvedValue(100);
  rejected = [
    { tg_id: "2", amount: 10 },
    { tg_id: "1", amount: 20 },
    { tg_id: "2", amount: 30 },
  ];
  const chain = {
    set: vi.fn(() => chain),
    where: () => chain,
    returning: async () => rejected,
  };
  set = chain.set;
  update = vi.fn(() => chain);
  const tx = { update };
  transaction = vi.fn((fn: (value: typeof tx) => unknown) => fn(tx));
  vi.mocked(getDb).mockReturnValue({
    select: () => ({ from: async () => [{ tg_id: "123" }] }),
    transaction,
  } as unknown as ReturnType<typeof getDb>);
});

describe("admin bulk rejection", () => {
  it("saves the shared trimmed note and refunds each user's total once", async () => {
    expect(await adminRejectAllWithdrawals({ data })).toEqual({ ok: true, rejected: 3 });
    expect(set).toHaveBeenCalledWith({ status: "rejected", note: "Incorrect details" });
    expect(creditWithin).toHaveBeenCalledTimes(2);
    expect(creditWithin).toHaveBeenNthCalledWith(1, expect.anything(), "1", 20);
    expect(creditWithin).toHaveBeenNthCalledWith(2, expect.anything(), "2", 40);
  });
  it("does not refund again when no pending rows remain", async () => {
    rejected = [];
    expect(await adminRejectAllWithdrawals({ data })).toEqual({ ok: true, rejected: 0 });
    expect(creditWithin).not.toHaveBeenCalled();
  });
  it("throws to roll back the transaction if a refund fails", async () => {
    vi.mocked(creditWithin).mockResolvedValue(null);
    await expect(adminRejectAllWithdrawals({ data })).rejects.toThrow("refund");
  });
  it("requires a nonblank note", async () => {
    await expect(adminRejectAllWithdrawals({ data: { ...data, reason: "  " } })).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
  it("refuses non-admin callers", async () => {
    vi.mocked(requireTelegramUser).mockReturnValue({
      id: "999",
      username: null,
      name: "Other",
      photoUrl: null,
      chatId: 999,
    });
    await expect(adminRejectAllWithdrawals({ data })).rejects.toThrow("Forbidden");
    expect(update).not.toHaveBeenCalled();
  });
});
