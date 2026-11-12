# Continue: Phoenix Fire hub and dock work (paste this into a new session)

Repo: /home/mrsuccess/Phoenix-Fire (branch main, nothing committed yet). Read CLAUDE.md first (Phoenix branding rules, tests per rebrand).

## State right now (all uncommitted, built into `site/` with `node phoenix/build.mjs --out site`)
Done and tested (tests green: next, brand, leak, phoenix, locker, hub, cardstudio, redirects, smooth-lock, identifiers, layout-pass 20/20, dock 7/7):
- Locker split into `hub.html` + `hub-profile/stats/medals/cardstudio/alerts.html` (next/pages/hub.mjs, next/static/locker.css, pages.js), button grid under the card, old `#lk-*` links forward.
- Staff hub `staff.html` (grouped tiles, owner-only tier) and one-tab Boardroom pages `staff-switches/health/announce/audit/halloffame/medals/backup/organization.html` (staffhub.js/css).
- Shared `next/static/layout.css`; search-bar freeze fix in `next/static/smooth.js` + `tests/smooth-lock.test.mjs`.
- Header and Card Studio links re-pointed to `hub-alerts.html` / `hub-cardstudio.html`.
- NEW, just written, built, test passes, but NOT yet checked in a browser:
  - `next/static/dock.js` + `dock.css`, wired in `next/lib/ui.mjs`: Phoenix crest ring with scroll progress (hub pages list hub rooms only; main pages list site menus and submenus only; "On this page" jumps; never lists Staff), plus a dark Staff pill (managers: staff tools; owner: plus owner groups, approvals count, Preview as, Edit this page). Both have pin stars. Hides old compass `.nv-fab`, owner stamp `.ofab`, gear `.gr-fab`, and the preview toolbar `.devbar/.devgear` via `html.pf-dock`. The issue pill (`.nxr-fab`) stays.
  - Account-saved pins: `bot/members.js` `POST /api/me/prefs` now accepts `pins` and `spins` (plus `motion`), `GET /api/me` returns `prefs.pins/spins`; `cleanPins` exported. `tests/dock.test.mjs`.

## Do next, in this order, fast
1. Browser check of the dock (Playwright, http://localhost:4323 via preview `phoenix-site`; set viewport 1440x900 and 390x844): ring and Staff pill visible, panel opens, hub page shows hub rooms only, `stats.html` shows site menus only, pinning persists after reload, no page errors, pills do not overlap the tab bar or the issue pill on phone. Fix any overlap/layout.
2. The user also asked: card must be the first thing in the hub locker side items; on phone the card comes right after the banner. The black "Preview as" toolbar at bottom-left is replaced by the dock (verify it is gone). Check `hub.html` desktop/phone screenshots.
3. Per-page sweep of every hub page (hub, hub-profile, hub-stats, hub-medals, hub-cardstudio, hub-alerts, hub-clubhouse, hub-squad, hub-matchnight, hub-discoveries, hub-handbook, hub-music, hub-watchlist, staff) at 390, 820, 1440: no sideways overflow (already clean), tidy alignment, and click every link/button without errors. Static link check found only `tactics.html#roles` (JS-filled id) to verify. Note: some profile clicks trigger a `beforeunload` dialog in Playwright; neutralize it with `context.addInitScript` overriding `beforeunload` before crawling.
4. Re-run `node tests/run.mjs next brand leak phoenix locker hub staff redirects smooth identifiers layout dock cardstudio members` (tests overwrite `site/`, so rebuild after: `node phoenix/build.mjs --out site`).
5. The user said to merge to main: commit everything relevant on main (end the message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`), no force push, leave junk untracked files (`.bashrc`, `.gitconfig`, `.idea`, shots, etc.) out of the commit. Push only if the user asks.

## Still open later (not urgent)
Deep-link helper and stale anchors (R04/R05), `members.html#…` forwarder (R06), optional additions R18-R22, staff sweep follow-ups R24-R29, search palette still uses NOREX-style blue-black, gold gradient in staffhub.css is hardcoded (should come from config).
