import type { Env } from './types';
import {
  verifyLoginWidgetAuth, verifyMiniAppInitData, loginWidgetAuthDateAgeSeconds, AUTH_MAX_AGE,
  createSession, requireSession, revokeSession, readSessionToken,
  buildSessionCookie, buildClearCookie,
} from './auth';
import { isAllowedPath, ghGetFile, ghPutFile, ghPutFileSafe, ghDeleteFile } from './github';
import { tgSendPost, tgEditPost, tgDeleteMessage } from './telegram';
import { runAgent, describeImage, MAX_INPUT_CHARS, type AgentTask } from './agent';
import { createDraft, markDraftReady, markDraftFailed, getDraft } from './drafts';
import { handleUpdate, updateSenderId, type TgUpdate } from './bot';
import { tgSetWebhook } from './telegram';
import type { DraftKind, Lang } from './types';

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.SITE_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(env: Env, data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env), ...extraHeaders },
  });
}

function errorResponse(env: Env, message: string, status = 400): Response {
  // Never leak provider responses or stack traces to the client (SKILLS.md worker-endpoint).
  return json(env, { ok: false, error: message }, status);
}

async function readJson<T>(req: Request): Promise<T> {
  try {
    return await req.json() as T;
  } catch {
    throw new Error('Invalid JSON body');
  }
}

const LANGS: Lang[] = ['uz', 'en', 'ru'];
const SLUG_RE = /^[a-z0-9-]+$/;

interface AgentRequestBody {
  slug?: string;
  targetLang?: string;
  title?: string;
  excerpt?: string;
  markdown?: string;
}

/**
 * Shared handler for /api/agent/*. Both tasks have the same shape and the same
 * D6 posture: write the draft row first, call the model, hand the proposal back
 * to the author for review. Nothing here writes to GitHub — publishing is a
 * separate call the author's client makes to /api/github/put after reviewing.
 */
async function handleAgentTask(env: Env, req: Request, task: AgentTask): Promise<Response> {
  const body = await readJson<AgentRequestBody>(req);

  const slug = (body.slug || '').trim();
  const title = (body.title || '').trim();
  const markdown = body.markdown || '';
  const excerpt = (body.excerpt || '').trim();

  if (!SLUG_RE.test(slug)) return errorResponse(env, 'Yaroqsiz slug.', 400);
  if (!title) return errorResponse(env, 'Sarlavha kerak.', 400);
  if (!markdown.trim()) return errorResponse(env, 'Post matni bo\'sh.', 400);

  // Long posts would blow past free-tier output limits and come back
  // truncated, which is worse than a clear refusal. Chunking is the first
  // follow-up; until then the cap is explicit.
  if (markdown.length > MAX_INPUT_CHARS) {
    return errorResponse(
      env,
      `Post juda uzun (${markdown.length} belgi). Hozircha eng ko'pi ${MAX_INPUT_CHARS} belgi tarjima qilinadi.`,
      400
    );
  }

  const targetLang = (body.targetLang || 'en') as Lang;
  if (task === 'translate' && !LANGS.includes(targetLang)) {
    return errorResponse(env, 'Yaroqsiz til.', 400);
  }

  const kind: DraftKind = task === 'translate' ? 'translation' : 'improvement';

  // Draft row first — a provider failure below must leave a retryable row
  // behind, never lose the author's work (SKILLS.md `agent-task` step 1).
  const draftId = await createDraft(env, { slug, targetLang, kind, sourceText: markdown });

  try {
    const result = await runAgent(env, task, { title, excerpt, markdown, targetLang });
    await markDraftReady(env, draftId, result);
    return json(env, {
      ok: true,
      draftId,
      title: result.title,
      excerpt: result.excerpt,
      markdown: result.markdown,
      provider: result.provider,
      model: result.model,
    });
  } catch (err) {
    // Record the real reason server-side, then rethrow so the catch-all
    // returns the generic message — provider detail never reaches a client.
    await markDraftFailed(env, draftId, (err as Error).message);
    throw err;
  }
}

export default {
  // `ctx` stays in the signature (unused for now) because later stages —
  // voice transcription, platform fan-out — will have genuinely fire-and-forget
  // work that suits waitUntil, unlike the agent call that must finish before
  // the author gets a reply.
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      /* ---------- /tg/webhook — the ONLY unauthenticated route ----------
         Telegram's servers have no session cookie, so this necessarily sits
         above the requireSession gate below. Three independent checks stand in
         for that gate; do not move this block downward or add siblings to it
         without the same checks.

         1. The secret-token header proves the caller is Telegram (it is set at
            setWebhook time and known only to Telegram and this Worker).
            Mismatch => 401, since that is not a real delivery worth suppressing
            retries for.
         2. The sender id must be the author. Anyone else => 200 and ignore: it
            IS a real Telegram delivery, so 200 stops pointless retries.
         3. The update is processed inline, awaited, before returning 200.

         An earlier version did the work in ctx.waitUntil to answer Telegram
         instantly. That silently broke: the runtime only grants waitUntil a
         short window *after* the response is sent, and two sequential
         reasoning-model calls exceeded it, so tasks were cancelled mid-flight
         and a posted idea produced no reply at all. `/start` still worked,
         which made it look like the bot was fine.

         Awaiting inline is correct here: the time is spent waiting on network
         I/O, not CPU, and Telegram tolerates a slow webhook far better than a
         fast 200 followed by nothing. The bot also acknowledges within a
         second and edits that message with the result, so the wait is
         visible rather than dead air. */

      if (path === '/tg/webhook' && req.method === 'POST') {
        const secret = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (!env.TG_WEBHOOK_SECRET || secret !== env.TG_WEBHOOK_SECRET) {
          return new Response('unauthorized', { status: 401 });
        }

        const update = await readJson<TgUpdate>(req);
        const senderId = updateSenderId(update);
        if (!senderId || String(senderId) !== env.ALLOWED_TELEGRAM_ID) {
          return new Response('ok', { status: 200 });
        }

        await handleUpdate(env, update);
        return new Response('ok', { status: 200 });
      }

      /* ---------- /auth/* — no session required, this IS the session issuer ---------- */

      if (path === '/auth/telegram-widget' && req.method === 'POST') {
        const user = await readJson<Record<string, string | number>>(req);
        const valid = await verifyLoginWidgetAuth(user, env.TG_BOT_TOKEN);
        if (!valid) return errorResponse(env, 'Telegram imzosi tasdiqlanmadi.', 401);
        const authDate = Number(user.auth_date || 0);
        if (loginWidgetAuthDateAgeSeconds(authDate) > AUTH_MAX_AGE.loginWidget) {
          return errorResponse(env, 'Login vaqti eskirgan, qaytadan urinib ko\'ring.', 401);
        }
        if (String(user.id) !== env.ALLOWED_TELEGRAM_ID) {
          return errorResponse(env, 'Sen admin emassan', 403);
        }
        const session = await createSession(env, String(user.id));
        return json(env, { ok: true, sessionId: session.id }, 200, {
          'Set-Cookie': buildSessionCookie(env, session.id, Number(env.SESSION_TTL_SECONDS)),
        });
      }

      if (path === '/auth/telegram-miniapp' && req.method === 'POST') {
        const { initData } = await readJson<{ initData: string }>(req);
        const result = await verifyMiniAppInitData(initData, env.TG_BOT_TOKEN);
        if (!result.valid || !result.user) return errorResponse(env, 'Telegram Mini App imzosi tasdiqlanmadi.', 401);
        if ((Date.now() / 1000 - (result.authDate || 0)) > AUTH_MAX_AGE.miniApp) {
          return errorResponse(env, 'Sessiya eskirgan, Telegram\'da botni qaytadan oching.', 401);
        }
        if (String(result.user.id) !== env.ALLOWED_TELEGRAM_ID) {
          return errorResponse(env, 'Sen admin emassan', 403);
        }
        const session = await createSession(env, String(result.user.id));
        return json(env, { ok: true, sessionId: session.id }, 200, {
          'Set-Cookie': buildSessionCookie(env, session.id, Number(env.SESSION_TTL_SECONDS)),
        });
      }

      if (path === '/auth/logout' && req.method === 'POST') {
        const token = readSessionToken(req, env);
        if (token) await revokeSession(env, token);
        return json(env, { ok: true }, 200, { 'Set-Cookie': buildClearCookie(env) });
      }

      /* ---------- /api/* — every route below requires a valid session ---------- */

      const session = await requireSession(req, env);

      if (path === '/api/session' && req.method === 'GET') {
        if (!session) return errorResponse(env, 'Not authenticated', 401);
        return json(env, { ok: true, telegram_id: session.telegram_id, expires_at: session.expires_at });
      }

      if (!session) return errorResponse(env, 'Not authenticated', 401);

      if (path === '/api/github/get' && req.method === 'POST') {
        const { path: filePath } = await readJson<{ path: string }>(req);
        if (!isAllowedPath(filePath)) return errorResponse(env, 'Path not allowed', 403);
        const file = await ghGetFile(env, filePath);
        return json(env, { ok: true, file });
      }

      if (path === '/api/github/put' && req.method === 'POST') {
        const { path: filePath, content, message, sha } = await readJson<{
          path: string; content: string; message: string; sha?: string | null;
        }>(req);
        if (!isAllowedPath(filePath)) return errorResponse(env, 'Path not allowed', 403);
        const result = await ghPutFileSafe(env, filePath, content, message, sha ?? null);
        return json(env, { ok: true, sha: result.sha });
      }

      if (path === '/api/github/delete' && req.method === 'POST') {
        const { path: filePath, message, sha } = await readJson<{ path: string; message: string; sha: string }>(req);
        if (!isAllowedPath(filePath)) return errorResponse(env, 'Path not allowed', 403);
        await ghDeleteFile(env, filePath, message, sha);
        return json(env, { ok: true });
      }

      if (path === '/api/telegram/send' && req.method === 'POST') {
        const { title, excerpt, coverImage, postUrl } = await readJson<{
          title: string; excerpt: string; coverImage: string | null; postUrl: string;
        }>(req);
        const messageId = await tgSendPost(env, title, excerpt, coverImage, postUrl);
        return json(env, { ok: true, message_id: messageId });
      }

      if (path === '/api/telegram/edit' && req.method === 'POST') {
        const { messageId, title, excerpt, postUrl, hadMedia } = await readJson<{
          messageId: number; title: string; excerpt: string; postUrl: string; hadMedia: boolean;
        }>(req);
        await tgEditPost(env, messageId, title, excerpt, postUrl, hadMedia);
        return json(env, { ok: true });
      }

      if (path === '/api/telegram/delete' && req.method === 'POST') {
        const { messageId } = await readJson<{ messageId: number }>(req);
        await tgDeleteMessage(env, messageId);
        return json(env, { ok: true });
      }

      /* ---------- /api/agent/* — proposes text, publishes nothing (D6) ---------- */

      if (path === '/api/agent/translate' && req.method === 'POST') {
        return handleAgentTask(env, req, 'translate');
      }

      if (path === '/api/agent/improve' && req.method === 'POST') {
        return handleAgentTask(env, req, 'improve');
      }

      // Alt text for one image. Unlike translate/improve this writes no draft
      // row: there is no author work to lose, the result is a single short
      // string returned immediately, and a row per image would be noise.
      if (path === '/api/agent/alt-text' && req.method === 'POST') {
        const { imageUrl, lang } = await readJson<{ imageUrl?: string; lang?: string }>(req);
        const url_ = (imageUrl || '').trim();

        // Only https, and bounded — this string is handed to a provider and
        // its answer ends up in an HTML attribute.
        if (!url_ || url_.length > 2000 || !/^https:\/\//i.test(url_)) {
          return errorResponse(env, 'Rasm uchun https havola kerak.', 400);
        }
        const target = (lang || 'uz') as Lang;
        if (!LANGS.includes(target)) return errorResponse(env, 'Yaroqsiz til.', 400);

        const result = await describeImage(env, url_, target);
        return json(env, { ok: true, alt: result.alt, provider: result.provider, model: result.model });
      }

      /* ---------- drafts + bot administration (author only) ---------- */

      if (path === '/api/drafts/get' && req.method === 'POST') {
        const { id } = await readJson<{ id: string }>(req);
        if (!id) return errorResponse(env, 'Draft id kerak.', 400);
        const draft = await getDraft(env, id);
        if (!draft) return errorResponse(env, 'Qoralama topilmadi.', 404);
        return json(env, {
          ok: true,
          draft: {
            id: draft.id,
            kind: draft.kind,
            status: draft.status,
            title: draft.result_title,
            excerpt: draft.result_excerpt,
            markdown: draft.result_text ?? draft.source_text,
            approved_at: draft.approved_at,
          },
        });
      }

      // Registers this Worker as the bot's webhook using secrets it already
      // holds, so the author never has to handle the bot token themselves.
      if (path === '/api/telegram/register-webhook' && req.method === 'POST') {
        if (!env.TG_WEBHOOK_SECRET) {
          return errorResponse(env, 'TG_WEBHOOK_SECRET sozlanmagan.', 400);
        }
        await tgSetWebhook(env, `${url.origin}/tg/webhook`, env.TG_WEBHOOK_SECRET);
        return json(env, { ok: true, webhook: `${url.origin}/tg/webhook` });
      }

      return errorResponse(env, 'Not found', 404);
    } catch (err) {
      // Log the real error server-side; never forward a provider's raw response
      // or a stack trace to the client (SKILLS.md worker-endpoint).
      console.error(err);
      if (err instanceof Error && err.message === 'Invalid JSON body') {
        return errorResponse(env, err.message, 400);
      }
      return errorResponse(env, 'Something went wrong. Try again.', 502);
    }
  },
};
