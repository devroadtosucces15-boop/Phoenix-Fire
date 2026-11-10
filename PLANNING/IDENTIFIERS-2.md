# Identifiers 2: the renames left after A2

Status: plan only (2026-11-10). No code changed. The code steps touch `bot/`, so they wait for the bot lane to land. Checked with
`git grep` the same day.

## What is actually left (corrections to the audit)

`PLANNING/PHASE1-NOREX-AUDIT.md` lists two open items. Reading the code today:

| Item | Real state | Verdict |
|---|---|---|
| **R2 bucket `norex-media`** | Already `phoenix-media` in `bot/wrangler.toml:93` (`MEDIA` binding) and `bot/ensure-resources.mjs:52` (`BUCKET`). The Worker, the deploy and the lifecycle rule all use `phoenix-media`. The old name survives only in **comments and docs**: `bot/media.js:1`, `bot/ensure-resources.mjs:2-3`, `bot/migrations/0019_media.sql:1`, `bot/RESTORE.md` (lines 17, 21, 22, 31, 65). | **No data migration needed.** Only a doc fix, plus one open question below. |
| **`${secret}:norex-bot-settings` salt** | Still live in 5 places: `bot/settings.js:38` (Worker, `settingsKey`), `bot/register.mjs:23`, `scripts/lib.mjs:114`, `scripts/lib/org.mjs:27` (`orgKey`, also the comment on line 26). Worker and Actions must derive the same hash. | Needs the dual-read migration below. |

Same class, not in the original list, found by the grep: three more salts built the same way, and the session HMAC.

| Salt string | Where | Role | Risk if renamed |
|---|---|---|---|
| `:norex-overrides` | `bot/notify.js:402`, `scripts/lib.mjs:41` | Keyed `/api/overrides` | Same as bot-settings: Worker and Actions must agree |
| `:norex-crawl` | `bot/crawl.js:13`, `scripts/lib.mjs:59` | Keyed crawl route | Same |
| `:norex-burners` | `bot/burners.js:43`, `scripts/lib.mjs:96` | Keyed burners route | Same |
| `:norex-session` | `bot/members.js:77`, `tests/mock.mjs:149` | **HMAC key that signs every login token** | Renaming signs out every member and invalidates sealed tokens. Highest risk |

Decision proposed: do the bot-settings salt first as the pattern, then the other three keyed-route salts in the same mechanical change
(they share one mechanism). **Leave `norex-session` alone** unless the owner wants it: nobody sees it, and the dual-read for an HMAC is
more delicate than for a header (see "Session HMAC" below).

## Why these strings are safe to keep, and why rename anyway

The salt is just bytes mixed into a hash. It never appears on a page, in Discord or in a URL, so it fails neither the brand leak check
(which ignores identifiers in scripts) nor any user. The only reason to rename is tidiness and the "do not add NOREX references" rule.
The cost of getting it wrong is real (the nightly site update and slash-command registration stop authenticating), so keep the change
small and dual-read. It is acceptable to decide "never rename" and record that; the plan below is for if the owner wants it done.

## Approach: dual-read, as in A2

The Worker is the only side that checks the key, so it can accept **both** hashes while senders move to the new one. Order matters:
Worker first, senders second, old accept removed last.

New salt string: `phoenix-bot-settings` (same pattern: `${secret}:phoenix-bot-settings`).

### Steps

1. **Worker accepts both (bot lane).** In `bot/settings.js` add `settingsKeys(secret)` returning `[newHash, oldHash]`; `sharedKey()`
   check (`bot/sharedkey.js`) and each keyed route compare the request header against either, in constant time, for both entries.
   Keep `settingsKey(secret)` returning the new hash, so callers that import it move automatically. Same for overrides, crawl and burners.
   - Deploy. Nothing changes for any caller: they still send the old hash.
2. **Senders move to the new hash (scripts, repo root).** Change the four sender sites (`scripts/lib.mjs` x4, `scripts/lib/org.mjs`,
   `bot/register.mjs`) to the new salt string. These ship via GitHub Actions and run on the next cron, so they pick it up without an owner action.
   - Precondition: step 1 is **deployed**, not just merged. `bot.yml` deploys on push, but the Worker deploy and the Actions scripts land in the same push; to be safe, make step 1 and step 2 **two pushes**, step 2 only after the Worker deploy shows green.
3. **Verify.** Trigger the update workflow manually: it must load bot settings (`Bot settings not loaded:` warning must be absent), the org clubs list, and register commands.
4. **Soak a few days** (at least one full cron cycle, one result post, one `register.mjs` run).
5. **Remove the old accept (bot lane).** Delete the old-hash branch. Optional; leaving it costs nothing and keeps rollback open. If removed, add the test below inverted (old hash now refused).

### Tests to add (in `tests/identifiers.test.mjs`, the A2 file, when the code step happens)

- new key accepted at `/api/bot/settings/public`, old key still accepted (until step 5), wrong key refused even beside a right one, no key refused (copy the four existing header cases);
- every sender source (`scripts/lib.mjs`, `scripts/lib/org.mjs`, `bot/register.mjs`) uses `:phoenix-` salts and none contains `:norex-` (same style as the existing "senders send X-Phoenix-Key only" check);
- the Worker's `settingsKey` equals the script-side derivation for the same secret (a shared-vector test, since the two sides compute it independently).

### What breaks if done wrong

| Mistake | Symptom | Recovery |
|---|---|---|
| Senders switched before the Worker accepts the new hash | `Bot settings not loaded`, results/awards fall back to defaults (orange `c8352c` default colour even), `register.mjs` can't read owner command settings and may register the wrong command set, org club list falls back | Revert step 2 and push; the old Worker still accepts the old hash |
| Old accept removed while a sender still uses it | Same symptoms, 403 on the keyed routes | Re-add the old hash in the Worker |
| Typo in one of the two sides | Silent 403 on the keyed routes (no crash) | The shared-vector test catches it before the push |
| Renaming `norex-session` | Every member signed out; sealed tokens already issued (including `phoenix_session` values stored in browsers) fail to verify | Revert; tokens issued meanwhile are lost |

## R2: `phoenix-media`

- Code and config are already on the Phoenix name. **Docs/comments fix only** (bot lane): update the five places in `bot/RESTORE.md`,
  `bot/media.js:1`, `bot/ensure-resources.mjs:2-3`, `bot/migrations/0019_media.sql:1`. Careful: `0019_media.sql` is an applied
  migration; changing a comment in an applied migration is harmless to D1 (it records the file name, not a hash), but confirm with
  `wrangler d1 migrations list` before editing, and prefer leaving migrations untouched.
- `bot/RESTORE.md:17` says D1 backups land under `backups/norex-<YYYY-MM-DD>.sql.gz`. Check the backup writer for the real prefix
  (`git grep -n "backups/"` in `bot/`) and make the doc match. Renaming the **object prefix** is a separate, optional change: new
  backups under `backups/phoenix-…`, old ones stay readable; list both in RESTORE.md. No dual-read needed because only people read it.
- **Owner check in Cloudflare (needs the account):** R2, buckets: confirm `phoenix-media` exists and `norex-media` is either absent or empty.
  If an old `norex-media` bucket still holds objects from before the move, decide: copy them (`rclone` or `wrangler r2 object`
  loop) or delete the bucket. The feed's `/media/<key>` links and `media` rows in D1 point at **keys**, not bucket names, so a copy with the same
  keys keeps every post working. This is the only step in this plan that can lose data; do not delete before verifying one key from each of `i/`, `v/`, `card/`.
- Other resource names: D1 `phoenix`, queue `phoenix-jobs`, KV already Phoenix-named in `wrangler.toml`. The KV namespace was
  titled `norex-members` in docs (`RESTORE.md:59, 65`, `ensure-resources.mjs:2`); check the title in the dashboard and fix the docs to the truth.

## Who does what

| Step | Needs the owner's Cloudflare account? | Who |
|---|---|---|
| Worker dual-accept, sender changes, tests, doc fixes | No | Claude, bot lane for `bot/` files, a later session |
| Deploy | No: `bot.yml` deploys on push with the existing token | Automatic after push |
| Confirm bucket names / empty `norex-media` / KV title in the dashboard | **Yes** (read-only look in R2 and KV) | Owner |
| Copy or delete leftover `norex-media` objects | **Yes** | Owner (Claude can write the exact command) |
| Rotating `DISCORD_CLIENT_SECRET` (unrelated to the rename, but changes all hashes at once) | Yes, Dev Portal | Owner. Do **not** combine with this change |

## Session HMAC (only if the owner wants `norex-session` renamed)

Same idea, different shape: verification tries `phoenix-session` first then `norex-session`; **signing** switches to `phoenix-session`
only after verify accepts both everywhere. Tokens live up to their expiry, so after removing the old verifier everyone with an
older token re-logs in once. The mock key in `tests/mock.mjs:149` changes with it. Low value, nonzero cost: default is to keep it and
note it as a permanent internal identifier.

## Suggested order for the later code session

1. Doc/comment fixes for R2 and KV (zero risk).
2. Worker dual-accept for the four keyed salts + tests. Push, wait for deploy.
3. Senders to the new salts. Push, run the update workflow by hand, check logs.
4. Soak, then optionally remove the old accept.
5. Update `CLAUDE.md` "Known leftovers" and the audit table.
Model: Sonnet is enough (mechanical, test-guarded). Use Opus only if the session HMAC is included.
