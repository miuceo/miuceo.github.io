-- Agent output lands here and stops. The row is written BEFORE the model is
-- called, so a provider outage or rate-limit degrades to a `pending` row the
-- author can retry rather than lost work (ARCHITECTURE.md §10: "drafts land in
-- D1 *before* the agent is called"; SKILLS.md `agent-task` step 1).
--
-- Nothing here reaches GitHub on its own. `approved_at` is set only by an
-- authenticated human action, and even then the actual publish is a separate
-- call the author's client makes to /api/github/put — the agent has no path to
-- it (D6, CLAUDE.md rule 3: "the absent endpoint is the boundary").
CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  target_lang TEXT NOT NULL,     -- uz | en | ru
  kind TEXT NOT NULL,            -- translation | improvement
  source_text TEXT NOT NULL,
  result_title TEXT,
  result_excerpt TEXT,
  result_text TEXT,              -- NULL until the model returns
  status TEXT NOT NULL,          -- pending | ready | failed
  provider TEXT,                 -- which provider actually answered
  model TEXT,                    -- which model id actually answered
  error TEXT,                    -- server-side detail only, never returned to a client
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  approved_at INTEGER            -- human action only; the agent never sets this
);

CREATE INDEX idx_drafts_slug_lang ON drafts (slug, target_lang);
CREATE INDEX idx_drafts_status ON drafts (status);
