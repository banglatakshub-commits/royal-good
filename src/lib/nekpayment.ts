import { createHash, timingSafeEqual } from "node:crypto";

export function generateNekSign(
  params: Record<string, string | number>,
  secretKey: string,
): string {
  const keys = Object.keys(params).filter(
    (k) => k !== "sign" && k !== "sign_type" && k !== "signType" && params[k] !== "",
  );
  keys.sort(); // ASCII sort

  const str = keys.map((k) => `${k}=${params[k]}`).join("&") + `&key=${secretKey}`;
  return createHash("md5").update(str, "utf8").digest("hex").toLowerCase();
}

/**
 * Checks a gateway notification signature in constant time.
 * A missing secret or signature always fails, so an unsigned notification is never trusted.
 */
export function verifyNekSign(
  params: Record<string, string | number>,
  secretKey: string,
  sign: string | undefined,
): boolean {
  if (!secretKey || !sign) return false;
  const expected = Buffer.from(generateNekSign(params, secretKey), "utf8");
  const received = Buffer.from(sign.trim().toLowerCase(), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export const NEK_PAY_URL = "https://api.nekpayment.com/pay/web";
export const NEK_TRANSFER_URL = "https://api.nekpayment.com/pay/transfer";
export const NEK_BALANCE_URL = "https://api.nekpayment.com/query/balance";

/**
 * Public host used to build the deposit notify_url and payout back_url.
 * Baked in so it works on extract without any env variable; RAILWAY_PUBLIC_DOMAIN
 * or the incoming request host still override it when present.
 */
export const NEK_DEFAULT_PUBLIC_DOMAIN = "royal-good-production.up.railway.app";

/**
 * NEKpay merchant business (collection / deposit) payment-type codes.
 * These are built in so no NEKPAY_PAY_TYPE env variable is needed:
 *   BKASH2 = 2222, NAGAD2 = 2221, BANK2 = 2220.
 */
export const NEK_PAY_TYPES = {
  bkash: "2222",
  nagad: "2221",
  bank: "2220",
} as const;

/**
 * Default deposit pay_type when the caller does not pick a channel. BANK2 (2220) makes the
 * NekPay cashier show every enabled channel (bKash + Nagad), so the user chooses on the gateway.
 */
export const NEK_DEFAULT_PAY_TYPE: string = NEK_PAY_TYPES.bank;

/** Resolves a deposit pay_type from a method label, falling back to the default channel. */
export function resolveNekPayType(method?: string): string {
  const key = (method ?? "").trim().toLowerCase();
  if (key.includes("nagad") || key.includes("নগদ")) return NEK_PAY_TYPES.nagad;
  if (key.includes("bkash") || key.includes("বিকাশ")) return NEK_PAY_TYPES.bkash;
  if (key.includes("bank") || key.includes("ব্যাংক")) return NEK_PAY_TYPES.bank;
  return NEK_DEFAULT_PAY_TYPE;
}

/**
 * Maps the app's withdrawal method label to NEKpay's bank_code.
 * bKash -> "baksh", Nagad -> "ngand". Unknown methods fall back to Nagad.
 */
export function mapNekBankCode(method: string): string {
  const key = method.trim().toLowerCase();
  const table: Record<string, string> = {
    bkash: "baksh",
    baksh: "baksh",
    বিকাশ: "baksh",
    nagad: "ngand",
    ngand: "ngand",
    নগদ: "ngand",
  };
  return table[key] ?? table[method.trim()] ?? "ngand";
}

/** Formats a date as "YYYY-MM-DD HH:mm:ss" in Asia/Dhaka, the format NEKpay expects. */
function dhakaTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  // en-CA gives "YYYY-MM-DD, HH:mm:ss"; drop the comma.
  return parts.replace(",", "");
}

async function postForm(url: string, params: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("NEKpay returned an unreadable response");
  }
}

export type NekPayoutResult =
  { success: true; tradeResult: string; tradeNo: string } | { success: false; message: string };

/**
 * Sends an auto payout (transfer) to NEKpay using the withdraw/transfer key.
 * respCode=SUCCESS means the transfer was accepted, not yet settled — the back_url
 * callback finalises it. transfer_amount must be an integer or NEKpay cancels it.
 */
export async function sendNekPayout(opts: {
  merchantId: string;
  withdrawKey: string;
  transferId: string;
  amount: number;
  method: string;
  receiveName: string;
  receiveAccount: string;
  backUrl: string;
}): Promise<NekPayoutResult> {
  if (!opts.merchantId || !opts.withdrawKey) {
    return { success: false, message: "NEKpay Merchant ID ও Withdraw Key সেট করা নেই।" };
  }
  const account = opts.receiveAccount.replace(/[^0-9]/g, "");
  const params: Record<string, string> = {
    mch_id: opts.merchantId,
    mch_transferId: opts.transferId,
    transfer_amount: String(Math.trunc(opts.amount)),
    apply_date: dhakaTimestamp(),
    receive_name: opts.receiveName.slice(0, 50) || "User",
    receive_account: account,
    bank_code: mapNekBankCode(opts.method),
    back_url: opts.backUrl,
    sign_type: "MD5",
  };
  params["sign"] = generateNekSign(params, opts.withdrawKey);

  let body: unknown;
  try {
    body = await postForm(NEK_TRANSFER_URL, params);
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
  if (!body || typeof body !== "object") {
    return { success: false, message: "Invalid NEKpay response" };
  }
  const obj = body as Record<string, unknown>;
  const respCode = String(obj["respCode"] ?? "").toUpperCase();
  if (respCode !== "SUCCESS") {
    const msg = String(obj["errorMsg"] ?? obj["tradeMsg"] ?? "Transfer rejected");
    return { success: false, message: msg };
  }
  return {
    success: true,
    tradeResult: String(obj["tradeResult"] ?? "0"),
    tradeNo: String(obj["tradeNo"] ?? ""),
  };
}

/**
 * Queries the NEKpay merchant account's available balance.
 * Tries each provided key (withdraw key first, then collection key as a fallback)
 * because a single-key merchant signs balance with the collection key.
 */
export async function queryNekBalance(opts: {
  merchantId: string;
  keys: string[];
}): Promise<number | null> {
  if (!opts.merchantId) return null;
  const keys = [...new Set(opts.keys.map((k) => k.trim()).filter(Boolean))];
  for (const key of keys) {
    const params: Record<string, string> = { mch_id: opts.merchantId };
    params["sign"] = generateNekSign(params, key);
    params["sign_type"] = "MD5";
    let body: unknown;
    try {
      body = await postForm(NEK_BALANCE_URL, params);
    } catch {
      continue;
    }
    if (!body || typeof body !== "object") continue;
    const obj = body as Record<string, unknown>;
    if (String(obj["respCode"] ?? "").toUpperCase() !== "SUCCESS") continue;
    const avail = obj["availableAmount"] ?? obj["amount"] ?? obj["balance"];
    const num = Number(avail);
    if (Number.isFinite(num)) return num;
  }
  return null;
}
