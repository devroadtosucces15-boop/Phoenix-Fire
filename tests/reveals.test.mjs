// PF-048: every block hidden for a scroll reveal does show (scrolled, ?still, print, motion off, safe mode, no JS).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
let fail = 0;
const t = (n, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; };
const css = fs.readFileSync('next/static/motion.css', 'utf8');
const style = fs.readFileSync('next/static/style.css', 'utf8');
t('blocks are only hidden once the motion script runs (html.mx), so no-JS stays readable', /html\.mx \.reveal\{opacity:0/.test(css) && !/(^|\n)\.reveal\{[^}]*opacity:0/.test(css));
t('print shows every reveal, staged part and dealt item', /@media print\{[^]*html\.mx \.reveal[^]*\.rv-c[^]*\.rv-g>\*[^]*opacity:1!important/.test(css));
t('motion off shows everything', /html\[data-motion=off\] \.reveal[^{]*\{opacity:1!important/.test(css));
t('safe mode shows everything', /html\.nx-safe \.reveal[^{]*\{opacity:1!important/.test(css));
t('?still shows everything', /body\.still \.reveal\{opacity:1/.test(style));
t('print rule does not touch the look on screen', !/@media print[^}]*display:none/.test(css));
const probe = fs.readFileSync('tools/effects/reveals.mjs', 'utf8');
t('probe covers scroll, still and print', /scroll: \{/.test(probe) && /still: \{ q: '\?still'/.test(probe) && /print: true/.test(probe) && /process\.exit\(bad \? 1 : 0\)/.test(probe));
// live probe on the built site when a built site and chromium exist (the stuck blocks are measured, not guessed)
const have = fs.existsSync('site/index.html') && spawnSync('chromium', ['--version']).status === 0;
if (have && !process.env.NO_LIVE) {
  const r = spawnSync('node', ['tools/effects/reveals.mjs', 'site'], { env: { ...process.env, PAGES: 'index,stats,tactics' }, encoding: 'utf8', timeout: 240000 });
  t('no block stays at opacity 0 on Club, Stats, Tactics (scroll, still, print)', r.status === 0);
  if (r.status !== 0) console.log((r.stderr || '').slice(0, 800));
} else console.log('skip live reveal probe (no built site or chromium)');
process.exit(fail ? 1 : 0);
