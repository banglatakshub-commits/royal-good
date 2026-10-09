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
