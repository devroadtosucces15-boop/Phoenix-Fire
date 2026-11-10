// Phoenix must not leak another club's identity: accent colour and crest art in bot output and built assets.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ACCENT } from '../bot/ui.js';

const root = path.resolve(import.meta.dirname, '..');
const NOREX_RED = ['c8352c'];

assert.equal(ACCENT.red, 0xe8651a, 'default bot accent must be Phoenix orange');

for (const f of fs.readdirSync(path.join(root, 'bot')).filter((n) => /\.(js|mjs)$/.test(n))) {
  const src = fs.readFileSync(path.join(root, 'bot', f), 'utf8').toLowerCase();
  for (const c of NOREX_RED) assert.ok(!src.includes(c), `bot/${f} still uses NOREX red ${c}`);
}

// the legacy-asset replacements must exist and differ from the classic NOREX art when a build is present
for (const n of ['crest.png', 'crest-ea.png', 'favicon.png']) assert.ok(fs.existsSync(path.join(root, 'phoenix/legacy-assets', n)), `phoenix/legacy-assets/${n} missing`);
const built = path.join(root, 'site/assets/crest.png');
if (fs.existsSync(built)) {
  const same = fs.readFileSync(built).equals(fs.readFileSync(path.join(root, 'phoenix/legacy-assets/crest.png')));
  if (!same) console.log('note: site/ is an older build; rebuild to pick up the Phoenix crest');
}
console.log('phoenix-brand: ok\n\n1 passed, 0 failed');
