import { createFileRoute } from "@tanstack/react-router";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/database";
import { verifyNekSign } from "@/lib/nekpayment";
import { payment_transactions, players } from "../../../../drizzle/schema";

type Fields = Record<string, string>;

async function readFields(request: Request): Promise<Fields> {
  const fields: Fields = {};
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string" || typeof value === "number") fields[key] = String(value);
    }
  } else {
    const form = await request.formData();
    form.forEach((value, key) => { if (typeof value === "string") fields[key] = value; });
  }
  return fields;
}

export const Route = createFileRoute("/api/public/nekpay-deposit-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let fields: Fields;
        try {
          fields = await readFields(request);
        } catch {
          return new Response("Malformed notification", { status: 400 });
        }
        const orderId = fields["mchOrderNo"]?.trim();
        const secret = process.env["NEKPAY_COLLECTION_KEY"]?.trim();
        const merchantId = process.env["NEKPAY_MCH_ID"]?.trim();
        if (!orderId || !orderId.startsWith("dep_") || !secret || !merchantId) {
          return new Response("Invalid notification", { status: 400 });
        }
        if (fields["mchId"] !== merchantId || !verifyNekSign(fields, secret, fields["sign"])) {
          return new Response("Invalid signature", { status: 403 });
        }
        if (fields["tradeResult"] !== "1" && fields["tradeResult"] !== "2") {
          // Unknown/in-progress statuses are acknowledged but never credited.
          return new Response("success", { status: 200 });
        }
        const db = getDb();
        try {
          await db.transaction(async (tx) => {
            const [order] = await tx.select({
              id: payment_transactions.id,
              tg_id: payment_transactions.tg_id,
              amount: payment_transactions.amount,
              status: payment_transactions.status,
            }).from(payment_transactions)
              .where(eq(payment_transactions.id, orderId))
              .limit(1);
            if (!order) throw new Error("Deposit order not found");
            const notifiedAmount = Number(fields["amount"] ?? fields["oriAmount"]);
            if (!Number.isFinite(notifiedAmount) || notifiedAmount !== order.amount) {
              throw new Error("Deposit amount does not match the order");
            }
            if (order.status !== "pending") return;
            if (fields["tradeResult"] === "2") {
              await tx.update(payment_transactions)
                .set({ status: "failed", updated_at: new Date() })
                .where(and(eq(payment_transactions.id, orderId), eq(payment_transactions.status, "pending")));
              return;
            }
            const [updated] = await tx.update(payment_transactions)
              .set({ status: "success", updated_at: new Date() })
              .where(and(eq(payment_transactions.id, orderId), eq(payment_transactions.status, "pending")))
              .returning({ tg_id: payment_transactions.tg_id, amount: payment_transactions.amount });
            if (!updated) return;
            await tx.update(players)
              .set({ balance: sql`${players.balance} + ${updated.amount}`, updated_at: new Date() })
              .where(eq(players.tg_id, updated.tg_id));
          });
          return new Response("success", { status: 200 });
        } catch (error) {
          console.error("NekPay deposit callback failed:", error);
          return new Response("Processing failed", { status: 500 });
        }
      },
    },
  },
});
