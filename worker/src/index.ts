import type { Env } from './types';
import {
  verifyLoginWidgetAuth, verifyMiniAppInitData, loginWidgetAuthDateAgeSeconds, AUTH_MAX_AGE,
  createSession, requireSession, revokeSession, readSessionToken,
  buildSessionCookie, buildClearCookie,
} from './auth';
import { isAllowedPath, ghGetFile, ghPutFile, ghPutFileSafe, ghDeleteFile } from './github';
import { tgSendPost, tgEditPost, tgDeleteMessage } from './telegram';

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
