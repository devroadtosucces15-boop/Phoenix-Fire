-- Phase 0: Organization Configuration. One organization, many EA club instances, flexible Discord mappings.
-- Everything the site, jobs and bot need to know about "which clubs / which channels / which roles" lives here, so adding a
-- club or moving a notification channel is a Boardroom edit, never a code change.

CREATE TABLE IF NOT EXISTS orgs (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);
INSERT OR IGNORE INTO orgs (id, slug, name) VALUES (1, 'phoenix-fire', 'Phoenix Fire');

CREATE TABLE IF NOT EXISTS org_divisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS ea_clubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL DEFAULT 1,
  ea_club_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  division_id INTEGER,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  sync_members INTEGER NOT NULL DEFAULT 1,
  sync_matches INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS discord_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL DEFAULT 1,
  guild_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

-- scope_type: org (whole organization) | division | club. scope_id is the division id / ea_clubs.id, NULL for org.
CREATE TABLE IF NOT EXISTS discord_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL,
  channel_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'org',
  scope_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS discord_channels_purpose ON discord_channels (purpose, active);

CREATE TABLE IF NOT EXISTS discord_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL,
  role_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  permission_group TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'org',
  scope_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1
);

-- Who changed what, when. before/after are JSON snapshots of the changed row.
CREATE TABLE IF NOT EXISTS config_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  entity TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  before TEXT,
  after TEXT
);

-- Known today: club 1111 and the Discord guild already in wrangler.toml. Names are placeholders to confirm in Boardroom.
INSERT OR IGNORE INTO ea_clubs (ea_club_id, display_name, created_at, updated_at) VALUES ('1111', 'Phoenix Fire (confirm name)', 0, 0);
INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('1328821938243637381', 'Phoenix Fire Discord');
