import type { Env, Session } from './types';

const LOGIN_WIDGET_MAX_AGE_SECONDS = 300;   // 5 min — a login link is a one-time thing
const MINI_APP_MAX_AGE_SECONDS = 86400;     // 24h — a Mini App session can sit open longer

function hexFromBuffer(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Telegram Login Widget verification.
 * secret_key = SHA256(bot_token); hash = HMAC_SHA256(data_check_string, secret_key)
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export async function verifyLoginWidgetAuth(
  user: Record<string, string | number>,
  botToken: string
): Promise<boolean> {
  const { hash, ...data } = user as Record<string, string | number> & { hash: string };
  if (!hash) return false;
  const checkString = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('\n');
  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.digest('SHA-256', encoder.encode(botToken));
  const key = await crypto.subtle.importKey('raw', secretKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(checkString));
  return timingSafeEqual(hexFromBuffer(sig), String(hash));
}

/**
 * Telegram Mini App (WebApp) initData verification.
 * secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)
 * hash        = HMAC_SHA256(key=secret_key, data=data_check_string)
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * DIFFERENT construction from the Login Widget above — do not conflate them
 * (see SKILLS.md worker-endpoint gotcha).
 */
export async function verifyMiniAppInitData(
  initData: string,
  botToken: string
): Promise<{ valid: boolean; user?: { id: number; username?: string; first_name?: string }; authDate?: number }> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { valid: false };
  params.delete('hash');

  const pairs: string[] = [];
  for (const [k, v] of params.entries()) pairs.push(`${k}=${v}`);
  pairs.sort();
  const checkString = pairs.join('\n');

  const encoder = new TextEncoder();
  const secretKeyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const secretKeyBuf = await crypto.subtle.sign('HMAC', secretKeyMaterial, encoder.encode(botToken));
  const hmacKey = await crypto.subtle.importKey('raw', secretKeyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(checkString));

  const valid = timingSafeEqual(hexFromBuffer(sig), hash);
  if (!valid) return { valid: false };

  const authDate = Number(params.get('auth_date') || 0);
  const userRaw = params.get('user');
  const user = userRaw ? JSON.parse(userRaw) : undefined;
  return { valid: true, user, authDate };
}

export function loginWidgetAuthDateAgeSeconds(authDate: number): number {
  return Date.now() / 1000 - authDate;
}

export const AUTH_MAX_AGE = {
  loginWidget: LOGIN_WIDGET_MAX_AGE_SECONDS,
  miniApp: MINI_APP_MAX_AGE_SECONDS,
};

/* ---------- Sessions (D1-backed, revocable) ---------- */

export async function createSession(env: Env, telegramId: string): Promise<{ id: string; expiresAt: number }> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(env.SESSION_TTL_SECONDS) || 2592000;
  const expiresAt = now + ttl;
  await env.DB.prepare(
    'INSERT INTO sessions (id, telegram_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(id, telegramId, now, expiresAt).run();
  return { id, expiresAt };
}

export async function getValidSession(env: Env, sessionId: string): Promise<Session | null> {
  const row = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first<Session>();
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (row.revoked_at || row.expires_at < now) return null;
  return row;
}

export async function revokeSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?')
    .bind(Math.floor(Date.now() / 1000), sessionId).run();
}

export function buildSessionCookie(env: Env, sessionId: string, maxAgeSeconds: number): string {
  return `${env.SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function buildClearCookie(env: Env): string {
  return `${env.SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
}

export function readSessionCookie(req: Request, env: Env): string | null {
  const cookieHeader = req.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|; )${env.SESSION_COOKIE_NAME}=([^;]+)`));
  return match && match[1] ? match[1] : null;
}

/**
 * Embedded webviews (confirmed: Telegram Desktop's Mini App browser) can
 * block the cross-site session cookie — the Worker's domain differs from
 * the site's, so SameSite=None cookies get treated as third-party and
 * silently dropped even though they're set correctly. The `Authorization:
 * Bearer <sessionId>` header is the fallback: same session id, just carried
 * explicitly by the client (localStorage, not a cookie) instead of relying
 * on the browser to attach it automatically. Cookie auth stays the default
 * for normal browser flows (login.html/admin.html/post-builder.html) —
 * this is additive, not a replacement.
 */
export function readSessionToken(req: Request, env: Env): string | null {
  const authHeader = req.headers.get('Authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer (.+)$/);
  if (bearerMatch && bearerMatch[1]) return bearerMatch[1];
  return readSessionCookie(req, env);
}

/** Every route except /auth/* must call this before doing anything else. */
export async function requireSession(req: Request, env: Env): Promise<Session | null> {
  const token = readSessionToken(req, env);
  if (!token) return null;
  return getValidSession(env, token);
}
