CREATE TABLE IF NOT EXISTS guild_cfg (guild_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS perms (guild_id TEXT NOT NULL, key TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (guild_id, key));
CREATE TABLE IF NOT EXISTS lineups (id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, event_id TEXT, kind TEXT NOT NULL DEFAULT 'work', name TEXT, formation TEXT, slots TEXT NOT NULL, posted INTEGER NOT NULL DEFAULT 0, channel_id TEXT, message_id TEXT, by_user TEXT, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS links (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, gamertag TEXT NOT NULL, PRIMARY KEY (guild_id, user_id));
