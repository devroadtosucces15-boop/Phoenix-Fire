# Prompt: remaining site items (R20, R21 check, R22, R18/R19/R23, deep-link leftovers)

Paste everything below the line into a new session in /home/mrsuccess/Phoenix-Fire.

---

Read `CLAUDE.md` first (Phoenix branding, a test for every change), then `.site-context/spec/REFACTOR.md` and `.site-context/spec/LAYOUT.md` (sections 4, 9, 10). R01-R17 are built; R04, R05 and R06 were finished and tested on 2026-11-12 (`next/static/deeplink.js`, `tests/deeplink.test.mjs`, `tests/redirects.test.mjs`). Do NOT commit or push; the owner reviews first. Leave the uncommitted dock work (`next/static/dock.js`, `dock.css`, `next/pages/hub.mjs`, `locker.css`, dock tests) and bot files (`bot/banners.js`, `bot/ui.js`, `scripts/cards.mjs`, `tools/bot-audit/out/*`) alone unless a change here needs them. `PLANNING/DOCK-MERGE-PROMPT.md` is a different task.

Rules: layout and behaviour only, no colour or copy change unless an item says the owner approved it; ids and `data-*` hooks are never renamed; Phoenix names only in new code. After ANY `node tests/run.mjs` run, rebuild before browsing: `node phoenix/build.mjs --out site`. Preview with `preview_start` `phoenix-site`; if the Browser pane is hidden (width 0, no animation frames), use the Playwright tools instead. Do not run the full pre-commit check (`PLANNING/PRE-COMMIT-CHECK.md`).

Work in this order, each with a test, and mark each item in `REFACTOR.md` as you finish it:

1. **Deep-link leftovers (R04 follow-up).** Verify `PhoenixDeeplink` in a real browser, phone 390 and desktop 1440, direct and from `burners.html`: `hub-clubhouse.html#ch-*`, `hub-handbook.html#hb-*`, `hub-matchnight.html#mn-*`, `hub-squad.html#sq-*`. Each target must sit at `--pf-sticky-top` (within 2 px) after the page settles. Fix what fails in the helper or with `data-dl`. Also make `index.html#live` and the header live chip (`next/static/header.js` ~164) land on the nearest visible element when the live strip is hidden.
2. **R20 Staff tab hashes.** Tab buttons in `desk.js`, `tools.js`, `content.js`, `intel.js`, `schedule.js` get `data-dl` (and `data-dl-to` for the pane) so `staff-desk.html#claims` etc. open the tab and scroll. Boardroom already does it (`boardroom.js` ~462); match that. Test: every staff tab hash resolves.
3. **R21 check.** `hub-profile`, `hub-stats`, `hub-medals`, `hub-cardstudio`, `hub-alerts` now exist and `hub.html` forwards `#lk-*`. Confirm in a browser that each page shows only its own section, has no console error, and `mylocker.js` guards each mount. Mark R21 only if true; report what is left.
4. **R22 accessibility bundle (phone change, ask the owner before shipping wording).** Allow zoom (drop `maximum-scale=1` in `next/lib/ui.mjs`), fix `aria-required-children` (playbook in `tactics.mjs`, `rush.mjs`) and `aria-allowed-attr` (`music()` in `hub.mjs`), enlarge tiny tap targets with padding or min-size only (10 phone pages). Leave the `classic/index.html` link wording and colour contrast as a written question for the owner. Done when a re-audit (axe) shows those checks at 0 and the phone layout is unchanged apart from larger hit areas.
5. **R18, R19, R23.** These need owner wording or a visual-forge brief. Draft the proposed link text for R18 (Rush log to `rush.html`) and R19 (`scouting.html` and `hub-squad.html#sq-scout`) in `.site-context/spec/OPEN-WORDING.md`, do not put them in the site. For R23 write one brief per assigned wishlist item in `.site-context/handoffs/` with `Status: open`.

Done when: the affected addresses land correctly on phone and desktop, a static link crawl of `site/` shows no missing files, tests for `next`, `redirects`, `dock`, `layout`, `brand`, `leak` and `deeplink` pass, and you report plainly what passed and what was not verified.
