import { describe, expect, it } from "vitest";
import {
  effectiveMinWithdraw,
  isValidWithdrawNumber,
  MAX_WITHDRAW_AMOUNT,
  normalizeWithdrawNumber,
  sanitizeWithdrawNumberInput,
  validateWithdraw,
  WITHDRAW_MESSAGES,
} from "../lib/withdraw-validation";

/** A request that passes every rule; each test breaks exactly one thing. */
const valid = {
  amount: "100",
  number: "01712345678",
  method: "bKash",
  balance: 500,
  minWithdraw: 50,
  rejectedCount: 0,
  isActive: true,
};

describe("effective minimum withdraw", () => {
  it("doubles for every rejected withdrawal and stops at eight times the setting", () => {
    expect(effectiveMinWithdraw(50, 0)).toBe(50);
    expect(effectiveMinWithdraw(50, 1)).toBe(100);
    expect(effectiveMinWithdraw(50, 3)).toBe(400);
    expect(effectiveMinWithdraw(50, 4)).toBe(400);
    expect(effectiveMinWithdraw(50, 40)).toBe(400);
  });

  it("survives the junk an admin setting or a count could hold", () => {
    expect(effectiveMinWithdraw(Number.NaN, 2)).toBe(0);
    expect(effectiveMinWithdraw(50.9, -3)).toBe(50);
  });
});

describe("mobile money number", () => {
  it("reduces every common spelling to the canonical local number", () => {
    for (const raw of [
      "01712345678",
      "+8801712345678",
      "8801712345678",
      "008801712345678",
      " 017-1234 5678 ",
    ]) {
      expect(normalizeWithdrawNumber(raw)).toBe("01712345678");
      expect(isValidWithdrawNumber(raw)).toBe(true);
    }
  });

  it("rejects wrong lengths, landline prefixes and non-numeric input", () => {
    for (const raw of [
      "",
      "0171234567",
      "017123456789",
      "02712345678",
      "01212345678",
      "1712345678",
      "abcdefg",
      "0171234567a",
    ]) {
      expect(isValidWithdrawNumber(raw), raw).toBe(false);
    }
  });

  it("keeps only digits and a leading plus while typing, capped at 14 characters", () => {
    expect(sanitizeWithdrawNumberInput("+88 (017) 12-34 5678 xxx")).toBe("+8801712345678");
    expect(sanitizeWithdrawNumberInput("9".repeat(30))).toHaveLength(14);
  });
});

describe("withdraw form validation", () => {
  it("accepts a complete request and returns canonical values", () => {
    const result = validateWithdraw({ ...valid, number: "+8801712345678" });

    expect(result.ok).toBe(true);
    expect(result.code).toBeNull();
    expect(result.message).toBe("");
    expect(result.fieldErrors).toEqual({});
    expect(result).toMatchObject({ amount: 100, number: "01712345678", method: "bKash" });
  });

  it("reports every empty field at once so the form can be fixed in one pass", () => {
    const result = validateWithdraw({ ...valid, amount: "", number: "", method: "" });

    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors).sort()).toEqual(["amount", "method", "number"]);
    expect(result.fieldErrors.number).toBe(WITHDRAW_MESSAGES.number_required);
    expect(result.fieldErrors.amount).toBe(WITHDRAW_MESSAGES.amount_required);
    expect(result.message).toBe(WITHDRAW_MESSAGES.method_invalid);
  });

  it("rejects an amount below the configured minimum withdraw", () => {
    const result = validateWithdraw({ ...valid, amount: "49" });

    expect(result.code).toBe("amount_below_min");
    expect(result.fieldErrors.amount).toContain("সর্বনিম্ন উইথড্র ৳50");
  });

  it("applies the escalated minimum for a user with rejected withdrawals", () => {
    const result = validateWithdraw({ ...valid, amount: "150", rejectedCount: 2 });

    expect(result.minimum).toBe(200);
    expect(result.code).toBe("amount_below_min");
    expect(result.fieldErrors.amount).toContain("৳200");
    expect(validateWithdraw({ ...valid, amount: "200", rejectedCount: 2 }).ok).toBe(true);
  });

  it("prefers the server-computed minimum over the locally cached setting", () => {
    const result = validateWithdraw({ ...valid, amount: "60", minimum: 100 });

    expect(result.minimum).toBe(100);
    expect(result.code).toBe("amount_below_min");
  });

  it("rejects amounts that are not whole taka or exceed the hard ceiling", () => {
    expect(validateWithdraw({ ...valid, amount: "50.5" }).code).toBe("amount_invalid");
    expect(validateWithdraw({ ...valid, amount: "-20" }).code).toBe("amount_invalid");
    expect(validateWithdraw({ ...valid, amount: 0 }).code).toBe("amount_invalid");
    expect(
      validateWithdraw({
        ...valid,
        amount: MAX_WITHDRAW_AMOUNT + 1,
        balance: MAX_WITHDRAW_AMOUNT + 1,
      }).code,
    ).toBe("amount_above_max");
  });

  it("says how much more the main balance needs when it is below the minimum withdraw", () => {
    const result = validateWithdraw({ ...valid, amount: "100", balance: 20 });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("balance_insufficient");
    expect(result.balanceShortfall).toBe(30);
    expect(result.message).toContain("মেইন ব্যালেন্স ৳20");
    expect(result.message).toContain("সর্বনিম্ন উইথড্র ৳50");
    expect(result.message).toContain("আরও ৳30");
  });

  it("says how much more this exact request needs when the balance is above the minimum", () => {
    const result = validateWithdraw({ ...valid, amount: "120", balance: 100 });

    expect(result.code).toBe("balance_insufficient");
    expect(result.balanceShortfall).toBe(0);
    expect(result.shortfall).toBe(20);
    expect(result.message).toContain("আরও ৳20");
  });

  it("lets a request through when the balance exactly covers it", () => {
    expect(validateWithdraw({ ...valid, amount: "500", balance: 500 }).ok).toBe(true);
  });

  it("keeps the account gates after the input and balance checks", () => {
    expect(validateWithdraw({ ...valid, isActive: false }).code).toBe("account_inactive");
    expect(validateWithdraw({ ...valid, isActive: false }).message).toContain("অ্যাক্টিভ");
    expect(validateWithdraw({ ...valid, isActive: false, activationFee: 100 }).message).toContain(
      "৳100",
    );
    expect(validateWithdraw({ ...valid, isBlocked: true }).code).toBe("account_blocked");
    expect(validateWithdraw({ ...valid, accountExists: false }).code).toBe("account_missing");
  });

  it("reports an inactive account only once the rest of the form is valid", () => {
    const result = validateWithdraw({ ...valid, isActive: false, amount: "" });

    expect(result.code).toBe("amount_required");
    expect(result.fieldErrors.amount).toBe(WITHDRAW_MESSAGES.amount_required);
  });

  it("treats a missing balance as zero instead of failing open", () => {
    const result = validateWithdraw({ ...valid, balance: null });

    expect(result.code).toBe("balance_insufficient");
    expect(result.balanceShortfall).toBe(50);
  });

  it("rejects an unknown payment method", () => {
    const result = validateWithdraw({ ...valid, method: "Rocket" });

    expect(result.code).toBe("method_invalid");
    expect(result.method).toBeNull();
    expect(result.fieldErrors.method).toBe(WITHDRAW_MESSAGES.method_invalid);
  });
});
