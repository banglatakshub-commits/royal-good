import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/lib/database";
import { payment_transactions, players, app_settings } from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateNekSign } from "@/lib/nekpayment";

export const Route = createFileRoute("/api/public/nekpayment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Parse URL-encoded or JSON body based on Nekpayment's format (usually application/x-www-form-urlencoded)
          let bodyParams: Record<string, string> = {};
          const contentType = request.headers.get("content-type") || "";
          
          if (contentType.includes("application/json")) {
            bodyParams = await request.json();
          } else {
            const formData = await request.formData();
            formData.forEach((value, key) => {
              bodyParams[key] = value.toString();
            });
          }

          const {
            tradeResult,
            merTransferId,
            sign,
            signType,
            ...otherParams
          } = bodyParams;

          if (!merTransferId) {
            return new Response("Missing merTransferId", { status: 400 });
          }

          const db = getDb();
          const [settingRow] = await db
            .select({ nek_secret_key: app_settings.nek_secret_key })
            .from(app_settings)
            .where(eq(app_settings.id, 1))
            .limit(1);

          const secretKey = settingRow?.nek_secret_key;

          if (secretKey && sign) {
            const calculatedSign = generateNekSign(bodyParams, secretKey);
            if (calculatedSign !== sign) {
              return new Response("Invalid signature", { status: 403 });
            }
          }

          // 1: Success, 2: Failed
          if (tradeResult === "1") {
            const [trx] = await db
              .select()
              .from(payment_transactions)
              .where(eq(payment_transactions.id, merTransferId))
              .limit(1);

            if (trx && trx.status !== "success") {
              // Mark transaction success
              await db
                .update(payment_transactions)
                .set({ status: "success", updated_at: new Date() })
                .where(eq(payment_transactions.id, merTransferId));

              // Mark user active
              await db
                .update(players)
                .set({ is_active: true })
                .where(eq(players.tg_id, trx.tg_id));
            }
          } else if (tradeResult === "2") {
            await db
              .update(payment_transactions)
              .set({ status: "failed", updated_at: new Date() })
              .where(eq(payment_transactions.id, merTransferId));
          }

          // Nekpayment requires "success" as a response to stop re-sending the notification
          return new Response("success", { status: 200 });
        } catch (error) {
          console.error("Nekpayment Webhook Error:", error);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
