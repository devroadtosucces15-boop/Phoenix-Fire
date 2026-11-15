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
| rush | 5v5 Rush queue manager | `/interactions/rush` | `PLANNING/RUSH-QUEUE.md` |

## Output rules

- Every output of every app carries the Phoenix theme: slash replies, embeds, panels, buttons, DMs, cron and webhook posts, error and
  ephemeral notices, emoji, avatars (`CLAUDE.md` branding rule). A change is not done until each dependent output is checked.
- Every message carries a drawn Phoenix picture. Check with `node tools/bot-studio/studio.mjs check --strict` (target 0 warnings).
- Gallery of every message and picture: `tools/bot-studio/gallery.html`, rebuilt by the `bot-gallery` skill.
- Icons are chosen per app by `bot/icons.js`; set per app by `bot/ensure-emojis.mjs`.
- Channels and roles come from Organization config (`bot/orgconfig.js`), editable on the site and by a manager command that writes the same
  rows. A feature with no channel configured says so instead of guessing.

## Settings and flags

| Setting | Where | Notes |
|---|---|---|
| Feature flags (for example `rosterPicture`) | `config.json` `features`, Worker flags | `rosterPicture` is off until match-night go-live (PF-005) |
| Match alert threshold | `config.json` `matchAlert.loseBy` | Defeat by 3 or more goals |
| Worker host | `phoenix/worker-host.json` | `node phoenix/worker-host.mjs flip <host>` changes every place at once |
| Backups | `.github/workflows/backup.yml` | Nightly D1 export to R2; restore in `bot/RESTORE.md` |
| Deploy | `.github/workflows/bot.yml` (wrangler deploy), `update.yml` (Pages) | Both run only on a push to `main` |

Adding a command: define it in `bot/commanddefs.js`, map it in `APP_COMMANDS`, read channels from config, add its picture and a brand test,
run `node tools/library/sync.mjs`.
