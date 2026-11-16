# PF-026: visual, navigable roadmap (owner request 2026-11-16)

Last verified: 2026-11-16

Owner words: "a live working artifact that shows a dynamic navigable roadmap that has details for each phase and step, outcomes, behavior, status etc."
Model: opus (claude-opus-5-5). Start only when the 5-hour usage window is below 80% (this was written while it was at 83%, 1h13m before reset).

## Goal
One page, built by a script from `LIBRARY/roadmap.json`, that shows where the project is and lets the owner drill into any phase and step. It runs in two places from the same renderer: the local live dashboard (`tools/brain/serve.mjs`, auto-refresh, Roadmap tab) and a private claude.ai Artifact snapshot republished at the end of each session (`tools/brain/publish.mjs`). The hosted copy only changes when a session republishes it and says so with its build time.

## What the page shows
- Overall progress and per-phase progress (size-weighted percent from `roadmap.json`), counts by status, "next up", "waiting on the owner" (BLOCKED and PAUSED), and the current usage snapshot (`LIBRARY/state/usage.json`).
- Three views of the same data: **Timeline** (phases as lanes, steps as nodes coloured by status, ordered by dependency and done date), **Board** (columns by status), **Graph** (dependency lines between steps, critical path highlighted).
- A detail drawer for any step: what it is, **outcome** (what the owner can now do or see), **behavior** (how it works or what it does), status and percent, size, effort, importance, estimated minutes, model, depends on and unlocks (clickable), file lane, notes and why paused, the done log with PR and commit links, and the library or planning pages it touched.
- Filters (status, phase, model), search, and deep links by hash (`#phase-<slug>`, `#PF-018`) so a step can be shared or bookmarked. Light and dark themes, phone width, keyboard focus, reduced motion.

## Data work (single source stays `roadmap.json`)
- Add optional `outcome` and `behavior` strings to each item. Fill them for every DONE item from its done log, notes and PR, and for open items from the plan text. Extend the schema check in `tests/library.test.mjs` (length limits, no secret-shaped strings) and `tools/library/sync.mjs` (show them in the generated `LIBRARY/ROADMAP.md`).
- Never put secret values, account ids or prompts in the page or the data.

## Build and publish
1. New renderer module shared by `tools/brain/serve.mjs` and a new `tools/brain/roadmap-page.mjs` that emits one self-contained HTML file (inline CSS and JS, data embedded). Reuse the brain page's design tokens and the owner's Discord gallery look (Phoenix ink `#0a0705`, accent `#e8651a`); design with the artifact-design skill's rules and one ArtifactCheck preview.
2. Publish as a PRIVATE Artifact named "Phoenix Roadmap" with the Artifact tool (load `artifact-design` and `artifact-capabilities` first; no runtime capability is required). Never read the artifact back. Record the link in this item's done log and in `LIBRARY/README.md`.
3. Add the republish step to `PLANNING/SESSION-HANDOFF.md` section 7 next to the brain snapshot step (one line), so each finished item updates the page.
4. Tests: renderer output has no `NOREX`, no secret-shaped strings, every step id appears, hash links resolve; `node tests/library.test.mjs` and `node tests/run.mjs` green (design test unsandboxed).

## Rules for this session
- Design work: ask for or look at the owner's screenshots first; take before and after shots at 390, 820 and 1440 only for the final page. Script and text checks otherwise.
- Claim `tools/brain/` and `LIBRARY/roadmap.json` rows you edit in `LIBRARY/CLAIMS.md`; other sessions also edit `roadmap.json`, so rebase on `origin/main` before the PR and touch only your own fields.
- Merge to main after green checks, mark PF-026 DONE, write the next prompt for the next open item that needs no owner decision.
