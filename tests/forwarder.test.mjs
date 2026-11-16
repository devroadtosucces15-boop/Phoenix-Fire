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
done();
