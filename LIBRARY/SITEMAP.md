# Site map

Last verified: 2026-11-15 (seeded from the sources below; PF-002 makes it complete and generated)

Pages are built by `phoenix/build.mjs` from `next/pages/*.mjs` (page modules) and `web/`. Source modules: about, burners, canvas, club, hub,
lookbook, matches, rush, rushboard, seasoncards, stats, swap, tactics. The live site is the Phoenix Pages URL in `config.json`.

| Group | Pages | Audience | Source |
|---|---|---|---|
| Public site | home and club pages, matches, stats, tactics, lookbook, about, rush and rush board, season cards, burners | everyone | `next/pages/club.mjs`, `matches.mjs`, `stats.mjs`, `tactics.mjs`, `lookbook.mjs`, `about.mjs`, `rush.mjs`, `rushboard.mjs`, `seasoncards.mjs`, `burners.mjs` |
| Member hub (locker) | `hub.html`, `hub-profile`, `hub-stats`, `hub-medals`, `hub-cardstudio`, `hub-alerts`, `hub-clubhouse`, `hub-squad`, `hub-matchnight`, `hub-discoveries`, `hub-handbook`, `hub-music`, `hub-watchlist` | signed-in members | `next/pages/hub.mjs`, `next/static/locker.css` |
| Staff hub | `staff.html` | managers; owner sees extra owner groups | `next/static/staffhub.js`, `staffhub.css` |
| Boardroom (one tab per page) | `staff-switches`, `staff-health`, `staff-announce`, `staff-audit`, `staff-halloffame`, `staff-medals`, `staff-backup`, `staff-organization` | managers | `staffhub.js` |
| Control Center | in the dock Admin and Manager views | managers | `bot/controlcenter.js`, dock |
| Member claim | `claim.html` | members claiming a profile | `phoenix/claim.html` |
| Player pages | one per player, keyed by the decoded name | everyone | `phoenix/build.mjs` |

Rules: a player link must resolve (guarded by `tests/phoenix-brand.test.mjs`); old `#lk-*` links forward to the hub pages; Staff is never listed
for members. When a page is added, renamed or removed, update the row here in the same change.
