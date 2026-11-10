# Live check (2026-11-10)

## Re-check, 2026-11-10 evening (Claude, unsandboxed fetch)

| Check | Result |
|---|---|
| **L1 manifest colours** | **Fixed.** Live `manifest.webmanifest`: name `PHOENIX FIRE`, `background_color` and `theme_color` both `#0a0705`. Home `theme-color` `#0a0705`. |
| Home, crest, icons 192/512, apple-touch-icon, `share.png`, `news`, `rush`, `watch`, `player-Bantu%20Vikng`, `robots.txt` | all 200 |
| Visible NOREX text on home (scripts and styles excluded) | 0 |
| `noindex` on home | present (closed, as intended) |
| Worker `GET /` | 200 `Phoenix Fire bot is running` |
| `/api/rush`, `/api/live` | 200, valid JSON, CORS echoes the Pages origin only |
| `/api/feed/public` | **404 `{"error":"Not available yet."}`** (earlier today it was 200 with an empty feed). The News page must show its empty state on a 404 as well as on an empty list; owner-side the feed flag/route is simply not serving yet. |
| `/api/health` without a login | 401 (auth-gated by design) |
| `POST /interactions/{core,stats,tools,fun,matchday,rush}` unsigned | all six answer 401 `Bad signature`, so the Matchday and Rush apps are live on the Worker |
| Not checkable from here | that each app's bot token secret is set; authenticated `/api/*` payloads; Discord-side command lists |

The section below is the first pass from earlier today; L1 is closed by the table above.

Fetched with curl, unsandboxed. Site: `https://devroadtosucces15-boop.github.io/Phoenix-Fire/`. Worker: `https://phoenix-bot.norexunited.workers.dev`.

## Site: passes

| Check | Result |
|---|---|
| Home, title, apple-mobile-web-app-title | `Home · PHOENIX FIRE`, `PHOENIX FIRE` |
| Crest (`crest.png`) | byte-identical to `phoenix/overlay/crest.png`; `crest-sm`, `crest-lg`, `apple-touch-icon`, `icon-192/512/maskable` all 200 |
| Manifest name, short name, id | `PHOENIX FIRE`, `PHOENIX`, `phoenix-fire` |
| `player-Bantu%20Vikng.html` (space in name), `player-Glekke-93.html` | 200 |
| `news.html`, `rush.html`, `watch.html`, `hub.html`, `fixtures`, `results`, `stats`, `leaders`, `join`, `opponents`, `playbook`, `builds`, `burners`, `halloffame`, `about`, `hub-matchnight` | all 200 |
| Visible NOREX text on those pages | none (script/identifier strings excluded) |
| Twitch on Watch and Home | `twitch.tv/kingmitch93`, no YouTube |
| `robots.txt`, `noindex` meta | blocks all (B8 until launch) |
| `undefined` / `NaN` in the static HTML | none |

## Site: failures

| # | Finding | Fix |
|---|---|---|
| L1 | `manifest.webmanifest` has `background_color` and `theme_color` `#080b11` (the NOREX blue-black, not Phoenix ink `#0a0705`). `recolor.sh` does not touch `.webmanifest`. | A4: recolour the manifest in `phoenix/build.mjs` and add a build guard |
| L2 | `index.html` meta `theme-color` is Phoenix, but the classic pages inside `next/dist` still carry `#080b11` and `apple-mobile-web-app-title="NOREX"` (local `next/dist` only, not published) | A4: guard checks the staged output; `next/dist` is gitignored |
| L3 | Internal identifiers still in published source: `norex.*` localStorage keys, `NOREX_API`, `NOREX_ICONS`, `NOREX_ROOT`, `NOREX_SW`, `NorexMotion`, the Worker host | Kept on purpose; A2 (Opus) migrates storage keys; the host is B1 |
| L4 | Rush, News and Watch empty states are only checkable in a browser (client-rendered from `api/*.json`) | A5 |
| L5 | Pretty URLs `/rush/`, `/news/`, `/watch/` return 404 (pages are flat `.html`) | Expected, no change. Nav uses `.html`. |

## Worker

| Check | Result |
|---|---|
| `GET /` | 200 `Phoenix Fire bot is running ⚽` |
| `GET /api/health`, `/api/club`, `/api/players`, `/api/news` without a login | 401 JSON `{"error":"Please log in again."}` (auth-gated by design) |
| CORS from the Pages origin | `access-control-allow-origin` echoes the Pages origin, `Authorization, Content-Type, X-View-As`, preflight 204 |
| CORS from another origin | no `access-control-allow-origin` header (correct) |
| Worker host | still `norexunited.workers.dev`: B1 |

Not checked (needs a login or the owner): authenticated `/api/*` payloads, Discord interaction endpoints (four apps), the `X-Norex-Key` header path (A2).

## Left over for the owner (part B)

B1 Worker host, B2 founded date, B8 launch go-ahead.

## A5 page pass (local live-flavour build, built-in browser at 375 px, 44 pages)

No page scrolls sideways, none prints `undefined`, `NaN` or `[object]`. Empty states read correctly: Fixtures ("No match night is scheduled right now."), Rush ("shown here once a manager confirms them"), Watch (Twitch channel card, no YouTube). Rush and Watch fill from the Worker at runtime, so their populated state could only be checked on the live site. L1 (manifest colours) is fixed by the A3 manifest change and guarded by A4. `tests/next-quality.test.mjs` now fails on printed broken values and on inline widths of 400 px or more.
