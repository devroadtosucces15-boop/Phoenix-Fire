// Posts the recap of every playing session that has ended. Runs in update.yml after the results are posted (every run, scheduled or not).
// A session = matches of one club with no gap longer than config.sessionRecap.idleGapMinutes; it is over once nothing new arrived for that long.
// Idempotent across runs: each session has a stable key and the Worker claims it before posting (bot/sessionrecap.js), so a repeated run, a
// re-run after a failed data commit, or two overlapping runs post it once. Sessions older than sessionRecap.maxAgeHours are left alone.
//   node scripts/session-recap.mjs [--dry]      SESSION_NOW=<unix seconds> pretends it is that time (tests, dry runs)
import fs from 'node:fs';
import path from 'node:path';
import { DATA, loadConfig, loadOverrides } from './lib.mjs';
import { resolveOrgClubs, requestSessionRecap } from './lib/org.mjs';
import { clubTag } from './lib/clubtag.mjs';
import { sessionPicture } from './cards.mjs';
import { launchChrome } from './lib/chrome.mjs';
import { findSessions, isEnded, isFresh, buildRecap, settingsOf } from './lib/sessionrecap.mjs';

const dry = process.argv.includes('--dry');
const config = loadConfig();
const st = settingsOf(config);
if (!st.enabled) { console.log('Session recap: switched off in config.json (sessionRecap.enabled)'); process.exit(0); }
const now = +process.env.SESSION_NOW || Math.floor(Date.now() / 1000);
const dir = path.join(DATA, 'matches');
const matches = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean);
const org = await resolveOrgClubs(config, { dataDir: DATA, live: !dry });
const o = dry ? { hiddenPlayers: [] } : await loadOverrides(config);
const hide = new Set([...(config.hiddenPlayers ?? []), ...(o.hiddenPlayers ?? [])].map((h) => String(h).toLowerCase()));
const due = findSessions(matches, org.ids, st.idleGapMinutes).filter((s) => isEnded(s, now, st.idleGapMinutes) && isFresh(s, now, st.maxAgeHours) && s.matches.length >= st.minMatches);
console.log(`Session recap: ${due.length} ended session${due.length === 1 ? '' : 's'} in the last ${st.maxAgeHours} h (idle gap ${st.idleGapMinutes} min, at least ${st.minMatches} matches)`);
let failed = 0;
// The session picture (crests, scores, scorers) is drawn here and sent with the numbers; if Chrome is not there the Worker posts the text list instead.
let chrome = null;
const club = { name: config.siteTitle ?? 'Club', crest: (() => { try { return `data:image/png;base64,${fs.readFileSync(new URL('../phoenix/overlay/crest-sm.png', import.meta.url)).toString('base64')}`; } catch { return ''; } })() };
for (const s of due) {
  const recap = buildRecap(s, { hide });
  recap.tag = clubTag({ src: s.club, type: recap.modes.length === 1 ? recap.modes[0].toLowerCase() : 'league', org, config });
  if (dry) { console.log(JSON.stringify(recap, null, 2)); continue; }
  try { chrome ??= await launchChrome(); recap.picture = (await chrome.shot(sessionPicture(recap, club), 1200)).toString('base64'); } catch (e) { console.warn(`Session picture not drawn: ${e.message}`); }
  const r = await requestSessionRecap(config, recap);
  console.log(`Recap ${recap.key} (${recap.w}W ${recap.d}D ${recap.l}L, ${recap.count} matches) → ${r.ok ? (r.posted ? `posted to ${r.posted} channel(s)` : `not posted: ${r.reason}`) : `NOT sent: ${r.reason}`}`);
  if (!r.ok || (!r.posted && /channel|Discord refused/.test(r.reason ?? ''))) { failed++; console.warn(`::warning title=Session recap::${recap.key}: ${r.reason}`); }
}
await chrome?.close?.();
if (failed) process.exitCode = 1;
