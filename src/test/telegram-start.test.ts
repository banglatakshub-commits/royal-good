import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStartKeyboard,
  buildStartMessage,
  sendStartGreeting,
} from "@/lib/telegram-start.server";

const appUrl = "https://royal-good-production.up.railway.app/";

describe("Telegram /start welcome message", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("greets the user by name and links the mini app", () => {
    const text = buildStartMessage("Soikot", appUrl);
    expect(text).toContain("<b>Soikot</b>");
    expect(text).toContain(`href="${appUrl}"`);
    expect(text).toContain("Life Good — Telegram Earning Mini App");
  });

  it("showcases spin, ads and typing income like the mini app", () => {
    const text = buildStartMessage("Soikot", appUrl);
    const plain = text.replace(/<[^>]+>/g, "");
    expect(plain).toContain("Spin korun");
    expect(plain).toContain("Add dekhe");
    expect(plain).toContain("Typing kore income korun");
    expect(text).toContain("Our Active Income Projects");
  });

  it("escapes HTML in the user-provided first name", () => {
    const text = buildStartMessage('<script>"x"</script>', appUrl);
    expect(text).not.toContain("<script>");
    expect(text).toContain("&lt;script&gt;");
  });

  it("stays within Telegram's 4096-character message limit", () => {
    expect(buildStartMessage("A".repeat(40), appUrl).length).toBeLessThan(4096);
  });

  it("builds a Start button that opens the mini app", () => {
    const keyboard = buildStartKeyboard(appUrl);
    const button = keyboard.inline_keyboard[0]![0]!;
    expect(button.text).toContain("Start");
    expect(button.web_app.url).toBe(appUrl);
  });

  it("shows a typing indicator first, then sends the formatted message", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return new Response("{}");
      }),
    );

    await sendStartGreeting("test-token", 123456, "Soikot", appUrl);

    expect(calls).toHaveLength(2);
    const [chatAction, message] = calls;
    expect(chatAction!.url).toBe("https://api.telegram.org/bottest-token/sendChatAction");
    expect(chatAction!.body).toMatchObject({ chat_id: 123456, action: "typing" });
    expect(message!.url).toBe("https://api.telegram.org/bottest-token/sendMessage");
    expect(message!.body).toMatchObject({ chat_id: 123456, parse_mode: "HTML" });
    expect(String(message!.body["text"])).toContain("<b>Soikot</b>");
    expect(message!.body["reply_markup"]).toEqual(buildStartKeyboard(appUrl));
  });
});
