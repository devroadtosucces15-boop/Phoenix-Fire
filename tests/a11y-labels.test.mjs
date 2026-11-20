// PF-030: names, labels, captions, current page and announcements. Fails when any of these is missing in the shared UI source.
import fs from 'node:fs';
import { scanAll, sourceFiles, mask } from '../tools/a11y/scan.mjs';
let fail = 0;
const t = (n, ok, more = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : more)); if (!ok) fail++; };
const list = (a) => '\n       ' + a.slice(0, 8).map((x) => `${x.file}:${x.line} ${x.tag}`).join('\n       ') + (a.length > 8 ? `\n       ... and ${a.length - 8} more` : '');

// the scanner must see every control it is meant to judge (a broken template parse would hide them)
let hidden = [];
for (const f of sourceFiles()) {
  const raw = fs.readFileSync(f, 'utf8'), m = mask(raw);
  for (const tag of ['<table', '<button', '<input', '<select', '<textarea', '<label', '<th'])
    { const a = (raw.match(new RegExp(tag + '\\b', 'g')) || []).length, b = (m.match(new RegExp(tag + '\\b', 'g')) || []).length; if (a !== b) hidden.push({ file: f, line: 0, tag: `${tag} raw ${a} seen ${b}` }); }
}
t('scanner sees every table, button, field, label and header cell', !hidden.length, list(hidden));

const r = scanAll();
t('every icon button has an accessible name (aria-label or visible text)', !r.iconButtons.length, list(r.iconButtons));
t('every input, select and textarea has a label (wrapping label, for=, aria-label)', !r.fields.length, list(r.fields));
t('every table has a caption', !r.tables.length, list(r.tables));

// header cells carry scope
const noScope = [];
for (const f of sourceFiles()) {
  const m = mask(fs.readFileSync(f, 'utf8'));
  for (const h of m.matchAll(/<thead>[\s\S]*?<\/thead>/g))
    for (const c of h[0].matchAll(/<th\b([^>]*)>/g)) if (!/scope=/.test(c[1])) noScope.push({ file: f, line: m.slice(0, h.index).split('\n').length, tag: c[0] });
}
t('every header cell in a table head has scope', !noScope.length, list(noScope));

// the dock (bottom tab bar), the header menu and the section bar mark the current page
const { shell } = await import('../next/lib/ui.mjs');
const html = shell({ group: 'club', page: 'index.html', title: 'x', body: '<p>x</p>' });
const bar = html.match(/<nav class="tabbar"[\s\S]*?<\/nav>/)?.[0] || '';
const cur = (bar.match(/<a [^>]*aria-current="[^"]+"[^>]*>/g) || []);
t('dock marks exactly one item as current', cur.length === 1 && /data-g="club"/.test(cur[0]), ' got ' + cur.length);
t('dock marks the landing page with aria-current="page"', /aria-current="page"/.test(cur[0] || ''));
const inner = shell({ group: 'club', page: 'results.html', title: 'x', body: '' }).match(/<nav class="tabbar"[\s\S]*?<\/nav>/)?.[0] || '';
t('dock marks the section as current while on one of its other pages', /data-g="club"[^>]*aria-current="true"/.test(inner));
t('header menu marks the current section', /<nav class="nv"[\s\S]*?<a [^>]*class="on"[^>]*aria-current=/.test(html));
const hub = shell({ group: 'hub', page: 'hub.html', title: 'x', body: '' }).match(/<nav class="tabbar"[\s\S]*?<\/nav>/)?.[0] || '';
t('dock marks the Hub key as current on the Hub', /class="key"[^>]*aria-current="page"/.test(hub));
const subPage = shell({ group: 'stats', page: 'stats.html', title: 'x', body: '' });
t('every on link in a section bar has aria-current', !/<nav class="sub"[\s\S]*?<a [^>]*class="on"(?![^>]*aria-current)/.test(subPage));

// banners and toasts are announced: status for notices, alert for errors
const motion = fs.readFileSync('next/static/motion.js', 'utf8');
t('toast box is a polite status region', /box\.setAttribute\('role', 'status'\)[\s\S]{0,40}aria-live', 'polite'/.test(motion));
t('error toasts are role=alert', /kind === 'err'\) t\.setAttribute\('role', 'alert'\)/.test(motion));
t('join status banner is role=status', /data-join-status role="status"/.test(fs.readFileSync('next/pages/club.mjs', 'utf8')));
t('owner view banner and notification warnings are role=status', /class="mc-banner" role="status"/.test(fs.readFileSync('web/messages.js', 'utf8')) && !/<p class="nt-warn">/.test(fs.readFileSync('web/notify.js', 'utf8')));
process.exit(fail ? 1 : 0);
