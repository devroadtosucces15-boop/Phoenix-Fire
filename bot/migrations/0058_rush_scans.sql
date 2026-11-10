-- Rush screenshot scans (bot/rushscan.js). EA exposes no Rush data, so members and managers photograph the in-game screens and the
-- Worker reads them with a vision model. Two features share this file:
--  1. rush_boards       – the global Rush leaderboard, photographed by managers several times a day (one row per photo).
--  2. rush_season_cards – each member's end-of-season stats screen (one row per member per season, a re-upload replaces it).
-- The photos themselves are not kept: only the numbers read from them (and any fix a person made before saving).
CREATE TABLE IF NOT EXISTS rush_boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season TEXT NOT NULL,
  taken_at INTEGER NOT NULL,         -- when the photo was taken (ms); defaults to the upload time
  at INTEGER NOT NULL,               -- when it was saved
  by_id TEXT,
  by_name TEXT,
  rows TEXT NOT NULL,                -- JSON [{rank, club, vp, gp, m, bfg, avg}]
  us INTEGER,                        -- index in rows of our club (0-based)
  qc TEXT,                           -- JSON {errors, warnings, fixed, edited}
  posted_channel TEXT,
  posted_msg TEXT
);
CREATE INDEX IF NOT EXISTS rush_boards_season ON rush_boards (season, taken_at);

CREATE TABLE IF NOT EXISTS rush_season_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT,
  avatar TEXT,
  player TEXT,                       -- approved claim, when there is one (links to the player page)
  stats TEXT NOT NULL,               -- JSON {matches, wins, goals, clubVp, myVp, club, tier, division}
  qc TEXT,                           -- JSON {errors, warnings, edited}
  at INTEGER NOT NULL,
  posted_channel TEXT,
  posted_msg TEXT,
  status TEXT NOT NULL DEFAULT 'saved', -- saved | removed (a manager can take a bad card down)
  UNIQUE (season, user_id)
);
CREATE INDEX IF NOT EXISTS rush_season_cards_season ON rush_season_cards (season, status);
