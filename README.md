# PHOENIX FIRE

*Rise. Burn. Repeat.* Pro Clubs site and Discord login for club 1111 (EA, common-gen5).

- **Site:** built by `node phoenix/build.mjs --live --out site` from `data/` (kept fresh by `.github/workflows/update.yml`).
- **Worker:** `bot/`, deployed as `phoenix-bot` (Discord login, member data, four Discord apps; see `bot/README.md`).
- **Discord server:** 1328821938243637381

## Build

Needs Node 22 or newer.

```bash
node scripts/fetch.mjs                      # refresh data/ from EA (optional; the workflow does this)
node phoenix/build.mjs --live --out site    # build the site into site/
```

`phoenix/live.json` holds the club ID, Worker URL and the public Discord values. `config.json` holds the site text, recruitment copy and feature flags. Leave unknown fields blank rather than guessing.

## Preview

Any static server works on `site/`. The repo's own:

```bash
PORT=4411 node scripts/serve.mjs            # serves site/ on http://localhost:4411
```

On localhost the browser blocks the Worker's API calls (it only allows the Pages origin), so the Rush log, news feed and live banner show their fallback states. That is expected.

## Test

```bash
node tests/run.mjs                          # syntax check, build, every tests/*.test.mjs
```

## Deploy

- **Site:** push to `main`. The update workflow rebuilds and publishes to GitHub Pages.
- **Bot:** `bot.yml` uploads the icon set, deploys the Worker and registers the slash commands for every configured app.
- **Secrets** (bot tokens, client secret) live only in GitHub Actions secrets. Never commit them.

More: `PLANNING/PHOENIX-ROADMAP.md`.
