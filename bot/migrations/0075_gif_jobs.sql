-- PF-024 Item 21 – the GIF maker (bot/gif.js). One row per submitted video. The input video lives in R2 under gifin/ (deleted as soon as the job ends),
-- the finished GIF under gif/. status: queued (row reserved, input being copied) | converting (GitHub Actions job running) | done | failed | deleted.
-- `token` is the Discord interaction token of the waiting reply (valid 15 minutes); it is cleared the moment the job ends. It never leaves D1.
CREATE TABLE IF NOT EXISTS gif_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,                       -- 24 hex chars, the only thing the Actions job is given
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  in_key TEXT NOT NULL,                           -- gifin/<24 hex>.<mp4|webm|mov>
  in_type TEXT NOT NULL,
  in_size INTEGER NOT NULL DEFAULT 0,
  out_key TEXT,                                   -- gif/<24 hex>.gif once done
  out_size INTEGER,
  width INTEGER,
  fps INTEGER,
  secs REAL,                                      -- clip length the converter measured
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,                                     -- short code: too_long | unreadable | too_big | timeout | dispatch | other
  token TEXT,
  app_id TEXT,
  private INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  done_at INTEGER,
  deleted_at INTEGER,
  deleted_by TEXT
);
CREATE INDEX IF NOT EXISTS gif_jobs_user ON gif_jobs (user_id, status, created_at);
CREATE INDEX IF NOT EXISTS gif_jobs_status ON gif_jobs (status, created_at);
