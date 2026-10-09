import { createHash } from "node:crypto";

export function generateNekSign(params: Record<string, string | number>, secretKey: string): string {
  const keys = Object.keys(params).filter((k) => k !== "sign" && k !== "sign_type" && k !== "signType" && params[k] !== "");
  keys.sort(); // ASCII sort

  const str = keys.map((k) => `${k}=${params[k]}`).join("&") + `&key=${secretKey}`;
  return createHash("md5").update(str, "utf8").digest("hex").toLowerCase();
}
