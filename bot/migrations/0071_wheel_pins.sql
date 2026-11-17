-- PF-024 Item 11: wheel history + spin length, and the sticky pin tool.
-- /wheel: how many seconds the spin animation runs (NULL = instant result, as before) and every result, for the History button.
ALTER TABLE fun_wheels ADD COLUMN seconds INTEGER;
CREATE TABLE IF NOT EXISTS fun_wheel_spins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wheel_id INTEGER NOT NULL,
  winner TEXT NOT NULL,
  by_id TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fun_wheel_spins_wheel ON fun_wheel_spins (wheel_id, at);
-- Pin tool (bot/pins.js): one sticky post per channel. The bot keeps it the newest message (re-post, old copy deleted) until it is
-- unpinned or expires. `message_id` is the bot's current copy.
CREATE TABLE IF NOT EXISTS bot_pins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  body TEXT NOT NULL,
  source_author TEXT,
  by_id TEXT NOT NULL,
  by_name TEXT,
  created_at INTEGER NOT NULL,
  posted_at INTEGER,
  expires_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS bot_pins_active ON bot_pins (active, channel_id);
