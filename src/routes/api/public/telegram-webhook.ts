import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { webhookSecret } from "@/lib/telegram-webhook-secret";

export { webhookSecret };

/** Mini App link opened by the /start button. Override with MINI_APP_URL if needed. */
export const MINI_APP_URL = "https://royal-good-production.up.railway.app/";
export const MINI_APP_LINK_TEXT = "Life Good — Telegram Earning Mini App";

function appUrl() {
  const configured = process.env["MINI_APP_URL"]?.trim();
  return configured && /^https:\/\//.test(configured)
    ? configured.replace(/\/?$/, "/")
    : MINI_APP_URL;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Builds the welcome message + Start button sent when a user opens the bot. */
export function buildWelcomeMessage(firstName: string, referralCode = "") {
  const baseUrl = appUrl();
  const webAppUrl = referralCode ? `${baseUrl}?ref=${encodeURIComponent(referralCode)}` : baseUrl;
  const name = escapeHtml(firstName);
  const divider = "━━━━━━━━━━━━━━━━━━";

  const text = [
    `✨ <b>স্বাগতম, ${name}!</b> ✨`,
    "",
    `🌟 <b>Life Good</b> — Telegram-এর আয়ের Mini App`,
    divider,
    "",
    "🎡 <b>Daily Spin</b>",
    "প্রতিদিন ফ্রি স্পিন ঘুরান, জিতুন ৳20 থেকে ৳300 পর্যন্ত! 💰",
    "",
    "📺 <b>Ads Video</b>",
    "এড ভিডিও দেখুন, প্রতিবার সাথে সাথে রিওয়ার্ড পান ✅",
    "",
    "⌨️ <b>Typing Job</b>",
    "টাইপ করে দ্রুত ও নির্ভুলভাবে কাজ শেষ করুন, ইনকাম বাড়ান 🚀",
    "",
    "🧠 <b>Quiz Job</b>",
    "সঠিক উত্তর দিন, জ্ঞান কাজে লাগিয়ে পুরস্কার জিতুন 🏆",
    "",
    "👥 <b>Refer &amp; Earn</b>",
    "বন্ধুদের আমন্ত্রণ জানান, রেফার বোনাস নিয়ে আয় আরও বাড়ান 🤝",
    "",
    "📊 <b>Leaderboard</b> — শীর্ষ আয়কারীদের তালিকায় নাম তুলুন",
    "💸 <b>Withdraw</b> — আয়ের টাকা সহজে উইথড্র করুন",
    "",
    divider,
    "👇 নিচের <b>Start</b> বাটনে চাপ দিয়ে এখনই শুরু করুন!",
    `🔗 <a href="${escapeHtml(baseUrl)}">${escapeHtml(MINI_APP_LINK_TEXT)}</a>`,
  ].join("\n");

  return {
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[{ text: "🚀 Start", web_app: { url: webAppUrl } }]],
    },
  };
}

type TelegramUpdate = {
  message?: {
    text?: unknown;
    chat?: { id?: unknown };
    from?: { first_name?: unknown };
  };
};

/** Any message (text, photo, sticker, …) gets the welcome + Start button; /start may carry a referral code. */
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
        const text = typeof message?.text === "string" ? message.text.trim() : "";
        const chatId = message?.chat?.id;
        if (typeof chatId !== "number" && typeof chatId !== "string") {
          return new Response("ok");
        }

        const isStart = /^\/start(@\w+)?(\s|$)/.test(text);
        const rawCode = isStart ? (text.split(/\s+/)[1] ?? "") : "";
        const referralCode = /^[A-Za-z0-9_]{1,64}$/.test(rawCode) ? rawCode : "";
        const firstName =
          typeof message?.from?.first_name === "string"
            ? message.from.first_name.slice(0, 40)
            : "বন্ধু";

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            ...buildWelcomeMessage(firstName, referralCode),
          }),
        }).catch(() => {});

        return new Response("ok");
      },
    },
  },
});
