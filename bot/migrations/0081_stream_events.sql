-- Stream overlay feed (bot/streamevents.js): follows from Twitch EventSub and anything the owner's tools push, read by overlay.html.
-- ext_id is Twitch's message id (or the sender's own), UNIQUE so a retried delivery is stored once. Only the newest rows are kept.
CREATE TABLE stream_events (
  n INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT UNIQUE,
  type TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  at INTEGER NOT NULL
);
