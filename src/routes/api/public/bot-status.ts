import { createFileRoute } from "@tanstack/react-router";

/**
 * Diagnostic endpoint: shows whether the Telegram webhook is registered and any delivery errors.
 * Open: https://<your-domain>/api/public/bot-status
 * No token or secret is exposed — only Telegram's getWebhookInfo result.
 */
export const Route = createFileRoute("/api/public/bot-status")({
  server: {
    handlers: {
      GET: async () => {
        const botToken = process.env["TELEGRAM_API_KEY"]?.trim();
        if (!botToken) {
          return new Response(JSON.stringify({ error: "TELEGRAM_API_KEY not set" }, null, 2), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
            signal: AbortSignal.timeout(10000),
          });
          const body = (await res.json()) as { ok?: boolean; result?: Record<string, unknown> };
          const r = body?.result ?? {};
          return new Response(
            JSON.stringify(
              {
                webhook_set: typeof r["url"] === "string" && r["url"] !== "",
                url: r["url"] ?? "",
                pending_update_count: r["pending_update_count"] ?? 0,
                last_error_message: r["last_error_message"] ?? null,
                last_error_date: r["last_error_date"] ?? null,
                ip_address: r["ip_address"] ?? null,
                allowed_updates: r["allowed_updates"] ?? null,
              },
              null,
              2,
            ),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch {
          return new Response(JSON.stringify({ error: "Could not reach Telegram" }, null, 2), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
