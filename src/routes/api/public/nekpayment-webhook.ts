import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/database";
import { verifyNekSign } from "@/lib/nekpayment";
import { creditWithin, type BalanceExecutor } from "@/lib/balance.server";
import {
  app_settings,
  payment_transactions,
  players,
  withdrawals,
} from "../../../../drizzle/schema";

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
 * Logs the outcome of a callback together with the proxy headers, so the real source address
 * can be checked in Railway logs. Signatures and secrets are never logged.
 */
function logCallback(verdict: string, request: Request, fields: Record<string, string> = {}): void {
  const clip = (value: string | null) => (value ?? "").slice(0, 200) || undefined;
  console.info(
    "Nekpayment callback",
    JSON.stringify({
      verdict,
      forwardedFor: clip(request.headers.get("x-forwarded-for")),
      realIp: clip(request.headers.get("x-real-ip")),
      ...fields,
    }),
  );
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

/**
 * Finalises an auto-payout (transfer) callback keyed by the withdrawal id (mch_transferId).
 * Success marks the withdrawal approved; a failure marks it rejected and refunds the user.
 * The conditional pending-only update makes a repeated callback idempotent, so no double refund.
 * Gateway codes: 1 = success, 2 = failed (refund), 3 = rejected (refund).
 */
async function settlePayoutCallback(withdrawalId: string, tradeResult: string): Promise<void> {
  if (tradeResult === "1") {
    await getDb()
      .update(withdrawals)
      .set({ status: "approved" })
      .where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.status, "pending")));
    return;
  }
  if (tradeResult === "2" || tradeResult === "3") {
    await getDb().transaction(async (tx) => {
      const [failed] = await tx
        .update(withdrawals)
        .set({ status: "rejected", note: "NEKpay payout failed — refunded" })
        .where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.status, "pending")))
        .returning({ tg_id: withdrawals.tg_id, amount: withdrawals.amount });
      if (!failed) return; // already settled: no double refund
      const balance = await creditWithin(
        tx as unknown as BalanceExecutor,
        failed.tg_id,
        failed.amount,
      );
      if (balance === null) throw new Error("Payout refund could not be credited.");
    });
  }
}

export const Route = createFileRoute("/api/public/nekpayment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let params: NotificationParams;
        try {
          params = await readNotificationParams(request);
        } catch {
          logCallback("malformed", request);
          return new Response("Malformed notification", { status: 400 });
        }

        // Payout (transfer) callback: keyed by mch_transferId / merTransferId, no collection order.
        // Per NEKpay, payout callbacks are not reliably signed, so they are matched by the
        // withdrawal id and tradeResult rather than by signature.
        const payoutId = (params["merTransferId"] ?? params["mch_transferId"])?.trim();
        if (payoutId && !params["mchOrderNo"]) {
          try {
            await settlePayoutCallback(payoutId, params["tradeResult"] ?? "");
            logCallback("payout_accepted", request, {
              transactionId: payoutId,
              tradeResult: params["tradeResult"] ?? "",
            });
            return new Response("success", { status: 200 });
          } catch (error) {
            logCallback("payout_processing_error", request, { transactionId: payoutId });
            console.error("Nekpayment payout webhook error:", error);
            return new Response("error", { status: 500 });
          }
        }

        const transactionId = (params["mchOrderNo"] ?? params["merTransferId"])?.trim();
        if (!transactionId) {
          logCallback("missing_transaction_id", request);
          return new Response("Missing order ID", { status: 400 });
        }

        try {
          const [settingRow] = await getDb()
            .select({
              nek_api_key: app_settings.nek_api_key,
              nek_secret_key: app_settings.nek_secret_key,
            })
            .from(app_settings)
            .where(eq(app_settings.id, 1))
            .limit(1);
          const secretKey = settingRow?.nek_secret_key.trim() ?? "";
          const merchantId = settingRow?.nek_api_key.trim() ?? "";

          // Fail closed: without the merchant secret a notification cannot be authenticated,
          // so it must never change a payment or activate an account.
          if (!secretKey) {
            logCallback("secret_not_configured", request, { transactionId });
            return new Response("Gateway secret is not configured", { status: 503 });
          }
          if (!verifyNekSign(params, secretKey, params["sign"])) {
            logCallback("invalid_signature", request, { transactionId });
            return new Response("Invalid signature", { status: 403 });
          }
          if (params["mchOrderNo"] && params["mchId"] !== merchantId) {
            logCallback("merchant_mismatch", request, { transactionId });
            return new Response("Invalid merchant", { status: 403 });
          }

          // For collection callbacks, verify the order and amount against our DB before activation.
          if (params["mchOrderNo"]) {
            const [order] = await getDb()
              .select({ amount: payment_transactions.amount, status: payment_transactions.status })
              .from(payment_transactions)
              .where(eq(payment_transactions.id, transactionId))
              .limit(1);
            const paidAmount = Number(params["oriAmount"] ?? params["amount"]);
            if (!order || !Number.isFinite(paidAmount) || paidAmount !== order.amount) {
              logCallback("order_or_amount_mismatch", request, { transactionId });
              return new Response("Order or amount mismatch", { status: 400 });
            }
          }

          // Gateway codes: 1 = success, 2 = failed.
          const tradeResult = params["tradeResult"] ?? "";
          if (tradeResult === "1") {
            await activatePaidTransaction(transactionId);
          } else if (tradeResult === "2") {
            await markPaymentFailed(transactionId);
          }
          logCallback("accepted", request, { transactionId, tradeResult });

          // Nekpayment keeps re-sending a notification until it receives "success".
          return new Response("success", { status: 200 });
        } catch (error) {
          logCallback("processing_error", request, { transactionId });
          console.error("Nekpayment webhook error:", error);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
