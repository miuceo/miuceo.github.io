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

/* ---------- Bot chat (Phase 5 Stage 2) ----------
   The three functions above all post to env.TG_CHANNEL and cannot express
   reply_markup. Bot conversation happens in the author's private chat and
   needs inline keyboards, so these take an explicit chat_id. Deliberately
   additive — the functions above are on the live publish path and unchanged. */

export interface InlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
}

export async function tgSendToChat(
  env: Env, chatId: number | string, text: string, replyMarkup?: InlineKeyboard
): Promise<number> {
  const res = await fetch(apiUrl(env, 'sendMessage'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  const data = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };
  if (!data.ok || !data.result) throw new Error('Telegram sendToChat failed: ' + (data.description || ''));
  return data.result.message_id;
}

export async function tgEditInChat(
  env: Env, chatId: number | string, messageId: number, text: string, replyMarkup?: InlineKeyboard
): Promise<void> {
  const res = await fetch(apiUrl(env, 'editMessageText'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  const data = await res.json() as { ok: boolean; description?: string };
  if (!data.ok && !/message is not modified/i.test(data.description || '')) {
    throw new Error('Telegram editInChat failed: ' + (data.description || ''));
  }
}

/** Must be called for every callback_query or the button spins indefinitely. */
export async function tgAnswerCallback(env: Env, callbackQueryId: string, text?: string): Promise<void> {
  await fetch(apiUrl(env, 'answerCallbackQuery'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
  });
}

/**
 * Downloads a file the bot received (a voice note, for Stage 3).
 *
 * The bytes are returned to the caller and never written anywhere: voice notes
 * are personal data and are transcribed, used, then dropped (SKILLS.md
 * `voice-pipeline` step 5). There is deliberately no storage helper here.
 */
export async function tgDownloadFile(env: Env, fileId: string): Promise<{ bytes: ArrayBuffer; path: string }> {
  const infoRes = await fetch(apiUrl(env, 'getFile'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  const info = await infoRes.json() as { ok: boolean; result?: { file_path: string }; description?: string };
  if (!info.ok || !info.result?.file_path) {
    throw new Error('Telegram getFile failed: ' + (info.description || ''));
  }

  const path = info.result.file_path;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${path}`);
  if (!fileRes.ok) throw new Error(`Telegram file download failed: ${fileRes.status}`);
  return { bytes: await fileRes.arrayBuffer(), path };
}

/** Registers this Worker as the bot's webhook, using secrets it already holds. */
export async function tgSetWebhook(env: Env, url: string, secretToken: string): Promise<void> {
  const res = await fetch(apiUrl(env, 'setWebhook'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
    }),
  });
  const data = await res.json() as { ok: boolean; description?: string };
  if (!data.ok) throw new Error('Telegram setWebhook failed: ' + (data.description || ''));
}
