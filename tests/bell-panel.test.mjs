// Bell dropdown + modal floating panels + tappable hero buttons (phone bug-fix pass).
import fs from 'node:fs';
import { ROOT } from './mock.mjs';
import { t as t0, done } from './lib.mjs';
const t = (n, f) => t0(n, !!f());

const rd = (p) => fs.readFileSync(ROOT + '/' + p, 'utf8');
const header = rd('next/static/header.js'), dock = rd('next/static/dock.js'), owner = rd('next/static/ownerfab.js'), style = rd('next/static/style.css'), widgets = rd('next/static/widgets.css');

t('bell is a button that opens its own notifications panel, not a link to the Locker', () => {
  const bell = header.match(/bell = d\.createElement\('([a-z]+)'\)[^;]*;[^;]*;[^;]*;/)?.[1];
  return bell === 'button' && /bell\.onclick = toggleBell/.test(header) && !/bell\.href/.test(header);
});
t('bell panel lists, marks read and opens items from /api/notify', () => /hdr-bellp/.test(header) && /\/api\/notify'/.test(header) && /\/api\/notify\/read/.test(header) && /data-all/.test(header));
t('no header entry point sends notifications to the Hub alerts page', () => !/href: 'hub-alerts\.html'/.test(header.replace(/\['Alert settings'[^\n]*\n/, '')) && !/'hub-alerts\.html'/.test(header.replace(/\['Alert settings'[^\n]*\n/, '')));
t('floating menu backdrop swallows pointer, touch and click events while open', () => /dk-scrim/.test(dock) && /capture: true/.test(dock) && /'touchend'/.test(dock) && !/pointerdown', \(e\) => \{ if \(!rp\.hidden && !rp\.contains\(e\.target\) && !ring\.contains\(e\.target\)\) closeR/.test(dock));
t('owner button panel no longer lets the closing tap fall through', () => /capture|, true\)/.test(owner) && /stopPropagation/.test(owner));
t('decorative hero layers never take taps', () => /\.crestwrap \.halo\{pointer-events:none/.test(style) && /\.wx \.rays\{pointer-events:none/.test(widgets));
t('bell panel is Phoenix themed (accent from the token, no NOREX red)', () => { const css = rd('next/static/header.css'); return /hdr-bellp/.test(css) && !/c8352c/i.test(css) && !/c8352c/i.test(header); });
import { HASH_MAP } from '../next/lib/linkmap.mjs';
t('old alerts links (members.html#alerts, #lk-alerts, #lk-unread) open the bell, not the Locker', () => HASH_MAP.alerts === 'index.html#bell' && /'#lk-alerts':'index\.html#bell'/.test(rd('next/pages/hub.mjs')) && /'#lk-unread':'index\.html#bell'/.test(rd('next/pages/hub.mjs')));
t('header opens the bell when the address carries #bell', () => /location\.hash === '#bell'/.test(header) && /hashchange/.test(header));
done();
