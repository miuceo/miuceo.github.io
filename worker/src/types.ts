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

  // secrets (`wrangler secret put`)
  GH_TOKEN: string;
  TG_BOT_TOKEN: string;
}

export interface Session {
  id: string;
  telegram_id: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
}
