import { getConfig } from '../config';
import { clamp } from './format';

const API = 'https://api.telegram.org';

/** Sends a MarkdownV2 message. Returns false rather than throwing. */
export async function sendMessage(chatId: string, text: string): Promise<boolean> {
  const { telegram } = getConfig();
  if (!telegram) return false;

  try {
    const res = await fetch(`${API}/bot${telegram.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: clamp(text),
        parse_mode: 'MarkdownV2',
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      // Telegram explains refusals in the body; a silent false is unhelpful
      // when a message never arrives.
      console.error('telegram sendMessage failed', res.status, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('telegram sendMessage threw', error);
    return false;
  }
}

/** Announces a settled gameweek to the configured chat. */
export async function announce(text: string): Promise<boolean> {
  const { telegram } = getConfig();
  if (!telegram?.chatId) return false;
  return sendMessage(telegram.chatId, text);
}
