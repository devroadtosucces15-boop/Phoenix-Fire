-- Control Center backend (PF-022a): config-only items move from config.json into D1 so staff edit them on the site, not in a commit.
-- config.json stays the first-run default: a key with no row here still reads it (bot/ccsettings.js ccConfig). NOT applied by the session that wrote it:
-- the owner runs it (wrangler d1 migrations apply).
CREATE TABLE IF NOT EXISTS cc_config (
  key TEXT PRIMARY KEY,               -- recruitment | matchAlert | streams
  value TEXT NOT NULL,                -- JSON
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO cc_config (key, value) VALUES ('recruitment', '{"open":true,"headline":"Trials are by application only","requirements":["Active on PS5 / Xbox Series / PC (new gen)","Available for regular league nights","Mic and Discord for match comms","Competitive attitude – we play to win"],"positions":["GK","CB","CDM","CM","CAM","ST"]}');
INSERT OR IGNORE INTO cc_config (key, value) VALUES ('matchAlert', '{"loseBy":3}');
INSERT OR IGNORE INTO cc_config (key, value) VALUES ('streams', '{"youtube":"","twitch":"https://m.twitch.tv/phoenixfirefc/home"}');
-- One audit read across config_audit, activity and role history (PF-022a step 6).
CREATE INDEX IF NOT EXISTS config_audit_at ON config_audit (at);
