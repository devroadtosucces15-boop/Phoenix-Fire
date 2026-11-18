-- PF-024 Item 17 – absence notices (bot/absence.js). A member says they will be away or play less; managers acknowledge it.
-- `reason` is free text PRIVATE TO MANAGERS: it is only ever shown in the managers' card and the manager API, never in a public post, a log or a member view.
CREATE TABLE IF NOT EXISTS absences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'away',            -- away | less | matches | other
  from_day TEXT,                                 -- YYYY-MM-DD, null = from now
  until_day TEXT,                                -- YYYY-MM-DD, null = open ended (expires after 30 days)
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',           -- open | acknowledged | cancelled
  ack_by TEXT, ack_name TEXT, ack_at INTEGER,
  channel_id TEXT, message_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS absences_user ON absences (user_id, status);
CREATE INDEX IF NOT EXISTS absences_exp ON absences (status, expires_at);
