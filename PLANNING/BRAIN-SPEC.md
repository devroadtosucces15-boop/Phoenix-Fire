# Project brain: spec (roadmap items PF-011 to PF-017)

Last verified: 2026-11-15

A living, always-open dashboard for the whole project, built by a script from the `LIBRARY/` files and the session data, so it costs almost no
model usage. Visual target: the Discord gallery the owner supplied (Phoenix ink and orange, sticky filter bar, drill-in rows) plus the layout
ideas of the Phoenix Control Center (tabs, grouped tiles). Rules for sessions: `PLANNING/SESSION-HANDOFF.md`.

## What it shows

| Tab | Contents | Built from |
|---|---|---|
| Roadmap (home) | Master roadmap board: status, size, items per area, workload, effort, model, importance, estimated run time, dependencies, notes on paused items, done log, percent complete per item, per phase and overall | `LIBRARY/roadmap.json` (PF-011) |
| Libraries | Assets, resources, design choices, bot, site map as browsable cards | `LIBRARY/*.md` |
| Maps | Site map and bot map you can drill into: page, what builds it, what it reads, what it posts | `LIBRARY/SITEMAP.md`, `tools/bot-studio/lib/deps.mjs` |
| Inputs and outputs | One folder per feature: what goes in (config, tables, secret names, APIs) and what comes out (messages, pages, images) | dependency map plus the library |
| References | Saved links and resources | `PLANNING/RESOURCES.md` |
| Credentials | Names, where each lives, whether it is set, last checked. **No values, ever** | `bot/SECRETS-REGISTRY.md` |
| Brainstorm | Type a thought or dictate one; at the end of each session each idea gets a reminder to tackle it or drop it | `LIBRARY/inbox/` |
| Usage | Current 5-hour and weekly percent, save-mode banner, per-item consumption, lessons and improvement plans | usage snapshots (PF-015, PF-016) |

## Decisions and limits (honest)

- **Live window: yes.** A small local server (`node tools/brain/serve.mjs`, no dependencies) serves the page and pushes updates when the generator
  runs, so one browser window opened in app mode stays current. Private to this computer.
- **Hosted artifact: optional mirror (PF-017).** A claude.ai artifact can be reached from the phone, but it only updates when a session publishes it, so it is
  a snapshot, not the live window. Phone brainstorm notes would use the artifact's shared storage and be pulled in at the end of a session.
- **Voice notes.** In the page the microphone button uses the browser's dictation to turn speech into text; the text is stored with the note. A saved audio
  file and offline transcription are a later option (nothing installed for that today).
- **Credentials: names and places only.** The page links to where each secret lives (portal, GitHub secrets, Worker secrets) and shows set or not set. It
  never stores or displays a value: a dashboard that held tokens would put them in plain text in the repo and in every session's context.
- **Usage reading.** Inside a session the app's usage tool returns the 5-hour and weekly percent and reset times (read 2026-11-15: 5-hour 13%, weekly 2%, Pro
  plan). A standalone script cannot call that tool, so PF-015 first tests whether the status line or another local source exposes the same numbers; if not, a
  session writes a snapshot to `LIBRARY/state/usage.json` at its start, after each item and at its end, and the page shows the latest snapshot with its age.
- **Save mode.** A running session cannot be switched from outside. The rule instead: when a snapshot shows 5-hour usage at or above a set threshold (start:
  80%) or weekly at or above 85%, a session stops starting large items and takes only roadmap items flagged `lowHanging` (size S, no open dependencies,
  not an owner step), and the page shows the switch and notifies the owner (browser notification). Thresholds live in `LIBRARY/state/usage-policy.json`.
- **Usage intelligence.** Per session and per roadmap item: turns, tokens, duration, share of context, tool mix, percent of the window consumed (from
  snapshots). Rules flag likely causes (very long session, large screenshots, repeated failing commands, big file reads) and write short lessons to
  `LIBRARY/LESSONS.md`; the page lists them as improvement plans. The analysis script runs without a model; a session adds the "why" only when asked.

## Roadmap data model (PF-011)

`LIBRARY/roadmap.json` is the source; `LIBRARY/ROADMAP.md` is generated from it (the test keeps them in step). Each item: `id`, `title`, `phase`, `area`,
`status` (NEXT, OPEN, BLOCKED, PAUSED, DONE), `size` (S, M, L), `effort` (1 to 5), `importance` (1 to 5), `estMinutes`, `model`, `dependsOn`, `fileLane`,
`lowHanging`, `percent` (0 to 100), `notes` (why paused or unfinished), `doneLog` (date, commit, what changed), `plans` (merged-in small plans).
Phase and project percent are computed from item percents weighted by size. Other plans merge into items; none stay separate.

## Build order

| Item | What | Model | Depends |
|---|---|---|---|
| PF-011 | Roadmap data model, metrics and generated markdown | sonnet | PF-002 |
| PF-012 | Dashboard v1: server, live refresh, tabs, Roadmap home, Libraries, References, Credentials registry | opus | PF-011 |
| PF-013 | Maps with drill-in, and the inputs and outputs folders | opus | PF-012 |
| PF-014 | Brainstorm inbox: typed and dictated notes, end-of-session reminders | sonnet | PF-012 |
| PF-015 | Usage probe, snapshots, policy, banner, notification, save mode | sonnet | PF-011 |
| PF-016 | Usage intelligence and lessons | opus | PF-015 |
| PF-017 | Optional hosted artifact mirror for the phone | sonnet | PF-012, PF-014 |

Each is its own session, built from the gallery template where the owner's design is the target. Design steps use screenshots (before and after at 390, 820, 1440).
