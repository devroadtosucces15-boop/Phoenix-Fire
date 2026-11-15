# Design choices and systems

Last verified: 2026-11-15

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
| Site theming | `next/` and `web/` are shared sources; `phoenix/build.mjs` stages them, recolours, renames, overlays the Phoenix theme. Source may say NOREX; built output must not | `tests/brand.test.mjs`, `tests/phoenix-brand.test.mjs`, `phoenix/leakcheck.mjs` |
| Bot pictures | Every message the bots send carries a drawn Phoenix picture; `studio.mjs check --strict` is at 0 warnings | `tools/bot-studio/`, `PLANNING/OUTPUT-REDESIGN-SECTIONS.md` |
| Navigation | A dock: crest ring with scroll progress plus a Staff pill; hub pages list hub rooms only, main pages list site menus; Staff never appears for members | `next/static/dock.js`, `dock.css`, `tests/dock.test.mjs` |
| Layout | Shared layout rules; no sideways scroll at 390, 820, 1440 | `next/static/layout.css`, layout tests |
| Channels and roles | Never hardcoded; read from Organization config | `bot/orgconfig.js`, per-feature test |
| Frameworks | Vanilla JS and CSS only | `PLANNING/RESOURCES.md` |

## Open design questions

None recorded. Add a row here with the date when the owner makes a design choice, so it is not asked twice.
