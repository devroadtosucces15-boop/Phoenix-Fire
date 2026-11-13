// Round 2 layout pass (R30-R37, 2026-11): level rows on the named grids, deep-link and landmark fixes, tap targets, text measure.
// Static checks on the built next/ output; layout only, phone untouched (rules sit in min-width queries).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lr2-'));
execFileSync(process.execPath, ['next/build.mjs', '--out', out, '--preview'], { cwd: ROOT, stdio: 'pipe' });
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const lay = strip(read('layout.css'));
const css = fs.readdirSync(out).filter((f) => f.endsWith('.css')).map((f) => strip(read(f))).join('\n');

// ---------- R30 ----------
const ROWS = ['.bx-grps', '.nw-posts', '.pb-top', '.ct-list', '.ix-cards', '.sc-list', '.adm-grid'];
const zero = lay.match(/@media\(min-width:700px\)\{(:is\([^)]*\)>\*)[^{]*\{margin-top:0\}\}/);
t('R30: the level-row rule exists inside a min-width:700px query', !!zero);
t('R30: it names every grid whose panels were pushed 22px low', !!zero && ROWS.every((c) => zero[1].includes(c)));
t('R30: each named container really is a display:grid in the shipped css', ROWS.every((c) => new RegExp(`${c.replace('.', '\\.')}\\{[^}]*display:grid`).test(css)));
t('R30: the sibling rule .panel+.panel is not edited, phone keeps it', /\.panel\+\.panel,\.panel\+\.grid,\.grid\+\.panel\{margin-top:22px\}/.test(css));


// ---------- R35 ----------
const hdr = strip(read('header.css'));
t('R35: header icons are 40px at 480px and below (were 38)', /max-width:480px\)\{[^}]*\.hdr-i\{min-width:40px;min-height:40px/.test(hdr.replace(/\}\.hdr-r \.ac\{[^}]*\}/g, '}')) || (hdr.includes('.hdr-s,.hdr-r .ac,.hdr-i{min-width:40px;min-height:40px}') && !hdr.includes('min-width:38px')));
t('R35: sub bar chips, skip link, small labels and links get a 40px (44px from 821px) box', lay.includes('.sub a{display:inline-flex;align-items:center;min-height:40px}') && lay.includes('@media(min-width:821px){.sub a{min-height:44px}}') && lay.includes('.skip{display:inline-flex;align-items:center;min-height:40px}') && lay.includes('#main>.wrap>a.muted.small'));
t('R35: members.html (claim page) links get a 40px box', fs.readFileSync(path.join(ROOT, 'phoenix/claim.html'), 'utf8').includes('.claim-links a{color:#f0bc7e;display:inline-flex;align-items:center;min-height:40px}'));


// ---------- R36 ----------
const pages = fs.readdirSync(out).filter((f) => f.endsWith('.html'));
const withSub = pages.filter((f) => /class="sub"/.test(read(f)));
t('R36: every page with a sub bar renders it as <nav class="sub" aria-label="Section pages"> (no div.sub left)', withSub.length > 20 && withSub.every((f) => /<nav class="sub" aria-label="Section pages">/.test(read(f)) && !/<div class="sub">/.test(read(f))));
const lvl1 = (h) => (h.match(/<h1[ >]/g) ?? []).length + (h.match(/<(?:h[23]|b)[^>]*aria-level="1"/g) ?? []).length;
t('R36: hub.html, staff.html and scout.html each carry exactly one level-1 heading', ['hub.html', 'staff.html', 'scout.html'].every((f) => lvl1(read(f)) === 1));
t('R36: hub and staff titles are the visible plate text, not the hidden gate', /<b role="heading" aria-level="1">My Locker<\/b>/.test(read('hub.html')) && /<b role="heading" aria-level="1">Staff hub<\/b>/.test(read('staff.html')) && !/aria-level="1">Staff only/.test(read('staff.html')));
t('R36: scout.js renders the player name as the level-1 heading', /<h2 aria-level="1">\$\{esc\(p\.n\)\}<\/h2>/.test(read('scout.js')));
t('R36: scrolling boxes take the keyboard (.tscroll, overflow .flat)', /<div class="tscroll" tabindex="0">/.test(read('tactics.html')) && !/<div class="tscroll">/.test(read('tactics.html')));
t('R36: no heading in <main> skips a level (aria-level is walked in order)', pages.every((f) => { const m = read(f).match(/<main id="main">[\s\S]*?<\/main>/)?.[0] ?? ''; let prev = 0; for (const x of m.matchAll(/<(h[1-6])((?:\s[^>]*)?)>|<b((?:\s[^>]*)?role="heading"[^>]*)>/g)) { const at = x[2] ?? x[3] ?? '', lv = /aria-level="(\d)"/.exec(at), cur = lv ? +lv[1] : +x[1][1]; if (cur > prev + 1) return false; prev = cur; } return true; }));
t('R36: mosaic and gdc hold links, so they are groups, not images', !/class="(mosaic|gdc)" role="img"/.test(read('stats.html')) && /class="mosaic" role="group"/.test(read('stats.html')));

t('R36: header.js repairs headings mounted by script (previous level + 1, aria-level only)', /aria-level', String\(prev \+ 1\)/.test(read('header.js')));


// ---------- R37 ----------
t('R37: body copy is capped at 72ch from 821px (md p, burner intro, muted paragraphs), centred panels excluded', /@media\(min-width:821px\)\{\.md p,\.bn-intro>p,#main :is\(\.wrap,\.sec,\.panel,\.ps-doc\):not\(\[style\*="center"\]\)>p\.muted\{max-width:72ch\}\}/.test(lay));
t('R37: handbook docs share rows from 1100px (auto-fit 480px, align start); phone and tablet stay one column', /@media\(min-width:1100px\)\{\.hb-accs,\.hb-body\{grid-template-columns:repeat\(auto-fit,minmax\(480px,1fr\)\);align-items:start\}/.test(lay));
t('R37: studio.html skips layout.css on purpose, so its caption is capped in tactics.css', /@media\(min-width:821px\)\{#board~p\.muted\.small\{max-width:72ch\}\}/.test(strip(read('tactics.css'))));
done();
