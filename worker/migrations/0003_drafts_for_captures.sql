-- Stage 1's drafts table assumed an existing post: `slug` was NOT NULL and
-- `kind` was only translation|improvement. A Telegram capture (Phase 5 Stage 2)
-- is an idea with no post behind it yet, so `slug` has to be nullable and
-- `kind` gains 'capture'. `source` records where a draft came from.
--
-- SQLite cannot relax NOT NULL in place, so this is the standard
-- create/copy/drop/rename recreate. Safe at current row counts.
CREATE TABLE drafts_new (
  id TEXT PRIMARY KEY,
  slug TEXT,                     -- nullable: a capture has no post yet
  target_lang TEXT NOT NULL,
  kind TEXT NOT NULL,            -- translation | improvement | capture
  source TEXT NOT NULL DEFAULT 'editor',  -- editor | telegram
  source_text TEXT NOT NULL,
  result_title TEXT,
  result_excerpt TEXT,
  result_text TEXT,
  status TEXT NOT NULL,          -- pending | ready | failed | discarded
  provider TEXT,
  model TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  approved_at INTEGER            -- human action only; the agent never sets this
);

INSERT INTO drafts_new (
  id, slug, target_lang, kind, source, source_text,
  result_title, result_excerpt, result_text,
  status, provider, model, error, created_at, updated_at, approved_at
)
SELECT
  id, slug, target_lang, kind, 'editor', source_text,
  result_title, result_excerpt, result_text,
  status, provider, model, error, created_at, updated_at, approved_at
FROM drafts;

DROP TABLE drafts;
ALTER TABLE drafts_new RENAME TO drafts;

CREATE INDEX idx_drafts_slug_lang ON drafts (slug, target_lang);
CREATE INDEX idx_drafts_status ON drafts (status);
CREATE INDEX idx_drafts_source_created ON drafts (source, created_at);
