import { describe, expect, it } from "vitest";
import { generateNekSign, verifyNekSign } from "../lib/nekpayment";

const secret = "test-secret";
// Signed fields: amount, merTransferId, tradeResult (sorted). sign, signType and empty values are excluded.
const notification = {
  merTransferId: "trx-123",
  tradeResult: "1",
  amount: "100.00",
  signType: "MD5",
  note: "",
};
// Independently computed: md5("amount=100.00&merTransferId=trx-123&tradeResult=1&key=test-secret")
const expectedSign = "536bf6d4521028b570f3fb8debc1bbbb";

describe("Nekpayment signature", () => {
  it("signs sorted, non-empty fields with the secret appended as key=", () => {
    expect(generateNekSign(notification, secret)).toBe(expectedSign);
  });

  it("ignores the sign and signType fields and empty values when signing", () => {
    expect(generateNekSign({ ...notification, sign: "anything" }, secret)).toBe(expectedSign);
  });

  it("accepts a correct signature regardless of case or surrounding spaces", () => {
    expect(verifyNekSign(notification, secret, expectedSign)).toBe(true);
    expect(verifyNekSign(notification, secret, ` ${expectedSign.toUpperCase()} `)).toBe(true);
  });

  it("rejects a notification without a signature", () => {
    expect(verifyNekSign(notification, secret, undefined)).toBe(false);
    expect(verifyNekSign(notification, secret, "")).toBe(false);
  });

  it("rejects a tampered field, a wrong secret, or a missing secret", () => {
    expect(verifyNekSign({ ...notification, amount: "1.00" }, secret, expectedSign)).toBe(false);
    expect(verifyNekSign(notification, "other-secret", expectedSign)).toBe(false);
    expect(verifyNekSign(notification, "", expectedSign)).toBe(false);
  });
});
