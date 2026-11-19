-- PF-024 Item 23 – the arcade (bot/arcade.js). One row per game between two members; `state` is the game's JSON (rules in bot/arcadegames.js).
-- status: invited (waiting for the other member) | playing | done | declined | expired. `ver` is a compare-and-set counter so two clicks never apply the same move twice.
-- Shared points go through bot/points.js awardRule('games.played' | 'games.won') with a once-only ref per game; arcade_scores is the arcade's own score table.
CREATE TABLE IF NOT EXISTS arcade_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,
  p1 TEXT NOT NULL, p1_name TEXT NOT NULL DEFAULT '',
  p2 TEXT NOT NULL, p2_name TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited',
  winner INTEGER,                                  -- 0 or 1 (a seat), NULL = no winner yet or a draw
  ended_by TEXT,                                   -- finish | resign | decline | expire
  moves INTEGER NOT NULL DEFAULT 0,
  ver INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS arcade_games_p1 ON arcade_games (p1, status);
CREATE INDEX IF NOT EXISTS arcade_games_p2 ON arcade_games (p2, status);
CREATE TABLE IF NOT EXISTS arcade_scores (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL DEFAULT 0,
  played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0
);
