// R45: the Control Center is reachable (dock Manager and Admin views, staff hub tile), gated to managers and the owner, laid out
// with min-width rules only, and the merged page brings no NOREX name, colour or crest into the Phoenix build.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ccn-'));
execFileSync(process.execPath, ['next/build.mjs', '--out', out, '--preview'], { cwd: ROOT, stdio: 'pipe' });
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const dock = read('dock.js'), staff = read('staff.html'), cc = read('staff-controlcenter.html'), css = strip(read('controlcenter.css')), lay = strip(read('layout.css'));
const grab = (name, to) => dock.match(new RegExp(`const ${name} = \\[[\\s\\S]*?\\n  ${to}`))?.[0] ?? '';

t('R45: the page is built under its real filename and is gated by the owner/manager sign-in (data-for owner, staff gate for the rest)', cc.includes('<h2') && cc.includes('data-for="owner"') && cc.includes('id="ccLive"') && cc.includes('Staff only'));
t('R45: the dock Manager list (STAFF) has a Control Center group, so managers and the owner reach it', /const STAFF = \[[\s\S]*\['Control Center', \[\['staff-controlcenter\.html', '🎛️', 'Control Center'\]\]\]\];/.test(dock));
t('R45: the dock Admin list (OWNER) lists Control Center next to the Boardroom (Boardroom stays first)', /\['Owner controls', \[\['staff-boardroom\.html', '👑', 'Boardroom'\], \['staff-controlcenter\.html', '🎛️', 'Control Center'\]/.test(dock));
t('R45: only the Manager (isStaff) and Admin (isOwner) views render those lists; members and guests get no slicer and no staff link', dock.includes('STAFF.map(staffGroup)') && dock.includes('OWNER.map(staffGroup)') && dock.includes("...(isStaff() ? ['manager'] : [])") && dock.includes("...(isOwner() ? ['admin'] : [])") && !/memberBody = [\s\S]*?staff-controlcenter[\s\S]*?const progress/.test(dock));
t('R45: the quick dial offers it to managers and the owner through the same STAFF list (staff only, deduplicated)', dock.includes("if (isStaff()) STAFF.forEach(([, items]) => items.forEach(([h, e, l]) => add(h, l, e)))"));
t('R45: the staff hub has the Control Center tile in the staff groups (managers and owner), pointing at the built page', (() => { const i = staff.indexOf('<h2>Control Center</h2>'); return i > 0 && /href="staff-controlcenter\.html"/.test(staff.slice(i, i + 900)) && staff.lastIndexOf('class="adm-g adm-owner"', i) < staff.indexOf('class="adm-g adm-owner"'); })());
t('R45: dock and hub name no channel or role (wording only, no Discord ID)', !/\b\d{17,20}\b/.test(dock + staff.slice(staff.indexOf('<main'), staff.indexOf('</main>')) + cc.slice(cc.indexOf('<main'), cc.indexOf('</main>'))));
t('R45 layout: every new Control Center rule sits in a min-width query (phone output unchanged), ids untouched', (() => { const i = css.indexOf('@media(min-width:900px)'); const tail = css.slice(i); return i > 0 && /^(@media\(min-width:(900|700)px\)\{[^@]*\}\s*)+$/.test(tail.trim()) && cc.includes('id="ccLive"') && cc.includes('id="ccLocal"'); })());
t('R45 layout: the panel switches are four even columns from 900px with a 40px target, the hint keeps a 90ch measure, the back link is a 24px target', /min-width:900px\)\{\.cc-slicer\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}\.cc-slicer \.chip\{[^}]*min-height:40px/.test(css) && css.includes('max-width:90ch') && css.includes('min-height:24px'));
t('R45 layout: Boardroom tiles fill the row, eight tiles make two even rows, the note has space, and the dead band under staff pages is cut from 821px up only', /@media\(min-width:821px\)\{\.br-tools\{grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,190px\),1fr\)\)\}\.br-tools:has\(>:nth-child\(8\):last-child\)\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}\.br-tools\+p\.muted\{margin-top:16px\}body\.room-staff main\{padding-bottom:56px\}\}/.test(lay));
t('R45 layout: no colour in the new rules (Phoenix tokens and existing styles only)', !/R45[\s\S]*#[0-9a-f]{3,6}/i.test(read('controlcenter.css').slice(read('controlcenter.css').indexOf('R45'))) );
// branding: the merged page and its assets, from the Phoenix build (the shared next/ preview build still says NOREX by design)
const pout = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-'));
execFileSync(process.execPath, ['phoenix/build.mjs', '--out', pout], { cwd: ROOT, stdio: 'pipe' });
const pread = (f) => fs.readFileSync(path.join(pout, f), 'utf8');
const vis = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
t('R45 brand: the Control Center page shows no NOREX name and no NOREX red or blue-black in html, css or script', !/norex/i.test(vis(pread('staff-controlcenter.html'))) && !/c8352c|080b11/i.test(pread('staff-controlcenter.html') + pread('controlcenter.css') + pread('controlcenter.js')) && pread('staff-controlcenter.html').includes('PHOENIX'));
t('R45 brand: the Control Center script and styles read channels and roles from the API, never a name or ID', !/#[a-z][\w-]{2,}-?(channel|chat)|\b\d{17,20}\b/.test(read('controlcenter.js')) && read('controlcenter.js').includes('/api/controlcenter/discord'));
done();
