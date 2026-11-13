// Builds the Phoenix share art from share.svg: an animated SVG (phoenix/overlay/share-animated.svg) and the 1200x630 PNG (phoenix/overlay/share.png).
// Needs Chromium (Playwright's or the system one). Run: node phoenix/share-art/make.mjs
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const here = import.meta.dirname, overlay = path.join(here, '../overlay');
const crest = fs.readFileSync(path.join(overlay, 'crest-sm.png')).toString('base64');
const svg = fs.readFileSync(path.join(here, 'share.svg'), 'utf8').replace('href="CREST"', `href="data:image/png;base64,${crest}"`);
fs.writeFileSync(path.join(overlay, 'share-animated.svg'), svg);
const tmp = path.join(process.env.TMPDIR || '/tmp', 'share-render.html');
fs.writeFileSync(tmp, `<!doctype html><body style="margin:0;background:#0a0705">${svg}</body>`);
const chrome = ['/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
execFileSync(chrome, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--window-size=1200,630', '--virtual-time-budget=1800', `--screenshot=${path.join(overlay, 'share.png')}`, 'file://' + tmp], { stdio: 'ignore' });
console.log('share.png + share-animated.svg written');
