// Visual roadmap snapshot for the private Artifact "Phoenix Roadmap".
//   node tools/brain/roadmap-page.mjs [--out path]   writes tools/brain/out/roadmap-snapshot.html (git-ignored), prints size and build time.
// A session then publishes that file with the Artifact tool (PLANNING/SESSION-HANDOFF.md section 7). No runtime capability is needed.
// The page is the same renderer the local dashboard serves at /roadmap (roadmap-view.mjs); data is embedded and redacted, and the page says its build time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoadmapData, renderRoadmapPage } from './roadmap-view.mjs';
import { ROOT } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.join(HERE, 'out', 'roadmap-snapshot.html');
export const SECRETISH = [/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /\b[0-9a-f]{32,}\b/, /\b\d{17,20}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

export function buildRoadmapSnapshot({ now = new Date() } = {}) {
  const crest = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'phoenix/overlay/crest-sm.png')).toString('base64');
  const html = renderRoadmapPage({ data: buildRoadmapData({ now }), mode: 'snapshot', crest });
  const bad = SECRETISH.find((re) => re.test(html.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/, '')));
  if (bad) throw new Error('roadmap-page.mjs: a secret-shaped string reached the page: ' + bad);
  return html;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? path.resolve(process.argv[i + 1]) : DEFAULT_OUT;
  const html = buildRoadmapSnapshot();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB), built ${new Date().toISOString()}`);
}
