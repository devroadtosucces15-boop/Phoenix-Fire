# Bot: apps, outputs and settings

Last verified: 2026-11-15

One Cloudflare Worker (`phoenix-bot`) serves six Discord apps. Commands per app, with options, are in `BOT-COMMANDS.md` (generated).
IDs and secret names are in `bot/SECRETS-REGISTRY.md` (see `CREDENTIALS.md`).

| App | Role | Interactions path | Code |
|---|---|---|---|
| core | Server, site and manager controls, member login, cron and result posts, AutoMod | `/interactions/core` and `/` | `bot/apps.js`, `bot/controlcenter.js` |
| stats | Anything that reads numbers: club, player, leaderboard, insight, ask | `/interactions/stats` | `bot/apps.js`, `bot/commanddefs.js` |
| tools | Helpers for members and managers: intel, feedback, suggest, watch, remind | `/interactions/tools` | same |
| fun | Old app, kept empty for the transition; carries a "moved" pointer until 2026-11-24 | `/interactions/fun` | same |
| matchday | Running a match night: host, lineup, check-in | `/interactions/matchday` | `bot/events.js`, `bot/rosterpic.js` |
| rush | 5v5 Rush queue manager | `/interactions/rush` | `bot/rushqueue.js`, `bot/rushscan.js`, `PLANNING/RUSH-QUEUE.md` |

## Worker pieces

| Piece | Where | Notes |
|---|---|---|
| Entry and routing | `bot/worker.js`, `bot/routing.js`, `bot/apps.js` | `/interactions/<app>` checked against that app's public key; `/` is core |
| Cron | `bot/wrangler.toml` `[triggers]` | Every 10 min: site update and checks; every minute: reminders only |
| Storage | D1 `DB` (`phoenix`, 63 migrations in `bot/migrations/`), KV `PHOENIX_KV` (+ `NOREX_KV`, same namespace), R2 `MEDIA` (`phoenix-media`), queue `JOBS` (`phoenix-jobs`) | Backups: nightly D1 export to R2 |
| Realtime | Durable Objects `CHAT_ROOM`, `HUB_ROOM`, `CLUB_ROOM` | Club chat, hub, club room |
| AI and images | Workers AI binding `AI`, Images binding `IMAGES` | Card art, insights, vision |
| Output builders | `bot/ui.js` (layout kit), `bot/banners.js`, `bot/panel.js`, `bot/notify.js` (DMs), `bot/matchcard.js`, `bot/rosterpic.js`, `bot/cardstudio.js` | Every message is built here; see output rules |
| Registration | `bot/register.mjs` (slash commands), `bot/ensure-emojis.mjs`, `bot/ensure-resources.mjs` | Run by `bot.yml` |
| Match-night flow | `bot/matchday.js`, `bot/events.js`, `bot/lineuprec.js`, `bot/matchalert.js` | Host, lineup, check-in, alerts |
| Site-side posts | `scripts/post-results.mjs`, `scripts/session-recap.mjs`, `update.yml` | Result posts run from Actions every 15 min |
| EA relay | `.github/workflows/ea-relay.yml`, `scripts/ea-relay.mjs` | EA blocks the Worker network, so `/burner` name searches go through Actions |

## Output rules

- Every output of every app carries the Phoenix theme: slash replies, embeds, panels, buttons, DMs, cron and webhook posts, error and
  ephemeral notices, emoji, avatars (`CLAUDE.md` branding rule). A change is not done until each dependent output is checked.
- Every message carries a drawn Phoenix picture. Check with `node tools/bot-studio/studio.mjs check --strict` (target 0 warnings).
- Gallery of every message and picture: `tools/bot-studio/gallery.html`, rebuilt by the `bot-gallery` skill.
- Icons are chosen per app by `bot/icons.js`; set per app by `bot/ensure-emojis.mjs`.
- Channels and roles come from Organization config (`bot/orgconfig.js`), editable on the site and by a manager command that writes the same
  rows. A feature with no channel configured says so instead of guessing.

## Message kinds (each carries a drawn Phoenix picture)

| Kind | Builder | Guard test |
|---|---|---|
| Slash replies | command handlers, `bot/ui.js` | `tests/slash-replies.test.mjs` |
| Buttons, menus, modals, notices | shared reply helper | `tests/notice-posters.test.mjs` |
| Direct messages | `bot/notify.js` `deliverDMs` | `tests/dm-posters.test.mjs` |
| Automated result post and review | `scripts/post-results.mjs`, `bot/matchcard.js` | `tests/resultpost-brand.test.mjs`, `tests/matchpicture.test.mjs` |
| Match-night and check-in post | `bot/rosterpic.js` | `tests/rosterpic.test.mjs` |
| Cards and banners | `scripts/cards.mjs`, `bot/banners.js` | `tests/banners.test.mjs`, `tests/cards-brand.test.mjs` |

## Settings and flags

| Setting | Where | Notes |
|---|---|---|
| Feature flags | `config.json` `features`; levels off, owner, managers, members, public; owner edits in Boardroom, Switches | Full list: `FLAGS-INDEX.md` (generated). `rosterPicture` is `members` here; check go-live status in PF-005 before relying on it |
| Per-command access | Discord visibility, owner settings in Boardroom, Bot, then in-handler checks | `bot/commanddefs.js` `STAFF_COMMANDS` |
| Public vars | `bot/wrangler.toml` `[vars]`: site and Worker URL, app IDs, public keys, bootstrap owner IDs, VAPID public key | No secrets; secrets are in `CREDENTIALS.md` |
| Match alert threshold | `config.json` `matchAlert.loseBy` | Defeat by 3 or more goals |
| Worker host | `phoenix/worker-host.json` | `node phoenix/worker-host.mjs flip <host>` changes every place at once |
| Backups | `.github/workflows/backup.yml` | Nightly D1 export to R2; restore in `bot/RESTORE.md` |
| Deploy | `.github/workflows/bot.yml` (wrangler deploy), `update.yml` (Pages) | Both run only on a push to `main` |

Adding a command: define it in `bot/commanddefs.js`, map it in `APP_COMMANDS`, read channels from config, add its picture and a brand test,
run `node tools/library/sync.mjs`.

## DJ bridge (PF-022 step 5)
The Phoenix DJ apps run on the owner's PC (`dj/`). `dj/src/bridge.js` pushes room snapshots and polls commands over `X-Phoenix-Key`; the Worker side is `bot/music.js` (`/api/music/*`, migration `0068_music_bridge.sql`), the Control Center rows are `bot/djregistry.js` (kind `dj`), the site page is `hub-music.html`. Setup: `dj/DEPLOY.md`, "Website link".
