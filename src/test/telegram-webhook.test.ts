import { describe, expect, it } from "vitest";
import { buildWelcomeMessage, MINI_APP_URL } from "@/routes/api/public/telegram-webhook";

describe("telegram /start welcome message", () => {
  it("includes the mini app link in text and as a Start web_app button", () => {
    const msg = buildWelcomeMessage("Rahim");
    expect(msg.text).toContain(
      `<a href="${MINI_APP_URL}">Life Good — Telegram Earning Mini App</a>`,
    );
    expect(msg.parse_mode).toBe("HTML");
    expect(msg.reply_markup.inline_keyboard[0]?.[0]).toEqual({
      text: "🚀 Start",
      web_app: { url: MINI_APP_URL },
    });
  });

  it("describes spin, ads, typing and other in-app earning features", () => {
    const { text } = buildWelcomeMessage("Rahim");
    for (const word of [
      "Daily Spin",
      "Ads Video",
      "Typing Job",
      "Quiz Job",
      "Refer",
      "Leaderboard",
      "Withdraw",
    ]) {
      expect(text).toContain(word);
    }
  });

  it("escapes the user's first name for HTML and keeps the referral code in the button URL", () => {
    const msg = buildWelcomeMessage("<b>A&B</b>", "REF123");
    expect(msg.text).toContain("&lt;b&gt;A&amp;B&lt;/b&gt;");
    expect(msg.text).not.toContain("<b>A&B</b>");
    expect(msg.reply_markup.inline_keyboard[0]?.[0]?.web_app?.url).toBe(
      `${MINI_APP_URL}?ref=REF123`,
    );
  });

  it("stays within Telegram's 4096-character message limit", () => {
    expect(buildWelcomeMessage("x".repeat(40)).text.length).toBeLessThan(4096);
  });
});
