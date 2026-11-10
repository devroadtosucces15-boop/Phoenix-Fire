# Rush queue manager (MB6): spec from the owner, 2026-11-10

Replaces "needs the owner's earlier code": this is the design. It lives in the **Phoenix Rush** app (`bot/apps.js`, `rush`), one Worker, one D1/KV.
All output is Phoenix-themed (`#e8651a`, Phoenix crest, `phoenix-rush*` icons) and a test fails on any NOREX name, colour or crest.

## Why it exists

Rush is 5v5 and EA matchmaking is thin. When two Phoenix lobbies search at the same moment they can match each other. The queue makes
lobbies search **one at a time**, so everyone can see who is searching and nobody queues against their own club.

## The model

- A **group** is one Rush lobby: up to 5 Discord members. Only **one person per group** (ideally the captain, the one who presses Search / Cancel in EA) uses the bot.
- A group enters the queue by its captain pressing **Join queue**. Order is strictly the order of the click.
- The front group gets the **green light** (ping to the captain and crew). Everyone else waits, position shown.

## The board (one always-latest message)

One message in the queue channel, rebuilt on every change:

```
🔥 PHOENIX RUSH QUEUE
SEARCHING NOW   Mr. Mike + Ana, Koen, Bantu, Niko      since 3:12 (4 min)
NEXT            1. Dax + ...   2. Tomas + ...
[Join queue] [Leave] [Edit my crew] [Searching now] [Match found] [Match failed] [Report]
```

**Always the most recent message.** A Worker has no Gateway, so it cannot see chat. Two layers:
1. After every button press the board is deleted and re-posted at the bottom (instant on any action).
2. A cron tick (every minute) reads the channel's `last_message_id`; if the board is not last, it re-posts. Free-plan limits apply (see `cloudflare-free-plan-limits`), so keep it to one REST read per tick and skip when the queue is empty.
Recommended: make the channel **send-locked for members** (buttons only, chat goes elsewhere); then the board is always last for free and layer 2 is only a safety net.

## Crew registration (first time only)

- First **Join queue**: the bot shows a **multi-select of members** ("Who is in your lobby?", up to 4 others, the captain is added automatically). The result is saved as the captain's **crew**.
- Every later **Join queue** is one click, using the saved crew.
- **Edit my crew** button: change who is in the crew any time (players leave and join). A per-join "someone else tonight?" quick swap without touching the saved crew.
- A member cannot be in two waiting groups at once. If they are, the bot says which group holds them and offers to move them.

## States and buttons

| State | Who presses | Result |
|---|---|---|
| waiting | captain: **Join queue** | added at the bottom; position shown |
| green light | bot | pings captain and crew: "You're up. Start searching" |
| searching | captain: **Searching now** | board shows SEARCHING NOW with a timer |
| matched | captain: **Match found** | posts "Phoenix found a match", removes the group, gives the **green light to the next group**, everyone moves up |
| cancelled | captain: **Leave / Cancel search** | group leaves; next group gets the green light |
| **failed** | captain: **Match failed** | EA said "match found" but the game did not load. The group is **not** sent to the bottom: it goes back **next in line** (straight back to green light if nobody else is searching; right after the group currently searching if someone is). |

Setting (owner/manager, default on): `failed_policy = next | bottom`. Default `next`, as asked.

## Report button (anonymous)

For "that lobby is searching without posting" (the cause of Phoenix vs Phoenix matches).
- Opens a short form: which group (dropdown of the board and recent groups) or free text, plus an optional note.
- Goes to the staff channel as an embed with **no reporter identity**. Nothing about the reporter is stored; rate limiting uses a salted hash with a short KV TTL (for example 3 reports per hour) so it cannot be spammed.
- Staff see the group, time and note, and can message the group.

## More ideas (included in scope, cheap)

1. **Idle timers:** green light with no action for 1 min pings again, and at 2 min the group is removed (configurable, see Decisions). A search over 15 min asks "still searching?". A waiting entry idle for 90 min is dropped.
2. **Pause/AFK:** a waiting group can pause without losing its place for 10 min.
3. **Self-match guard:** the board says which groups are Phoenix, and warns when a Phoenix group is searching while another says "Searching now".
4. **ETA and stats:** estimated wait from the average search time; weekly numbers per group (searches, average wait, failed rate) feed the Rush leaderboard and `/rush` profile.
5. **Result logging hook:** **Match found** offers a one-tap "Log the result" that opens `/rush log` pre-filled with the crew as the squad.
6. **Staff controls:** a manager can move, remove or pause a group; a nightly reset clears the board.
7. **LFG link:** "Need a player" (need 1, need 2, need a keeper) posts the existing availability marker (see `PLANNING/BOT-SPLIT.md`, Rush LFG: pings the Rush role, never `@everyone`, "I'm in / later", auto-expires after 60 min) and accepted players can be added to the crew.
8. **DM option:** members can opt in to a DM when their group gets the green light.

## Data

- `rush_crews(captain_id, members JSON, updated_at)`
- `rush_queue(id, captain_id, members JSON, status, joined_at, searching_since, attempts, paused_until)`
- `rush_queue_stats(week, captain_id, searches, matched, failed, wait_seconds)`
- org settings (failed policy, idle timers) in the Organization config; channels are `discord_channels` rows with purposes `rush_queue` and `rush_queue_reports`
- Board message id and last-post time in KV.

## Build order

1. Migration + `bot/rushqueue.js` pure logic (ordering, failed re-queue, conflicts, timers) with tests first.
2. Board render (Components V2, `bot/ui.js`) and buttons/selects/modals on the Rush app; works on core while the Rush app is unconfigured.
3. Re-post layers, cron tick, staff channel report.
4. Stats and the `/rush log` hook. Then LFG.

Tests: strict click order; two groups cannot share a member; match found promotes the next and pings it; failed goes next (and bottom when the policy says so); idle timers skip; board re-posted when not last; report stores no user id; no NOREX name, colour or crest in any output.

## Decisions (owner, 2026-11-10)

1. **No hardcoded channel names or IDs, anywhere.** The queue channel and the staff-report channel are **channel purposes** in the existing Organization config (`discord_channels`, `bot/orgconfig.js`, `CHANNEL_PURPOSES`): add `rush_queue` and `rush_queue_reports`. Several channels per purpose are allowed (one board per queue channel; a report goes to every report channel). They are edited on the website's Organization section **and** by a manager slash command (for example `/setup channel purpose:rush_queue` run inside the channel that should hold the board). Both write the same `discord_channels` rows, so the site and Discord always show the same thing. The bot never falls back to some other channel; if none is set it says so (existing rule in `orgconfig.js`).
2. **Group size:** max 5 including the captain. Typical groups are 2 to 4 because there are few keepers and an AI keeper fills the gap, so the board shows "needs N" instead of assuming five.
3. **"Need a player", not "need a 5th":** the extra-player marker is a button/field with a count (need 1 / need 2 / need a keeper) and posts through the Rush LFG marker (role ping, never `@everyone`, auto-expires). Accepted players join the crew.
4. **Idle rule is 2 minutes, not 5:** a group at the green light that does nothing for **2 minutes** is removed from the queue (it gets a one-line notice and can press Join again). The warning ping goes out at 1 minute. Both values are org settings, default 2 min / 1 min.
5. **General rule for every bot feature:** any command or feature that posts to, reads from, or is restricted to a channel or role takes it from Organization config (purpose-based, multiple allowed, editable on the site and by a manager command, both writing the same rows). No module may hardcode a channel name, channel ID or role ID. See `CLAUDE.md`.
