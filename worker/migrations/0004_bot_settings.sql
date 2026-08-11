-- Runtime settings the author changes from the bot, without a redeploy.
--
-- Currently one key: `stt_language`, the language passed to Whisper. It exists
-- because auto-detection handles Uzbek badly — Whisper frequently reads it as
-- Turkish or Azerbaijani, and once misdetected the whole note is transcribed
-- with the wrong phonetic model (ARCHITECTURE.md §5.1: "Uzbek accuracy is the
-- weak point").
--
-- Default stays 'auto' so SKILLS.md `voice-pipeline` step 3 still holds —
-- detection is the default because the author speaks all three — but the
-- author can pin a language when detection is getting it wrong.
CREATE TABLE bot_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
