import type { Draft, DraftKind, Env, Lang } from './types';

/**
 * Durability layer for agent output (migration 0002). A draft row is created
 * BEFORE the model is called so a provider outage degrades to a `pending`
 * row the author can retry, never to lost work (SKILLS.md `agent-task` step 1).
 *
 * Note what is absent: there is no function here that publishes. Approving a
 * draft only stamps `approved_at`; moving content to GitHub is a separate
 * call the author's client makes to /api/github/put (D6).
 */

function now(): number {
  return Math.floor(Date.now() / 1000);
}

export async function createDraft(
  env: Env,
  input: { slug: string | null; targetLang: Lang; kind: DraftKind; sourceText: string; source?: 'editor' | 'telegram' }
): Promise<string> {
  const id = crypto.randomUUID();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO drafts (id, slug, target_lang, kind, source, source_text, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  )
    .bind(id, input.slug, input.targetLang, input.kind, input.source || 'editor', input.sourceText, ts, ts)
    .run();
  return id;
}

/**
 * A draft captured from the Telegram bot. No slug — there is no post behind it
 * yet; the author gives it one when finishing in the Mini App.
 */
export async function discardDraft(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE drafts SET status = 'discarded', updated_at = ? WHERE id = ?`)
    .bind(now(), id)
    .run();
}

export async function markDraftReady(
  env: Env,
  id: string,
  result: { title: string; excerpt: string; markdown: string; provider: string; model: string }
): Promise<void> {
  await env.DB.prepare(
    `UPDATE drafts
     SET status = 'ready', result_title = ?, result_excerpt = ?, result_text = ?,
         provider = ?, model = ?, error = NULL, updated_at = ?
     WHERE id = ?`
  )
    .bind(result.title, result.excerpt, result.markdown, result.provider, result.model, now(), id)
    .run();
}

/** `message` is server-side detail — it is never returned to a client. */
export async function markDraftFailed(env: Env, id: string, message: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE drafts SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`
  )
    .bind(message.slice(0, 2000), now(), id)
    .run();
}

export async function getDraft(env: Env, id: string): Promise<Draft | null> {
  const row = await env.DB.prepare('SELECT * FROM drafts WHERE id = ?').bind(id).first<Draft>();
  return row ?? null;
}

/** Stamped only by an authenticated human action. The agent never calls this. */
export async function approveDraft(env: Env, id: string): Promise<void> {
  await env.DB.prepare('UPDATE drafts SET approved_at = ?, updated_at = ? WHERE id = ?')
    .bind(now(), now(), id)
    .run();
}
