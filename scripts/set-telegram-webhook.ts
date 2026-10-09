/**
 * Registers the Telegram bot webhook so /start and any other message reach
 * /api/public/telegram-webhook. Without this, the bot never replies and the
 * Start button is never shown.
 *
 * Usage (TELEGRAM_API_KEY must be set in the environment or .env):
 *   bun run telegram:webhook
 *   bun run telegram:webhook -- https://your-app.up.railway.app
 */
import { webhookSecret } from "../src/lib/telegram-webhook-secret";

const DEFAULT_BASE = "https://royal-good-production.up.railway.app";
const botToken = process.env["TELEGRAM_API_KEY"]?.trim();
if (!botToken) {
  console.error("TELEGRAM_API_KEY is not set.");
  process.exit(1);
}

const base = (process.argv[2] ?? process.env["RAILWAY_PUBLIC_DOMAIN"] ?? DEFAULT_BASE)
  .trim()
  .replace(/\/+$/, "");
const url = /^https?:\/\//.test(base) ? base : `https://${base}`;
const webhookUrl = `${url}/api/public/telegram-webhook`;

const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: webhookSecret(botToken),
    allowed_updates: ["message"],
    drop_pending_updates: false,
  }),
});
const body = await res.json().catch(() => ({}));
console.log(JSON.stringify(body, null, 2));
if (!res.ok || (body as { ok?: boolean }).ok !== true) process.exit(1);

const info = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`).then((r) =>
  r.json(),
);
console.log("getWebhookInfo:", JSON.stringify(info, null, 2));
