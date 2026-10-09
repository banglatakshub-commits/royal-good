const TELEGRAM_API_BASE = "https://api.telegram.org";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rich HTML welcome message sent when a user presses Start on the bot.
 * Mirrors the mini app vibe: spin korun, add dekhe, typing kore income korun.
 */
export function buildStartMessage(firstName: string, appUrl: string) {
  const name = escapeHtml(firstName);
  const safeUrl = escapeHtml(appUrl);
  return [
    `🎉 স্বাগতম, <b>${name}</b>!`,
    ``,
    `👑 <a href="${safeUrl}"><b>Life Good — Telegram Earning Mini App</b></a>`,
    `<i>Telegram-e সহজ টাস্ক kore income korun।</i>`,
    ``,
    `✨ <b>কীভাবে income korun?</b>`,
    `🎰 <b>Spin korun</b> — Daily Spin, প্রতিদিন ৳20-300`,
    `📺 <b>Add dekhe</b> income korun`,
    `⌨️ <b>Typing kore</b> income korun`,
    `❓ <b>Quiz kore</b> bonus nin`,
    ``,
    `💼 <b>Our Active Income Projects</b>`,
    `⌨️ Typing Job  •  ❓ Quiz Job`,
    `📺 Ads Video  •  🎰 Daily Spin`,
    `👥 Refer  •  💰 Withdraw`,
    ``,
    `🔮 <i>✨ আরও Income App coming soon!</i>`,
    ``,
    `👇 নিচের <b>Start</b> Button-e click korle App open hobe!`,
  ].join("\n");
}

/** Inline keyboard with a single Start button that opens the mini app. */
export function buildStartKeyboard(appUrl: string) {
  return {
    inline_keyboard: [[{ text: "🚀 Start — Life Good Mini App", web_app: { url: appUrl } }]],
  };
}

/**
 * Shows the "typing…" chat indicator first (like a human reply), then sends
 * the formatted welcome message with the Start button.
 */
export async function sendStartGreeting(
  botToken: string,
  chatId: number | string,
  firstName: string,
  appUrl: string,
) {
  const api = `${TELEGRAM_API_BASE}/bot${botToken}`;
  const headers = { "content-type": "application/json" };

  await fetch(`${api}/sendChatAction`, {
    method: "POST",
    headers,
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});

  await fetch(`${api}/sendMessage`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      chat_id: chatId,
      text: buildStartMessage(firstName, appUrl),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: buildStartKeyboard(appUrl),
    }),
  }).catch(() => {});
}
