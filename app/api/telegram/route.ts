import { getConfig } from '@/lib/config';
import { sendMessage } from '@/lib/telegram/client';
import { respondTo } from '@/lib/telegram/commands';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Telegram webhook.
 *
 * Always answers 200: a non-200 makes Telegram retry the same update, which
 * would repost on every failure.
 */
export async function POST(request: Request) {
  const { telegram } = getConfig();
  if (!telegram) return Response.json({ ok: true });

  if (telegram.webhookSecret) {
    const provided = request.headers.get('x-telegram-bot-api-secret-token');
    if (provided !== telegram.webhookSecret) {
      return Response.json({ ok: false }, { status: 401 });
    }
  }

  try {
    const update = await request.json();
    const message = update?.message ?? update?.edited_message;
    const text: unknown = message?.text;
    const chatId: unknown = message?.chat?.id;

    if (typeof text !== 'string' || (typeof chatId !== 'number' && typeof chatId !== 'string')) {
      return Response.json({ ok: true });
    }

    const reply = await respondTo(text);
    if (reply) await sendMessage(String(chatId), reply);
  } catch (error) {
    console.error('telegram webhook failed', error);
  }

  return Response.json({ ok: true });
}
