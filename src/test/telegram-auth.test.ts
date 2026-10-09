import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requireTelegramUser,
  telegramIdentityMatches,
  verifyTelegramInitData,
} from "@/lib/telegram-auth.server";

const botToken = "123456:development-test-token";

function signedInitData(user: Record<string, unknown>, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "test-query",
    user: JSON.stringify(user),
  });
  const checkString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secretKey).update(checkString).digest("hex"));
  return params.toString();
}

describe("Telegram Mini App authentication", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts valid signed initData and derives identity only from its signed user", () => {
    vi.stubEnv("TELEGRAM_API_KEY", botToken);
    vi.stubEnv("NODE_ENV", "production");
    const initData = signedInitData({
      id: 123456789,
      first_name: "Soikot",
      last_name: "Islam",
      username: "soikot",
      photo_url: "https://t.me/i/userpic/320/soikot.jpg",
    });

    const user = verifyTelegramInitData(initData);

    expect(user).toEqual({
      id: "123456789",
      username: "soikot",
      name: "Soikot Islam",
      photoUrl: "https://t.me/i/userpic/320/soikot.jpg",
      chatId: 123456789,
    });
    expect(telegramIdentityMatches(user, "123456789")).toBe(true);
    expect(telegramIdentityMatches(user, "other-user")).toBe(false);
  });

  it("rejects modified and expired initData", () => {
    vi.stubEnv("TELEGRAM_API_KEY", botToken);
    vi.stubEnv("NODE_ENV", "production");
    const current = Math.floor(Date.now() / 1000);
    const valid = new URLSearchParams(signedInitData({ id: 123456789 }, current));
    valid.set("user", JSON.stringify({ id: 987654321 }));
    expect(() => verifyTelegramInitData(valid.toString())).toThrow(/signature/i);

    const expired = signedInitData({ id: 123456789 }, current - 24 * 60 * 60 - 1);
    expect(() => verifyTelegramInitData(expired)).toThrow(/expired/i);
  });

  it("accepts unsigned identities only in explicit development/test modes", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(requireTelegramUser("", { tgId: "local-user" }).id).toBe("local-user");

    vi.stubEnv("NODE_ENV", "");
    expect(() => requireTelegramUser("", { tgId: "123456789" })).toThrow(/inside Telegram/i);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => requireTelegramUser("", { tgId: "123456789" })).toThrow(/inside Telegram/i);
  });
});
