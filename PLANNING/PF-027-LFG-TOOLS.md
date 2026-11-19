# PF-027: LFG and queue tools (owner request 2026-11-19)

Code: `bot/lfg.js`, `bot/rushqueue.js`, `bot/rushmatch.js`, migration `0080_lfg_tools.sql`, test `tests/lfg-tools.test.mjs`. No new flag: `rushLfg` and `rushQueue` already gate everything. Voice is NOT touched (the create-room feature stays separate).

What changed
- **Pass the captain role** (queue and LFG): board button **Pass captain** (member picker), `/queue captain [member]` and `/lfg captain [member]`. No name = it goes to the first person in the crew. The old captain stays in the crew; place in line, status and timers are untouched. The new captain searches, invites and presses the board buttons. An open "Need a player" call and its offers move with the role (closed and posted again under the new captain). The new captain gets a saved crew.
- **LFG post** is now sent by the Rush app (so it can be re-sent and edited) with five buttons: I'm in, **Make a lobby**, **+1 hour** and **Take down** (poster only), **Alert me**. Default length 30 minutes (was 60); +1 hour up to 6 hours in total.
- **Still here?**: about 10 minutes before the end the poster gets one DM with Keep it up (+1 hour) / I'm done. No answer = it ends on time.
- **Stays the newest message**: the 1-minute job (`lfgTick`) re-sends an open call at the bottom when someone else posted under it (not within 90 seconds of the last send, never pings again) and deletes the old message. An ended or taken-down call is edited into the "over" card. If the Rush app cannot post, the slash reply is the post as before.
- **Alert me**: a DM offer (Accept / No thanks, never an automatic add) when a lobby needs your position, without posting `/lfg now`. Press again to turn off.
- **Make a lobby**: the poster or anyone who tapped I'm in presses it and becomes the proposed captain. Everyone else on the post gets a DM request (Accept / No thanks, 15 minutes). Only people who accept join; the lobby goes on the queue board with the first accept. Crew size 2 to 5, no position rule.

Not built (owner decisions or later): one unified status per member across LFG and the queue, putting people back to "available" when a lobby falls apart, keeping the "Need a player" posts newest (the board already is), points for filling a lobby.

Owner steps: the bot deploy applies migration 0080. The Rush app needs permission to send, edit and delete messages in the channel where members use `/lfg now` (it already does for the board and the calls).
