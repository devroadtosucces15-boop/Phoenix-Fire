# Bot split: Matchday and Rush (Phoenix design, 2026-11-10)

Phoenix is its own project (`CLAUDE.md`): everything below is Phoenix, with Phoenix branding on every output. Ported from a
design first drafted in the wrong repo; nothing here depends on NOREX.

## Status

| Piece | State |
|---|---|
| Apps `core`, `stats`, `tools`, `fun` | Live, 4 endpoints answer |
| Plumbing for `matchday` and `rush` (`bot/apps.js`, `APP_COMMANDS`, `bot.yml`, `set-tokens.sh`) | **Done**, both apps have no commands yet so nothing moved |
| Icons `phoenix-matchday*`, `phoenix-rush*` | Done (`bot/icons/phoenix/v2/`) |
| Discord applications "Phoenix Matchday" and "Phoenix Rush" | **Owner step** (checklist in `bot/README.md`) |
| Moving commands, new features | Waves below |

## The apps

| Bot | Job | Players see |
|---|---|---|
| **Phoenix Stats** (live) | Read the numbers: players, club, insights, leaderboards | `/player`, `/club`, `/top`, `/compare`... |
| **Phoenix Matchday** (new) | Set up and run one 11v11 match day: league, playoffs, friendlies, tournaments, VPG | `/host`, `/availability`, `/lineup`... |
| **Phoenix Rush** (new) | 5v5 Rush, logged by members (EA exposes no Rush data), LFG, queue | `/rush log`, `/lfg`, later `/queue` |

One Worker, one D1/KV. A Discord application is only an identity (name, avatar, token, public key, command list), so each new
app is config: `DISCORD_APP_ID_<APP>`, `DISCORD_PUBLIC_KEY_<APP>` in `wrangler.toml`, `DISCORD_BOT_TOKEN_<APP>` as a secret.
An unconfigured app lends its commands to core, so a move is safe before the app exists.

## Command map (from `APP_COMMANDS` today)

- **Matchday**: `host`, `schedule`, `nextevent`, `availability`, `lineup`, `remind`, `reminders`, `trial`, plus event posts, RSVP buttons, DM pushes and the reminder queue. New: `/matchday create` (league, playoff, friendly, tournament, VPG), `/checkin`, `/status`.
- **Rush**: `rush` (moves off stats), the rush leaderboard/profile views, the Rush squad builder. Later `/lfg`, `/queue`. Rush events keep their RSVP but are created from Matchday for now.
- **Stays**: everything else on stats, tools, fun and core.
- **Transition**: register a moved command on its new app first, keep it on the old one about 2 weeks with a one-line "this moved to Phoenix Matchday" reply, then remove.

## Request 1: preferred position on check-in

Tapping in / available also asks which position they want that night (GK, CB, LB/RB, CDM, CM, CAM, LW/RW, ST; one or up to two; optional). Stored in a new `event_rsvps.pref_pos` column (JSON, ordered; check the latest migration number first). Discord: an ephemeral select after the button; site: the same picker in the RSVP sheet. It is a preference, never a promise.

## Request 2: layered lineup recommender

Order of priority: 1. level (stats rating), 2. commitment (turn-up rate over the last N events; no-shows count against), 3. tiebreak (who ticked in first for that position). Each slot is offered to those who asked for it; losers fall to their second pick, then their profile positions, then positions most played, then best fit by stats. Nobody sits out over a mismatch. Every placement carries a short reason managers can override. Rush has no stats, so level uses profile self-rating and logged Rush games.
Tests: clash of 3 strikers for 1 slot; preference vs higher-rated non-asker; no-show history demotes; tie broken by check-in time; no preference equals today's output.

## Rush bot, later

- **Queue manager**: designed with the owner on 2026-11-10, see `PLANNING/RUSH-QUEUE.md`.
- **LFG / availability marker**: "available for Rush" posts to the Rush channel tagging the Rush role (never `@everyone`), buttons "I'm in" / "later", auto-expires (default 60 min), per-player cooldown, honours muted alerts, goes through the notification registry. Flags `rushQueue`, `rushLfg`, default owner.

## Waves

| Wave | What | Who | Model |
|---|---|---|---|
| **MB0** | Plumbing for two more apps | **Done** | – |
| **MB-own** | Create both applications in the portal, set tokens | Owner (checklist, `bash bot/set-tokens.sh MATCHDAY RUSH`) | – |
| **MB3** | Layered lineup recommender in `bot/lineuprec.js` (can ship before the split) | Claude | Opus |
| **MB1** | Matchday goes live: move the command set, transition replies, `/matchday create` | Claude | Sonnet |
| **MB2** | Preferred position: migration, Discord select, site picker | Claude | Sonnet |
| **MB4** | Rush goes live: move `rush` and rush files | Claude | Sonnet |
| **MB5** | Rush LFG | Claude | Sonnet |
| **MB6** | Queue manager, spec in `PLANNING/RUSH-QUEUE.md` (owner's design, 2026-11-10) | Claude | Opus |

Branding check for every wave: all replies, embeds, buttons, DMs, cron posts and icons of the new apps use the Phoenix theme (`#e8651a`, Phoenix crest, `phoenix-matchday*` / `phoenix-rush*` icons); add a test that fails on any NOREX name, colour or crest.
