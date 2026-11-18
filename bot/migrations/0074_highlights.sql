-- PF-024 Item 18 – highlight clip uploads (bot/highlight.js). The file lives in R2 (binding MEDIA) under hl/<random>.<ext>; this table is the index.
-- Nothing is published from here: status is pending (being copied) | stored | failed | deleted. The social automation is built later and reads `stored` rows.
CREATE TABLE IF NOT EXISTS highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  key TEXT NOT NULL UNIQUE,                       -- R2 object key, hl/<32 hex>.<mp4|webm|mov>
  type TEXT NOT NULL,                             -- video/mp4 | video/webm | video/quicktime
  size INTEGER NOT NULL DEFAULT 0,                -- bytes
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  deleted_by TEXT
);
CREATE INDEX IF NOT EXISTS highlights_user ON highlights (user_id, status, created_at);
CREATE INDEX IF NOT EXISTS highlights_status ON highlights (status, created_at);
