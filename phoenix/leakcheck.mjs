// Fails a Phoenix build whose OUTPUT still shows another club's identity.
// next/ and web/ are shared sources (they may still say NOREX); only what members can see is checked:
// visible html text and attributes (scripts and styles excluded: internal identifiers such as norex.* storage keys stay on purpose),
// the manifest, and the NOREX palette in css/html/js/manifest.
import fs from 'node:fs'; import path from 'node:path';

const NAME = /\bnorex\b(?![-_.])/i;               // a brand name, not norex_session / norex.as / norex-media
const PALETTE = /#?(c8352c|080b11)\b/i;          // NOREX red and NOREX blue-black
const strip = (h) => h.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

export function findLeaks(out) {
  const leaks = [];
  for (const f of walk(out)) {
    const rel = path.relative(out, f); const ext = path.extname(f).toLowerCase();
    if (!['.html', '.css', '.js', '.webmanifest'].includes(ext)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const seen = ext === '.html' ? strip(src) : ext === '.webmanifest' ? src : '';
    const name = seen.match(NAME); if (name) leaks.push(`${rel}: NOREX name near "${seen.slice(Math.max(0, name.index - 20), name.index + 30).replace(/\s+/g, ' ')}"`);
    const pal = src.match(PALETTE); if (pal) leaks.push(`${rel}: NOREX colour ${pal[0]}`);
  }
  return leaks;
}

export function assertNoLeaks(out, onFail = (m) => { throw new Error(m); }) {
  const leaks = findLeaks(out);
  if (leaks.length) onFail(`phoenix: ${leaks.length} NOREX leak(s) in the built output:\n  ` + leaks.slice(0, 25).join('\n  ') + (leaks.length > 25 ? `\n  ... and ${leaks.length - 25} more` : ''));
}
