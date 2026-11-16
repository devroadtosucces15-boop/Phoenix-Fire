# Phoenix DJ – run it on the PC

Phoenix DJ is the PHOENIX FIRE music bot: **Phoenix DJ** (the controller, registers `/play` and the other commands) plus
**Phoenix DJ 1–5** (helpers, one per extra voice room), so up to 6 rooms play at once. It needs a long-running computer
because it sits in voice channels, so it does not run on the Worker. The apps talk to Discord over the gateway: **leave the
Interactions Endpoint URL empty** on all six DJ apps (setting one would stop `/play` from working).

## Discord apps (done 2026-11-10)
| App | ID |
|---|---|
| Phoenix DJ | 1569676079134810164 |
| Phoenix DJ 1 | 1569687929624858735 |
| Phoenix DJ 2 | 1569696022622634104 |
| Phoenix DJ 3 | 1569696921134833784 |
| Phoenix DJ 4 | 1569699245584424970 |
| Phoenix DJ 5 | 1569699811546890240 |

Invite each with its install link (`https://discord.com/oauth2/authorize?client_id=<ID>`). The controller asks for View
Channels, Send Messages, Embed Links, Attach Files, Read Message History, Use External Emojis, Connect and Speak; helpers only
View Channels, Connect and Speak. Pop-up rooms (`/room`) also need **Manage Channels** on the controller (give it in the server).

## On the PC (one time)
The PC already runs the home audio engine (Lavalink, `norex-lavalink.service`, 127.0.0.1:2333). Phoenix DJ uses the same
engine; one engine serves both bots, nothing to install for it.

```bash
cd ~/Phoenix-Fire/dj
cp .env.example .env && chmod 600 .env
./add-token.sh main        # Phoenix DJ token (Portal > Phoenix DJ > Bot > Reset Token); hidden prompt
./add-token.sh helper      # run five times: Phoenix DJ 1, 2, 3, 4, 5
./pc-install.sh            # installs phoenix-dj.service, starts it, shows the log
```
Expect `Phoenix DJ ready: 6 room(s)` in the log.

Everyday: `systemctl --user status phoenix-dj` · `journalctl --user -u phoenix-dj -f` · after `git pull`:
`systemctl --user restart phoenix-dj`. It starts at login and restarts by itself if it stops.

## Notes
- `/play` joins the voice channel you are in. Managers (Manage Server, or `MANAGER_ROLE_IDS`) can force-skip and control any room.
- YouTube breaks every few months; the home engine's self-repair (`norex-heal.timer`) updates its plugin. SoundCloud is tried first.
- Spotify links use the engine's Spotify keys if it has them.
- Running on a server instead: `docker compose up -d --build` with `LAVALINK_HOST=lavalink:2333` and a `LAVALINK_PASSWORD` in `.env`
  (the compose file starts its own Lavalink; `maintain.sh` keeps its YouTube plugin current).
- Brand (names, colours, crest) lives in `src/brand.js`, read from `../config.json`; `tests/dj.test.mjs` fails if another club's name, colour or crest shows up.

## Website link: the DJ bridge (PF-022)
The PC is behind NAT, so the Worker never calls it. The DJ app **pushes** a snapshot of every live room to the Worker
(`POST /api/music/bridge/push`, on every change and every 20 s) and **polls** a command queue every 2 s
(`GET /api/music/bridge/commands`, then `POST .../ack`) over the shared key header `X-Phoenix-Key`. The Music page and the
Control Center use those routes; with the DJ off the page shows its SAMPLE rooms. Commands run at most once.
1. Pick a long random key (at least 16 characters). Never put it in git or in chat.
2. On the PC: `./set-secret.sh MUSIC_SHARED_KEY` (hidden prompt, writes `.env`). `WORKER_URL` is optional: it defaults to
   `members.api` in `config.json`, so a Worker host move needs no change here.
3. In the Worker (owner step): `wrangler secret put MUSIC_SHARED_KEY` with the same value, and apply migration
   `bot/migrations/0068_music_bridge.sql`, then deploy the Worker.
4. Restart the DJ (`sudo systemctl restart phoenix-dj`): the log says `bridge: connected to the Worker`. Without the key it
   says `site bridge off`.
5. Turn on the `music` feature flag (Boardroom) for the audience you want.
