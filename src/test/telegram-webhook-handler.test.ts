import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, webhookSecret } from "@/routes/api/public/telegram-webhook";

const TOKEN = "123:test-token";
type Handler = (ctx: { request: Request }) => Promise<Response>;
const POST = (Route as unknown as { options: { server: { handlers: { POST: Handler } } } }).options
  .server.handlers.POST;

function post(update: unknown) {
  return POST({
    request: new Request("https://app.test/api/public/telegram-webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": webhookSecret(TOKEN),
      },
      body: JSON.stringify(update),
    }),
  });
}

describe("telegram webhook handler", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["TELEGRAM_API_KEY"];
  });

  it("replies with the welcome + Start button to a photo (no text)", async () => {
    process.env["TELEGRAM_API_KEY"] = TOKEN;
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await post({
      message: { chat: { id: 42 }, from: { first_name: "Rahim" }, photo: [{}] },
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe(42);
    expect(body.reply_markup.inline_keyboard[0][0].text).toBe("🚀 Start");
  });

  it("passes a referral code from /start into the button URL", async () => {
    process.env["TELEGRAM_API_KEY"] = TOKEN;
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await post({ message: { text: "/start REF99", chat: { id: 7 } } });
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.reply_markup.inline_keyboard[0][0].web_app.url).toMatch(/\?ref=REF99$/);
  });

  it("rejects requests with a wrong secret token", async () => {
    process.env["TELEGRAM_API_KEY"] = TOKEN;
    const res = await POST({
      request: new Request("https://app.test/x", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "wrong" },
        body: "{}",
      }),
    });
    expect(res.status).toBe(401);
  });
});
