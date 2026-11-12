# Full background check before the big commit (owner request, 2026-11-12)

Run this once, when the site and bot work is ready to commit for good. Not before. Nothing here is a reason to stop earlier commits.

## Why
On 2026-11-12 the owner clicked the PHOENIX FIRE logo in the Locker and landed on the very first NOREX design (old layout, NOREX crest, Phoenix name).
Cause: `site/` held the **classic build** that `node tests/run.mjs` writes (it overwrites `site/`), and `index.html` in that build is the old design.
`site/` is git-ignored, so it cannot be committed, but the same class of leak can come from other places. Look for it on purpose.

## Checklist
1. Rebuild the real site last: `node phoenix/build.mjs --out site` (never trust `site/` after a test run). Confirm `site/hub.html` exists.
2. Click-through of the built site in a browser: logo, every header and sub-menu link, every dock and ring menu link, every Staff link. Nothing may open a page with the NOREX crest, red `#c8352c`, blue-black `#080b11` or the NOREX name.
3. `git grep -il norex` and compare with the known leftovers in `CLAUDE.md` (Worker host, dual-read identifiers, `window.Norex*`). Anything else is a leak.
4. `phoenix/leakcheck.mjs` passes on the fresh build; `tests/brand.test.mjs`, `tests/phoenix-brand.test.mjs`, `tests/leakcheck.test.mjs` green.
5. Every link in built html resolves to a built page (no link to a file only the classic build has: `members.html`, old `squad.html`, `index.html` from `web/`).
6. Crest check: every `crest*.png`, icon, manifest and share image in `site/` is the Phoenix crest (hash against `phoenix/overlay/`).
7. `git status`: only intended files; no `site/`, `.build/`, `.playwright-mcp/`, shots or personal dotfiles.
8. Bot side: `node tests/run.mjs` all green, `bot-studio` check (`/bot-check`) clean, no NOREX text in any output.
