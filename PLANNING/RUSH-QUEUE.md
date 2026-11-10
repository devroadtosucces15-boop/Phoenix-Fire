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

1. **Idle timers:** green light with no action for 5 min pings again, then skips the group to just behind the next one (configurable). A search over 15 min asks "still searching?". A waiting entry idle for 90 min is dropped.
2. **Pause/AFK:** a waiting group can pause without losing its place for 10 min.
3. **Self-match guard:** the board says which groups are Phoenix, and warns when a Phoenix group is searching while another says "Searching now".
4. **ETA and stats:** estimated wait from the average search time; weekly numbers per group (searches, average wait, failed rate) feed the Rush leaderboard and `/rush` profile.
5. **Result logging hook:** **Match found** offers a one-tap "Log the result" that opens `/rush log` pre-filled with the crew as the squad.
6. **Staff controls:** a manager can move, remove or pause a group; a nightly reset clears the board.
7. **LFG link:** "Need a 5th?" posts the existing availability marker (see `PLANNING/BOT-SPLIT.md`, Rush LFG: pings the Rush role, never `@everyone`, "I'm in / later", auto-expires after 60 min) and accepted players can be added to the crew.
8. **DM option:** members can opt in to a DM when their group gets the green light.

## Data

- `rush_crews(captain_id, members JSON, updated_at)`
- `rush_queue(id, captain_id, members JSON, status, joined_at, searching_since, attempts, paused_until)`
- `rush_queue_stats(week, captain_id, searches, matched, failed, wait_seconds)`
- `rush_queue_settings` in the org config (channel id, staff channel id, failed policy, timers)
- Board message id and last-post time in KV.

## Build order

1. Migration + `bot/rushqueue.js` pure logic (ordering, failed re-queue, conflicts, timers) with tests first.
2. Board render (Components V2, `bot/ui.js`) and buttons/selects/modals on the Rush app; works on core while the Rush app is unconfigured.
3. Re-post layers, cron tick, staff channel report.
4. Stats and the `/rush log` hook. Then LFG.

Tests: strict click order; two groups cannot share a member; match found promotes the next and pings it; failed goes next (and bottom when the policy says so); idle timers skip; board re-posted when not last; report stores no user id; no NOREX name, colour or crest in any output.

## Questions to confirm (defaults used until answered)

- Queue channel and staff-report channel names (set in org config).
- Is the captain's crew limit 5 including them? Default yes.
- Should the green light skip an idle group (default 5 min) or wait? Default skip.
