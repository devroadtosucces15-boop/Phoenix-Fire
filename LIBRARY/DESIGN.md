# Design choices and systems

Last verified: 2026-11-16

Single source for brand values: `config.json` (`brand`), `phoenix/live.json`, `phoenix/overlay/`, `bot/icons/phoenix/`. This file records the
decisions and where they are enforced. Design talk always starts from a screenshot (`PLANNING/SESSION-HANDOFF.md`).

## Brand tokens

| Token | Value | Where it comes from | Guard |
|---|---|---|---|
| Name | PHOENIX FIRE | `config.json` `siteTitle` | `tests/brand.test.mjs`, `phoenix/leakcheck.mjs` |
| Motto | Rise. Burn. Repeat. | `config.json` `brand.motto` | brand tests |
| Accent | `#e8651a` | `config.json` `brand.red` | leak check fails on `#c8352c` |
| Ink | `#0a0705` | `config.json` `brand.ink` | leak check fails on `#080b11` |
| Crest | `phoenix/overlay/crest*.png` | overlay | brand tests |
| Club | id 1111, platform common-gen5, founded 2025 | `config.json`, `phoenix/live.json` | none |

## Decisions

| Area | Decision | Enforced by |
|---|---|---|
| Player images | Chest up: head, neck, shoulders, chest; large with a clear margin from every card border; big bold shirt number on the chest | `bot/cardstudio.js` prompts, `web/cardcomposer.js` (`CHEST_ASPECT`, `FIT_PAD`), `tests/cardstudio.test.mjs` |
| Card Studio uniform and panel | Members pick the male or female club kit (reference image per variant, text pair from config); no card preview before approval; `/avatarcard` is a private panel on `pf:card:` ids that feeds the same request pipeline | `bot/cardstudio.js`, `bot/cardpanel.js`, `tests/cardpanel.test.mjs`, `tests/cardstudio.test.mjs` |
| Site theming | `next/` and `web/` are shared sources; `phoenix/build.mjs` stages them, recolours, renames, overlays the Phoenix theme. Source may say NOREX; built output must not | `tests/brand.test.mjs`, `tests/phoenix-brand.test.mjs`, `phoenix/leakcheck.mjs` |
| Bot pictures | Every message the bots send carries a drawn Phoenix picture; `studio.mjs check --strict` is at 0 warnings | `tools/bot-studio/`, `PLANNING/OUTPUT-REDESIGN-SECTIONS.md` |
| Navigation | A dock: crest ring with scroll progress plus a Staff pill; hub pages list hub rooms only, main pages list site menus; Staff never appears for members | `next/static/dock.js`, `dock.css`, `tests/dock.test.mjs` |
| Control Center | One staff manifest (`next/lib/staffmanifest.mjs`) feeds hub tiles, dock lists, sidebar, Ctrl+K and link resolver; shell is a scoped dark CRM variant (`.cx`, ember/amber/gold theme vars, neon numbers), one SVG sprite (`next/lib/ccsprite.mjs`), phone-first drawer and grouped lists, dashboard cross-filters one data layer | `tests/ccshell.test.mjs`, `tests/controlcenter-nav.test.mjs` |
| Layout | Shared layout rules; no sideways scroll at 390, 820, 1440 | `next/static/layout.css`, layout tests |
| Channels and roles | Never hardcoded; read from Organization config | `bot/orgconfig.js`, per-feature test |
| Frameworks | Vanilla JS and CSS only; vendored gsap, lenis, three for motion | `PLANNING/RESOURCES.md` |
| Go-live | `config.json` `launch.public`: off hides the site from search engines; on makes public pages indexable while hub, staff and design pages stay hidden | `tests/launch.test.mjs`, `phoenix/build.mjs` |
| Old addresses | Every old page address resolves to a new page or a copy under `classic/` | `tests/redirects.test.mjs` |
| Install | PWA with its own cache name `pf-v2` | `tests/pwa.test.mjs` |

## Theme layers (site, load order)

| Layer | File | What it does |
|---|---|---|
| Base | `next/static/style.css`, `themes.css` | Type, panels, buttons, the NOREX palette that the recolour step replaces |
| Layout | `layout.css`, `header.css`, `dock.css` | Shared grids, header, dock ring and Staff pill |
| Rooms | `locker.css`, `hubx.css`, `staffhub.css`, `controlcenter.css`, `rush.css`, `rushboard.css`, `canvas.css`, `lookbook.css` | Page families: locker, staff hub, control center, rush, cards |
| Motion | `fx.css`, `motion.css`, `smooth.css`, `crest3d.css`, `vendor-gsap`, `vendor-lenis`, `vendor-three` | Entrance, scroll and 3D crest; owner can switch motion off |
| Phoenix | `phoenix/overlay/phoenix.css` (loaded last), `phoenix-fx.js` | Ember orange (`--red #e8741a`, `--red2 #ff9a2e`), gold (`--g1..g4`), silver (`--s1..s3`), black marble background, ember button gradient |
| Brand tokens | `config.json` brand.plate, brand.palette; `phoenix/build.mjs` | Staff-hub gold plate (`--plate-top/-bottom`) and search palette and menu surfaces (`--pal-top/-bottom/-veil`) come from config, written into `phoenix.css` at build; css never holds those hex values (`tests/theme-tokens.test.mjs`) |

## Guard tests by area

| Area | Tests |
|---|---|
| Brand leak (name, crest, colour) | `brand`, `phoenix-brand`, `leakcheck`, `no-norex-fallback`, `identifiers`, `sharemeta` |
| Layout and responsive | `layout-pass`, `layout-r2`, `phonefix`, `dock`, `smooth-lock`, `design` (Chrome, run unsandboxed) |
| Contrast | `contrast-r44`: text stays Phoenix cream on dark, active controls carry Phoenix ink on ember |
| Bot pictures | `design`, `banners`, `cards-brand`, `notice-posters`, `dm-posters`, `slash-replies`, `resultpost-brand`, `matchpicture`, `rosterpic`, `botstudio` |
| Go-live and PWA | `launch`, `redirects`, `pwa` |

## Bot design system

Layout kit `bot/ui.js`; card templates `scripts/cards.mjs`; banner families `bot/banners.js` (one family per command, button, DM type and post);
rules in `LIBRARY/BOT.md`. Redesign with the `bot-output-studio` skill; the gallery is `tools/bot-studio/gallery.html`.

## Open design questions

None recorded. Add a row here with the date when the owner makes a design choice, so it is not asked twice.
