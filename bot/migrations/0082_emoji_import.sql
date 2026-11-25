-- Emoji importer + copy-from-another-server (bot/emoji.js, bot/emojiimport.js).
ALTER TABLE emoji_suggestions ADD COLUMN source_id TEXT; -- the emoji it was copied from (NULL for an uploaded image)
ALTER TABLE emoji_suggestions ADD COLUMN emoji_id TEXT;  -- its ID in our server once the importer added it
-- Per-emoji usage, filled by a REST scan of new messages and reactions on the 10-minute cron.
CREATE TABLE IF NOT EXISTS emoji_usage (
  emoji_id TEXT NOT NULL,
  day TEXT NOT NULL,               -- YYYY-MM-DD (UTC) of the message
  uses INTEGER NOT NULL DEFAULT 0, -- times it appeared in message text
  reactions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (emoji_id, day)
);
CREATE TABLE IF NOT EXISTS emoji_scan (
  channel_id TEXT PRIMARY KEY,
  last_id TEXT NOT NULL,           -- newest message already counted
  since INTEGER NOT NULL,          -- when counting started for this channel
  at INTEGER NOT NULL              -- last scanned
);
