import { z } from "zod";

/**
 * Single source of truth for withdrawal form rules, shared by the /withdraw page and the
 * `requestWithdraw` server function. The client uses it for instant, per-field feedback; the
 * server runs it again against authoritative rows (main balance, rejected count, activation)
 * so a patched client can never bypass a rule. Messages are user-facing Bengali.
 */

export const WITHDRAW_METHODS = ["bKash", "Nagad"] as const;
export type WithdrawMethod = (typeof WITHDRAW_METHODS)[number];

/** Hard ceiling for a single request. Keep in sync with the server validator below. */
export const MAX_WITHDRAW_AMOUNT = 10_000_000;

/** Each rejected withdrawal doubles the required minimum, capped at this many times the setting. */
export const MAX_MIN_WITHDRAW_STEPS = 8;

/** Bangladeshi mobile money numbers: 01 followed by an operator digit 3-9 and 8 more digits. */
const BD_MOBILE_PATTERN = /^01[3-9]\d{8}$/;

export type WithdrawErrorCode =
  | "method_invalid"
  | "number_required"
  | "number_invalid"
  | "amount_required"
  | "amount_invalid"
  | "amount_below_min"
  | "amount_above_max"
  | "balance_insufficient"
  | "account_missing"
  | "account_blocked"
  | "account_inactive";

export type WithdrawField = "method" | "number" | "amount";
export type WithdrawFieldErrors = Partial<Record<WithdrawField, string>>;

export const WITHDRAW_MESSAGES: Record<WithdrawErrorCode, string> = {
  method_invalid: "বিকাশ অথবা নগদ — একটি পেমেন্ট মেথড বেছে নিন",
  number_required: "বিকাশ/নগদ মোবাইল নম্বর লিখুন",
  number_invalid: "সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন (যেমন 01712345678)",
  amount_required: "উইথড্রের পরিমাণ লিখুন",
  amount_invalid: "সঠিক উইথড্রের পরিমাণ লিখুন (পূর্ণ টাকার অঙ্ক, যেমন 50)",
  amount_below_min: "সর্বনিম্ন উইথড্রের চেয়ে কম লিখেছেন",
  amount_above_max: "এত বড় উইথড্র একবারে করা যাবে না",
  balance_insufficient: "পর্যাপ্ত ব্যালেন্স নেই",
  account_missing: "অ্যাকাউন্ট পাওয়া যায়নি",
  account_blocked: "আপনার অ্যাকাউন্ট ব্লক করা হয়েছে",
  account_inactive: "উইথড্র করতে আগে আপনার অ্যাকাউন্ট অ্যাক্টিভ করুন",
};

/** Accepted raw input while typing: digits plus an optional country-code `+`. */
export function sanitizeWithdrawNumberInput(raw: string): string {
  return String(raw ?? "")
    .replace(/[^\d+]/g, "")
    .slice(0, 14);
}

/**
 * Reduce any common spelling of a Bangladeshi mobile number (`+880…`, `880…`, `0088…`,
 * spaced or dashed) to the canonical 11-digit local form used for validation and storage.
 */
export function normalizeWithdrawNumber(raw: string | null | undefined): string {
  let digits = String(raw ?? "")
    .replace(/\+/g, "")
    .replace(/\D/g, "");
  if (digits.startsWith("0088")) digits = digits.slice(4);
  else if (digits.length === 13 && digits.startsWith("88")) digits = digits.slice(2);
  return digits;
}

export function isValidWithdrawNumber(raw: string | null | undefined): boolean {
  return BD_MOBILE_PATTERN.test(normalizeWithdrawNumber(raw));
}

/** Admin-set minimum, escalated for this user's rejected withdrawals (2×, 4× … up to 8×). */
export function effectiveMinWithdraw(minWithdraw: number, rejectedCount = 0): number {
  const base = Number.isFinite(minWithdraw) ? Math.max(0, Math.trunc(minWithdraw)) : 0;
  const rejections = Number.isFinite(rejectedCount) ? Math.max(0, Math.trunc(rejectedCount)) : 0;
  return base * Math.min(2 ** rejections, MAX_MIN_WITHDRAW_STEPS);
}

/** Extra taka the user must earn before any withdrawal is possible at all. */
export function withdrawShortfall(balance: number, minimum: number): number {
  const safeBalance = Number.isFinite(balance) ? Math.max(0, Math.trunc(balance)) : 0;
  return Math.max(0, minimum - safeBalance);
}

type AmountParse = { empty: boolean; value: number | null };

function parseAmount(raw: string | number | null | undefined): AmountParse {
  if (raw === null || raw === undefined) return { empty: true, value: null };
  if (typeof raw === "number") {
    return { empty: false, value: Number.isInteger(raw) && Number.isFinite(raw) ? raw : null };
  }
  const text = String(raw).trim();
  if (!text) return { empty: true, value: null };
  if (!/^\d+$/.test(text)) return { empty: false, value: null };
  const value = Number(text);
  return { empty: false, value: Number.isSafeInteger(value) ? value : null };
}

function safeBalance(balance: number | null | undefined): number {
  if (typeof balance !== "number" || !Number.isFinite(balance)) return 0;
  return Math.max(0, Math.trunc(balance));
}

export type WithdrawValidationInput = {
  amount: string | number | null | undefined;
  number: string | null | undefined;
  method: string | null | undefined;
  /** Main balance: `players.balance` on the server, the synced wallet cache on the client. */
  balance: number | null | undefined;
  /** Admin setting `min_withdraw`, before the rejected-withdrawal escalation. */
  minWithdraw: number | null | undefined;
  rejectedCount?: number;
  /** Server-computed effective minimum; wins over `minWithdraw × rejectedCount` when present. */
  minimum?: number | null;
  /** Unknown state is treated as active on the client; the server always passes the real value. */
  isActive?: boolean;
  isBlocked?: boolean;
  /** `false` only when the server could not find the player row. */
  accountExists?: boolean;
  activationFee?: number;
};

export type WithdrawValidation = {
  ok: boolean;
  code: WithdrawErrorCode | null;
  /** Summary sentence for the form banner; empty when everything passed. */
  message: string;
  fieldErrors: WithdrawFieldErrors;
  /** Canonical values to submit; `amount` is 0 and `method` is null when invalid. */
  amount: number;
  number: string;
  method: WithdrawMethod | null;
  minimum: number;
  /** Extra taka needed for this exact request (0 when the balance covers it). */
  shortfall: number;
  /** Extra taka needed to reach the minimum at all (0 when the balance already does). */
  balanceShortfall: number;
};

/**
 * Validate a withdrawal request in the order the user experiences it:
 * inputs → minimum withdraw → main balance → account status (blocked / not activated).
 */
export function validateWithdraw(input: WithdrawValidationInput): WithdrawValidation {
  const minimum =
    typeof input.minimum === "number" && Number.isFinite(input.minimum)
      ? Math.max(0, Math.trunc(input.minimum))
      : effectiveMinWithdraw(input.minWithdraw ?? 0, input.rejectedCount ?? 0);
  const balance = safeBalance(input.balance);
  const balanceShortfall = withdrawShortfall(balance, minimum);
  const activationFee = input.activationFee ?? 0;

  const fieldErrors: WithdrawFieldErrors = {};
  let code: WithdrawErrorCode | null = null;
  let amount = 0;
  let number = "";
  let method: WithdrawMethod | null = null;

  const rawMethod = String(input.method ?? "").trim();
  if (isWithdrawMethod(rawMethod)) method = rawMethod;
  else {
    fieldErrors.method = WITHDRAW_MESSAGES.method_invalid;
    code ??= "method_invalid";
  }

  const rawNumber = String(input.number ?? "").trim();
  number = normalizeWithdrawNumber(rawNumber);
  if (!rawNumber) {
    number = "";
    fieldErrors.number = WITHDRAW_MESSAGES.number_required;
    code ??= "number_required";
  } else if (!BD_MOBILE_PATTERN.test(number)) {
    number = "";
    fieldErrors.number = WITHDRAW_MESSAGES.number_invalid;
    code ??= "number_invalid";
  }

  const parsed = parseAmount(input.amount);
  if (parsed.empty) {
    fieldErrors.amount = WITHDRAW_MESSAGES.amount_required;
    code ??= "amount_required";
  } else if (parsed.value === null || parsed.value < 1) {
    fieldErrors.amount = WITHDRAW_MESSAGES.amount_invalid;
    code ??= "amount_invalid";
  } else if (parsed.value > MAX_WITHDRAW_AMOUNT) {
    fieldErrors.amount = `${WITHDRAW_MESSAGES.amount_above_max} (সর্বোচ্চ ৳${MAX_WITHDRAW_AMOUNT})`;
    code ??= "amount_above_max";
  } else if (parsed.value < minimum) {
    fieldErrors.amount = `সর্বনিম্ন উইথড্র ৳${minimum}${
      (input.rejectedCount ?? 0) > 0
        ? ` — ${input.rejectedCount} টি রিজেক্টের কারণে সীমা বেড়েছে`
        : ""
    }`;
    code ??= "amount_below_min";
  } else {
    amount = parsed.value;
  }

  const fail = (errorCode: WithdrawErrorCode, message: string): WithdrawValidation => ({
    ok: false,
    code: errorCode,
    message,
    fieldErrors,
    amount,
    number,
    method,
    minimum,
    shortfall: amount > 0 ? Math.max(0, amount - balance) : balanceShortfall,
    balanceShortfall,
  });

  // Every input problem is reported at once, so the user fixes the whole form in one pass.
  if (code) return fail(code, firstFieldError(fieldErrors) ?? WITHDRAW_MESSAGES[code]);

  // Main balance: distinguish "below the configured minimum" from "below this request".
  if (amount > balance) {
    const missing = amount - balance;
    return fail(
      "balance_insufficient",
      balance < minimum
        ? `আপনার মেইন ব্যালেন্স ৳${balance}, কিন্তু সর্বনিম্ন উইথড্র ৳${minimum} — আরও ৳${balanceShortfall} জমা হলে উইথড্র করতে পারবেন।`
        : `পর্যাপ্ত ব্যালেন্স নেই। আপনার মেইন ব্যালেন্স ৳${balance}, এই উইথড্রে আরও ৳${missing} প্রয়োজন।`,
    );
  }

  // Account status: blocked first, then the activation gate that opens the payment flow.
  if (input.isBlocked) return fail("account_blocked", WITHDRAW_MESSAGES.account_blocked);
  if (input.accountExists === false)
    return fail("account_missing", WITHDRAW_MESSAGES.account_missing);
  if (input.isActive === false) {
    return fail(
      "account_inactive",
      activationFee > 0
        ? `${WITHDRAW_MESSAGES.account_inactive} — অ্যাক্টিভেশন ফি ৳${activationFee}।`
        : WITHDRAW_MESSAGES.account_inactive,
    );
  }

  return {
    ok: true,
    code: null,
    message: "",
    fieldErrors,
    amount,
    number,
    method,
    minimum,
    shortfall: 0,
    balanceShortfall,
  };
}

function firstFieldError(fieldErrors: WithdrawFieldErrors): string | null {
  return fieldErrors.method ?? fieldErrors.number ?? fieldErrors.amount ?? null;
}

export function isWithdrawMethod(value: string): value is WithdrawMethod {
  return (WITHDRAW_METHODS as readonly string[]).includes(value);
}

/**
 * Wire validator for `requestWithdraw`: bounds only, so out-of-range input is rejected before it
 * reaches the database. Semantic rules live in `validateWithdraw`, which can return a structured
 * Bengali message instead of throwing.
 */
export const withdrawRequestSchema = z.object({
  amount: z.number().int().min(1).max(MAX_WITHDRAW_AMOUNT),
  method: z.string().trim().max(20),
  number: z.string().trim().max(20),
});
