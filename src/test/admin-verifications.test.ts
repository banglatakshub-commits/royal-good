import { beforeEach, describe, expect, it, vi } from "vitest";
import { Param, type SQL } from "drizzle-orm";
import { adminListVerifications, adminReviewVerification } from "@/lib/admin.functions";
import { getDb } from "@/lib/database";
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

const identity = { tgId: "123" };

/** Values bound as parameters inside a drizzle `where(...)` condition. */
function boundValues(condition: unknown): unknown[] {
  return ((condition as SQL).queryChunks as unknown as object[])
    .filter((chunk): chunk is Param => chunk instanceof Param)
    .map((param) => param.value);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTelegramUser).mockReturnValue({
    id: "123",
    username: null,
    name: "Admin",
    photoUrl: null,
    chatId: 123,
  });
});

describe("admin verification queue", () => {
  it("only lists pending requests, so a reviewed one drops out of the tab", async () => {
    const rows = [{ request: { id: "r1", status: "pending" }, name: "Rahim", username: null }];
    const chain = {
      leftJoin: vi.fn(() => chain),
      where: vi.fn((_condition: unknown) => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(rows)),
    };
    let selects = 0;
    vi.mocked(getDb).mockReturnValue({
      select: () => {
        selects += 1;
        // First select is the admin allowlist lookup inside assertTgAdmin.
        return selects === 1 ? { from: async () => [{ tg_id: "123" }] } : { from: () => chain };
      },
    } as unknown as ReturnType<typeof getDb>);

    expect(await adminListVerifications({ data: identity })).toEqual(rows);
    expect(selects).toBe(2);
    expect(chain.where).toHaveBeenCalledTimes(1);
    expect(boundValues(chain.where.mock.calls[0]?.[0])).toContain("pending");
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(500);
  });

  it.each(["success", "rejected"] as const)(
    "marks a %s request non-pending instead of leaving it in the queue",
    async (decision) => {
      const request = { id: "r1", tg_id: "user-1", status: "pending" };
      const chain = {
        set: vi.fn(() => chain),
        where: vi.fn(() => chain),
        returning: vi
          .fn()
          .mockResolvedValueOnce([request])
          .mockResolvedValueOnce([{ tg_id: "user-1" }]),
      };
      const tx = { update: vi.fn(() => chain), delete: vi.fn() };
      let selects = 0;
      vi.mocked(getDb).mockReturnValue({
        select: () => {
          selects += 1;
          return { from: async () => [{ tg_id: "123" }] };
        },
        transaction: vi.fn((fn: (value: typeof tx) => unknown) => fn(tx)),
      } as unknown as ReturnType<typeof getDb>);

      expect(await adminReviewVerification({ data: { ...identity, id: "r1", decision } })).toEqual({
        ok: true,
      });
      expect(selects).toBe(1);
      expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ status: decision }));
      expect(tx.delete).not.toHaveBeenCalled();
    },
  );
});
