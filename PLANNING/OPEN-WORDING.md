# Wording for R18 and R19 (PF-009): APPROVED and wired 2026-11-16

The owner approved these drafts. Two lines were adjusted when wiring because the pages differ from the draft: the Rush sub line says "Scores, top scorers and form, newest first." (rush.html shows no line-ups), and the scouting links read "Track your recommendations in Squad" (scouting.html is where members recommend players, not where they are scouted) and "Recommend a player" (back link on Squad). Guarded in `tests/forwarder.test.mjs`.

## R18: Rush log to `rush.html`
`rush.html` (Rush results) is in the Matches menu but nothing on the Rush queue or Rush night pages points at it.
- Link text: "See every Rush result"
- Sub line: "Scores, goal scorers and who was on the pitch, newest first."
- Where: under the Rush night block on `hub-matchnight.html#mn-rush`, and at the end of the Rush section on `tactics.html`.

## R19: scouting
`scouting.html` (Club menu) and `hub-squad.html#sq-scout` cover the same job from two sides and do not link to each other.
- On `scouting.html`: "Want to be scouted? Open the scout board in Squad." linking to `hub-squad.html#sq-scout`.
- On `hub-squad.html#sq-scout`: "How scouting works" linking to `scouting.html`.

## Status of the rest of PF-009 (checked 2026-11-16)
- R18 and R19 are done (above).
- R20 (staff tab hashes) and R21 (split locker pages): built and guarded in `tests/deeplink.test.mjs`.
- R22: zoom is already allowed (no `maximum-scale` or `user-scalable` in `next/lib`, `next/pages`, `phoenix/`). Still to do: re-run axe for `aria-required-children` (tactics, rush), `aria-allowed-attr` (`music()` in `hub.mjs`) and tap targets; needs Chrome and a decision on phone wording.
- R23: needs the list of assigned wishlist items; write one brief each in `.site-context/handoffs/` with `Status: open` (the folder is missing in this checkout).
- R24 to R29 (staff sweep follow-ups): their definitions were in `.site-context/spec/REFACTOR.md`, which is not in the repo; recover it or have the owner restate them.
