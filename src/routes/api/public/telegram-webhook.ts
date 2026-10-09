import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

function appUrl() {
  if (process.env["NODE_ENV"] !== "production") {
    const port = process.env["PORT"] || "3000";
    return `http://localhost:${port}/`;
  }
  const publicHost = process.env["RAILWAY_PUBLIC_DOMAIN"] || process.env["RAILWAY_STATIC_URL"];
  if (!publicHost)
    throw new Error("Set RAILWAY_PUBLIC_DOMAIN to enable the Telegram start webhook.");
  const normalizedHost = publicHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${normalizedHost}/`;
}

export function webhookSecret(botToken: string) {
  return createHash("sha256").update(`tg-webhook:${botToken}`).digest("hex").slice(0, 48);
}

type TelegramUpdate = {
  message?: {
    text?: unknown;
    chat?: { id?: unknown };
    from?: { first_name?: unknown };
  };
};

export const Route = createFileRoute("/api/public/telegram-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botToken = process.env["TELEGRAM_API_KEY"];
        if (!botToken) return new Response("not configured", { status: 500 });

        const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        const expectedSecret = webhookSecret(botToken);
        if (
          receivedSecret.length !== expectedSecret.length ||
          !timingSafeEqual(Buffer.from(receivedSecret), Buffer.from(expectedSecret))
        ) {
          return new Response("forbidden", { status: 401 });
        }

        let update: TelegramUpdate;
        try {
          update = (await request.json()) as TelegramUpdate;
        } catch {
          return new Response("ok");
        }

        const message = update.message;
        const text = typeof message?.text === "string" ? message.text : "";
        const chatId = message?.chat?.id;
        if (
          (typeof chatId !== "number" && typeof chatId !== "string") ||
          !text.startsWith("/start")
        ) {
          return new Response("ok");
        }

        const rawCode = text.trim().split(/\s+/)[1] ?? "";
        const referralCode = /^[A-Za-z0-9_]{1,64}$/.test(rawCode) ? rawCode : "";
        const url = appUrl();
        const webAppUrl = referralCode ? `${url}?ref=${encodeURIComponent(referralCode)}` : url;
        const firstName =
          typeof message?.from?.first_name === "string"
            ? message.from.first_name.slice(0, 40)
            : "বন্ধু";

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `স্বাগতম ${firstName}! 🎉\n\nনিচের বাটনে চাপ দিয়ে অ্যাপ খুলুন, কাজ করে টাকা আয় করুন।`,
            reply_markup: {
              inline_keyboard: [[{ text: "🚀 অ্যাপ খুলুন", web_app: { url: webAppUrl } }]],
            },
          }),
        }).catch(() => {});

        return new Response("ok");
      },
    },
  },
});
