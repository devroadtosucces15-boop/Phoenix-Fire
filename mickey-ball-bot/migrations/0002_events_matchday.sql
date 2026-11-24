-- Decoded event counters per player line, the main-club flag, and the match-day tables (new tables come from schema.sql: CREATE IF NOT EXISTS).
ALTER TABLE player_lines ADD COLUMN ev TEXT;
ALTER TABLE tracked ADD COLUMN main INTEGER NOT NULL DEFAULT 0;
UPDATE tracked SET main = 1 WHERE rowid IN (SELECT MIN(rowid) FROM tracked GROUP BY guild_id);
