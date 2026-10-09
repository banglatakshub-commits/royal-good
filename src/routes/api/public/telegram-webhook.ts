import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

const APP_URL = process.env.NODE_ENV === 'production' 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-app.railway.app'}/`
  : "http://localhost:3000/";

export function webhookSecret(tgKey: string) {
  return createHash("sha256").update("tg-webhook:" + tgKey).digest("hex").slice(0, 48);
}

export const Route = createFileRoute("/api/public/telegram-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const tgKey = process.env["TELEGRAM_API_KEY"];
        if (!tgKey) return new Response("not configured", { status: 500 });
        
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        const want = webhookSecret(tgKey);
        
        if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
          return new Response("forbidden", { status: 401 });
        }
        
        let update: any;
        try {
          update = await request.json();
        } catch {
          return new Response("ok");
        }
        
        const msg = update?.message;
        const text: string = typeof msg?.text === "string" ? msg.text : "";
        const chatId = msg?.chat?.id;
        
        if (!chatId || !text.startsWith("/start")) return new Response("ok");

        const raw = text.split(/\s+/)[1] ?? "";
        const ref = /^[A-Za-z0-9_]{1,64}$/.test(raw) ? raw : "";
        const url = ref ? `${APP_URL}?ref=${encodeURIComponent(ref)}` : APP_URL;
        const name = String(msg?.from?.first_name ?? "বন্ধু").slice(0, 40);

        // Direct Telegram API call instead of Lovable connector
        await fetch(`https://api.telegram.org/bot${tgKey}/sendMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: `স্বাগতম ${name}! 🎉\n\nনিচের বাটনে চাপ দিয়ে অ্যাপ খুলুন, কাজ করে টাকা আয় করুন।`,
            reply_markup: { 
              inline_keyboard: [[{ 
                text: "🚀 অ্যাপ খুলুন", 
                web_app: { url } 
              }]] 
            },
          }),
        }).catch(() => {});
        
        return new Response("ok");
      },
    },
  },
});
