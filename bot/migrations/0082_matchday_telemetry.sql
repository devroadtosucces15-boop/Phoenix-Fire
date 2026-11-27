-- 0082_matchday_telemetry.sql
-- 4-Stage Pro Telemetry Matchday Suite:
--   1. Roll Call (/host): unlimited sign-ups, up to 3 formation-exact positions (Primary + Flex),
--      fair signed_in_at priority timestamp (preserved on position edits, reset on Maybe/Out -> In),
--      manual manager sign-up lock (signup_closed_at).
--   2. Provisional Lineup Call -> 3. Lobby Check-In (manual or auto -15m, ready/late states) ->
--   4. Official Final XI (manual lock or manager-verified Game-1 auto-fallback).

ALTER TABLE events ADD COLUMN signup_closed_at INTEGER;
ALTER TABLE events ADD COLUMN lineup_phase TEXT;
ALTER TABLE events ADD COLUMN checkin_opened_at INTEGER;
ALTER TABLE events ADD COLUMN final_lineup_msg TEXT;
ALTER TABLE events ADD COLUMN final_lineup_channel TEXT;
ALTER TABLE events ADD COLUMN manager_id TEXT;

ALTER TABLE event_rsvps ADD COLUMN signed_in_at INTEGER;

ALTER TABLE event_checkins ADD COLUMN state TEXT DEFAULT 'ready';
