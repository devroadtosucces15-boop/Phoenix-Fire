# PF-024 go-live (owner-only steps)

## Item 8: duplicate-post fix (code done on branch `pf-024-item8`)
No migration needed: claims use the existing `meta` table (keys `remind24:<event>`, `remind2:<event>`, `alert:<match>:<channel>`, `hotw:<week>`).
- Deploy the Worker (`phoenix-bot`) after the merge. Owner step.
- Still to check by hand (cannot be done from the repo): Cloudflare and GitHub for a second Worker, webhook or Actions job from the sibling club repo that uses the same bot tokens or webhook (cause D in the audit). Also `wrangler tail` for repeated posts after deploy.
- Not yet done (later items): one owner app per output (`events.discord_app`), CI result-post claim (`result:<match>`), board-id compare-and-set, `/matchday` read replies ephemeral.

## Item 9: Translator (code done on branch `pf-024-item9`)
Built interactions-only (no gateway, no Message Content intent): message context-menu command **Translate message** (type 3), plus `/translate`, `/enhance` (polish level 1 to 10, tone) and `/language` (saves the member's language in KV `tr:lang:<id>`). All four are in the **tools** app. Feature flag `translate` ships `owner`. New shared AI counter `bot/aibudget.js` (KV `aibudget:<UTC day>`, cap 6000 of the 10,000 free neurons, 20 s cooldown per person per feature; `AI_DAILY_CAP` var overrides). No migration, no new Worker route, no new channel or role.

Owner steps:
1. Deploy the Worker, then register commands (Boardroom "Sync to Discord" or `node bot/register.mjs`) so the right-click command and `/translate` `/enhance` `/language` appear. Owner step.
2. Set the flag: Control Center / Flags tab `translate` to `members` when happy (it is `owner` now).
3. Existing AI features (card studio, hype, `/ask`) do not yet spend from the new counter; they share the same 10,000 pool. Wire them in a later item if the pool runs dry.

Owner decisions (I did not guess; the default built is in bold):
- **Gateway vs interactions-only.** Built **interactions-only**. Limits: the Translator works only when someone right clicks a message or types text; it cannot auto-translate every message as it is sent. Auto-translate-on-send needs a new gateway process next to `dj/` with the Message Content intent (portal toggle, possibly a justification to Discord).
- **Privacy stance.** Built: the text is sent to Workers AI for that one call and never stored; only the chosen language is stored. If you want a posted line telling people this, add it to the rules channel. Cloudflare's Workers AI terms apply.
- **Which languages.** Built 14 (`bot/translatelangs.js`: English, Spanish, Portuguese, French, German, Italian, Dutch, Polish, Turkish, Arabic, Russian, Swedish, Danish, Romanian). Discord allows 25. Tell me the club's real languages.
- **Who may use it.** Built: flag `translate`, then everyone with that level (members when you flip it). Output is public in the channel by design (plan: not private). Option: members only, or managers only, through the flag level.
- **Model quality.** Uses the same small Llama model as `/ask` (`@cf/meta/llama-3.1-8b-instruct-fp8`), which is weak on street slang and rarer languages. Option: a larger model costs several times more neurons per call; set after a trial.
- **Daily cap.** 6000 neurons for new features. Raise or lower with the `AI_DAILY_CAP` var.

## Item 10: Quote card (code done on branch `pf-024-item10`)
Message context-menu command **Quote card** (type 3, tools app, no gateway, no Message Content intent): right click a message → Apps → Quote card. It draws a 1080×1080 Phoenix picture (big quote, author avatar, name, handle, date, crest, motto from `ORG_MOTTO` / config brand.motto) through the Images binding into R2 (`q/<hash>.png`, cached so the same quote is never drawn twice) and posts it publicly in the channel. No Images/R2 binding or a failed draw → a styled text quote instead. Limit 20 cards per person per hour (KV `quoterl:`). Flag `quoteCard` ships `owner`. No migration, no new route, no new channel or role. Code: `bot/quotecard.js`; test: `tests/quotecard.test.mjs`.

Owner steps:
1. Deploy the Worker and sync commands to Discord (the right-click command appears after the sync). Owner step.
2. Flip the `quoteCard` flag to `members` after trying it (it is `owner` now).
3. The drawn pictures stay in R2 forever. Cheap, but see decision 3.

Owner decisions (defaults built in bold):
- **Who may use it:** by flag level (**owner now**, then members). Option: managers only.
- **Whose messages may be quoted:** **any person's message in any channel the bot can see, shown with their name and avatar, posted publicly.** Options: an opt-out for authors (a `/language`-style setting), quote only the user's own messages, or exclude chosen channels (e.g. private staff ones). A message quoted from a private channel becomes visible where the command is run.
- **Retention:** **pictures are kept in R2 with no expiry.** Option: delete after N days (a cleanup job like the media guard).
- **Look:** one dark-ember square. Options: a light variant, a wide 16:9 format, a choice of backgrounds.
- **Not built:** quoting several messages, attachments and embeds (cards use text only), emoji in the picture (the renderer has no emoji font, so they are dropped).

## Item 11: wheel and pin tool (code done on branch `pf-024-item11`)
**Migration 0071 (`bot/migrations/0071_wheel_pins.sql`) must be applied before deploy.** Owner step (D1 migrations are not run from the repo). It adds `fun_wheels.seconds`, `fun_wheel_spins` (history) and `bot_pins`.

(a) **Wheel** (`bot/fun.js`): `/wheel` now takes `seconds` (2 to 10): the reply shows the options with a pointer that runs round, slows down and lands on the winner, by editing the message once a second (no gateway, no GIF; leave `seconds` empty for the old instant result). Options accept weights, `Jez, Kruger*3` = three times the chance (1 to 10). Spin again and Remove-and-spin keep the stored length; a **History** button shows the last 10 results and the win counts. Flag stays `fun`.

(b) **Pin tool** (`bot/pins.js`): managers right click a message → Apps → **Pin to bottom**, or `/unpin`. The bot posts a Phoenix "Pinned" panel and the 1-minute cron keeps it the newest message in that channel (re-posts and deletes the old copy when someone else posts; claims through `once` so two runs cannot double-post). One pin per channel, a new pin replaces the old one, a pin ends with Unpin (managers), `/unpin` or after 30 days (`PIN_DAYS`). New flag `pins` (ships `owner`), new permission `pins.manage` (manager), new channel purpose `pinned_posts`.

Owner steps:
1. Apply migration 0071 to D1, deploy the Worker, sync the commands to Discord. Owner step.
2. In the Organization config (site Channels page or the manager command) add the channel(s) for purpose **Pinned posts**. Until one is set, the pin command says "No pin channel is set" and posts nothing.
3. Give the tools bot (or core, if tools is not set up) View Channel, Send Messages, Read Message History and **Manage Messages** in those channels (it deletes its own old copy).
4. Flip the `pins` flag to `managers` or `members` when ready (it is `owner` now).

Owner decisions (defaults built are bold):
- **Spin look:** **text wheel, pointer marked ▶, one edit a second.** A real drawn wheel needs a rendered image per frame (Images binding, slow, about 6 draws) or a site page with a Durable Object live wheel (a bigger item). Say if you want either.
- **Pin style:** **re-post to stay newest (sticky bot post).** Alternative: also call Discord's own message pin (50 per channel, shows in the pins list, but cannot stay at the bottom). Say if you want both.
- **Pin limits:** **one pin per channel, 30 days, managers only, only in `pinned_posts` channels.** Options: several pins per channel, a longer or no expiry, any manager role by channel.
- **Cron cost:** one Discord read per active pin per minute (up to 25 pins). Fine for a few pins.
- **Not built:** pinning attachments or embeds (text only), wheel entries from a role or voice channel, a site page for history.

## Item 12: server navigator (code done on branch `pf-024-item12`)
`/navigator [question]` (tools app, private reply, flag `navigator` ships `owner`). Code: `bot/navigator.js`, test: `tests/navigator.test.mjs`. No migration (the scan is kept in the `meta` table: `nav:map`, `nav:changes`), no new route, no new channel purpose. New permission `navigator.manage` (manager). Needs only the bot token and `DISCORD_GUILD_ID` (the same two the server-tools cron already uses); no gateway, no Message Content intent.

What it does: scans the server's channels, categories and roles; works out what each channel is for (first the Organization config purposes, otherwise a guess from the name and topic, marked with ~); works out who can see it from the permission overwrites (public, some roles, staff only; a member only sees what they can see, managers see everything marked 🔒); shows a section menu, a page per section, a Q&A wiki built from the map and the public command list ("Where do I find Rush?", "What does /club do?"), and `/navigator question:` answers straight from it. The 10-minute cron rescans about hourly, compares the new map with the old (new, removed, renamed, moved, purpose or access changed) and keeps the last 5 change sets under **What changed** (managers). **Rescan now** (managers) scans on demand.

Owner steps:
1. Deploy the Worker, sync the commands to Discord (owner step). No migration.
2. Make sure the bot has View Channels (it already needs it) and that `DISCORD_GUILD_ID` is set.
3. Flip the `navigator` flag to `members` when ready (it is `owner` now).
4. For the best answers set the channel purposes in the Organization config; unset channels are guessed from their names.

Owner decisions (defaults built are bold):
- **Public or private panel:** **private (only you see it).** Option: a public pinned navigator panel in a start channel (pair it with the pin tool from Item 11).
- **Staff channels:** **hidden from members, shown to managers with a lock.** Option: hide them from managers' panel too, or list names only.
- **Rescan cadence:** **hourly by cron, plus Rescan now.** Option: every 10 minutes (more Discord reads) or daily.
- **No announcement of changes:** **changes are only listed for managers.** Option: post new channels to the announcements channel.
- **Wiki scope:** **generated from channels and commands only.** Option: add hand-written FAQ entries (rules, how to claim a player) edited on the site; that fits Item 13 (the bot wiki book).
- **Not built:** reading messages to learn what a channel is really used for (needs the Message Content intent; the guess uses names and topics only), a site page for the map.

## Item 13: the Phoenix wiki book (code done on branch `pf-024-item13`)
`/wiki [bot] [question]` (tools app, private reply, flag `wiki` ships `owner`). Code: `bot/wikibook.js`, test: `tests/wikibook.test.mjs`. No migration, no route, no new channel purpose, no new permission. The server map for channel answers comes from the navigator's scan when the database is connected; without it the book still answers from the commands and guides.

What it does: one book for all five bots. A chapter per bot: a contents page, the step-by-step guides, then one spread per command. A spread is one private message with a LEFT page (what it is, who can use it, where it fits in a guide) and a RIGHT page (the choices or fields, good-to-know tips, related questions). Back, Next, Contents, Step by step and a jump list turn the pages. The 🧩 setup helper on a command page lets a member pick a subcommand and the optional fields and builds the command line (`/setup channel purpose:‹…› channel:‹#channel›`) ready to type; Discord cannot fill the command box, so the line is shown, not sent. `/wiki question:` answers in the member's words from the guides, the command list and the navigator's server map. Nothing is written twice: the pages come from `bot/help.js` (guides and tips) and `bot/commanddefs.js`, the Q&A from the navigator's `wikiEntries`.
With the flag on, `/corehelp /statshelp /toolshelp /matchdayhelp /rushhelp` open the book on their own bot; with it off they open the old help menus unchanged.

Owner steps:
1. Deploy the Worker and sync the commands to Discord (owner step). No migration.
2. Flip the `wiki` flag to `members` when ready (it is `owner` now). The help commands switch to the book at the same time.
3. The banner picture `banner-wiki.png` is drawn by the next card run in CI.

Owner decisions (defaults built are bold):
- **Replace the five help commands:** **keep them, opened on the book once the flag is on.** Option: remove them from Discord and leave only `/wiki` (one command instead of six; members lose the habit of /corehelp).
- **Two pages:** **a left and a right text block in one message.** Discord has no real two-column layout; the limit is 40 components and 4000 characters, which every page stays under (tested).
- **Setup helper:** **shows a copyable command line.** Option: a modal that collects the values and posts them back (still cannot run the command for the member; Discord only lets the member submit a command themselves).
- **Hand-written FAQ:** **none yet; the book's FAQ comes from the guides and the command list.** Option: an FAQ table edited on the site (rules, how to claim a player) that both this book and the navigator read.
- **Public or private:** **private (only you see it).** Option: a pinned public "start here" copy of the hub in a start channel (pair it with the pin tool from Item 11).

## Item 14: server intelligence and the counselor (code done on branch `pf-024-item14`)
`/counselor` (tools app, managers only, private reply) and a Counselor section in the site's Intelligence room (`GET /api/intel/counselor`, Control Center tool `counselor`, manager level). Code: `bot/serverintel.js`, test: `tests/serverintel.test.mjs`. Flag `serverIntel` ships **`off`**: the kill switch. No migration (aggregates live in D1 `meta`: `sv_intel`, `sv_intel_job`, `sv_intel_status`). New channel purpose `intel_skip`; new permission `counselor.view` (manager).

What it does: once a week the Worker's 10-minute cron samples about 50 recent messages per **public** text channel (four reads per channel at 03:30, 09:30, 15:30 and 21:30 UTC on four different days) over Discord REST, four channels per run. Each message is turned into numbers on the spot (topic, tone, length, time of day); the text is dropped. What is kept: team topics, mood, activity by time of day, per-channel heat, a small per-member baseline of numbers (4 weeks, then deleted) and anomaly flags. The counselor shows tendencies, how to approach them and flags ("a normally quiet member is suddenly very active", "sounds sharper than their own usual", "a heated channel", "team mood jumped"). It never shows what anyone said or a per-person history. The profile also carries a small `voice` (vibe, topics, busiest time) for the mascot in Item 15.

Guardrails in code (each has a test):
1. Only public channels: skipped when @everyone cannot view it (category and channel overwrites, base role permissions; unknown = skipped), when its Organization config purpose is a staff one (`manager_alerts`, `logs`, `config_audit`, `system_alerts`, `member_log`, `automod_alerts`, `claims`, `rush_queue_reports`, `recruitment`) or `intel_skip`, when it is age-restricted, or when its name or category looks like staff or private.
2. Raw message text is never stored or logged: not in D1, KV, a log line, an error or the AI prompt (the test searches all of them for planted text).
3. Kill switch: flag `serverIntel` (Control Center, Site access) and the scheduled-job switch `job:intelSample`. Both are re-read from D1 before every channel, so switching off stops the next fetch; off means no Discord call.
4. Counselor is managers only: tendencies and flags, no per-person dossier, no option to ask about one person.
5. AI budget: at most 20% of the daily pool (2,000 neurons) through the KV counter `aibudget:intel:<day>`; one short call per weekly run. Over budget the run is skipped and the status says so.

Owner steps:
1. In the Discord Developer Portal (Bot page of the core app) switch on **Message Content Intent**. Without it Discord sends empty text and the run reports "no content" instead of a profile.
2. Post the disclosure (below) in the rules or server info, **before** the flag goes on.
3. Deploy the Worker and sync the commands to Discord. No migration.
4. Optional: in the Organization config add the purpose `intel_skip` to any other channel that is sensitive (staff purposes are always skipped).
5. Flip `serverIntel` to `owner`, check `/counselor` after the first run, then `managers` if wanted. Flip to `off` any time to stop sampling.

Disclosure wording for the owner to post (not posted):
> **Server intelligence.** Once a week the Phoenix Fire bot looks at a small sample of recent messages in public channels only, to see which topics come up, when the server is busiest and how the mood is. Messages are read in memory and never saved: only totals are kept (topics, mood, activity by time of day). Staff and private channels are never read. Managers see team tendencies and a few "check in" flags, never what anyone wrote. Questions? Ask a manager.

Owner decisions made (2026-11-18): REST sampling by the Worker (no gateway process), minimal safe baseline, kill switch default off, counselor for managers, 20% AI share. **No member opt-out table** (owner declined): it can be added later as a small table the sampler checks before counting an author, plus `/intel optout`.
Not built: a gateway process, per-person dossiers, storing any message text, sampling private or staff channels, a member opt-out.

## Item 15: the mascot and roaster (code done on branch `pf-024-item15`)
`/mascot quote | ask | roast | mute` (tools app, public replies; mute is managers only). Flag `mascot` ships **`off`** (the kill switch). No migration (D1 `meta` keys `mascot_*`). New channel purpose `mascot_posts`, new permission `mascot.mute` (manager), new cron job `mascotDaily` (Control Center scheduled jobs). Code: `bot/mascot.js`, test: `tests/mascot.test.mjs`.

Owner decisions made (2026-11-18): slash commands only (no gateway, nothing reads chat); roast guardrails as below; **no per-member opt-out**; mascot AI share 20% of the daily pool (2,000 neurons, KV counter `aibudget:mascot:<day>`, separate from Item 14's 20%). Assumed for the open question: the roast uses only the target's display name from the command and Item 14's aggregate mood (never message text, never an avatar); change it if you want avatar jokes later.

What it does:
- **quote**: today's motivational line (general, football, gaming), one a day, the same all day. The built-in list has 58 lines; each is used once. When they run out the AI writes new ones, each checked against everything used so far, so a line never repeats. The daily post (cron, after 09:00 UTC) goes to the `mascot_posts` channel; none set = no post and the status line in D1 says so.
- **ask**: an honest, upbeat answer (admits when it does not know). The prompt carries only the club mood word (steady, warm, tense).
- **roast**: on request only, banter about play and habits. Optional `message` (what they said to you): the reply matches that register but stays clean. Tricks picked at random: name pun, jail joke, empty trophy cabinet, sat-nav passing, late for kick-off. A tense week caps it at "light".

Guardrails in code (each tested): the filter blocks slurs, protected traits (race, religion, sexuality, gender, disability, nationality), looks and weight, family, harm and private details, both in what the person typed and in the AI's answer (a bad answer is replaced by a built-in roast); the roast never names the club; no pings; per-person cooldown (20 s) and at most 3 roasts a day per target; bots are not targets; a manager can mute ask and roast (the quote carries on); AI capped at 20%.

Owner steps:
1. Deploy the Worker and sync the commands to Discord. No migration.
2. In the Organization config add a channel with purpose `mascot_posts` for the daily quote.
3. Flip `mascot` to `owner` to test, then `members`. Flip to `off` any time to stop everything.
4. The banner `banner-mascot.png` is already drawn for the audit; the live site gets it on the next card run in CI.

Not built: reacting when "Phoenix" is mentioned in chat (needs a gateway process and the Message Content intent: a later item if wanted), avatar or meme generation from profile pictures, a member opt-out.

## Item 16: the player bio card (code done on branch `pf-024-item16`)
When a member who has claimed their player saves their profile on the site, the bot posts one formatted card (Components V2 panel, icons, separators, footer) in the `member_bios` channel and mentions the player. A later save **edits the same message** (no second post, nobody re-pinged); an unchanged save touches nothing; a card deleted in Discord is posted again. Lives in the tools app's output family, flag `bioCard` ships `owner`. Code: `bot/biocard.js`, `bot/profiles.js` (new fields), `web/profile.js` (form), migration `0072_bio_card.sql`, test `tests/biocard.test.mjs`.

Card content: player name and platform, positions, Rush positions, game IDs, play schedule (times in the member's zone) and, only if the member ticks them, country, age and language. Age and language are also hidden from other members' profile cards unless ticked. The member sets all of this in the site profile form ("Show on my Discord bio card"); defaults: game IDs and schedule shown, country, age, language hidden.

Owner steps:
1. Apply migration `0072_bio_card.sql` (adds `age`, `language`, `bio_show` to `profiles`), deploy the Worker and the site.
2. In the Organization config add a channel with purpose `member_bios`. Optional: a role in the group `ping_bios` to tag on a member's first card.
3. Flip `bioCard` to `members` when ready (it is `owner` now). Nothing posts until the channel is set.
4. The banner `banner-bio.png` is drawn for the audit; the live site gets it on the next card run in CI.

Owner decision (assumed, you said go ahead): "tag everyone" = **the player plus an optional configured role, never @everyone**, and only on the first post. Option: no role ping at all (leave `ping_bios` empty, the default).
Not built: a /bio slash command to repost on demand, posting when a claim is approved without a profile save, a site toggle to stop the card entirely (a member who never saves a profile gets no card; deleting the Discord message makes the next save post a new one).

## Item 17: the absence notice (code done on branch `pf-024-item17`)
`/absence` (matchday app: the tools app is at the 25 help-page limit, so it was placed beside /lineup and /matchday; the card and its button come from that app): `notice` (type: away, playing less, cannot make matches, other; optional `from` and `until` as 24/12 or 2026-12-24; optional free-text `reason`), `mine`, `cancel`, `list` (managers). A notice posts ONE Phoenix card (Components V2 panel, icons, separators, footer) to the managers' channel with an **Acknowledge** button. Acknowledging edits the same card (who and when). A notice ends on its `until` date (end of that day, UTC) or 30 days after it was filed when no date was given; the 10-minute cron edits the card to "Ended". The member can withdraw a notice and the card says so. Managers also see the list with status on the Control Center tool **Absences** (Staff insights page, `GET /api/intel/absences`, manager level).

Privacy: the free-text reason is private to managers. It is stored in D1, shown only on the managers' card and the manager API, and never in a public post, a log line, a DM, the member's own reply or `/absence mine`. Because the card sits in a Discord channel, **the `absence_notices` channel must be managers-only**.

Owner steps:
1. Apply migration `0073_absences.sql` (new table `absences`), deploy the Worker and the site, and sync the slash commands to Discord (`/absence`, matchday app).
2. In the Organization config add a channel with purpose `absence_notices` (managers-only). With none set, `/absence notice` says so and stores nothing.
3. Flip `absence` to `members` when ready (it is `owner` now). Flip to `off` any time to stop it.
4. The banner `banner-absence.png` is drawn for the audit; the live site gets it on the next card run in CI.

Owner decision (assumed, unclear in the plan): **who counts as a manager for the Acknowledge button and for seeing the reason** = the manager level of the Control Center permission matrix (`absence.ack` is `manager` in `bot/roles.js`, the route is `manager` in `bot/ccpermissions.js`), so the owner and managers, nobody else. Say if you want a narrower group (for example only captains).

Not built (inbox for later): the Dugout/lineup views do not show an "away" badge yet (the data is there: `GET /api/intel/absences` returns `active` per player); a site form to file a notice; a DM to the member when a manager acknowledges.

## Item 18: the highlight clip upload (code done on branch `pf-024-item18`)
`/highlight` (matchday app: the tools app is at the 25 help-page limit): `upload` (required `clip` attachment, optional `title`, `note`), `mine`, `delete` (default: your latest), `list` (managers). The bot copies the attachment from Discord's CDN into R2 (binding `MEDIA`, key `hl/<random>.<mp4|webm|mov>`), writes a `highlights` row (user, title, note, size, type, created, status `stored`) and answers with a private Phoenix receipt. **Nothing else happens**: the clip is not served on any URL, not posted, not shared (the social automation reads the `stored` rows later). If a channel has the purpose `highlights`, one small card (who, title, size, never the file or a link) is posted there; none set = no post.

Safety built in: only mp4/webm/mov (declared type or extension, then the first bytes must match), only Discord CDN hosts, never more bytes than declared, size cap and per-member daily cap from `config.json` `highlight` (`maxMb` 50, `perDay` 5; hard ceiling 100 MB; copied to the Worker var `HIGHLIGHT` by `bot.yml`), the daily cap is enforced inside the INSERT, the storage guard figure refuses uploads before the free 10 GB is full, the hourly media guard never deletes `hl/` objects, and nothing about a clip (title, note, link) is logged.

Owner steps:
1. Apply migration `0074_highlights.sql`, deploy the Worker (the next `bot.yml` run also copies `highlight` from config.json into the Worker var), and sync the slash commands (`/highlight`, matchday app).
2. The R2 binding `MEDIA` (bucket `phoenix-media`) must exist (it does for the feed). With it missing, `/highlight upload` says storage is not switched on.
3. Optional: in the Organization config add a channel with purpose `highlights` to get the small card. None set = no post.
4. Flip `highlight` to `members` when ready (it is `owner` now). Flip to `off` to stop it.
5. The banner `banner-highlight.png` is drawn for the audit; the live site gets it on the next card run in CI.

Owner decisions (assumed safest defaults, say if you want different):
- **Command name**: `/highlight`. **App**: matchday (tools is full).
- **Max size and uploads**: 50 MB and 5 clips a day per member. Discord only hands a bot what the uploader's own upload limit allows (typically 10 MB, more with Nitro or boosts); raise `maxMb` in config up to 100 only if the R2 free 10 GB (shared with the feed) allows it. **Length** in seconds is not checked: the Worker cannot read video duration; the size cap is the guard (a later converter step could add it).
- **Types**: videos only (mp4, webm, mov). Images were mentioned in the plan; they are not accepted here (say if you want them).
- **Who may upload**: members. **Who may list or delete**: the uploader deletes their own, managers (`highlight.manage`) list and delete any.
- **Approval**: none needed, the clip is only stored. **Public posting**: none; the file is private. The optional channel card carries no file.
- **Retention**: clips stay until deleted (no 365-day expiry like feed files); the owner may want a policy once the social step exists.

## Item 19: birthdays (code done on branch `pf-024-item19`)
`/birthday` (matchday app): `set date:07-14 [visible]`, `visible on:`, `show`, `clear`; every reply is private to the member. It stores month and day only, in the existing `profiles.birthday` column (the site profile form writes the same field), with the visibility flag in `profiles.bio_show.birthday` (default **off**). **No migration is needed.** The bio card (Item 16) gains a "Birthday" row (day and month, never a year) only when the member turned visibility on.
The one daily poster is now `bot/birthday.js` (folded in from `bot/fun.js`, which re-exports it): after 08:00 UTC, for members who made it visible, one Phoenix panel in the channel for the purpose `birthdays` (falls back to `fun_posts`, then announcements, by Organization config) that mentions them, an optional ping role (group `ping_birthdays`), plus one private DM per member per year built from real data (joined month, matches, goals, assists, MOTMs from Rush results, badges, points) with a thanks-only fallback. Claims in `meta` (`birthday:<date>`, `birthday-dm:<id>:<year>`) prevent a second post or DM. No channel at all = nothing is posted (the DM still goes).

Owner steps (not done here):
1. Deploy the Worker and sync the slash commands (`/birthday`, matchday app). No migration.
2. In the Organization config add a channel with purpose `birthdays` (otherwise the old `fun_posts`/announcements channel is used). Optionally add a role to the group `ping_birthdays` to tag it on the daily card.
3. Flip `birthday` to `members` when ready (it is `owner` now; the cron runs when `birthday` or the old `fun` flag is on).
4. The existing banners `banner-birthday.png` / `banner-post-birthday.png` are reused; no new banner.

Owner decisions (assumed safest defaults, say if you want different):
- **Visibility default**: hidden. Birthdays saved before this change (site profile form) are NOT posted or DMed until the member runs `/birthday visible on` (behaviour change for the old poster). Say if you would rather treat existing saved dates as visible.
- **Year and age**: never stored, never shown (the bio card still has its separate opt-in age field).
- **Time zone**: the UTC date, stated in the replies. A per-member time zone would need the profile tz (exists) and a different cron; say if you want it.
- **Role ping**: off until you configure `ping_birthdays`; never @everyone and the code has no option for it.
- **Who is celebrated**: only members with visibility on (the DM too: it is a message they opted into). 29 Feb is celebrated on 1 March in non-leap years.
- **DM stats**: games, goals, assists and MOTMs come from the Rush results in D1 for the member's approved player claim; the Pro Clubs season totals, medals live in site JSON the Worker does not read, so they are left out (inbox).

## Item 21: the GIF maker (code done on branch `pf-024-item21`)
`/gif make | mine | delete | list` (matchday app: the tools app is full). `make` takes a required `video` attachment (MP4, WebM or MOV, at most 15 seconds), an optional `title` and `private` (the reply is public by default so others can favourite the GIF; `private` hides it). Flow (**owner decision 2026-11-18: the converter is a GitHub Actions job**, same pattern as the EA relay):
1. The Worker validates type (declared type and first bytes), size and the Discord CDN host, checks the per-member daily limit and the waiting-jobs cap inside the INSERT, copies the video into R2 (`gifin/<24 hex>.<ext>`), writes a `gif_jobs` row (status `converting`, the reply's interaction token kept in D1 only) and dispatches `.github/workflows/gif-convert.yml` with **one input: the job ref**. The member's reply becomes a "Converting your video" panel at once.
2. The job (`scripts/gif-convert.mjs`) pulls the video from `GET /api/gif/input`, checks the length with ffprobe (more than 15 s fails with a clear message: the Worker cannot read video length, so this is where the length rule is enforced), runs ffmpeg with fixed arguments (palette-based GIF, width and fps from `config.json` `gif`, retried smaller up to twice if over the size cap) and posts the GIF to `POST /api/gif/result`, or a failure code to `POST /api/gif/fail`.
3. The Worker stores the GIF in R2 (`gif/<24 hex>.gif`), deletes the input video, and edits the member's reply into the receipt panel (GIF attached, length, size, "Add to Favourites" hint). Failure at any step (bad file, too long, too big, dispatch refused, job lost) edits the reply into a clear error, marks the row failed, deletes the input and clears the token. A job that never answers is failed by the 1-minute timer after `timeoutMin` (10).

Keyed routes `GET /api/gif/input`, `POST /api/gif/result`, `POST /api/gif/fail` use the shared key (`X-Phoenix-Key`, derived from `DISCORD_CLIENT_SECRET` in `bot/gifkey.js`, the `bot/crawl.js` pattern); wrong or missing key = 403. They are not Control Center routes (no session), so they are not in `ROUTES` of `bot/ccpermissions.js`; the Worker answers only to the keyed job.

Safety built in: the video is untrusted. It is written to a fixed file name and handed to ffprobe and ffmpeg as an argument array (no shell, no user text anywhere in a command), with the protocol whitelist set to local files, a stripped environment (the secret never reaches ffmpeg), a timeout, and the job ref validated as 24 hex characters. The workflow takes the single input `ref`, has `contents: read` only, pins both actions to commit SHAs (checkout v4, setup-node v4), passes the secret only to the convert step and never echoes it. The input video is deleted as soon as the job ends; only the GIF is kept (until deleted with `/gif delete`; the hourly media guard never deletes `gif/` or `gifin/`).

**GitHub Actions limits (verified for this repo 2026-11-18):** the repository `devroadtosucces15-boop/Phoenix-Fire` is **public** (`gh repo view` says not private), so standard hosted runners are free with no monthly minute cap (the Boardroom Health tab agrees). Real limits that remain: (a) **latency**: a dispatch plus runner start plus the ffmpeg install is typically 30 to 90 seconds and can be several minutes when GitHub is busy, so the member sees "Converting" for a minute or more; (b) the job queues one at a time (`concurrency` group `gif-convert`, not cancelled), so a burst waits in line and the Worker's `maxWaiting` (4) and `timeoutMin` (10) cap that; (c) the job is killed after 8 minutes (`timeout-minutes`); (d) the Discord reply token is only valid 15 minutes, which is why the timeout is clamped below that; (e) GitHub may disable scheduled workflows of inactive public repos, but this one is dispatch-only so it is not affected; (f) the dispatch API call is rate limited by GitHub (far above this use).

Owner steps (not done here):
1. Apply migration `0075_gif_jobs.sql`, deploy the Worker (the next `bot.yml` run also copies `gif` from `config.json` into the Worker var `GIF`), and sync the slash commands (`/gif`, matchday app).
2. **Secret (by name and place only): `GH_DISPATCH_TOKEN`**, a Worker secret that already exists for `update.yml` and the EA relay, with the repository variable `GITHUB_REPO` set in `bot/wrangler.toml`. It must be allowed to dispatch workflows on this repository (fine-grained token, repository Actions: read and write). No new token is needed if it already does; do not create a new one for this. **`DISCORD_CLIENT_SECRET`** must be set both as a Worker secret and as a GitHub Actions secret (it already is: the crawl and the EA relay use the same pair); the job derives the shared key from it.
3. The workflow file must be on `main` before the first use (merging this branch does that). Run it once by hand from the Actions tab with a bogus ref to see it start, if you like; it fails fast with a 404 from the Worker.
4. The R2 binding `MEDIA` (bucket `phoenix-media`) must exist (it does for the feed and Item 18).
5. Flip `gif` to `members` when ready (it ships `owner`). Flip to `off` to stop it.
6. The banner `banner-gif.png` is drawn for the audit; the live site gets it on the next card run in CI.

Owner decisions (assumed safest defaults, say if you want different):
- **Command name**: `/gif`. **App**: matchday. **Who**: members; managers list and delete any.
- **Limits** (all in `config.json` `gif`): video up to 15 s (hard ceiling), at most 25 MB in (Discord only hands a bot what the uploader's own limit allows, typically 10 MB), GIF at most 8 MB out (Discord's upload limit for a bot reply is 10 MB without a boost, so 8 leaves room), 480 px wide at 12 fps, 5 GIFs a day per member, at most 4 conversions waiting.
- **Public by default**: the finished GIF appears in the channel where the command was used so others can favourite it; `private` keeps it to the member. Discord decides this when the reply starts, so the choice cannot change afterwards.
- **Retention**: the GIF copy in R2 stays until the member or a manager deletes it (the Discord copy is the one people favourite). Videos are never kept.
- **Not built**: a site page for GIFs, a "post this GIF again" command, audio (GIFs have none), a Control Center tool for GIF limits.

## Item 22: the emoji and sticker suggester (code done on branch `pf-024-item22`)
`/emoji suggest | mine | delete | review` (matchday app: the tools app is full). `suggest` takes a required `image` attachment, a required `type` (emoji or sticker) and a required `name`. The Worker downloads the file from Discord's CDN, reads the format and the real pixel size from the image's own bytes (the file name and declared type are never trusted), then reserves a `emoji_suggestions` row (status `pending`) with the per-member pending cap and the duplicate-name check inside the INSERT, and stores the image in R2 (`emoji/<32 hex>.<png|jpg|gif>`, binding `MEDIA`). The member gets a private receipt. If the Organization config has a channel for purpose `emoji_review`, one card (name, type, size, who, Approve and Reject buttons, Discord's own attachment preview once) goes there; none set means no card and managers use the Control Center. Managers also have the Control Center section **Emoji and stickers** (Club Intelligence page, `staff-insights.html?tool=emojis`): the list, a "Show image" button that loads the stored image on request, Approve and Reject. Approved images are kept for the future importer. **Nothing is imported into the server and nothing is shown publicly**; the importer is a separate later feature.

Limits (Discord's, checked 2026-11-18): custom emoji **256 KiB**, JPEG, PNG or GIF, animated only as GIF (Discord's emoji docs: https://docs.discord.com/developers/resources/emoji). Sticker **512 KiB**, PNG, APNG or GIF, 320 x 320 recommended (this figure is from my knowledge of Discord's sticker docs; the search this session only found it on a different platform's page, so the importer session should re-check it before it uploads a sticker). Refused outright: SVG, WebP, video, Lottie JSON, JPEG stickers, animated PNG emoji. Pixels (config, `emojiSuggest` in `config.json`): between 32 and 1024 on the long side, and roughly square (long side at most 1.25 times the short). Config can only tighten the size limits, never go above Discord's.

Owner steps (not done here):
1. Apply migration `0076_emoji_suggestions.sql`, deploy the Worker (the next `bot.yml` run copies `emojiSuggest` from `config.json` into the Worker var `EMOJI_SUGGEST`), and sync the slash commands (`/emoji`, matchday app).
2. Set the review channel: Organization config, purpose `emoji_review` (a managers-only channel; the bot needs View Channel and Send Messages there). Without it no card is posted.
3. The R2 binding `MEDIA` (bucket `phoenix-media`) must exist (it does for the feed, Item 18 and Item 21).
4. Flip `emoji` to `members` when ready (it ships `owner`). Flip to `off` to stop it.
5. The banner `banner-emoji.png` is drawn for the audit; the live site gets it on the next card run in CI.

Owner decisions (assumed safest defaults, say if you want different):
- **Who may submit**: any member (`emoji.suggest`), managers review (`emoji.review`: the Control Center manager level). No public gallery: a member sees only their own list.
- **Name rules**: letters, digits and underscores only (spaces and dashes become underscores, accents dropped, @mentions removed), 2 to 32 characters (30 for a sticker), the Discord rule. A name already waiting or approved for the same kind (any case) is refused. Managers cannot rename yet: reject and ask the member to send it again.
- **Per-member limit**: 3 suggestions waiting at once (`emojiSuggest.maxPending`, 1 to 20); there is no daily cap.
- **Withdrawing**: a member removes only a suggestion that is still waiting; an approved image is kept for the importer and only a manager removes it.
- **The member is not told by DM** when a manager decides: `/emoji mine` shows the status. Say if you want a DM (it would be an owner-controlled DM kind in the DM matrix).
- **Rejections carry no reason** (one click). Say if you want a reason box on Reject.
- **Retention**: images stay in R2 until removed; the media storage guard never deletes them.
- **Not built**: the importer (adding approved images to the server as emoji or stickers), renaming, a reason on rejection, a site page for members.
