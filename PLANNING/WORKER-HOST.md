# B1: Move the Worker off `norexunited.workers.dev`

Decision 2026-11-13: owner keeps the host as is (option D). Nothing to do. Original plan below.

Status: plan only (2026-11-10). Nothing here has been changed. The host is still `https://phoenix-bot.norexunited.workers.dev`.
Owner decision needed: which target (see Recommendation). Cloudflare and Discord Developer Portal steps are the owner's.

## Why it matters

The `workers.dev` subdomain belongs to the **Cloudflare account**, not to the Worker. `norexunited` is the account's subdomain, so
every Worker on that account shares it. Two consequences:

- Renaming the account subdomain would also move any other Worker on the account (including NOREX's, if it lives there). Do not
  rename it unless the owner has checked that nothing else uses it.
- A Phoenix-named `workers.dev` host therefore means either a **new Cloudflare account** (new subdomain, new D1/KV/R2/secrets, a data
  migration) or a **custom domain** on this account. The second is much cheaper and reversible.

## Every place the host appears (git grep, 2026-11-10)

| # | File | What | Changes when the host moves? |
|---|---|---|---|
| 1 | `config.json` `members.api` | Site pages call the member API here. Source for `next/` builds and `tests/next.test.mjs`. | Yes |
| 2 | `phoenix/live.json` `api` | API base for `phoenix/build.mjs --live` builds. | Yes |
| 3 | `bot/wrangler.toml` `PUBLIC_URL` | Worker's own address for Card Studio media links (`bot/faces.js`, `bot/panel.js`). | Yes (bot lane owns this file, see Handover) |
| 4 | `bot/SECRETS-REGISTRY.md` line 14 | Records the core OAuth redirect URL. | Yes (docs) |
| 5 | `CLAUDE.md` "Known leftovers" | Text note about B1. | Yes (docs) |
| 6 | `PLANNING/LIVE-CHECK.md`, `PHASE1-NOREX-AUDIT.md`, `PHOENIX-NEXT.md` (B1), `PHOENIX-ROADMAP.md` | History and status text. | Update the status lines; leave dated history alone |
| 7 | `tests/pwa.test.mjs:22` | Asserts the service worker string does not contain `workers.dev`. | No (still correct on a custom domain; keep) |
| 8 | `.github/workflows/*.yml` | No hard-coded host. `bot.yml` reads `config.json` and `wrangler.toml`; the Discord interaction endpoint is **not** set by CI. | No |

Not hard-coded, derived at request time, so they follow the host automatically once Discord is updated:

- OAuth `redirect_uri` is `${url.origin}/auth/callback` (`bot/members.js:463`), the origin of whatever host the browser used.
- CORS: `Access-Control-Allow-Origin` is `new URL(env.SITE_URL).origin` (`bot/members.js:91-96`). That is the **site** origin
  (`https://devroadtosucces15-boop.github.io`), not the Worker host, so moving the Worker does **not** change CORS. It changes only
  if the *site* moves (see "Site host" below). `/media/*` and the avatar proxy answer `*`.

Re-run `git grep -n "norexunited.workers.dev"` before starting; the bot lane may have added references.

## Options

| Option | Cost | Effort | Risk | Notes |
|---|---|---|---|---|
| **A. Custom domain on this account** (e.g. `api.<phoenix-domain>`), keep `workers_dev = true` during cutover | Domain only, about 10 to 15 USD/year; Workers Custom Domains are free | Low: add one `[[routes]]` entry, update 6 strings, 6 portal fields | Low: old host keeps answering, rollback is a revert | Needs a domain on Cloudflare DNS (Cloudflare Registrar sells at cost) |
| **B. New Cloudflare account with a Phoenix subdomain** (`phoenix-bot.<phoenixname>.workers.dev`) | Free plan | High: new D1, KV, R2, queues, secrets, cron; copy data; redeploy; re-point everything | Medium: data migration, two live copies | Only choice if Phoenix must not share any account with NOREX |
| **C. Rename the existing account subdomain** | Free | Trivial, but breaks every Worker on the account | High unless the account is Phoenix-only | Not recommended |
| **D. Keep as is** | Free | None | None | The URL is visible only in network calls and the OAuth redirect; members rarely see it |

### Recommendation: A, a custom domain (with D as the fallback if there is no domain yet)

It keeps the data, secrets and cron where they are, gives a Phoenix-branded host, lets the old host answer during the cutover so
nothing breaks mid-move, and rollback is "point the strings back". B is a migration project for a cosmetic gain. Until a domain is
bought, D costs nothing and nothing is broken, so do not block launch on this.

## Procedure for option A

Assume the new host is `https://api.example-phoenix.com` (replace everywhere).

### 1. Cloudflare (owner)
1. Add the domain to the same Cloudflare account (Registrar purchase, or add the zone and change nameservers). Wait for it to be Active.
2. Workers & Pages, `phoenix-bot`, Settings, Domains & Routes, **Add, Custom domain**, enter `api.example-phoenix.com`. Cloudflare
   creates the DNS record and certificate. Leave the `workers.dev` route enabled for now.
3. Check `https://api.example-phoenix.com/` returns the same 200 body as the old host.

### 2. Discord Developer Portal (owner), one app at a time
For each app, Settings:

| App | Application ID | General Information, Interactions Endpoint URL | OAuth2, Redirects |
|---|---|---|---|
| core "Phoenix Fire" | 1569450321057550537 | `https://api.example-phoenix.com/interactions/core` | add `https://api.example-phoenix.com/auth/callback` (keep the old one until step 6) |
| stats "Phoenix Stats" | 1569608077748080720 | `https://api.example-phoenix.com/interactions/stats` | none needed |
| tools "Phoenix Toolbot" | 1569608448507650048 | `https://api.example-phoenix.com/interactions/tools` | none needed |
| fun "Phoenix Fun" | 1569608868533637121 | `https://api.example-phoenix.com/interactions/fun` | none needed |
| Matchday (B3, not created yet) | n/a | `https://api.example-phoenix.com/interactions/matchday` | none needed |
| Rush (B3, not created yet) | n/a | `https://api.example-phoenix.com/interactions/rush` | none needed |

Discord verifies an endpoint by sending a signed PING when you save; it only saves if the Worker answers correctly, so a typo is
caught at once. Matchday and Rush are created straight onto the new host, so they never need a second edit.
Only the core app uses OAuth (website login), so only core needs a redirect.

### 3. Repo (separate commit, after the bot lane lands; `wrangler.toml` is theirs)
Change the same string in: `config.json` `members.api`, `phoenix/live.json` `api`, `bot/wrangler.toml` `PUBLIC_URL`, then the docs
(`bot/SECRETS-REGISTRY.md`, `CLAUDE.md`, status lines in `PLANNING/`). Optionally add the route in `wrangler.toml`:
```toml
[[routes]]
pattern = "api.example-phoenix.com"
custom_domain = true
```
Then `node tests/run.mjs`, push, and let `bot.yml` deploy and the site update rebuild.

### 4. Verify
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.example-phoenix.com/
curl -s https://api.example-phoenix.com/api/live
curl -si -H "Origin: https://devroadtosucces15-boop.github.io" https://api.example-phoenix.com/api/rush | grep -i access-control
```
Expect 200, valid JSON, and `access-control-allow-origin` equal to the site origin. Then in the browser:
- the live site loads data (network tab shows only the new host);
- Sign in with Discord completes and lands back signed in;
- `/ping` or any slash command from each app answers in Discord;
- a Card Studio card image loads (it uses `PUBLIC_URL`).
Check the Worker logs for 401/signature errors.

### 5. Observe for a few days
Keep `workers.dev` on. Any request still reaching the old host (Worker logs, per host) is a stale cache, an old PWA install, or a
missed string.

### 6. Retire the old host
Remove the old OAuth redirect in the core app, then (optional) disable the `workers.dev` route in Domains & Routes. Update
`LIVE-CHECK.md`. Disabling is the point of no return only for stale clients; it is itself reversible.

## Site host (related, not part of B1)
CORS follows `SITE_URL`. If the site later moves from `devroadtosucces15-boop.github.io` to a custom domain, change `SITE_URL`
(`wrangler.toml`) and `config.json` `siteUrl` together, add the new site origin to the OAuth return handling, and redeploy the Worker
first; otherwise every member API call fails CORS. That is a separate change with its own plan.

## Rollback
- Before step 6: revert the Discord endpoint fields to the old URL (the old host still answers); revert the repo commit; redeploy. No data moved, so nothing to restore.
- After step 6: re-enable the `workers.dev` route in Cloudflare (one click), restore the endpoint and redirect in the portal, revert the repo commit.
- Option B only: the old account was never switched off, so the same steps apply; the new account's data is discarded.

## Handover
`bot/wrangler.toml` and `bot/SECRETS-REGISTRY.md` belong to the bot lane. Do step 3 only after that lane has landed, or message it.
