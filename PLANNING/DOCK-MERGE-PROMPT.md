# Prompt for a new session: merge the dock into one badge, role slicer, quick dial

Paste everything below the line into a new Claude Code session in /home/mrsuccess/Phoenix-Fire. Read `CLAUDE.md` first (Phoenix branding rules, a test for every rebrand). Work autonomously; the owner is not technical, explain results plainly.

---

## Where things stand (2026-11-12, nothing of this is committed yet)

The dock is `next/static/dock.js` + `dock.css`, wired on every page by `next/lib/ui.mjs`. Today it has **three round badges**:
- **Ring** (everyone): crest on ember with a scroll-progress ring and a 🧭 chip. Opens the BIG menu (centered glass window, `dk-nav dk-big`): pinned items, the colour-coded **room map** (tiles fed by `window.PF_ROOMS`, built in `next/pages/hub.mjs` as `RING_ROOMS` + `LK_BUTTONS`), the six locker pages as small cards (`mini()`), "On this page" chips, Top/End buttons. On main pages it lists the site menus instead.
- **Staff** (manager + owner): crest on dark gold, cap chip, waiting-count bubble. Opens an anchored panel of staff tools (gold mini cards); the owner also gets the owner groups, approvals, "Preview as" and "Edit this page".
- **Issue** (`.nxr-fab`, built by `web/report.js`, restyled only in `dock.css`): crimson, 🐞 chip.
All three drag anywhere in the free screen area (below `header.bar`/`.sub`, above `.tabbar`), position saved in `localStorage` `phoenix.fabs` as fractions, Shift+arrows move a focused badge, a drag never counts as a click. Pins are saved on the account (`/api/me/prefs` `pins`, `spins`). Lenis + GSAP already run the smooth scroll (`next/static/smooth.js`, `window.NorexLenis`). Tests: `tests/dock.test.mjs`, `layout-pass`, `next`, `next-quality` (script budget was raised to 320 KB).

## What the owner now wants (build it)

### 1. Remove the Issue badge; the issue tool becomes a menu option
- Delete the floating `.nxr-fab` from the screen (hide it with CSS; do **not** edit `web/report.js`, call its button's `click()` from the menu so the tool keeps working).
- Add **"Report an issue"** as a card in the Manager view (see 2). The owner asked for it inside the staff navigation. Today members can also report issues; tell the owner that removing the badge removes that for members, and suggest (but default to NOT building) a small "Report a problem" card in the Member view.

### 2. Merge Ring and Staff into ONE badge with a role slicer
- One badge, one design: the **gold** one. Today the ring badge has a progress ring AND a border, so it looks bigger than the Staff one. Keep a single gold ring only (the scroll progress can be the same ring, not a second one). Same size as before (60px), same drag behaviour, same saved position (one key).
- The big menu gets a **slicer at the top**: pills side by side, **Member** highlighted and active by default, then **Manager**, then **Admin/Owner**.
  - Members: no slicer at all, and no way to reach manager or owner tools. Managers: Member + Manager. Owner: all three. The Manager and Owner views must not even be rendered for roles that may not see them (check `role()`, `isStaff()`, `isOwner()` in dock.js; server stays the real gate).
  - Guests: they see no slicer. (The owner said guests "will not see that navigation option": read this as the slicer. Keep the badge and site menus for guests unless the owner says otherwise, and ask once in your first message if it is unclear.)
  - Member view = what the ring menu shows now. Manager view = the staff tools (Match night, People, Club content, Moderation and tools, Club health) as gold mini cards, plus "Report an issue", the approvals/waiting count. Admin/Owner view = Artwork + Owner controls, "Preview as", "Edit this page".
  - Remember the last chosen view per browser (`phoenix.dockview`); a role that loses access falls back to Member.
  - Use the same glass window, card language and no-scrollbar rule as now. The staff panel (`dk-staff`) disappears; its content lives in the big menu.
- Remove `.dk-pill` / `.dk-staff` code paths, update `tests/dock.test.mjs` (keep tests for: role gating, owner-only groups, pins saved to account, no NOREX, drag rules, clean Locker landing).

### 3. Quick dial (long-press), propose first, then build the safe version
Idea: press and hold the badge, haptic feel (small bounce, `navigator.vibrate(10)` where available), and a **wheel of quick actions** appears on top of the content from the nearest screen edge, no background, just the items on a circular arc. Moving the finger up and down spins the wheel; items that reach the top or bottom of the arc fold in (scale and fade) and reappear from the other end (endless wheel). Releasing snaps to the nearest item and opens it. It is for a few quick jumps (pinned items, then top rooms; managers see staff shortcuts in Manager view), NOT the whole menu.

**Conflict to solve:** dragging the badge is also a press-and-move. My recommendation (the owner asked for a judgment): decide by time and motion, like iOS:
- quick tap = open the menu;
- press and **move within ~350 ms** = drag the badge (current behaviour);
- press and **hold still ~350 ms** = haptic + dial opens; from then the finger drives the wheel, drag is off;
- slide far away from the arc (or press Esc / second finger) = cancel, nothing opens.
Write this proposal into a short section at the top of your first message, then build it unless the owner objects. Rules: pointer-only enhancement (keyboard and screen-reader users keep the menu); `prefers-reduced-motion` = a plain vertical list instead of the spin; use GSAP (`vendor-gsap.min.js`) for the spin and fold, Lenis must not scroll the page during the dial; arc must stay inside the free area (not under the header/sub bar or the tab bar); items come from the same sources as the menu (pins first), so nothing is hardcoded.

## Rules and checks
- Phoenix only: no NOREX name, crest or colours; brand colours from CSS variables; add or extend a test for each rule above.
- After **any** `node tests/run.mjs` run, rebuild before browsing: `node phoenix/build.mjs --out site` (tests overwrite `site/` with the old classic NOREX build; that is how the owner once landed on the old design).
- Preview: `preview_start` `phoenix-site` (served from `site/`). Check desktop 1440 and phone 390: badge drag, slicer per role (use `phoenix.as` / `NorexAs` to switch guest, member, owner; manager if the mock allows), big menu in each view, no sideways scroll, no overlap with the tab bar, dial on a touch-emulated phone.
- Do not run the full pre-commit background check yet (`PLANNING/PRE-COMMIT-CHECK.md`); it is for the final commit. Do not commit or push unless the owner says so. Unrelated uncommitted bot files (`bot/banners.js`, `bot/ui.js`, `scripts/cards.mjs`, `tools/bot-audit/out/*`) are not part of this work; leave them alone.
- Still open elsewhere (not this task): deep-link helper R04-R06, staff form-control restyle, staff sweep on live data (`.site-context/spec/REFACTOR.md`, `STAFF-SWEEP.md`).
