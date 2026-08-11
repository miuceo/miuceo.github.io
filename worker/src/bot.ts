import type { Env } from './types';
import { runAgent, transcribeAudio, MAX_INPUT_CHARS, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from './agent';
import {
  createCapture, markDraftReady, markDraftFailed, approveDraft, discardDraft, getDraft,
  getSetting, setSetting,
} from './drafts';
import { tgSendToChat, tgEditInChat, tgAnswerCallback, tgDownloadFile, type InlineKeyboard } from './telegram';

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
  "Salom! Menga post g'oyangizni yozing yoki ovozli xabar yuboring — AI uni " +
  "qoralamaga aylantiradi, siz tekshirib tasdiqlaysiz, keyin Mini App'da tugatasiz.\n\n" +
  "🎙 Ovozli xabar: avval eshitganimni ko'rsataman, siz tasdiqlaganingizdan keyin " +
  "qoralama tayyorlanadi.\n\n" +
  "/til uz — o'zbekcha yozib olish aniqligini sezilarli oshiradi (avtomatik aniqlash " +
  "o'zbek tilini ko'pincha turkcha deb o'qiydi).\n\n" +
  "Rasm keyingi bosqichda qo'shiladi.";

interface TgUser { id: number }
interface TgChat { id: number }
const STT_LANGS = ['uz', 'en', 'ru', 'auto'];

interface TgVoice {
  file_id: string;
  duration?: number;
  file_size?: number;
  mime_type?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  voice?: TgVoice;
  audio?: TgVoice;
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

/**
 * Pulls a title out of the message if the author gave one.
 *
 * Accepts what people actually type — `Title:` / `Sarlavha:` / `Заголовок:`
 * on the first line, optionally followed by a `Body:` / `Matn:` / `Текст:`
 * marker — and otherwise falls back to treating a short standalone first line
 * as the title. If neither applies the title is left empty rather than
 * invented; the author sets it in the Mini App.
 */
export function parseCapture(text: string): { title: string; body: string } {
  const lines = text.split('\n');
  const titleMatch = lines[0]?.match(/^\s*(?:title|sarlavha|заголовок)\s*:\s*(.+)$/i);

  if (titleMatch && titleMatch[1]) {
    const rest = lines.slice(1).join('\n');
    const body = rest.replace(/^\s*(?:body|matn|текст)\s*:\s*/i, '').trim();
    return { title: titleMatch[1].trim(), body: body || rest.trim() };
  }

  // A short first line followed by a blank line reads as a heading.
  const first = (lines[0] || '').trim();
  if (first && first.length <= 80 && lines.length > 1 && !(lines[1] || '').trim()) {
    return { title: first, body: lines.slice(2).join('\n').trim() };
  }

  return { title: '', body: text.trim() };
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

/**
 * The transcript gate. SKILLS.md `voice-pipeline` step 2 is explicit: always
 * show the transcript for correction *before* drafting, because Whisper is
 * materially weaker in Uzbek than in English or Russian. So a voice note never
 * goes straight to the agent — the author confirms what was heard first.
 */
function transcriptKeyboard(draftId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: '✅ To‘g‘ri, davom et', callback_data: `tr:${draftId}` },
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
  // /til — pins the language Whisper uses instead of auto-detecting. Auto is
  // the default (the author speaks all three), but detection handles Uzbek
  // badly, so pinning it is the fix when transcripts come back wrong.
  const tilMatch = text.match(/^\/til(?:\s+(\S+))?/i);
  if (tilMatch) {
    const arg = (tilMatch[1] || '').toLowerCase();
    if (!STT_LANGS.includes(arg)) {
      const current = (await getSetting(env, 'stt_language')) || 'auto';
      await tgSendToChat(
        env, chatId,
        `Ovoz tili: ${current}\n\nO'zgartirish: /til uz | /til en | /til ru | /til auto\n\n` +
          `Agar o'zbekcha yozib olish noto'g'ri bo'lsa — /til uz buyrug'i aniqlikni sezilarli oshiradi.`
      );
      return;
    }
    await setSetting(env, 'stt_language', arg);
    await tgSendToChat(env, chatId, `✅ Ovoz tili: ${arg}`);
    return;
  }

  if (text.startsWith('/')) {
    await tgSendToChat(env, chatId, "Bunday buyruq yo'q. Shunchaki g'oyangizni yozing yoki /til.");
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
    const { title, body } = parseCapture(text);
    draftId = await createCapture(env, text);

    // skipMeta: one LLM call instead of two. The author's own title is used
    // when they gave one, so asking a model to invent another bought nothing
    // and doubled the latency.
    const result = await runAgent(env, 'improve', {
      title,
      excerpt: '',
      markdown: body,
      skipMeta: true,
    });
    await markDraftReady(env, draftId, result);

    const preview = result.markdown.length > 3000 ? result.markdown.slice(0, 3000) + '…' : result.markdown;
    const heading = title ? `📝 ${title}` : '📝 Qoralama tayyor';
    await say(`${heading}\n\n${preview}\n\n— ${result.provider}/${result.model}`, reviewKeyboard(draftId));
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

/**
 * Voice note -> transcript, shown for confirmation. Deliberately stops there:
 * no agent call, no draft shaping, until the author confirms what was heard.
 *
 * The audio itself is held only as bytes in this function and never written
 * anywhere (SKILLS.md `voice-pipeline` step 5 — transcribe, use, discard).
 */
async function handleVoiceMessage(env: Env, msg: TgMessage, voice: TgVoice): Promise<void> {
  const chatId = msg.chat.id;

  // Guards before downloading anything, so an oversized note costs one cheap
  // reply rather than a 25 MB transfer and a rejected API call.
  if (voice.duration && voice.duration > MAX_AUDIO_SECONDS) {
    await tgSendToChat(
      env, chatId,
      `Ovozli xabar juda uzun (${voice.duration}s). Eng ko‘pi ${MAX_AUDIO_SECONDS}s.`
    );
    return;
  }
  if (voice.file_size && voice.file_size > MAX_AUDIO_BYTES) {
    await tgSendToChat(env, chatId, 'Ovozli xabar juda katta (eng ko‘pi 25 MB).');
    return;
  }

  let ackId: number | null = null;
  try {
    ackId = await tgSendToChat(env, chatId, '🎧 Tinglayapman...');
  } catch {
    /* non-fatal */
  }
  const say = async (body: string, keyboard?: InlineKeyboard) => {
    if (ackId !== null) await tgEditInChat(env, chatId, ackId, body, keyboard);
    else await tgSendToChat(env, chatId, body, keyboard);
  };

  let draftId: string | null = null;
  try {
    const pinned = await getSetting(env, 'stt_language');
    const { bytes, path } = await tgDownloadFile(env, voice.file_id);
    const filename = path.split('/').pop() || 'voice.ogg';
    const transcript = await transcribeAudio(env, bytes, filename, pinned);

    // The transcript is the draft's source text. The raw audio goes out of
    // scope here and is never persisted.
    draftId = await createCapture(env, transcript.text);

    const langNote = pinned && pinned !== 'auto'
      ? ` (${pinned}, qat'iy)`
      : transcript.language ? ` (${transcript.language}, avtomatik)` : '';
    const hint = (!pinned || pinned === 'auto')
      ? `\n\nNoto‘g‘ri chiqdimi? /til uz — o‘zbekcha aniqlikni oshiradi.`
      : '';
    await say(
      `🎙 Eshitganim${langNote}:\n\n${transcript.text}\n\n` +
        `Agar xato bo‘lsa — to‘g‘rilangan matnni oddiy xabar qilib yuboring.${hint}`,
      transcriptKeyboard(draftId)
    );
  } catch (err) {
    if (draftId) await markDraftFailed(env, draftId, (err as Error).message);
    console.error('bot voice failed', err);
    await say("Ovozni matnga aylantirib bo‘lmadi. Keyinroq urinib ko‘ring.");
  }
}

/**
 * Second half of the voice flow: the author confirmed the transcript, so now
 * the agent may shape it. Mirrors the text-capture path from this point on.
 */
async function draftFromConfirmedTranscript(
  env: Env, chatId: number, messageId: number, draftId: string, sourceText: string
): Promise<void> {
  const say = (body: string, keyboard?: InlineKeyboard) =>
    tgEditInChat(env, chatId, messageId, body, keyboard);

  try {
    await say('⏳ AI ishlayapti...');
    const { title, body } = parseCapture(sourceText);
    const result = await runAgent(env, 'improve', {
      title, excerpt: '', markdown: body, skipMeta: true,
    });
    await markDraftReady(env, draftId, result);

    const preview = result.markdown.length > 3000 ? result.markdown.slice(0, 3000) + '…' : result.markdown;
    const heading = title ? `📝 ${title}` : '📝 Qoralama tayyor';
    await say(`${heading}\n\n${preview}\n\n— ${result.provider}/${result.model}`, reviewKeyboard(draftId));
  } catch (err) {
    await markDraftFailed(env, draftId, (err as Error).message);
    console.error('bot transcript drafting failed', err);
    await say("AI hozir javob bermadi. Matningiz saqlandi — keyinroq urinib ko‘ring.");
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

  // Transcript confirmed — only now may the agent see it.
  if (action === 'tr') {
    await draftFromConfirmedTranscript(env, chatId, messageId, draftId, draft.source_text);
    return;
  }

  if (action === 'ok') {
    await approveDraft(env, draftId);
    const heading = draft.result_title ? `\n\n📝 ${draft.result_title}` : '';
    await tgEditInChat(
      env,
      chatId,
      messageId,
      `✅ Saqlandi${heading}\n\nMini App'da tugatib, nashr qiling.`,
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

    const voice = msg.voice || msg.audio;
    if (voice) {
      await handleVoiceMessage(env, msg, voice);
      return;
    }

    if (msg.photo || msg.document) {
      await tgSendToChat(
        env,
        msg.chat.id,
        "Hozircha matn va ovozni qabul qilaman. Rasm keyingi bosqichda qo'shiladi."
      );
      return;
    }

    await handleTextMessage(env, msg);
  } catch (err) {
    console.error('bot handleUpdate failed', err);
  }
}
