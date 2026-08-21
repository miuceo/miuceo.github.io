export interface Env {
  DB: D1Database;

  // vars (wrangler.toml)
  SITE_ORIGIN: string;
  GH_OWNER: string;
  GH_REPO: string;
  GH_BRANCH: string;
  ALLOWED_TELEGRAM_ID: string;
  TG_CHANNEL: string;
  SESSION_COOKIE_NAME: string;
  SESSION_TTL_SECONDS: string;
  // Ordered, comma-separated model id candidates. Config, never code — the
  // free roster rotates and a hardcoded id is a future outage (SKILLS.md
  // `agent-task` step 4). The ladder walks each list in order.
  GROQ_TEXT_MODELS: string;
  OPENROUTER_TEXT_MODELS: string;
  GROQ_STT_MODEL: string;
  OPENROUTER_VISION_MODELS: string;

  // secrets (`wrangler secret put`)
  GH_TOKEN: string;
  // Channel posting only. There is no bot webhook any more — this Worker has
  // no unauthenticated route, and Telegram never calls in.
  TG_BOT_TOKEN: string;
  GROQ_API_KEY: string;
  OPENROUTER_API_KEY: string;
}

export interface Session {
  id: string;
  telegram_id: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export type DraftStatus = 'pending' | 'ready' | 'failed' | 'discarded';
export type DraftKind = 'translation' | 'improvement' | 'capture';
export type DraftSource = 'editor' | 'telegram';
export type Lang = 'uz' | 'en' | 'ru';

export interface Draft {
  id: string;
  slug: string | null; // null for a capture — no post behind it yet
  target_lang: Lang;
  kind: DraftKind;
  source: DraftSource;
  source_text: string;
  result_title: string | null;
  result_excerpt: string | null;
  result_text: string | null;
  status: DraftStatus;
  provider: string | null;
  model: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
  approved_at: number | null;
}
