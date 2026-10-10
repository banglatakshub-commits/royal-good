import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/database";
import { requireTelegramUser, telegramIdentityMatches } from "@/lib/telegram-auth.server";
import { generateNekSign } from "@/lib/nekpayment";
import { payment_transactions } from "../../drizzle/schema";

const identity = z.object({
  initData: z.string().max(8192).optional(),
  tgId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100).optional(),
  username: z.string().trim().max(64).nullable().optional(),
  photo: z.string().url().max(500).nullable().optional(),
});

function getAuthenticatedTelegramId(data: z.infer<typeof identity>) {
  const user = requireTelegramUser(data.initData, {
    tgId: data.tgId,
    name: data.name,
    username: data.username,
    photoUrl: data.photo,
  });
  if (!telegramIdentityMatches(user, data.tgId)) {
    throw new Error("Telegram identity does not match the request.");
  }
  return user.id;
}

function formatDhakaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

function findPaymentUrl(value: unknown, depth = 0): string | null {
  if (depth > 5 || !value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  for (const key of ["pay_url", "payUrl", "payment_url", "paymentUrl", "cashierUrl", "url", "redirect_url"]) {
    const candidate = object[key];
    if (typeof candidate === "string" && /^https:\/\//i.test(candidate)) return candidate;
  }
  for (const nested of Object.values(object)) {
    const found = findPaymentUrl(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Create a server-side NekPay collection order for the authenticated Telegram user. */
export const createDepositOrder = createServerFn({ method: "POST" })
  .validator((input) => identity.extend({ amount: z.number().int().min(10).max(50000) }).parse(input))
  .handler(async ({ data }) => {
    const tgId = getAuthenticatedTelegramId(data);
    const merchantId = process.env["NEKPAY_MCH_ID"]?.trim();
    const collectionKey = process.env["NEKPAY_COLLECTION_KEY"]?.trim();
    const payType = process.env["NEKPAY_PAY_TYPE"]?.trim();
    const publicDomain = process.env["RAILWAY_PUBLIC_DOMAIN"]?.trim();
    if (!merchantId || !collectionKey || !payType || !publicDomain) {
      throw new Error("NekPay is not configured. Set NEKPAY_MCH_ID, NEKPAY_COLLECTION_KEY, NEKPAY_PAY_TYPE and RAILWAY_PUBLIC_DOMAIN in Railway.");
    }
    const callbackUrl = `https://${publicDomain.replace(/^https?:\/\//i, "").replace(/\/$/, "")}/api/public/nekpay-deposit-webhook`;
    const orderId = `dep_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const db = getDb();
    await db.insert(payment_transactions).values({
      id: orderId,
      tg_id: tgId,
      amount: data.amount,
      status: "pending",
    });

    const params: Record<string, string> = {
      version: "1.0",
      mch_id: merchantId,
      notify_url: callbackUrl,
      mch_order_no: orderId,
      pay_type: payType,
      trade_amount: String(data.amount),
      order_date: formatDhakaDate(new Date()),
      goods_name: "Royal Good Deposit",
      sign_type: "MD5",
    };
    params.sign = generateNekSign(params, collectionKey);

    try {
      const response = await fetch("https://api.nekpayment.com/pay/web", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(15000),
      });
      const raw = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error("NekPay returned an unreadable response.");
      }
      if (!response.ok) throw new Error(`NekPay request failed (HTTP ${response.status}).`);
      const paymentUrl = findPaymentUrl(payload);
      if (!paymentUrl) {
        console.error("NekPay create-order response had no recognized payment URL field.");
        throw new Error("NekPay did not return a recognized payment URL. Check its response format in the official documentation.");
      }
      return { orderId, paymentUrl, amount: data.amount };
    } catch (error) {
      await db.update(payment_transactions)
        .set({ status: "failed", updated_at: new Date() })
        .where(eq(payment_transactions.id, orderId));
      throw error;
    }
  });
