// PF-042: search becomes a command palette (next/static/header.js + header.css): groups, key hints, actions, recents, 12 px panel, no glow.
import fs from 'node:fs';
import { t, done } from './lib.mjs';
const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const js = rd('next/static/header.js'), css = rd('next/static/header.css');
t('no NOREX name, colour or crest in the palette code', !/norex united|c8352c|080b11/i.test(css) && !/norex united/i.test(js));
t('groups: Recent, Actions, Players, Pages, Menus, Settings, in that order', js.includes("const ORDER = ['Recent', 'Actions', 'Players', 'Pages', 'Menus', 'Settings']"));
t('group headings are rendered and hidden from screen readers', js.includes('class="phd" aria-hidden="true"'));
t('actions run in place (copy link, back to top, motion, alerts inbox)', ["'copy'", "'top'", "'motion'", "'bell'"].every((a) => js.includes(a)) && js.includes('navigator.clipboard.writeText(location.href)') && js.includes("window.scrollTo({ top: 0"));
t('the alerts action is only offered to signed-in members', js.includes("x[3] !== 'bell'"));
t('recents: last 5 picks kept in this browser under a phoenix.* key, with a Clear button', js.includes("'phoenix.search.recent'") && js.includes('.slice(0, 5)') && js.includes('pclr') && js.includes('forgetRecents'));
t('recents show first on an empty query', /\[\.\.\.recents\(\), \.\.\.all\.filter/.test(js));
t('picking a row (click or Enter) is remembered', js.includes('remember(r);') && js.includes("remember(results.find"));
t('key hints: row Enter hint and a move/open/close footer, footer only for a fine pointer', js.includes('class="pk"') && js.includes('class="pft"') && css.includes('@media(hover:hover) and (pointer:fine){.hdr-pal .pft{display:flex}}') && css.includes('@media(pointer:coarse){.hdr-pal .pk{display:none!important}}'));
t('panel is 12 px with no glow or big shadow', /\.hdr-pal \.pbox\{[^}]*border-radius:12px;box-shadow:none/.test(css));
t('rows keep their emoji', js.includes('<span class="pe" aria-hidden="true">${r.emo}</span>') && js.includes("emo: '👤'") && js.includes("'🔗'"));
t('the 44 px tap rule holds for rows and close', /\.hdr-pal li a\{[^}]*min-height:48px/.test(css) && /\.pclose\{width:44px;height:44px/.test(css));
t('keyboard still works: / and Ctrl+K open, arrows move, Enter opens, Esc closes', js.includes("e.key === '/'") && js.includes("'ArrowDown'") && js.includes("e.key === 'Enter'") && js.includes("e.key === 'Escape'"));
done();
