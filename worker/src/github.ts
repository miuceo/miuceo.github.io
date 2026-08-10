import type { Env } from './types';

/**
 * Paths the Worker will read/write on the author's behalf. Deliberately
 * narrow — a session token only ever needs to touch these, so even a
 * compromised session (stolen cookie, XSS in the client) can't redirect a
 * write to an arbitrary file in the repo (e.g. admin.html itself).
 */
export function isAllowedPath(path: string): boolean {
  if (path === 'posts.json' || path === 'rss.xml') return true;
  if (/^posts\/[a-z0-9-]+\.html$/.test(path)) return true;
  if (/^posts-data\/[a-z0-9-]+\.json$/.test(path)) return true;
  // v2 Astro content collection — post-builder.html dual-writes here so the
  // Astro build (ARCHITECTURE.md §9 Phase 3) stays in sync with v1 publishes.
  // en/ru are written by the author approving an agent translation (Phase 5
  // Stage 1); the agent itself cannot reach this function.
  if (/^src\/content\/posts\/[a-z0-9-]+\/(uz|en|ru)\.md$/.test(path)) return true;
  return false;
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function apiUrl(env: Env, path: string): string {
  return `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${path}`;
}

function ghHeaders(env: Env): HeadersInit {
  return {
    Authorization: `token ${env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'miuceo-worker',
  };
}

export interface GhFile {
  sha: string;
  content: string;
}

export async function ghGetFile(env: Env, path: string): Promise<GhFile | null> {
  const res = await fetch(`${apiUrl(env, path)}?ref=${env.GH_BRANCH}`, { headers: ghHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { sha: string; content: string };
  return { sha: data.sha, content: base64ToUtf8(data.content) };
}

export async function ghPutFile(
  env: Env, path: string, contentStr: string, message: string, sha?: string | null
): Promise<{ sha: string }> {
  const body: Record<string, unknown> = {
    message,
    content: utf8ToBase64(contentStr),
    branch: env.GH_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(apiUrl(env, path), {
    method: 'PUT',
    headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${path} failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { content: { sha: string } };
  return { sha: data.content.sha };
}

/** Retries once with a fresh sha on a stale-sha conflict (409/422). */
export async function ghPutFileSafe(
  env: Env, path: string, contentStr: string, message: string, sha?: string | null
): Promise<{ sha: string }> {
  try {
    return await ghPutFile(env, path, contentStr, message, sha);
  } catch (err) {
    if (err instanceof Error && /40[9]|422/.test(err.message)) {
      const fresh = await ghGetFile(env, path);
      return ghPutFile(env, path, contentStr, message, fresh?.sha ?? null);
    }
    throw err;
  }
}

export async function ghDeleteFile(env: Env, path: string, message: string, sha: string): Promise<void> {
  const res = await fetch(apiUrl(env, path), {
    method: 'DELETE',
    headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: env.GH_BRANCH }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`GitHub DELETE ${path} failed: ${res.status} ${await res.text()}`);
  }
}
