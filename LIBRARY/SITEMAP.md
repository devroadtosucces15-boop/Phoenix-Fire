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
- Links (PF-018): every address a bot message, DM, bell row or old Discord post can carry resolves through ONE map, `next/lib/linkmap.mjs`
  (`members.html#<key>` table, `schedule-<id>` prefix, legacy page names). The site reads it through `PhoenixLinks.resolve` (`next/static/links.js`),
  `members.html` forwards from it, and the build writes stubs for dead names (docs, feed, messages, builder, compare, apply, `players/<id>`,
  `matches/<id>`, `clubs/<id>`). New bot links point at the real page; a new legacy key goes in `linkmap.mjs`, never in a second resolver.
  `tests/linkresolve.test.mjs` fails when a bot link literal or map target does not land on a built page and id. Sign-in keeps the `#section` (`next/static/session.js`).
