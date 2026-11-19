-- PF-027: LFG tools. The post is now sent by the Rush app (not as the slash reply) so it can be re-sent to stay the newest message and edited when it ends:
--   msg_id = the Discord message of the open post, posted_at = when it was last (re)sent, asked = 1 once the poster got the "still here?" DM.
ALTER TABLE rush_lfg ADD COLUMN msg_id TEXT;
ALTER TABLE rush_lfg ADD COLUMN posted_at INTEGER;
ALTER TABLE rush_lfg ADD COLUMN asked INTEGER NOT NULL DEFAULT 0;
-- Alert me: members who want a DM offer when a lobby needs their position, without posting /lfg. Off by pressing the button again.
CREATE TABLE IF NOT EXISTS rush_lfg_alerts (
  user_id TEXT PRIMARY KEY,
  positions TEXT NOT NULL DEFAULT '[]',
  at INTEGER NOT NULL
);
-- Make a lobby: one request (a DM with Accept / No thanks) per person. Nobody is added unless they accept; a request runs out after 15 minutes.
CREATE TABLE IF NOT EXISTS rush_lobby_asks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captain_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  lfg_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rush_lobby_asks_open ON rush_lobby_asks (captain_id, user_id, status);
