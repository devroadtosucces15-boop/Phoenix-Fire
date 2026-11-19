-- PF-024 Item 24b: engagement points. One small row per member per UTC day, built from COUNTS only:
--   chs = the channel IDs they were active in that day, hours = a 24-bit mask of the hours they were active, msgs = how many messages (never any text),
--   cmds = how many bot commands they ran, paid = 1 once that day has been turned into points (once per member per day, also guarded by points_log.ref).
-- Rows older than 45 days are deleted by the settle job.
CREATE TABLE IF NOT EXISTS engagement_days (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  chs TEXT NOT NULL DEFAULT '',
  hours INTEGER NOT NULL DEFAULT 0,
  msgs INTEGER NOT NULL DEFAULT 0,
  cmds INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS engagement_days_day ON engagement_days (day, paid);
