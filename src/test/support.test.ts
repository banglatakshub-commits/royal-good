import { describe, expect, it } from "vitest";
import { supportUsernameSchema } from "../lib/support";

describe("support Telegram username", () => {
  it("normalizes usernames and allows unconfigured support", () => {
    expect(supportUsernameSchema.parse(" @shanto_As ")).toBe("shanto_As");
    expect(supportUsernameSchema.parse("")).toBe("");
  });
  it("rejects links, unsafe characters and invalid lengths", () => {
    for (const value of ["https://t.me/test", "abc", "12345", "name?x=1", "a".repeat(34)]) {
      expect(supportUsernameSchema.safeParse(value).success).toBe(false);
    }
  });
});
