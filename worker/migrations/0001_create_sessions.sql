-- Opaque server-side sessions. The cookie carries only this id — no signed
-- payload — so a session is revoked by deleting or flagging its row, which
-- a stateless JWT cannot do (ARCHITECTURE.md §4: "sessions are revocable
-- server-side").
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
