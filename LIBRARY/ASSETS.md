# Assets

Last verified: 2026-11-15

What each asset group is for. The full file list is generated in `ASSETS-INDEX.md`. Phoenix only: no NOREX crest, colour or art, ever
(`CLAUDE.md` branding rule). Brand values come from config, never hardcoded.

## Groups

| Group | Folder | Used by | Rules |
|---|---|---|---|
| Crest and logo sizes | `phoenix/overlay/crest.png`, `crest-sm.png`, `crest-lg.png` | `phoenix/build.mjs` lays them over the built site (header, dock ring, about, cards) | The only crest allowed. Guarded by `tests/brand.test.mjs`, `tests/phoenix-brand.test.mjs`, `phoenix/leakcheck.mjs`. |
| 3D crest texture and script | `phoenix/overlay/crest3d-tex.png`, `phoenix3d.js` | About page crest, hero | Built over `next/static/crest3d.js`. |
| App and install icons | `phoenix/overlay/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | `manifest.webmanifest`, PWA install, iOS home screen | Checked by `tests/pwa.test.mjs`. |
| Share images | `phoenix/overlay/share.png`, `share-animated.svg`; source in `phoenix/share-art/` (`make.mjs`, `share-source.png`, `share.svg`) | OG and Twitter meta on every public page | `tests/sharemeta.test.mjs`. Accent `#e8651a`, ink `#0a0705`. |
| Theme layer | `phoenix/overlay/phoenix.css`, `phoenix-fx.js` | Loaded last on every page; black marble, ember orange, gold, silver | Colours here are the Phoenix tokens in `DESIGN.md`. |
| Demo data | `phoenix/overlay/phoenix-mock.js`, `phoenix-api.json` | Mock members, matches and API files until real data lands | Mock only; never shown as real stats. |
| Discord icon set (current) | `bot/icons/phoenix/` (`phoenix-core`, `-stats`, `-toolbot`, `-fun`, `-dj-*`, `-dj-controller`, each plain and `-128`) and `contact-sheet.png` | App avatars; source for emoji upload | One image per app. |
| Discord icon set v2 | `bot/icons/phoenix/v2/` (avatar, `-128`, `-banner` per app, plus `banners-sheet.png`, `contact-sheet.png`) | App avatars and banners | Newer set; check the sheet before replacing an avatar. |
| Application emoji | built from `bot/iconset.mjs` and `bot/emojiset.mjs`; IDs per app in `bot/emojis.gen.js`; read by `bot/icons.js` | Every message, button and menu emoji | Upload with `node bot/ensure-emojis.mjs`; falls back to core, then unicode. `tests/emojis.test.mjs`. Emoji names still start `nx_` (see Known leftovers). |
| Card studio looks | `phoenix/card-looks/` (`ember-night.png`, `gold-crest.png`, `phoenix-rise.png`; `make.py`, `seed.mjs`) | `bot/cardstudio.js`, `web/cardcomposer.js`, member card requests | Player images chest up (`DESIGN.md`). `tests/cardstudio.test.mjs`, `tests/cards-brand.test.mjs`. |
| Card and banner pictures | `scripts/cards.mjs`, `scripts/cards-events.mjs`, `scripts/cards/`, `bot/banners.js`, `bot/matchcard.js`, `bot/rosterpic.js` | Bot posts, DMs, notices and site share cards | Drawn at build time or by the Worker; never hand-edited. `tests/banners.test.mjs`, `tests/cards-events.test.mjs`. |
| Source art | `phoenix/source/` (`newcrest.py`, `make3d.py`, `cut4.py`, `phoenix_crest.blend`, `*-src.jpg`, `badge_cut.png`) | Rebuilding crest, icons and 3D crest | Read-only inputs. Not shipped. |
| Site static art | `web/` (`crest.png`, `crest-ea.png`, `favicon.png`, `icons/`) and `next/static/` (`crest-*.png`, `icon-*.png`) | Shared sources the build recolours and replaces with the overlay | NOREX crest may exist in source only; the built output must not (`phoenix/leakcheck.mjs`). |
| Legacy assets | `phoenix/legacy-assets/` | Kept for the transition | Do not add new uses. |

## Known leftovers

- `bot/emojis.gen.js` emoji names use the `nx_` prefix (NOREX era). Names are not visible to members, but rename when the set is next uploaded.

Adding an asset: put it in the group's folder, add a row here if it is a new group, run `node tools/library/sync.mjs`, and add a test if it
is brand-visible.
