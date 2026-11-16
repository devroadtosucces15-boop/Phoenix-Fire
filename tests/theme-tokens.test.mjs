// PF-010: the staff-hub gold plate and the search palette / menu surfaces take their colours from config.json brand tokens,
// and the built Phoenix site shows no NOREX blue-black, NOREX red or hardcoded gold in those rules.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { t, done } from './lib.mjs';

const root = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8')).brand;
const COOL = /#(c8352c|080b11|151c2a|0f151f|e9c56a|b88a2e)\b|rgba\(4,\s*6,\s*10/i;

t('config.json brand has plate and palette tokens', !!(brand.plate?.top && brand.plate?.bottom && brand.palette?.top && brand.palette?.bottom && brand.palette?.veil));
for (const f of ['next/static/staffhub.css', 'next/static/header.css']) t(`${f} source has no hardcoded gold or NOREX blue-black`, !COOL.test(fs.readFileSync(path.join(root, f), 'utf8')));
t('staffhub.css plate reads var(--plate-*)', /\.adm-plate\{[^}]*var\(--plate-top[^}]*var\(--plate-bottom/.test(fs.readFileSync(path.join(root, 'next/static/staffhub.css'), 'utf8')));
t('header.css palette reads var(--pal-*)', /\.hdr-pal\{[^}]*var\(--pal-veil/.test(fs.readFileSync(path.join(root, 'next/static/header.css'), 'utf8')) && /\.hdr-pal \.pbox\{[^}]*var\(--pal-top[^}]*var\(--pal-bottom/.test(fs.readFileSync(path.join(root, 'next/static/header.css'), 'utf8')));

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-'));
try {
  execFileSync('node', [path.join(root, 'phoenix/build.mjs'), '--out', out], { stdio: 'pipe', cwd: root, maxBuffer: 1 << 28 });
  const css = (f) => fs.readFileSync(path.join(out, f), 'utf8');
  const tok = css('phoenix.css');
  for (const [k, v] of [['plate-top', brand.plate.top], ['plate-bottom', brand.plate.bottom], ['pal-top', brand.palette.top], ['pal-bottom', brand.palette.bottom], ['pal-veil', brand.palette.veil]]) t(`built phoenix.css sets --${k} from config`, tok.includes(`--${k}:${v}`));
  for (const f of ['staffhub.css', 'header.css']) t(`built ${f} has no NOREX blue-black or hardcoded gold`, !COOL.test(css(f)));
  const all = fs.readdirSync(out).filter((f) => /\.(css|js)$/.test(f)).concat(fs.existsSync(path.join(out, 'assets')) ? fs.readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.css')).map((f) => 'assets/' + f) : []);
  t('no built css or js shows #c8352c or #080b11', all.every((f) => !/#(c8352c|080b11)\b/i.test(css(f))));
} finally { fs.rmSync(out, { recursive: true, force: true }); }
done();
