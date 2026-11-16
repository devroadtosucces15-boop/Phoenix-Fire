// R06 / PF-008: the members.html#... forwarder in the built Phoenix claim page. Every legacy hash must land on a page and an id (or data-dl
// alias) that exist in the same build, the claim hashes must stay on the page, and the output must carry no NOREX name or colour.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-'));
execFileSync(process.execPath, ['phoenix/build.mjs', '--out', out], { cwd: ROOT, stdio: 'pipe' });
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const html = read('members.html');
const m = html.match(/var m=(\{.*?\}),h=location\.hash/);
t('members.html carries the legacy hash forwarder with a map', !!m);
const map = m ? JSON.parse(m[1]) : {};
t('forwarder map is not trivially small', Object.keys(map).length >= 20);
const bad = [];
for (const [k, target] of Object.entries(map)) {
  const [page, id] = target.split('#');
  if (!fs.existsSync(path.join(out, page))) { bad.push(`${k} -> ${target} (no page)`); continue; }
  if (!id) continue;
  const s = read(page);
  if (!(s.includes(`id="${id}"`) || s.includes(`data-dl="${id}"`) || s.includes(`data-dl~="${id}`))) bad.push(`${k} -> ${target} (no id)`);
}
t('every forwarder target page and anchor exists in the build' + (bad.length ? ': ' + bad.join('; ') : ''), bad.length === 0);
t('unknown hashes and the claim flow stay on members.html (the forwarder returns before replace)', html.includes('if(!o.call(m,h))return;') && html.includes('location.replace('));
t('the forwarder keeps the query string and forwards by prefix (~schedule, ~event)', html.includes('location.search') && html.includes("'~'+h.split('-')[0]"));
t('no NOREX name or colour in the forwarder page', !/norex|#c8352c|#080b11/i.test(html.replace(/norex_(session|error)|norex\.|NOREX_KV|X-Norex-Key|NorexLenis|window\.Norex\w*/gi, '')));
// static internal anchors in every built page must resolve (script-built handbook ids are the one named exception)
const pages = fs.readdirSync(out).filter((f) => f.endsWith('.html')), docs = Object.fromEntries(pages.map((f) => [f, read(f)]));
const js = fs.readdirSync(out).filter((f) => f.endsWith('.js')).map(read).join('\n');
const stale = [];
for (const [f, h] of Object.entries(docs)) for (const a of h.matchAll(/href="([\w.-]+\.html)#([\w-]+)"/g)) {
  const [, p, id] = a, d = docs[p];
  if (!d) { stale.push(`${f} -> ${p}#${id}`); continue; }
  if (d.includes(`id="${id}"`) || d.includes(`data-dl="${id}"`) || d.includes(`data-dl~="${id}`)) continue;
  if (!(p === 'hub-handbook.html' && /^(league|rush)-setpieces$/.test(id) && js.includes('id="${mode}-${k}"'))) stale.push(`${f} -> ${p}#${id}`);
}
t('no stale page.html#anchor link in any built page' + (stale.length ? ': ' + stale.slice(0, 5).join('; ') : ''), stale.length === 0);
// PF-009 R18/R19 (owner-approved wording): Rush log and scouting are linked both ways
const hasLink = (f, href, text) => new RegExp(`<a href="${href.replace(/[.#]/g, '\\$&')}">(<span[^>]*>[^<]*</span> )?${text}</a>`).test(docs[f] || '');
t('R18: hub-matchnight.html and tactics.html link "See every Rush result" to rush.html, and the page exists', hasLink('hub-matchnight.html', 'rush.html', 'See every Rush result') && hasLink('tactics.html', 'rush.html', 'See every Rush result') && !!docs['rush.html']);
t('R19: scouting.html links to hub-squad.html#sq-scout and hub-squad.html links back to scouting.html', hasLink('scouting.html', 'hub-squad.html#sq-scout', 'Track your recommendations in Squad') && hasLink('hub-squad.html', 'scouting.html', 'Recommend a player'));
// PF-009 R22 (axe re-run 2026-11-16): the two findings left after the playbook and music() fixes are closed
const mnjs = fs.readFileSync(path.join(ROOT, 'next/static/matchnight.js'), 'utf8');
t('R22: match-night day buttons are plain buttons in a group, not role="listitem" (axe aria-allowed-role)', !mnjs.includes('role="listitem"') && !mnjs.includes('role="list"') && mnjs.includes('class="mn-days" role="group"'));
const mcss = read('motion.css');
t('R22: the install-banner close button keeps a 44px hit area (axe target-size)', /#nx-inst \.x\{[^}]*min-width:44px;min-height:44px/.test(mcss));
t('R22: on phones the install banner sits above the dock button, so it never covers the close button (axe target-size)', /@media\(max-width:820px\)\{#nx-inst\{bottom:calc\(168px/.test(mcss));
done();
