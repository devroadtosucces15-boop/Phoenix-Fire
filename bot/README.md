# Phoenix bot – Discord apps on one Worker

The `phoenix-bot` Cloudflare Worker serves several Discord applications over HTTP interactions (no Gateway).
Each app has its own name, avatar, public key and bot token, and owns a slice of the slash commands.
The map lives in `bot/commanddefs.js` (`APP_COMMANDS`); routing helpers are in `bot/apps.js`.

| App key | What it does | Interactions Endpoint URL |
|---|---|---|
| `core`  | Member login (OAuth), role sync, result + notification posts, AutoMod, every cron/background post | `<PUBLIC_URL>/interactions/core` (or the old `<PUBLIC_URL>/`) |
| `stats` | Club and player records | `<PUBLIC_URL>/interactions/stats` |
| `tools` | Management and member tools (setup, purge, announce, trial, host, tags, remind, events…) | `<PUBLIC_URL>/interactions/tools` |
| `fun`   | Engagement (jail, wheel, trivia, share, awards, points…) | `<PUBLIC_URL>/interactions/fun` |

Music/DJ bots are out of scope (they need voice hosting outside the Worker).

## How it routes

- Every request to `/interactions/<app>` is checked against that app's own public key. `/` (and any path outside `/interactions/`) is the core app, so the original single-app setup keeps working.
- A non-core app counts as **configured** once its app ID and public key are set. Until then its endpoint answers 404 and **core answers and registers its commands**. You can split one app at a time.
- Slash commands and autocomplete are answered only by the app that serves them. Anything else gets a private "use it from Phoenix Stats" note, which covers stale registrations.
- Buttons, menus and modals (`norex:*` custom IDs) are not filtered. They arrive on whichever app posted the message, and every app runs the same handlers. Cron posts come from core, so their buttons come back to core.
- Handlers see the receiving app's `DISCORD_APP_ID` / `DISCORD_BOT_TOKEN`. That means follow-ups, DMs and channel posts during an interaction come from the app that was used.
- Access per command is unchanged. There are three gates: Discord visibility (`default_member_permissions`, forced on for `STAFF_COMMANDS`), the owner's per-command settings (Boardroom → Bot), and `can()` + feature flags in the handler.

## Names

Replace `<APP>` with `CORE`, `STATS`, `TOOLS` or `FUN`.

| Name | Kind | Where it lives |
|---|---|---|
| `DISCORD_APP_ID_<APP>` | public | `bot/wrangler.toml` `[vars]` |
| `DISCORD_PUBLIC_KEY_<APP>` | public | `bot/wrangler.toml` `[vars]` |
| `DISCORD_BOT_TOKEN_<APP>` | **secret** | GitHub Actions secret → uploaded to the Worker by `bot.yml` |
| `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY` | public | `bot/wrangler.toml` — the core app (fallback when `_CORE` is unset) |
| `DISCORD_BOT_TOKEN` | **secret** | the core app's token (fallback when `_CORE` is unset) |
| `DISCORD_CLIENT_SECRET` | **secret** | core only, used for website login (OAuth) and the settings key `register.mjs` uses |

Other Worker secrets are unchanged: `GH_DISPATCH_TOKEN`, `VAPID_PRIVATE_KEY`, `CLOUDFLARE_ANALYTICS_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
Never commit a token or client secret.

## Adding an app (e.g. stats)

1. In the Discord Developer Portal, create the application, add a bot, and invite it to the server with the `applications.commands` + `bot` scopes.
2. Set its **Interactions Endpoint URL** to `<PUBLIC_URL>/interactions/stats`. Discord pings the endpoint when you save, so do this after step 3 is deployed.
3. Add `DISCORD_APP_ID_STATS` and `DISCORD_PUBLIC_KEY_STATS` to `bot/wrangler.toml` `[vars]`, and the GitHub secret `DISCORD_BOT_TOKEN_STATS`. Push, and `bot.yml` deploys.
4. `bot.yml` re-registers every app: stats gets its commands and core drops them. To do it by hand, use `node bot/register.mjs stats core` or Boardroom → Bot → Sync to Discord.

## Registering commands

```
node bot/register.mjs            # every configured app with a token
node bot/register.mjs stats fun  # only those apps
```

Public IDs and keys are read from `bot/wrangler.toml`. Tokens are read from the environment.
