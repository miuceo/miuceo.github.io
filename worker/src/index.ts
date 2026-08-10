import type { Env } from './types';
import {
  verifyLoginWidgetAuth, verifyMiniAppInitData, loginWidgetAuthDateAgeSeconds, AUTH_MAX_AGE,
  createSession, requireSession, revokeSession, readSessionToken,
  buildSessionCookie, buildClearCookie,
} from './auth';
import { isAllowedPath, ghGetFile, ghPutFile, ghPutFileSafe, ghDeleteFile } from './github';
import { tgSendPost, tgEditPost, tgDeleteMessage } from './telegram';
import { runAgent, MAX_INPUT_CHARS, type AgentTask } from './agent';
import { createDraft, markDraftReady, markDraftFailed } from './drafts';
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
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
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
