import { createHash } from "node:crypto";

/**
 * Secret token Telegram echoes back in the `x-telegram-bot-api-secret-token` header.
 * Derived from the bot token, so the same value must be passed to setWebhook
 * (see scripts/set-telegram-webhook.ts).
 */
export function webhookSecret(botToken: string) {
  return createHash("sha256").update(`tg-webhook:${botToken}`).digest("hex").slice(0, 48);
}
