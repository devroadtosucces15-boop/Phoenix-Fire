-- DJ bridge (PF-022 step 5). The DJ app on the owner's PC is behind NAT, so it PUSHES state snapshots here and POLLS a command queue
-- over the shared key. One snapshot row (the last state of every room) and a short-lived command queue; nothing here is a secret.
CREATE TABLE IF NOT EXISTS music_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  rooms TEXT NOT NULL DEFAULT '[]',   -- JSON: [{ id, name, paused, listeners, volume, nowPlaying, queue }]
  pushed_at INTEGER NOT NULL DEFAULT 0 -- unix ms of the last push; older than 90 s = the DJ is offline
);
CREATE TABLE IF NOT EXISTS music_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL DEFAULT '',   -- '' for room-less commands (search)
  type TEXT NOT NULL CHECK (type IN ('pause', 'resume', 'skip', 'volume', 'add', 'remove', 'search')),
  arg TEXT NOT NULL DEFAULT '{}',     -- JSON: { v } | { track } | { id } | { q }
  by_id TEXT NOT NULL DEFAULT '',
  by_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'done', 'failed', 'expired')),
  result TEXT,                        -- JSON answer from the DJ (search tracks, or an error text)
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  done_at INTEGER
);
CREATE INDEX IF NOT EXISTS music_commands_status ON music_commands (status, id);
