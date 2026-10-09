import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/database";
import { verifyNekSign } from "@/lib/nekpayment";
import { app_settings, payment_transactions, players } from "../../../../drizzle/schema";

type NotificationParams = Record<string, string>;

/** Reads the gateway notification (form-encoded or JSON) into flat string fields. */
async function readNotificationParams(request: Request): Promise<NotificationParams> {
  const params: NotificationParams = {};

  if (request.headers.get("content-type")?.includes("application/json")) {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Notification body must be a JSON object");
    }
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string" || typeof value === "number") params[key] = String(value);
    }
    return params;
  }

  const form = await request.formData();
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  return params;
}

/**
 * Marks a pending activation payment as paid and activates its player.
 * The conditional update runs first, so a repeated or concurrent notification cannot activate twice.
 */
async function activatePaidTransaction(transactionId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [paid] = await tx
      .update(payment_transactions)
      .set({ status: "success", updated_at: new Date() })
      .where(
        and(eq(payment_transactions.id, transactionId), eq(payment_transactions.status, "pending")),
      )
      .returning({ tg_id: payment_transactions.tg_id });

    // Unknown id, or already processed or failed: nothing to do.
    if (!paid) return;

    await tx.update(players).set({ is_active: true }).where(eq(players.tg_id, paid.tg_id));
  });
}

async function markPaymentFailed(transactionId: string): Promise<void> {
  await getDb()
    .update(payment_transactions)
    .set({ status: "failed", updated_at: new Date() })
    .where(
      and(eq(payment_transactions.id, transactionId), eq(payment_transactions.status, "pending")),
    );
}

export const Route = createFileRoute("/api/public/nekpayment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let params: NotificationParams;
        try {
          params = await readNotificationParams(request);
        } catch {
          return new Response("Malformed notification", { status: 400 });
        }

        const transactionId = params["merTransferId"]?.trim();
        if (!transactionId) return new Response("Missing merTransferId", { status: 400 });

        try {
          const [settingRow] = await getDb()
            .select({ nek_secret_key: app_settings.nek_secret_key })
            .from(app_settings)
            .where(eq(app_settings.id, 1))
            .limit(1);
          const secretKey = settingRow?.nek_secret_key.trim() ?? "";

          // Fail closed: without the merchant secret a notification cannot be authenticated,
          // so it must never change a payment or activate an account.
          if (!secretKey) return new Response("Gateway secret is not configured", { status: 503 });
          if (!verifyNekSign(params, secretKey, params["sign"])) {
            return new Response("Invalid signature", { status: 403 });
          }

          // Gateway codes: 1 = success, 2 = failed.
          if (params["tradeResult"] === "1") {
            await activatePaidTransaction(transactionId);
          } else if (params["tradeResult"] === "2") {
            await markPaymentFailed(transactionId);
          }

          // Nekpayment keeps re-sending a notification until it receives "success".
          return new Response("success", { status: 200 });
        } catch (error) {
          console.error("Nekpayment webhook error:", error);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
