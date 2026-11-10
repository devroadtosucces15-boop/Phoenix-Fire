-- MB5: Rush "looking for players" posts (bot/lfg.js). One row per post; open until `expires`, then it stops taking answers.
CREATE TABLE IF NOT EXISTS rush_lfg (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT,
  avatar TEXT,
  note TEXT,
  channel TEXT,
  at INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' -- open | cancelled | expired
);
CREATE INDEX IF NOT EXISTS rush_lfg_open ON rush_lfg (status, expires);
CREATE INDEX IF NOT EXISTS rush_lfg_user ON rush_lfg (user_id, at);
-- Answers to a post: 'in' (I'm in) or 'later'.
CREATE TABLE IF NOT EXISTS rush_lfg_answers (
  lfg_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT,
  answer TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (lfg_id, user_id)
);
