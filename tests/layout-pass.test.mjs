// Layout pass (2026-11): the locker is six pages with a button grid, the staff hub is one page with an owner-only tier, the shared
// layout stylesheet is on every page, and none of it brings back a NOREX name, colour or crest.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';
import * as MAN from '../next/lib/staffmanifest.mjs';

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
t('locker: the five locker pages keep the button bar for moving between them; the landing has none (the ring menu holds every room and page)', !read('hub.html').includes('class="wrap lk-jump"') && Object.keys(LK).filter((f) => f !== 'hub.html').every((f) => ['hub-profile.html', 'hub-stats.html', 'hub-medals.html', 'hub-cardstudio.html', 'hub-alerts.html'].every((h) => read(f).match(/<nav class="wrap lk-jump"[\s\S]*?<\/nav>/)?.[0].includes(`href="${h}"`))));
t('locker: no button scrolls within the same page (no #lk- hrefs in the button grid)', Object.keys(LK).filter((f) => f !== 'hub.html').every((f) => { const nav = read(f).match(/<nav class="wrap lk-jump"[\s\S]*?<\/nav>/)?.[0] ?? ''; return nav && !/href="#/.test(nav); }));
t('locker: the open page is marked in the button grid', read('hub-stats.html').match(/<nav class="wrap lk-jump"[\s\S]*?<\/nav>/)[0].includes('href="hub-stats.html" aria-current="page"'));
t('locker: old hub.html#lk-… links forward to the right page, from every locker page (R31)', /hub-alerts\.html/.test(read('hub.html').match(/<script>\(function\(\)\{var m=\{'#lk-me'[\s\S]*?<\/script>/)?.[0] ?? '') && read('hub-stats.html').includes("var m={'#lk-me'"));
t('locker: the card stays in the page flow on the landing (pages.js)', /lk-landing/.test(fs.readFileSync(path.join(out, 'pages.js'), 'utf8')));
const lk = read('locker.css');
t('locker.css: no card size override sits outside a media query, so the phone keeps its size', !/--s:[\d.]+!important/.test(lk.split('@media')[0]));

// ---------- the staff hub ----------
const st = read('staff-controlcenter.html');
t('Control Center: decks for managers, owner-only tools flagged data-owner', st.includes('data-deck="match"') && st.includes('data-deck="org"') && /data-tool="boardroom"[^>]*data-owner/.test(st) && st.includes('src="ccshell.js"'));
t('Control Center: every tool row opens a view of its own', (st.match(/class="cx-nav" href="([^"#]+\?tool=[a-z]+)"/g) ?? []).length >= 30 && !/class="cx-nav" href="#/.test(st));
const BR = ['switches', 'health', 'announce', 'audit', 'halloffame', 'medals', 'backup', 'organization']; // the old one-tab Boardroom pages
t('staff hub: each old Boardroom control page redirects into its Control Center view (PF-022 step 8: no solo tab pages any more)', BR.every((k) => { const f = `staff-${k}.html`, id = MAN.LEGACY_PAGES[f]; return id && read(f).includes(`staff-controlcenter.html#${id}`) && !read(f).includes('pf-br-tab') && !read(f).includes('br-solo'); }));
t('staff hub: the Boardroom page itself redirects to the Control Center Boardroom view', read('staff-boardroom.html').includes('staff-controlcenter.html#boardroom'));
t('staff hub: only the owner gets the owner tier (staffhub.js reads the session role)', /A\.role === 'owner'/.test(fs.readFileSync(path.join(out, 'staffhub.js'), 'utf8')));

// ---------- branding: the shared source still carries the NOREX palette until phoenix/build.mjs recolours it (tests/phoenix-brand.test.mjs and leakcheck cover the built output), so here: names only ----------
const NEW = [...Object.keys(LK), 'staff.html', ...BR.map((k) => `staff-${k}.html`), 'layout.css', 'locker.css', 'staffhub.css'];
t('no NOREX name in the new pages and stylesheets', NEW.every((f) => { const s = read(f).replace(/<script[\s\S]*?<\/script>/g, ''); return !/norex/i.test(s.replace(/class="[^"]*"|id="[^"]*"/g, '')) ; }));

// PF-009 R24 (owner approved 2026-11-16): staff home groups sit in a 4-column grid from 1100, 2 from 821, one on phones; the owner group spans the row
const shc = read('staffhub.css');
t('R24 (deck layout): the deck cards and KPI tiles flow in a three-column grid from the stylesheet, no fixed sidebar column', /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(read('ccshell.css')) && !/cx-side/.test(read('ccshell.css')));
t('R24: the staff home stays Phoenix (no NOREX name, no NOREX red)', !/norex/i.test(st.replace(/<script[\s\S]*?<\/script>/g, '')) && !/c8352c/i.test(shc));
// PF-009 R25 (owner approved 2026-11-16): Boardroom link tiles are an equal auto-fill grid; the Switches accordion sits in 2 columns from 1100 with the counts beside the title
const brj = read('controlcenter.js'); // the grouped switches now live in the Control Center's Site access panel
t('R25: Boardroom link tiles use an equal auto-fill grid (no auto-fit stretch)', /\.br-tools\{grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,190px\),1fr\)\)\}/.test(lay) && !/\.br-tools\{grid-template-columns:repeat\(auto-fit/.test(lay));
t('R25 (control cards): site access groups are collapsible, counts next to the title, and the cards sit in a 2-column grid from 1100', read('controlcenter.js').includes('class="cu-group"') && /@media\(min-width:1100px\)\{[^@]*\.cu-grid\{grid-template-columns:repeat\(2,/.test(read('ccui.css')) && /\.cu-group>summary small\{margin-left:auto/.test(read('ccui.css')));
t('R25: the Boardroom output stays Phoenix (no NOREX name, no NOREX red)', !/norex/i.test(read('staff-boardroom.html').replace(/<script[\s\S]*?<\/script>/g, '')) && !/c8352c/i.test(lay));
// PF-009 R26 (owner approved 2026-11-16): Dugout is three equal-height columns from 1100 (roster / pitch / ready-check); phone stays one column
const dgj = read('dugout.js');
t('R26: the Dugout roster section no longer uses the .dg-av avatar class (it collapsed to 34px)', dgj.includes('dg-sec dg-roster') && !/<section[^>]*dg-sec dg-av/.test(dgj));
t('R26: Dugout board is a 3-column equal-height grid from 1100, pitch column widest', /@media\(min-width:1100px\)\{\.dg-top\{grid-template-columns:minmax\(240px,1fr\) minmax\(0,1\.5fr\) minmax\(240px,1fr\);[^}]*align-items:stretch\}\.dg-top>\.dg-sec\{height:100%;margin:0\}/.test(lay));
t('R26: the Dugout output stays Phoenix (no NOREX name, no NOREX red)', !/norex/i.test(read('staff-dugout.html').replace(/<script[\s\S]*?<\/script>/g, '')) && !/c8352c/i.test(lay));
// PF-009 R27 (owner approved 2026-11-16): Insights is two columns from 821 (Health and Month by month left, To do right); phones keep one card
const ixj = read('intel.js');
t('R27: each Insights card carries its own class (ix-card-health, ix-card-todo, ix-card-history)', ixj.includes('ix-card ix-card-${k}'));
t('R27: Insights is a 2-column grid from 821 with To do spanning both rows', /@media\(min-width:821px\)\{\.ix-cards\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);grid-template-areas:"ixh ixt" "ixm ixt"/.test(lay) && /\.ix-card-todo\{grid-area:ixt\}/.test(lay) && /\.ix-card-history\{grid-area:ixm\}/.test(lay));
t('R27: the Insights output stays Phoenix (no NOREX name, no NOREX red)', !/norex/i.test(read('staff-insights.html').replace(/<script[\s\S]*?<\/script>/g, '')) && !/c8352c/i.test(lay));
// PF-009 R28 (owner approved look exception 2026-11-16): Tools and Content controls and tables use the site input style, from tokens
const hx = read('hubx.css');
const r28 = hx.slice(hx.indexOf('PF-009 R28'));
t('R28: Tools and Content inputs, selects and textareas share one dark site input style with a focus ring from tokens', /\.room-staff \.dk-nf select[\s\S]*\.room-staff \.ct-l textarea\{[^}]*border:1px solid var\(--line2\);background:rgba\(0,0,0,\.3\);color:#fff/.test(r28) && /input:focus[\s\S]*border-color:var\(--g2\)/.test(r28));
t('R28: the Tools tables are styled (header row, row lines, hover) and checkboxes use the accent token', /\.room-staff table\.tbl th\{[^}]*border-bottom:1px solid var\(--line2\)/.test(r28) && /\.room-staff table\.tbl tbody tr:hover td/.test(r28) && /accent-color:var\(--g2\)/.test(r28) && /accent-color:var\(--g2\)/.test(read('content.css')));
t('R28: Tools and Content styling carries no NOREX red or name', !/c8352c/i.test(r28 + read('content.css')) && !/norex/i.test(read('staff-tools.html').replace(/<script[\s\S]*?<\/script>/g, '')) && !/norex/i.test(read('staff-content.html').replace(/<script[\s\S]*?<\/script>/g, '')));
done();
