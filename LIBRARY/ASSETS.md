# Assets

Last verified: 2026-11-15

What each asset group is for. The full file list is generated in `ASSETS-INDEX.md`. Phoenix only: no NOREX crest, colour or art, ever
(`CLAUDE.md` branding rule). Brand values come from config, never hardcoded.

| Group | Folder | Used by | Rules |
|---|---|---|---|
| Crest, logo, favicons, theme layer | `phoenix/overlay/` (`crest*.png`) | `phoenix/build.mjs` lays it over the built site; manifest, favicon, OG images | The only crest allowed. `tests/brand.test.mjs` and `phoenix/leakcheck.mjs` guard it. |
| Discord emoji and icon set | `bot/icons/phoenix/` | `bot/ensure-emojis.mjs` uploads it per app; IDs in `bot/emojis.gen.js`; picked by `bot/icons.js` | Per-app IDs; falls back to core, then unicode. |
| Card studio looks | `phoenix/card-looks/` | `bot/cardstudio.js`, `web/cardcomposer.js` | Player images are chest up (see `DESIGN.md`). |
| Share art | `phoenix/share-art/` | Share cards and result graphics | Accent `#e8651a`, ink `#0a0705`. |
| Build sources | `phoenix/source/` | Site and card builds | Read-only inputs. |
| Legacy assets | `phoenix/legacy-assets/` | Kept for the transition | Do not add new uses. |
| Generated card and banner pictures | `scripts/cards-events.mjs`, `bot/banners.js`, `bot/rosterpic.js` | Bot posts and site | Built at build time or drawn by the Worker; never hand-edited. |

Adding an asset: put it in the group's folder, add a row here if it is a new group, run `node tools/library/sync.mjs`, and add a test if it
is brand-visible.
