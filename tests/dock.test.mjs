// The dock: Phoenix ring + Staff pill replace the compass, owner stamp, gear and preview toolbar; pins are saved on the account.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';
import { cleanPins } from '../bot/members.js';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-'));
execFileSync(process.execPath, ['next/build.mjs', '--out', out, '--preview'], { cwd: ROOT, stdio: 'pipe' });
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
const js = read('dock.js'), css = read('dock.css');
t('dock ships and loads on a normal page and a hub page', ['hub.html', 'index.html', 'staff.html'].every((f) => read(f).includes('src="dock.js"') && read(f).includes('href="dock.css"')));
t('old floating controls are hidden once the dock mounts', /\.pf-dock \.nv-fab[^{]*\.ofab[^{]*\.gr-fab[^{]*\.devbar[^{]*\.devgear/.test(css));
t('hub context lists hub rooms only, main context lists site menus only, Staff never in the ring', js.includes("!/^staff/.test(a.getAttribute('href'))") && js.includes("!/^(hub|staff)/.test(g.href)"));
t('staff pill is for owner and manager; owner groups only for the owner', js.includes("role() === 'owner' || role() === 'manager'") && js.includes('isOwner() ? [...STAFF, ...OWNER] : STAFF'));
t('pins are saved to the account (pins, spins) and mirrored in localStorage', js.includes("'/api/me/prefs'") && js.includes("store('pins', 'pins')") && js.includes("store('spins', 'spins')"));
t('server keeps only safe pins (relative paths, max 12)', cleanPins([['hub.html', 'Hub', '🔐'], ['https://x.y', 'bad'], ['javascript:1', 'bad'], ['a b', 'bad'], ...Array.from({ length: 20 }, (_, i) => [`p${i}.html`, 'x'])]).length === 12 && cleanPins([['https://evil', 'x']]).length === 0);
t('dock has no NOREX name and no hardcoded NOREX colours', !/norex|#c8352c|#080b11/i.test(js.replace(/NOREX_API|window\.NOREX\b|NorexAuth|NorexAs|NorexDock|w\.NOREX/g, '') + css));
done();
