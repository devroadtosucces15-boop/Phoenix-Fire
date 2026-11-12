// Fails (exit 1) when the Discord card step left no usable output: no manifest, no banners, or a listed picture missing on disk.
// Run by update.yml after "Draw Discord cards" (which is continue-on-error so a card problem never blocks the site).
//   node scripts/check-cards.mjs [siteDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function checkCards(siteDir) {
  const problems = [];
  const manifestFile = path.join(siteDir, 'api', 'cards.json');
  if (!fs.existsSync(manifestFile)) return [`no manifest at ${manifestFile}`];
  let m;
  try { m = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (e) { return [`manifest is not valid JSON: ${e.message}`]; }
  if (!m.banner || !Object.keys(m.banner).length) problems.push('manifest lists no banners');
  const files = [];
  const walk = (o) => { for (const v of Object.values(o ?? {})) { if (typeof v === 'string' && /\.png$/.test(v)) files.push(v); else if (v && typeof v === 'object') walk(v); } };
  walk({ ...m, v: undefined, at: undefined, base: undefined });
  if (!files.length) problems.push('manifest lists no pictures');
  const missing = files.filter((f) => !fs.existsSync(path.join(siteDir, 'cards', f)));
  if (missing.length) problems.push(`${missing.length} listed picture(s) missing on disk, e.g. ${missing[0]}`);
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const siteDir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../site', import.meta.url)));
  const problems = checkCards(siteDir);
  if (problems.length) { for (const p of problems) console.log(`::error title=Discord cards::${p}`); process.exit(1); }
  console.log('✔ card manifest and pictures present');
}
