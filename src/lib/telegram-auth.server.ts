import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: string;
  username: string | null;
  name: string;
  photoUrl: string | null;
  chatId: number | null;
};

type DevelopmentIdentity = {
  tgId?: string | undefined;
  username?: string | null | undefined;
  name?: string | undefined;
  photoUrl?: string | null | undefined;
};

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/** Verify Telegram Mini App initData and return its signed user identity. */
export function verifyTelegramInitData(initData: string): TelegramUser {
  const botToken = process.env["TELEGRAM_API_KEY"]?.trim();
  if (!botToken) {
    throw new Error("TELEGRAM_API_KEY is required to verify Telegram Mini App requests.");
  }
  if (!initData || initData.length > 8192) {
    throw new Error("Telegram authentication is required.");
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error("Invalid Telegram authentication data.");
  }

  const checkString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(checkString).digest();
  const actualHash = Buffer.from(receivedHash, "hex");
  if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
    throw new Error("Invalid Telegram authentication signature.");
  }

  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(authDate) ||
    authDate > now + 60 ||
    now - authDate > MAX_AUTH_AGE_SECONDS
  ) {
    throw new Error("Telegram authentication data has expired. Reopen the app in Telegram.");
  }

  let rawUser: unknown;
  try {
    rawUser = JSON.parse(params.get("user") ?? "null");
  } catch {
    throw new Error("Invalid Telegram user data.");
  }
  if (!rawUser || typeof rawUser !== "object" || !("id" in rawUser)) {
    throw new Error("Telegram user data is missing.");
  }

  const user = rawUser as {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  };
  if (!Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new Error("Invalid Telegram user ID.");
  }
  const id = String(user.id);
  const username =
    typeof user.username === "string" && user.username.length > 0 ? user.username : null;
  const name =
    [user.first_name, user.last_name]
      .filter((part) => typeof part === "string" && part.length > 0)
      .join(" ") || "User";
  const photoUrl =
    typeof user.photo_url === "string" && user.photo_url.length > 0 ? user.photo_url : null;

  return { id, username, name, photoUrl, chatId: user.id };
}

/**
 * Return the authenticated user. Unsigned fallback identities are deliberately
 * allowed only in non-production environments to keep local browser previews useful.
 */
export function requireTelegramUser(
  initData?: string | null,
  fallback?: DevelopmentIdentity,
): TelegramUser {
  if (initData) return verifyTelegramInitData(initData);

  if (process.env["NODE_ENV"] !== "development" && process.env["NODE_ENV"] !== "test") {
    throw new Error("Open this app inside Telegram to continue.");
  }

  const id = fallback?.tgId?.trim();
  if (!id) throw new Error("Telegram user ID is missing.");
  const chatId = /^\d+$/.test(id) ? Number(id) : null;
  return {
    id,
    username: fallback?.username?.trim() || null,
    name: fallback?.name?.trim() || "Development User",
    photoUrl: fallback?.photoUrl ?? null,
    chatId: chatId !== null && Number.isSafeInteger(chatId) ? chatId : null,
  };
}

export function telegramIdentityMatches(user: TelegramUser, claimedTgId: string): boolean {
  return user.id === claimedTgId.trim();
}
