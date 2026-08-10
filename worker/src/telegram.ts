import type { Env } from './types';

function apiUrl(env: Env, method: string): string {
  return `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`;
}

export async function tgSendPost(
  env: Env, title: string, excerpt: string, coverImage: string | null, postUrl: string
): Promise<number> {
  const caption = `${title}\n\n${excerpt}\n\n${postUrl}`;
  const method = coverImage ? 'sendPhoto' : 'sendMessage';
  const params = coverImage
    ? { chat_id: env.TG_CHANNEL, photo: coverImage, caption }
    : { chat_id: env.TG_CHANNEL, text: caption };
  const res = await fetch(apiUrl(env, method), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
  });
  const data = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };
  if (!data.ok || !data.result) throw new Error('Telegram send failed: ' + (data.description || JSON.stringify(data)));
  return data.result.message_id;
}

export async function tgEditPost(
  env: Env, messageId: number, title: string, excerpt: string, postUrl: string, hadMediaOriginally: boolean
): Promise<void> {
  const caption = `${title}\n\n${excerpt}\n\n${postUrl}`;
  const method = hadMediaOriginally ? 'editMessageCaption' : 'editMessageText';
  const params = hadMediaOriginally
    ? { chat_id: env.TG_CHANNEL, message_id: messageId, caption }
    : { chat_id: env.TG_CHANNEL, message_id: messageId, text: caption };
  const res = await fetch(apiUrl(env, method), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
  });
  const data = await res.json() as { ok: boolean; description?: string };
  if (!data.ok) {
    if (/message is not modified/i.test(data.description || '')) return;
    throw new Error('Telegram edit failed: ' + (data.description || JSON.stringify(data)));
  }
}

export async function tgDeleteMessage(env: Env, messageId: number): Promise<void> {
  if (!messageId) return;
  await fetch(apiUrl(env, 'deleteMessage'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TG_CHANNEL, message_id: messageId }),
  });
}
