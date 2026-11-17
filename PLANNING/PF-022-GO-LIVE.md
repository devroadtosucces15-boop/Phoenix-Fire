# PF-022 Control Center: permissions (step 9) and the owner steps to take it live

## Permissions (step 9, 2026-11-17)
Choices made where the plan left them open (the owner could not be asked): **the owner sees everything, a manager sees the manager tools, members and guests see none of the Control Center.**
Change the choice in one place: the `level` of a tool in `next/lib/staffmanifest.mjs` (`'manager'` or `'owner'`).

| Layer | Where | What it does |
|---|---|---|
| Matrix | `next/lib/staffmanifest.mjs` (`level`, `mayUse`, `matrix()`) | Every tool has a level. 7 owner tools (Organization, Health, Announce, Hall of Fame, Medals, Backup, Boardroom), 20 manager tools, members none. `problems()` fails on a missing level. |
| Worker | `bot/ccpermissions.js`, called from `controlCenterRoute` and `route()` in `bot/members.js` | Each Control Center route and the moved settings routes (`/api/bot/settings`, `/commands`, `/routes`, `/api/org/*`, `/api/admin/flags` writes, `/api/admin/health`, `/api/music/status`) is bound to a tool: signed out 401, member or guest 403, manager 403 on an owner tool, owner everything. Each route's own check (`can(...)`) still runs after it. |
| Site | `ccshell.js` (sidebar and Ctrl+K filtered by `matrix`), `session.js` (`Auth.ccRole`) | Hides what the role may not use; no tool mounts and no request is made for a role the matrix refuses. |
| Sign-in | gate in `staff-controlcenter.html` (`#cxGate`) | Signed out: "Staff sign-in" with the Discord link (the `#tool` survives the round trip: `session.js` keeps the hash). Signed in without a staff role: "Managers and the owner only". The old `staff-*.html` addresses redirect to the Control Center and land on the same gate. |
| View as | `#cxView` strip, `phoenix.cc.viewas` | Real owners only: Owner / Manager / Member. The page shows that role's view and every request carries `X-View-As`, so the Worker answers as that role (`viewAsRole` never lets anyone climb). Real permissions never change. |

Tests: `tests/cc-permissions.test.mjs` (matrix, every route against fake sessions, the full mock Worker path including X-View-As, built-site gate and branding).
Not verified: a real Discord sign-in on the live site (only the mock session path and the mock Worker were run).

## Owner steps still needed to take the whole Control Center live (none done by code)
1. **Apply migrations** (additive), in order: `0064` (card studio kit variants, PF-020), `0065_cc_config.sql` (recruitment, match alert, streams), `0068_music_bridge.sql` (DJ bridge). 0062 and 0063 (command rows) if not yet applied.
2. **Deploy the Worker** (`phoenix-bot`): permissions matrix, Control Center routes, DJ bridge routes.
3. **Shared key**: pick a long random key (16+ characters), `wrangler secret put MUSIC_SHARED_KEY` on the Worker and `./set-secret.sh MUSIC_SHARED_KEY` in `dj/` on the PC (`dj/DEPLOY.md`). Never in git or chat.
4. **Restart the DJ on the PC** (`systemctl --user restart phoenix-dj`) and look for `bridge: connected to the Worker`.
5. **Re-register the Discord slash commands** (`/setup role group` has four ping groups, `/setup output`, `/avatarcard` shape).
6. **Run `fold-legacy` once** (Control Center › Bot settings) so old channel and ping-role homes land in the Organization config.
7. **Publish the site** (merge to `main` builds it) and turn on the `music` feature flag for the audience you want (Site access).
8. **Sign in as a real manager and as a real member once** and check the gate and the sidebar (this session could not).
9. Still open from before: PF-006 (keep or move the Worker host `phoenix-bot.norexunited.workers.dev`), PF-007 (DJ bots on separate hosting), PF-005 (match-night go-live).
