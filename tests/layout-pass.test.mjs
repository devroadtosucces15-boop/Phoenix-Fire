// Layout pass (2026-11): the locker is six pages with a button grid, the staff hub is one page with an owner-only tier, the shared
// layout stylesheet is on every page, and none of it brings back a NOREX name, colour or crest.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-'));
execFileSync(process.execPath, ['next/build.mjs', '--out', out, '--preview'], { cwd: ROOT, stdio: 'pipe' });
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const html = fs.readdirSync(out).filter((f) => f.endsWith('.html'));

// ---------- shared stylesheet ----------
t('layout.css and locker/staffhub sheets ship', ['layout.css', 'locker.css', 'staffhub.css', 'staffhub.js'].every((f) => fs.existsSync(path.join(out, f))));
t('layout.css is linked on every page', html.filter((f) => !['canvas.html', 'lookbook.html', 'studio.html'].includes(f)).every((f) => read(f).includes('href="layout.css"')));
const lay = read('layout.css');
t('layout.css only changes layout: no colour, font, radius, shadow or border is set', !/(^|[;{\s])(color|background|font|border|box-shadow|border-radius)\s*:/.test(lay.replace(/\/\*[\s\S]*?\*\//g, '')));
t('level rows: the global .panel+.panel gap is reset inside grids from 821px', /@media\(min-width:821px\)\{:is\(\.g2,\.g3,\.g4,\.grid\)>\.panel/.test(lay));
t('every jump lands below the sticky bars (one scroll offset)', lay.includes('--pf-sticky-top') && lay.includes('scroll-margin-top:var(--pf-sticky-top)'));

// ---------- the locker: landing + five pages ----------
const LK = { 'hub.html': 'lk-landing', 'hub-profile.html': 'lk-me', 'hub-stats.html': 'lk-stats', 'hub-medals.html': 'lk-medals', 'hub-cardstudio.html': 'lk-cards', 'hub-alerts.html': 'lk-alerts' };
t('locker: the landing and the five pages are built', Object.keys(LK).every((f) => html.includes(f)));
t('locker: each page carries its own body class and the locker stylesheet', Object.entries(LK).every(([f, c]) => { const s = read(f); return new RegExp(`<body[^>]*class="[^"]*\\b${c}\\b`).test(s) && s.includes('href="locker.css"'); }));
t('locker: every page keeps all the mounts the scripts fill (lkme, lkstats, lkmedals, lkcards, lkinbox, lkprefs, cardslot)', Object.keys(LK).every((f) => ['id="lkme"', 'id="lkstats"', 'id="lkmedals"', 'id="lkcards"', 'id="lkinbox"', 'id="lkprefs"', 'id="cardslot"'].every((m) => read(f).includes(m))));
t('locker: the button grid sits inside the stage, after the card, and links to five different pages', (() => { const s = read('hub.html'); const stage = s.slice(s.indexOf('id="lockstage"'), s.indexOf('class="wrap lk-below"')); return stage.indexOf('id="cardslot"') > -1 && stage.indexOf('class="wrap lk-jump"') > stage.indexOf('id="cardslot"') && ['hub-profile.html', 'hub-stats.html', 'hub-medals.html', 'hub-cardstudio.html', 'hub-alerts.html'].every((h) => stage.includes(`href="${h}"`)); })());
t('locker: no button scrolls within the same page (no #lk- hrefs in the button grid)', Object.keys(LK).every((f) => { const nav = read(f).match(/<nav class="wrap lk-jump"[\s\S]*?<\/nav>/)?.[0] ?? ''; return nav && !/href="#/.test(nav); }));
t('locker: the open page is marked in the button grid', read('hub-stats.html').match(/<nav class="wrap lk-jump"[\s\S]*?<\/nav>/)[0].includes('href="hub-stats.html" aria-current="page"'));
t('locker: old hub.html#lk-… links forward to the right page', /hub-alerts\.html/.test(read('hub.html').match(/<script>\(function\(\)\{var m=\{'#lk-me'[\s\S]*?<\/script>/)?.[0] ?? '') && !read('hub-stats.html').includes("var m={'#lk-me'"));
t('locker: the card stays in the page flow on the landing (pages.js)', /lk-landing/.test(fs.readFileSync(path.join(out, 'pages.js'), 'utf8')));
const lk = read('locker.css');
t('locker.css: no card size override sits outside a media query, so the phone keeps its size', !/--s:[\d.]+!important/.test(lk.split('@media')[0]));

// ---------- the staff hub ----------
const st = read('staff.html');
t('staff hub: shared groups for managers, owner-only groups behind .adm-owner', st.includes('Match night') && st.includes('class="adm-g adm-owner"') && st.includes('Owner controls') && st.includes('src="staffhub.js"'));
t('staff hub: every tile opens a page of its own', (st.match(/class="panel room adm-tile" href="([^"#]+)"/g) ?? []).length >= 15 && !/class="panel room adm-tile" href="#/.test(st));
const BR = ['switches', 'health', 'announce', 'audit', 'halloffame', 'medals', 'backup', 'organization'];
t('staff hub: each Boardroom control is its own page that opens its tab', BR.every((k) => html.includes(`staff-${k}.html`) && /name="pf-br-tab" content="[a-z]+"/.test(read(`staff-${k}.html`)) && read(`staff-${k}.html`).includes('br-solo')));
t('staff hub: the Boardroom page itself is unchanged (no solo tab)', !read('staff-boardroom.html').includes('pf-br-tab'));
t('staff hub: only the owner gets the owner tier (staffhub.js reads the session role)', /A\.role === 'owner'/.test(fs.readFileSync(path.join(out, 'staffhub.js'), 'utf8')));

// ---------- branding: the shared source still carries the NOREX palette until phoenix/build.mjs recolours it (tests/phoenix-brand.test.mjs and leakcheck cover the built output), so here: names only ----------
const NEW = [...Object.keys(LK), 'staff.html', ...BR.map((k) => `staff-${k}.html`), 'layout.css', 'locker.css', 'staffhub.css'];
t('no NOREX name in the new pages and stylesheets', NEW.every((f) => { const s = read(f).replace(/<script[\s\S]*?<\/script>/g, ''); return !/norex/i.test(s.replace(/class="[^"]*"|id="[^"]*"/g, '')) ; }));

done();
