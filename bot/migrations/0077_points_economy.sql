-- PF-024 Item 24: the shared points economy. Extends the P11.3 ledger (0025), no new ledger.
--   points are SEASONAL: users.points = earned this season, users.points_spent = credit used this season, balance = points - points_spent (never below 0).
--   points_log gets the season it belongs to and an optional ref (one award per member per match / badge, so a re-sent batch never pays twice).
--   a spend is a points_log row with category 'spend' and a negative delta; the manager audit trail also goes to config_audit (entity points:spend).
--   points_seasons keeps each closed season's totals when the owner resets.
ALTER TABLE users ADD COLUMN points_spent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE points_log ADD COLUMN season TEXT;
ALTER TABLE points_log ADD COLUMN ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS points_log_ref ON points_log (user_id, ref) WHERE ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS points_seasons (
  season TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT,
  earned INTEGER NOT NULL,
  spent INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  closed_at INTEGER NOT NULL,
  PRIMARY KEY (season, user_id)
);
