// The library (LIBRARY/) stays complete, current and free of secrets, and the operating rules are in place.
import fs from 'node:fs';
import { t, done } from './lib.mjs';
import { renderCommands, renderAssets, renderSitemap, renderFlags } from '../tools/library/sync.mjs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const exists = (f) => fs.existsSync(new URL(`../${f}`, import.meta.url));

const HAND = ['README', 'ROADMAP', 'CLAIMS', 'ASSETS', 'RESOURCES', 'CREDENTIALS', 'DESIGN', 'BOT', 'SITEMAP'];
for (const n of HAND) {
  const ok = exists(`LIBRARY/${n}.md`);
  t(`LIBRARY/${n}.md exists`, ok);
  if (ok) t(`LIBRARY/${n}.md has a "Last verified: YYYY-MM-DD" line`, /^Last verified: \d{4}-\d{2}-\d{2}/m.test(read(`LIBRARY/${n}.md`)));
}
t('README lists every hand and generated library file', [...HAND.filter((n) => n !== 'README'), 'BOT-COMMANDS', 'ASSETS-INDEX', 'SITEMAP-INDEX', 'FLAGS-INDEX'].every((n) => read('LIBRARY/README.md').includes(`\`${n}.md\``)));

const road = read('LIBRARY/ROADMAP.md');
t('the roadmap has exactly one NEXT item', (road.match(/^\| PF-\d+ \|.*\| NEXT \|/gm) || []).length === 1);
const ids = [...road.matchAll(/^\| (PF-\d+) \|/gm)].map((m) => m[1]);
t('roadmap item ids are unique', new Set(ids).size === ids.length && ids.length > 0);

t('BOT-COMMANDS.md matches bot/commanddefs.js (run node tools/library/sync.mjs)', exists('LIBRARY/BOT-COMMANDS.md') && read('LIBRARY/BOT-COMMANDS.md') === renderCommands());
t('ASSETS-INDEX.md matches the asset folders (run node tools/library/sync.mjs)', exists('LIBRARY/ASSETS-INDEX.md') && read('LIBRARY/ASSETS-INDEX.md') === renderAssets());
t('SITEMAP-INDEX.md matches a fresh build (run node tools/library/sync.mjs)', exists('LIBRARY/SITEMAP-INDEX.md') && read('LIBRARY/SITEMAP-INDEX.md') === renderSitemap());
t('FLAGS-INDEX.md matches config.json features (run node tools/library/sync.mjs)', exists('LIBRARY/FLAGS-INDEX.md') && read('LIBRARY/FLAGS-INDEX.md') === renderFlags());

// No secret values anywhere in the library.
const SECRET = [
  /[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/, // Discord bot token shape
  /gh[pousr]_[A-Za-z0-9]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(?:token|secret|password|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9+/_-]{24,}/i,
];
const files = fs.readdirSync(new URL('../LIBRARY/', import.meta.url)).filter((f) => f.endsWith('.md'));
const leaks = files.filter((f) => SECRET.some((re) => re.test(read(`LIBRARY/${f}`))));
t(`no secret-looking value in LIBRARY (${leaks.join(', ') || 'clean'})`, leaks.length === 0);

t('CLAUDE.md points sessions at the library and the operating rules', /LIBRARY\/README\.md/.test(read('CLAUDE.md')) && /SESSION-HANDOFF\.md/.test(read('CLAUDE.md')));
t('the operating rules cover roadmap, claims, authorization, library and the next-session prompt', ['## 1. One master roadmap', '## 4. Working beside other sessions', '## 5. Standing authorization', '## 6. Libraries', '## 7. Ending a session'].every((h) => read('PLANNING/SESSION-HANDOFF.md').includes(h)));
done();
