// PF-031: header fits a 360 to 390 px phone (logo shortens, avatar stays inside) and the alert badge reads 9+.
import fs from 'node:fs';
import { t, done } from './lib.mjs';
import { shell } from '../next/lib/ui.mjs';

const js = fs.readFileSync(new URL('../next/static/header.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../next/static/header.css', import.meta.url), 'utf8');

// 9+ badge: run the real formatter from header.js
const m = js.match(/const badge = \(n\) => \([^\n]*?\);/);
t('header.js defines the badge formatter', !!m);
const badge = m ? new Function(`${m[0]} return badge;`)() : () => '';
t('badge shows nothing for 0', badge(0) === '');
t('badge shows 1 to 9 as they are', badge(1) === '1' && badge(9) === '9');
t('badge shows 9+ from 10 up (also 12 and 150)', badge(10) === '9+' && badge(12) === '9+' && badge(150) === '9+');
t('bell and chat badges go through the formatter', /i\.textContent = badge\(n\)/.test(js) && !/99\+/.test(js));

// shortened logo: second word is its own element, dropped on small phones, full name kept for screen readers
const html = shell({ group: 'club', page: 'index.html', title: 'x', body: '' });
const lg = html.match(/<a class="lg"[\s\S]*?<\/a>/)?.[0] || '';
t('logo splits the name into a first word and a second word', /class="lg1"/.test(lg) && /class="lg2"/.test(lg));
t('logo link keeps the full club name as its accessible name', /aria-label="[^"]+ [^"]+"/.test(lg));
t('logo name comes from config, not a hardcoded string', !/NOREX/i.test(lg));
t('second word is hidden at 430 px and below', /@media\(max-width:430px\)\{[^}]*\.bar \.lg \.lg2\{display:none\}/.test(css));

// fit: the right group never shrinks, the logo gives way first, badge is smaller on phones
t('the right-hand group never shrinks', /\.hdr-r\{flex:0 0 auto\}/.test(css));
t('the logo can shrink (min-width 0)', /\.bar \.lg\{flex:0 1 auto;min-width:0\}/.test(css));
t('at 360 px and below the header buttons get smaller', /@media\(max-width:360px\)\{[^\n]*\.hdr-r \.ac,\.hdr-i\{width:38px;height:38px\}/.test(css));
done();
