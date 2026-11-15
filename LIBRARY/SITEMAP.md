# Site map

Last verified: 2026-11-15

Every built page, with title, audience and source module, is generated in `SITEMAP-INDEX.md` from a fresh `phoenix/build.mjs` build
(`node tools/library/sync.mjs`). This file records what the groups mean and the rules around them. The live site is the Phoenix Pages URL
in `config.json`.

| Group | Pages (see the index for each) | Audience | Source |
|---|---|---|---|
| Home and club | `index`, `squad`, `players`, `news`, `watch`, `join`, `halloffame`, `leaders`, `scouting`, `scout` | everyone | `next/pages/club.mjs`, `about.mjs`, `stats.mjs` |
| Matches | `fixtures`, `results`, `opponents`, plus `match-<id>` and `opp-<id>` per record | everyone | `next/pages/matches.mjs` |
| Players | `player-<name>` per squad player | everyone | `next/pages/club.mjs` |
| Tactics and builds | `tactics`, `playbook`, `playstyle`, `builds`, `studio` | everyone | `next/pages/tactics.mjs` |
| Cards and art | `canvas`, `lookbook`, `seasoncards`, `updates` | everyone | `next/pages/canvas.mjs`, `lookbook.mjs`, `seasoncards.mjs` |
| Rush | `rush`, `rushboard` | everyone | `next/pages/rush.mjs`, `rushboard.mjs` |
| About and burners | `about`, `burners` | everyone | `next/pages/about.mjs`, `burners.mjs` |
| Claim and member | `members` (claim your player), `member` (profile) | signed-in members | `phoenix/claim.html`, `next/pages/swap.mjs` |
| Member hub (locker) | `hub` and `hub-*` (profile, stats, medals, cardstudio, alerts, clubhouse, squad, matchnight, discoveries, handbook, music, watchlist) | signed-in members | `next/pages/hub.mjs`, `next/static/locker.css` |
| Staff hub | `staff` and `staff-*` (boardroom tabs: switches, health, announce, audit, backup, organization, medals, halloffame, plus desk, dugout, content, tools, insights, schedule, artwork, controlcenter) | managers; owner sees extra owner groups | `next/pages/hub.mjs`, `next/static/staffhub.js` |
| System | `404`, `offline` (service worker), `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, `api/*.json` | machines | `next/lib/swap.mjs`, `phoenix/build.mjs` |

Rules:
- A player link must resolve (`tests/phoenix-brand.test.mjs`); old `#lk-*` links forward to the hub pages (`next/pages/hub.mjs`); Staff is never
  listed for members; `robots.txt` disallows `/hub` and `/staff`.
- Adding, renaming or removing a page: register it with `P('name.html', ...)` in a `next/pages/*.mjs` module, run
  `node tools/library/sync.mjs`, and update the group row above if it is a new group.
- Control Center lives in the dock Admin and Manager views (`staff-controlcenter`, `bot/controlcenter.js`).
