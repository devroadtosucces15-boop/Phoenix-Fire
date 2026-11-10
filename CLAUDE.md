# PHOENIX FIRE

Pro Clubs site and Discord bot for Phoenix Fire (club 1111). See `README.md` and `PLANNING/PHOENIX-ROADMAP.md`.

## Phoenix is its own project. NOREX is a different club.

NOREX UNITED has its own data, its own site and its own process. None of it belongs here. This repo began as a
copy of the NOREX codebase, so NOREX leftovers are the main risk: wrong crest, wrong colour, wrong name, wrong links.

### Branding rule: it follows every dependency

When you work on any item, its Phoenix branding must carry through **everything that item touches or outputs**, not only
the file you opened. Before calling an item done, list what it feeds and check each one:

- **Bot:** every output of every Discord app (core, stats, tools, fun): slash replies, embeds, panels, buttons, DMs,
  cron and webhook posts, error and ephemeral notices, emoji, avatars and icons.
- **Site:** every page, component, chart, share card, generated image, OG image, manifest, service worker, favicon.
- **Data and generators:** card studio, avatar cards, result graphics, AI prompts, seeds and migrations.
- **Copy:** names, links, footers, "-# " lines, docs, README and PLANNING text.

Phoenix identity (single source: `config.json` brand, `phoenix/live.json`, `phoenix/overlay/`, `bot/icons/phoenix/`):

- Name: PHOENIX FIRE. Motto: "Rise. Burn. Repeat."
- Accent: `#e8651a` (`config.json` brand.red), ink `#0a0705`. Not NOREX red (`0xc8352c`).
- Crest and logo: the Phoenix crest from `phoenix/overlay/crest*.png`. Never the NOREX crest.
- Worker: `phoenix-bot`. Site: the Phoenix Pages URL in `config.json`.

### Player image rule (all generated images)

Every player image, whatever makes it (portrait prompt, full-card prompt, compositor crop, avatar card, share graphic), is **chest up**:
head, neck, shoulders, chest, no waist or legs. The figure is large but keeps a clear margin from every card border (never overlaps
an edge or the crest), and the shirt number is big and bold on the chest. The prompts live in `bot/cardstudio.js`, the crop and number
in `web/cardcomposer.js` (`CHEST_ASPECT`, `FIT_PAD`); `tests/cardstudio.test.mjs` guards the prompts. New image generators follow it.

### Rules

1. A change is not finished until every dependent output is in the Phoenix theme. Check the dependents, not just the file you edited.
2. Do not add new NOREX references. When you touch a file that has one, remove it or make it read from Phoenix config.
3. Brand values come from config (`config.json`, `live.json`, wrangler vars), never hardcoded in a module.
4. Do not copy files or code back and forth with the NOREX repo without re-theming them first.
5. Tests: when you rebrand something, add or extend a test that fails if a NOREX name, colour or crest appears in that output.

### How the site is themed

`next/` and `web/` are shared sources. `phoenix/build.mjs` stages them, runs `phoenix/recolor.sh` on both, renames NOREX to Phoenix in
every staged js/css/html file, then overlays the Phoenix crest and theme layer. Source files may still say NOREX; the **built output**
must not. `tests/brand.test.mjs` and `tests/phoenix-brand.test.mjs` build the site and fail on a visible NOREX name, the NOREX crest,
the NOREX red, or a player link that does not resolve.

The build is guarded: `phoenix/leakcheck.mjs` runs at the end of `phoenix/build.mjs` and exits non-zero when the output shows a NOREX name (in visible html or the manifest) or the NOREX red or blue-black (`#c8352c`, `#080b11`). Identifiers inside scripts are ignored. `tests/leakcheck.test.mjs` covers the guard. Keep `next/` and `web/` as shared sources; do not delete them.

### Known leftovers (audit 2026-11-10)

- The Worker host is `phoenix-bot.norexunited.workers.dev` (config, wrangler `PUBLIC_URL`, `live.json`, secrets registry). Owner decision: keep the account host or move it.
- A2 (2026-11-10) moved the active identifiers to Phoenix names with the old ones still read: `phoenix_session` (+ `norex_session`), `X-Phoenix-Key` (+ `X-Norex-Key`, `bot/sharedkey.js`), `phoenix.*` / `phoenix_*` storage keys (one-time copy from `norex.*`, flag `phoenix.migrated`), `PHOENIX_KV` (+ `NOREX_KV` on the same namespace, `bot/kv.js`). New code uses only the Phoenix names; `tests/identifiers.test.mjs` guards both. `window.Norex*` namespaces stay (reusable class in `PLANNING/PHASE1-NOREX-AUDIT.md`).
- `site/` in a working copy may be an old classic build from `tests/run.mjs`; the published site comes from `phoenix/build.mjs`.

### Channels and roles are never hardcoded

Every channel or role a bot feature uses (queue boards, reports, announcements, reminders, results, alerts) comes from the Organization config
(`discord_channels` / `discord_roles` by purpose, `bot/orgconfig.js`): several allowed per purpose, editable on the website **and** by a manager
command that writes the same rows, so site and Discord always agree. A feature with no channel configured says so instead of guessing. New
features add a purpose; they never add a name or ID to code. Add a test that the feature reads its channel from config.
