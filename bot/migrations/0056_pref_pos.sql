-- MB2: the position a member would like on the night, asked when they answer yes/maybe. JSON array, best first, at most two
-- of GK, CB, LB/RB, CDM, CM, CAM, LW/RW, ST (bot/prefpos.js). A preference only, never a promise; NULL = no preference.
ALTER TABLE event_rsvps ADD COLUMN pref_pos TEXT;
