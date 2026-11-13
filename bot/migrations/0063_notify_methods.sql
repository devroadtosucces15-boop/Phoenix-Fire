-- Notification methods are independent now (site bell and inbox, Discord DM, browser push). A notification that goes only by DM or push is
-- stored with on_site = 0 so it never shows in the site list or count. Existing rows are on the site (default 1). Stored member preferences
-- are NOT rewritten: the old per-type strings ('dm' | 'site' | 'off') are still read and become the matching checkboxes (bot/notify.js methodsOf).
ALTER TABLE notifications ADD COLUMN on_site INTEGER NOT NULL DEFAULT 1;
