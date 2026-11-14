-- Rush queue timers: when the group entered its current state (waiting, green light, searching). joined_at (the total time in the
-- queue, kept across failed / back in line) already exists.
ALTER TABLE rush_queue ADD COLUMN status_since INTEGER;

-- Control Center (PLANNING/CONTROL-CENTER.md): one row per registry output (key = registry id such as `slash:/queue`, `auto:rush-need`,
-- `dm:lfg`, `site:rush`). A row is only written when a manager changes something; no row = on, default rules.
-- rules JSON: { allow_roles, allow_members, deny_roles, deny_members, allow_channels, deny_channels, post_channels, methods, windows }.
CREATE TABLE IF NOT EXISTS output_controls (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  rules TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER,
  updated_by TEXT
);
