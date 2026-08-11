import type { Env } from './types';
import { runAgent, MAX_INPUT_CHARS } from './agent';
import { createCapture, markDraftReady, markDraftFailed, approveDraft, discardDraft, getDraft } from './drafts';
import { tgSendToChat, tgEditInChat, tgAnswerCallback, type InlineKeyboard } from './telegram';

/**
 * Telegram bot update routing (ARCHITECTURE.md §9 Phase 5 Stage 2).
 *
 * This module deliberately imports NO publishing capability — no ./github, and
 * none of telegram.ts's channel-posting helpers. The bot captures ideas and
 * shapes them into drafts; publishing remains the Mini App's human-gated flow
 * (D6, CLAUDE.md rule 3). Do not add such an import: approving here marks a
 * draft approved, nothing more.
 *
 * Authentication for this surface lives in index.ts, which verifies Telegram's
 * secret-token header and the sender id before any of this runs.
 */

const HELP =
  "Salom! Menga post g'oyangizni yozing — AI uni qoralamaga aylantiradi, " +
  "siz tekshirib tasdiqlaysiz, keyin Mini App'da tugatasiz.\n\n" +
  "Hozircha faqat matn qabul qilinadi. Ovoz va rasm keyingi bosqichlarda qo'shiladi.";

interface TgUser { id: number }
interface TgChat { id: number }
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  voice?: unknown;
  photo?: unknown;
  document?: unknown;
}
interface TgCallbackQuery {
  id: string;
  from?: TgUser;
  data?: string;
  message?: { message_id: number; chat: TgChat };
}
export interface TgUpdate {
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

/** Returns the sender id of whichever update kind this is, or null. */
export function updateSenderId(update: TgUpdate): number | null {
  return update.message?.from?.id ?? update.callback_query?.from?.id ?? null;
}

function reviewKeyboard(draftId: string): InlineKeyboard {
  // callback_data is capped at 64 bytes by Telegram; "ok:" + a 36-char uuid
  // is 39, comfortably inside.
  return {
    inline_keyboard: [
      [
        { text: '✅ Saqlash', callback_data: `ok:${draftId}` },
        { text: '🗑 Bekor qilish', callback_data: `no:${draftId}` },
      ],
    ],
  };
}

function finishKeyboard(env: Env, draftId: string): InlineKeyboard {
  return {
    inline_keyboard: [[{ text: '✏️ Mini App’da tugatish', url: `${env.SITE_ORIGIN}/post-builder/?draft=${draftId}` }]],
  };
}

async function handleTextMessage(env: Env, msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  if (text.startsWith('/start') || text.startsWith('/help')) {
    await tgSendToChat(env, chatId, HELP);
    return;
  }
  if (text.startsWith('/')) {
    await tgSendToChat(env, chatId, "Bunday buyruq yo'q. Shunchaki g'oyangizni yozing.");
    return;
  }
  if (!text) return;

  if (text.length > MAX_INPUT_CHARS) {
    await tgSendToChat(
      env,
      chatId,
      `Matn juda uzun (${text.length} belgi). Eng ko'pi ${MAX_INPUT_CHARS} belgi.`
    );
    return;
  }

  // Acknowledge before the slow part, so the author sees something within a
  // second instead of wondering whether the bot heard them. The result edits
  // this same message in place.
  let ackId: number | null = null;
  try {
    ackId = await tgSendToChat(env, chatId, '⏳ AI ishlayapti...');
  } catch {
    /* non-fatal — the work below still runs */
  }

  const say = async (body: string, keyboard?: InlineKeyboard) => {
    if (ackId !== null) {
      await tgEditInChat(env, chatId, ackId, body, keyboard);
    } else {
      await tgSendToChat(env, chatId, body, keyboard);
    }
  };

  // Draft row first, so a provider failure leaves retryable work rather than
  // losing what the author wrote (SKILLS.md `agent-task` step 1). Inside the
  // try: if D1 itself fails, the author must still be told, not left silent.
  let draftId: string | null = null;
  try {
    draftId = await createCapture(env, text);

    // skipMeta: one LLM call instead of two. The title here is a placeholder
    // the author sets in the Mini App, so the second call bought nothing and
    // doubled the latency.
    const result = await runAgent(env, 'improve', {
      title: 'Draft',
      excerpt: '',
      markdown: text,
      skipMeta: true,
    });
    await markDraftReady(env, draftId, result);

    const preview = result.markdown.length > 3000 ? result.markdown.slice(0, 3000) + '…' : result.markdown;
    await say(`📝 Qoralama tayyor\n\n${preview}\n\n— ${result.provider}/${result.model}`, reviewKeyboard(draftId));
  } catch (err) {
    if (draftId) await markDraftFailed(env, draftId, (err as Error).message);
    console.error('bot capture failed', err);
    // A readable message rather than silence; the real reason stays
    // server-side.
    await say(
      draftId
        ? "AI hozir javob bermadi. Matningiz saqlandi — keyinroq urinib ko'ring."
        : "Xatolik yuz berdi. Keyinroq urinib ko'ring."
    );
  }
}

async function handleCallback(env: Env, cb: TgCallbackQuery): Promise<void> {
  // Always answer, or Telegram leaves the button spinning.
  await tgAnswerCallback(env, cb.id);

  const data = cb.data || '';
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  if (!chatId || !messageId) return;

  const [action, draftId] = [data.slice(0, 2), data.slice(3)];
  if (!draftId) return;

  const draft = await getDraft(env, draftId);
  if (!draft) {
    await tgEditInChat(env, chatId, messageId, 'Bu qoralama topilmadi.');
    return;
  }

  if (action === 'ok') {
    await approveDraft(env, draftId);
    await tgEditInChat(
      env,
      chatId,
      messageId,
      `✅ Saqlandi\n\n📝 ${draft.result_title || ''}\n\nMini App'da tugatib, nashr qiling.`,
      finishKeyboard(env, draftId)
    );
    return;
  }

  if (action === 'no') {
    await discardDraft(env, draftId);
    await tgEditInChat(env, chatId, messageId, '🗑 Bekor qilindi.');
  }
}

/**
 * Processes one already-authenticated update. Runs inside ctx.waitUntil, so it
 * must never throw — a rejection here would be an unhandled promise rather
 * than something the caller can report.
 */
export async function handleUpdate(env: Env, update: TgUpdate): Promise<void> {
  try {
    if (update.callback_query) {
      await handleCallback(env, update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg) return;

    if (msg.voice || msg.photo || msg.document) {
      await tgSendToChat(
        env,
        msg.chat.id,
        "Hozircha faqat matn qabul qilaman. Ovoz va rasm keyingi bosqichlarda qo'shiladi."
      );
      return;
    }

    await handleTextMessage(env, msg);
  } catch (err) {
    console.error('bot handleUpdate failed', err);
  }
}
