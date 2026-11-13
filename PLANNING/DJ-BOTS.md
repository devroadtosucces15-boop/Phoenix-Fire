# B5: Where the DJ (music) bots run

**Update 2026-11-13: built and running.** The DJ bots live in `dj/` (see `dj/DEPLOY.md`), run on the owner's PC as `phoenix-dj.service` with the shared Lavalink engine. Six Discord apps exist (controller + 5 helpers). B5 is no longer an open item; a VPS (below) is only an option if the PC cannot stay on. The plan below is kept for that case.

Status: plan only (2026-11-10). Owner decision: pick the host and open the account. Prices below are from memory of public
pricing and drift; confirm on each provider's page before signing up.

## Why not the Worker

A Cloudflare Worker answers short HTTP requests (Discord interactions). A music bot needs the opposite:

- a **persistent gateway connection** (WebSocket) to Discord, to join a voice channel;
- a **UDP voice connection** and a process that decodes, mixes and encodes audio continuously (ffmpeg or Lavalink);
- one process that stays alive for hours.

Workers cannot hold UDP sockets or run ffmpeg, and Durable Objects do not fix that. So the music bots live somewhere else and the
Worker stays the control plane (site, member API, roles). `bot/README.md` already lists music as out of scope for `bot/`.

## What a "DJ bot" is here

Each DJ bot is its own Discord application and token (Discord allows one voice connection per bot per server, so two DJ bots
means two rooms playing at once). A small always-on service logs each one in and plays audio in voice channels.
Slash commands (`/play`, `/queue`, `/skip`, `/stop`) are handled by that service over the gateway, not by the Worker.

**Content rule to settle first (owner):** Google and Spotify do not allow bots to stream their audio. YouTube extraction from
datacenter IPs also gets blocked and breaks often, and the big public music bots were shut down over it. Safe sources: audio files
the club owns or is licensed to use (uploaded to storage), SoundCloud, and internet radio streams. Build for those and treat YouTube
as unsupported.

## Hosts compared (small bot: 1 to 3 DJ bots, a handful of listeners)

Sizing: discord.js voice with ffmpeg needs about 1 vCPU and 512 MB per few bots; Lavalink (Java) wants about 1 GB RAM.
Outbound UDP must be allowed (all four allow it).

| Host | Monthly cost | Always-on | Limits | What the owner sets up |
|---|---|---|---|---|
| **Hetzner Cloud** small VPS (CX22 class: 2 vCPU, 4 GB, 20 TB traffic) | about 4 to 5 EUR | Yes | Paid from day one; EU or US regions; you maintain the OS | Account with ID check, create the VPS, add an SSH key. Claude can then write the Docker setup and deploy script |
| **Oracle Cloud Always Free** (ARM VM, up to 4 OCPU and 24 GB) | 0 | Yes, but idle instances can be reclaimed and signup is picky | Needs a card for verification, capacity in some regions is scarce, account can be terminated if flagged | Account with card, create an Ampere A1 instance, open no inbound ports except SSH |
| **Fly.io** (small shared machine) | about 2 to 5 USD (pay as you go, no real free tier now) | Yes | Billed per second and per volume; fine for one bot, awkward for Lavalink | Account with card, install `flyctl`, deploy a Dockerfile; secrets via `fly secrets` |
| **Home machine or Raspberry Pi 4/5** | 0 (electricity, a Pi is about 40 to 70 USD once) | Only while it is on and online | Home upload bandwidth, power cuts, dynamic IP does not matter (outbound only); the PC with the old GPU is a poor always-on choice | Install Node and ffmpeg, a systemd service or Docker, auto-restart |

Not recommended: serverless or "free tier" PaaS that sleep idle containers (Render free, Railway trial). A sleeping bot drops out of the
voice channel.

## Recommendation: Hetzner Cloud small VPS

About 5 EUR a month for a real always-on Linux box, predictable, no card-verification roulette, and enough headroom for Lavalink and
three bots. If the owner wants 0 cost and accepts the signup friction and reclaim risk, Oracle Always Free runs the same Docker setup
unchanged, so the choice can be reversed without rewriting code.

## Code and where it lives

**A separate repository, `phoenix-dj`** (not `bot/`, not in this repo's site build):

- different runtime (long-running Node process in Docker, not a Worker), different deploy path (SSH or container registry, not
  `bot.yml`/Pages), different secrets (one token per DJ app), different failure modes;
- keeps this repo's `node tests/run.mjs` and Pages deploy fast and free of ffmpeg or native dependencies;
- only fallback if the owner dislikes a second repo: a top-level `dj/` folder with its own `package.json`, excluded from the site build and from `tests/run.mjs` syntax sweep.

Proposed contents:

| Piece | Choice |
|---|---|
| Runtime | Node 22, `discord.js` v14 + `@discordjs/voice` + `ffmpeg-static` (simplest), or `lavalink` + `lavalink-client` if more than 2 to 3 bots or heavy use |
| Config | `djbots.json`: list of bots (name, app id, token env var name, home voice channel). No IDs in code, per the repo rule that channels come from config |
| Commands | `/play <url or file>`, `/queue`, `/skip`, `/stop`, `/volume`; registered by a small script per DJ app |
| Sources | Files in the club's own storage (R2 public URL or the VPS disk), SoundCloud, radio stream URLs |
| Control from the site | Optional later: the Worker stores "now playing / queue" in D1; the DJ service polls or receives a signed webhook. The site's existing `music.js` (flag `music`, owner only) is the UI hook |
| Branding | Phoenix names, ember accent `#e8651a`, crest avatars from `bot/icons/phoenix/`; embeds read name and colour from config; add a test that no NOREX name or red appears in embed output |
| Ops | Docker Compose with `restart: unless-stopped`, healthcheck, logs to the journal, one `deploy.sh` (rsync or `docker compose pull`), secrets in an `.env` that is never committed |
| Safety | Owner or role gate on `/play` via the same role IDs the Worker uses (fetched from the member API, not hard-coded); per-guild rate limit; never leave a channel playing alone for hours (auto-disconnect when empty) |

## Owner checklist

1. Decide the allowed audio sources (see content rule).
2. Create one Discord application per DJ bot (names, avatars, tokens) in the Developer Portal; voice needs no privileged intent.
3. Open the Hetzner (or chosen) account and create the VPS; give Claude the SSH host or run the deploy script.
4. Confirm monthly budget (about 5 EUR) and how many DJ bots.

## Effort

Single bot with file and radio playback: one Sonnet session. Multi-bot with Lavalink, queue persistence and a site control panel: one Opus
session plus an owner-side deploy.
