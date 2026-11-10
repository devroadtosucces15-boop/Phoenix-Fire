-- MB6 Rush queue manager (PLANNING/RUSH-QUEUE.md). Groups search one at a time so two Phoenix lobbies never match each other.
-- Channels are Organization config rows (purposes rush_queue and rush_queue_reports), never columns here.
CREATE TABLE IF NOT EXISTS rush_crews (
  captain_id TEXT PRIMARY KEY,
  members TEXT NOT NULL DEFAULT '[]',        -- JSON array of Discord user ids (the captain is not in it)
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rush_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captain_id TEXT NOT NULL UNIQUE,           -- one place per captain
  members TEXT NOT NULL DEFAULT '[]',        -- JSON array of the other members' ids
  status TEXT NOT NULL DEFAULT 'waiting',    -- waiting | green | searching
  ord INTEGER NOT NULL DEFAULT 0,            -- strict click order (renumbered on every change)
  joined_at INTEGER NOT NULL,
  green_at INTEGER,
  warned INTEGER NOT NULL DEFAULT 0,
  searching_since INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  paused_until INTEGER,
  needs INTEGER NOT NULL DEFAULT 0           -- "need a player": 0 none, 1, 2, or 9 = a keeper
);
CREATE TABLE IF NOT EXISTS rush_queue_stats (
  week TEXT NOT NULL,                        -- Monday of the week, YYYY-MM-DD
  captain_id TEXT NOT NULL,
  searches INTEGER NOT NULL DEFAULT 0,
  matched INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  wait_seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, captain_id)
);
