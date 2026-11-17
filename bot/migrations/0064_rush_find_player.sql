-- PF-023: "Find a player" is part of the queue board. A lobby opens it (rush_queue.need_open), each open call is a row in
-- rush_needs (replacing the old KV record), and every match proposal is a row in rush_need_offers.
ALTER TABLE rush_queue ADD COLUMN need_open INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS rush_needs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captain_id TEXT NOT NULL,
  positions TEXT NOT NULL DEFAULT '[]',   -- JSON, each of GK ST CB W (empty = any)
  count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',    -- open | filled | expired | cancelled
  created_at INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  channel TEXT, message_id TEXT
);
CREATE INDEX IF NOT EXISTS rush_needs_open ON rush_needs (status, expires);
CREATE TABLE IF NOT EXISTS rush_need_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  need_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  position TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'exact',     -- exact | any | alt
  lobby_ok INTEGER NOT NULL DEFAULT 0,    -- 1 once the lobby accepted
  player_ok INTEGER NOT NULL DEFAULT 0,   -- 1 once the player accepted
  status TEXT NOT NULL DEFAULT 'open',    -- open | accepted | declined | expired
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rush_need_offers_need ON rush_need_offers (need_id, status);
