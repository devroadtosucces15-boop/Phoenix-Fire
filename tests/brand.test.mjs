// Phoenix brand guard: the built site must carry no NOREX name, crest or colour, and player pages must be reachable.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';
import { ACCENT } from '../bot/ui.js';
import { APP_LABEL } from '../bot/apps.js';
import { lfgMessage } from '../bot/lfg.js';
import { boardMessage } from '../bot/rushqueue.js';

const NOREX_CREST_SHA1 = '80ed04c5b4eb3f7234f3fbe6d3adb490b62ba3b1'; // the NOREX UNITED crest that once shipped as assets/crest.png
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-brand-'));
execFileSync(process.execPath, ['phoenix/build.mjs', '--live', '--out', out], { cwd: ROOT, stdio: 'pipe' });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(out);
const htmls = files.filter((f) => f.endsWith('.html'));
const text = (f) => fs.readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');

t('brand: no visible NOREX text on any page', htmls.every((f) => !/norex/i.test(text(f))));
t('brand: manifest and title are Phoenix', (() => { const m = fs.readFileSync(path.join(out, 'manifest.webmanifest'), 'utf8'); return /PHOENIX FIRE/i.test(m) && !/norex/i.test(m); })() && /PHOENIX FIRE/i.test(fs.readFileSync(path.join(out, 'index.html'), 'utf8').match(/<title>[^<]*/)?.[0] ?? ''));
t('brand: the crest is not the NOREX crest', files.filter((f) => /crest[^/]*\.png$|icon[^/]*\.png$|favicon\.png$/.test(f)).every((f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') !== NOREX_CREST_SHA1));
t('brand: the NOREX accent red is not used in site styles', files.filter((f) => f.endsWith('.css')).every((f) => !/#c8352c/i.test(fs.readFileSync(f, 'utf8'))));
t('brand: no file name carries a literal %20 (it 404s on Pages)', files.every((f) => !/%[0-9a-f]{2}/i.test(path.basename(f))));
t('brand: every player link on every page resolves to a built file', (() => { const names = new Set(files.map((f) => path.relative(out, f))); let n = 0; for (const f of htmls) for (const m of fs.readFileSync(f, 'utf8').matchAll(/href="(player-[^"#?]+\.html)"/g)) { n++; if (!names.has(decodeURIComponent(m[1]).replace(/&amp;/g, '&'))) return false; } return n > 0; })());
// ---------- the bot: every app and every Phoenix-only module ----------
const botSrc = (f) => fs.readFileSync(path.join(ROOT, 'bot', f), 'utf8');
t('brand: every Discord app is labelled Phoenix', Object.values(APP_LABEL).every((l) => /^Phoenix\b/.test(l)));
t('brand: no stripe colour in the bot is the NOREX red', Object.values(ACCENT).every((c) => c !== 0xc8352c) && ACCENT.red === 0xe8651a);
const sampleOut = JSON.stringify([
  lfgMessage({ id: 1, name: 'Ann', note: 'keeper', status: 'open', expires: Date.now() + 36e5 }, [{ name: 'Bo', answer: 'in' }], { roleId: '7' }),
  boardMessage([{ captain: '1', members: ['2'], status: 'green', ord: 0, joined_at: 0, green_at: 0, needs: 1 }], { org: 'Phoenix Fire' }),
]);
t('brand: LFG and queue messages carry the Phoenix colour and no NOREX name or colour', /phoenix fire/i.test(sampleOut) && !/norex|c8352c|13121580/i.test(sampleOut) && sampleOut.includes(String(0xe8651a)));
// New Phoenix-only bot modules (matchday, rush, lineup recommender, queue, config constants) must not mention NOREX at all.
const phoenixOnly = ['rushqueue.js', 'lfg.js', 'matchday.js', 'lineuprec.js', 'prefpos.js', 'orgconsts.js'];
t('brand: the Phoenix-only bot modules never say NOREX', phoenixOnly.every((f) => !/norex/i.test(botSrc(f))));
t('brand: icon files for the new apps are Phoenix-named', ['phoenix-matchday', 'phoenix-rush'].every((n) => walk(path.join(ROOT, 'bot', 'icons')).some((f) => path.basename(f).startsWith(n))));

fs.rmSync(out, { recursive: true, force: true });
done();
