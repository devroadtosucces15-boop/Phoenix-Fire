# Credentials and keys (registry only)

Last verified: 2026-11-15 (names checked against `env.*` use in `bot/*.js`, `bot/wrangler.toml` and every `secrets.*` in `.github/workflows/`; whether each is actually set is not verifiable from here)

**Never write a secret value into this repo, this library, a prompt, a commit message or chat.** This file says where each credential
lives and who owns it, so a session can find it without anyone pasting it. The detailed table (app IDs, token names, where each is set in
the Worker and in GitHub) is `bot/SECRETS-REGISTRY.md`; it is the single source and `tests/docs-fresh.test.mjs` keeps it in step with the code.

| Kind | Where the value lives | Registry row | Owner action |
|---|---|---|---|
| Discord bot tokens (one per app) | Dev Portal, set in the Worker and GitHub secrets | `bot/SECRETS-REGISTRY.md`, "Discord apps" and "Secrets" | Reset in the portal, then `set-tokens.sh` |
| Discord application IDs and public keys | Public; `bot/wrangler.toml` | same | none |
| DJ bridge key `MUSIC_SHARED_KEY` | Worker secret and the PC's `dj/.env` (same value, never in git) | `bot/SECRETS-REGISTRY.md` | Owner sets both; see `dj/DEPLOY.md`, "Website link" |
| Stream overlay keys `STREAM_OVERLAY_KEY`, `TWITCH_EVENTSUB_SECRET` | Worker secrets; the overlay feed key is also typed into the Overlay Studio (it ends up in the OBS link, so treat the link as private) | `bot/SECRETS-REGISTRY.md` | Owner sets; only needed for follows, see `LIBRARY/STREAM-OVERLAY.md` |
| VAPID, dispatch and analytics secrets | Worker secrets | same | Rotate by the owner |
| GitHub access | `gh` login on the owner's machine (`gh auth setup-git` makes plain `git push` work) | memory note `git-push-gh-credential` | Re-login if expired |
| Cloudflare account ID and deploy token | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` as GitHub secrets; deploys and backups run from GitHub (`bot.yml`, `backup.yml`) | `bot/SECRETS-REGISTRY.md`, "Secrets" | Owner only |
| Cloudflare analytics token | `CLOUDFLARE_ANALYTICS_TOKEN` in Worker and GitHub | same | Owner |
| Discord client secret (website login) | `DISCORD_CLIENT_SECRET` in Worker; GitHub for `update.yml`, `ea-relay.yml` and `gif-convert.yml` | same | Reset in the portal |
| GitHub dispatch token (Worker starts workflows: site update, EA relay, GIF converter) | `GH_DISPATCH_TOKEN` in Worker; repo name in `bot/wrangler.toml` `GITHUB_REPO` | same | Actions read and write on this repo only; rotate in GitHub settings |
| Discord webhook for site posts | `DISCORD_WEBHOOK`, GitHub secret read by `update.yml` | same (row added in PF-002; set status not verified) | Owner |
| Twitch app keys (optional) | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`; without them the bot reads public channel pages | same (optional, status not verified) | Owner |
| Board OCR reader (optional) | `BOARD_OCR_URL`, `BOARD_OCR_KEY`; dark until both are set (`tools/board-ocr`) | same (optional, not set) | Owner |
| Rush report salt (optional) | `RUSH_REPORT_SALT`; falls back to the public key when unset | same (optional) | Owner |
| Bootstrap owner IDs | `ADMIN_IDS`, a plain var in `bot/wrangler.toml` (Discord user IDs, not secret) | `bot/wrangler.toml` | Owner |

Rules for sessions:
- Read secrets from the environment or the platform that holds them; do not print them, log them, or copy them into files.
- Never type a password into a login. Ask the owner to enter it.
- A new secret gets a row in `bot/SECRETS-REGISTRY.md` (name, purpose, where set, date), not a value.
- `tests/library.test.mjs` fails if a token-shaped string appears anywhere in `LIBRARY/`.
