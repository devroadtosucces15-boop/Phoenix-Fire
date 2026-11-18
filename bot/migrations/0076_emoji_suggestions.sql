-- PF-024 Item 22 – emoji and sticker suggestions (bot/emoji.js). The image lives in R2 (binding MEDIA) under emoji/<random>.<png|jpg|gif>; this table is the library.
-- status: pending (waiting for a manager) | approved | rejected | deleted | failed (copy did not finish). Nothing is imported into the Discord server from here:
-- the importer is a separate later feature and reads the `approved` rows.
CREATE TABLE IF NOT EXISTS emoji_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,                              -- sanitised to Discord's allowed characters (letters, digits, underscore)
  kind TEXT NOT NULL,                              -- emoji | sticker
  key TEXT NOT NULL UNIQUE,                        -- R2 object key, emoji/<32 hex>.<png|jpg|gif>
  mime TEXT NOT NULL,                              -- image/png | image/jpeg | image/gif (checked against the first bytes)
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  animated INTEGER NOT NULL DEFAULT 0,             -- 1 for an animated GIF or APNG
  size INTEGER NOT NULL DEFAULT 0,                 -- bytes
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  reviewed_by TEXT,
  reviewed_name TEXT,
  reviewed_at INTEGER,
  channel_id TEXT,                                 -- the manager review card
  message_id TEXT
);
CREATE INDEX IF NOT EXISTS emoji_suggestions_user ON emoji_suggestions (user_id, status, created_at);
CREATE INDEX IF NOT EXISTS emoji_suggestions_status ON emoji_suggestions (status, created_at);
