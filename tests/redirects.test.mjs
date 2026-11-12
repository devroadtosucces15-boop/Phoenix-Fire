// Swap-over step 2: every old page address resolves – either to a new page or to its copy under classic/.
import { t, done } from './lib.mjs';
import { planRedirects, stubHtml, ROOT_MAP, HASH_MAP } from '../next/lib/redirects.mjs';
import vm from 'node:vm';

const oldFiles = ['index.html', 'about.html', 'members.html', 'builder.html', 'hub/index.html', 'players/abc.html', 'players/zzz.html', 'matches/1.html', 'matches/2.html', 'clubs/10.html', 'clubs/10-results.html', 'clubs/11.html', 'assets/app.js', 'api/players.json', 'sw.js'];
const newFiles = ['index.html', 'hub.html', 'builds.html', 'player-Mike.html', 'match-1.html', 'opp-10.html'];
const plan = planRedirects({ oldFiles, newFiles, players: [{ id: 'abc', k: 'Mike' }] });
t('same-path pages are left alone (index.html)', !('index.html' in plan));
t('assets, api and non-html files get no stub', !('assets/app.js' in plan) && !('api/players.json' in plan) && !('sw.js' in plan));
t('members.html → hub.html', plan['members.html'] === 'hub.html');
t('builder.html → builds.html', plan['builder.html'] === 'builds.html');
t('hub/index.html → hub.html', plan['hub/index.html'] === 'hub.html');
t('home player page → new player page', plan['players/abc.html'] === 'player-Mike.html');
t('other player page → classic copy', plan['players/zzz.html'] === 'classic/players/zzz.html');
t('match with a new page → new page; without → classic', plan['matches/1.html'] === 'match-1.html' && plan['matches/2.html'] === 'classic/matches/2.html');
t('club + club results → opponent page, unknown club → classic', plan['clubs/10.html'] === 'opp-10.html' && plan['clubs/10-results.html'] === 'opp-10.html' && plan['clubs/11.html'] === 'classic/clubs/11.html');
t('page the new build lacks falls back to classic', plan['about.html'] === 'classic/about.html');
t('every mapped target exists (new page) or lives under classic/', Object.values(plan).every((v) => v.startsWith('classic/') || newFiles.includes(v.split('#')[0])));
t('ROOT_MAP never points at itself', Object.entries(ROOT_MAP).every(([k, v]) => k !== v));
const s = stubHtml('players/abc.html', 'player-Mike.html');
t('stub in a folder goes up one level', s.includes('url=../player-Mike.html'));
t('stub keeps query and fragment', /location\.replace\(base\+location\.search\+f\)/.test(s));
t('members.html stub maps #schedule to the match night page', stubHtml('members.html', 'hub.html').includes('"schedule":"hub-matchnight.html#mn-week"'));
t('stub is not indexable', s.includes('noindex'));
import { emitRedirects } from '../next/lib/redirects.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-')); const cl = path.join(tmp, 'c'), nw = path.join(tmp, 'n');
for (const f of oldFiles) { fs.mkdirSync(path.dirname(path.join(cl, f)), { recursive: true }); fs.writeFileSync(path.join(cl, f), 'x'); }
for (const f of newFiles) { fs.mkdirSync(path.dirname(path.join(nw, f)), { recursive: true }); fs.writeFileSync(path.join(nw, f), 'x'); }
emitRedirects({ out: nw, classicDir: cl, players: [{ id: 'abc', k: 'Mike' }] });
t('writes stub files into the site folder', fs.existsSync(path.join(nw, 'members.html')) && fs.existsSync(path.join(nw, 'players/abc.html')));
t('does not overwrite a real page', fs.readFileSync(path.join(nw, 'index.html'), 'utf8') === 'x');
t('old /next/ preview links redirect to the main page', fs.readFileSync(path.join(nw, 'next/hub.html'), 'utf8').includes('url=../hub.html'));
fs.rmSync(tmp, { recursive: true, force: true });

// R06: legacy members.html#x. members.html is phoenix/claim.html (the claim page), so the forwarder lives in its head.
const claim = fs.readFileSync(new URL('../phoenix/claim.html', import.meta.url), 'utf8');
const fwd = claim.match(/<script>\/\* legacy members\.html[\s\S]*?<\/script>/)?.[0].replace(/^<script>|<\/script>$/g, '').replace('__PHOENIX_HASHES__', JSON.stringify(HASH_MAP));
const go = (hash, search = '') => { let to = null; vm.runInNewContext(fwd, { location: { hash, search, replace: (u) => { to = u; } }, Object: Object }); return to; };
t('claim.html carries the forwarder before the claim UI runs', !!fwd && claim.indexOf('legacy members.html') < claim.indexOf('PHOENIX_API'));
t('members.html#schedule, #manager, #awards, #achievements land on their page and section', go('#schedule') === 'hub-matchnight.html#mn-week' && go('#manager') === 'staff.html' && go('#awards') === 'hub-squad.html#sq-awards' && go('#achievements') === 'hub-medals.html#lk-medals' && go('#me') === 'hub-profile.html#lk-me' && go('#alerts') === 'hub-alerts.html#lk-alerts');
t('a query string stays before the fragment', go('#motm', '?x=1') === 'hub-matchnight.html?x=1#mn-motm');
t('no hash, #claim and unknown or inherited keys leave the claim page alone', go('') === null && go('#claim') === null && go('#nope') === null && go('#constructor') === null && go('#__proto__') === null);
t('every forwarder target is a page the built site makes and stays inside the site', Object.values(HASH_MAP).every((v) => /^[a-z-]+\.html(#[a-z-]+)?$/.test(v)));
const alerts = fs.readFileSync(new URL('../next/static/alerts.js', import.meta.url), 'utf8');
t('alert links members.html#schedule, #manager, #awards (and the rest of the table) have a ROUTE', ['schedule|events|rsvp', 'motm', 'rush', 'awards', 'predict', 'squads', 'recs|teamup', 'scout', 'manager', 'docs'].every((k) => alerts.includes('members\\.html#' + (k.includes('|') ? '(' + k + ')' : k))) && alerts.includes("'hub-matchnight.html#mn-week'") && alerts.includes("'staff.html'") && alerts.includes("'hub-squad.html#sq-awards'"));
done();
