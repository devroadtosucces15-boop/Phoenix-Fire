// One flip moves the Worker host (PLANNING/WORKER-HOST.md, B1). phoenix/worker-host.json holds the current host; every repo
// string that must agree with it is listed in PLACES. Nothing is changed until `flip` runs, after the owner has the new host
// answering in Cloudflare and the Discord portal fields are ready.
//   node phoenix/worker-host.mjs check               every place still agrees with worker-host.json (exit 1 if not)
//   node phoenix/worker-host.mjs flip <https://host> rewrite every place + worker-host.json, add the custom-domain route
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOST_FILE = 'phoenix/worker-host.json';
// file -> what must hold (the host appears here). `runtime` places are read by code; the rest are docs and records.
export const PLACES = [
  { file: 'config.json', runtime: true, what: 'members.api (site pages call the member API here)' },
  { file: 'phoenix/live.json', runtime: true, what: 'api (live site builds)' },
  { file: 'bot/wrangler.toml', runtime: true, what: 'PUBLIC_URL (Card Studio media links)' },
  { file: 'bot/SECRETS-REGISTRY.md', runtime: false, what: 'core OAuth redirect record' },
  { file: 'CLAUDE.md', runtime: false, what: 'Known leftovers note' },
];
const read = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');
const origin = (u) => new URL(u).origin;
const bare = (u) => new URL(u).hostname; // docs sometimes write the host without https://

export function currentHost(root) { return origin(JSON.parse(read(root, HOST_FILE)).current); }

export function check(root) {
  const host = bare(currentHost(root));
  return PLACES.filter((p) => !read(root, p.file).includes(host)).map((p) => `${p.file}: does not contain ${host} (${p.what})`);
}

export function flip(root, next) {
  const to = origin(next);
  if (!/^https:\/\//.test(to)) throw new Error('The new host must be an https URL');
  const from = currentHost(root);
  if (from === to) return { from, to, changed: [] };
  const changed = [];
  for (const p of PLACES) {
    const f = path.join(root, p.file), s = fs.readFileSync(f, 'utf8');
    const n = s.split(from).join(to).split(bare(from)).join(bare(to));
    if (n !== s) { fs.writeFileSync(f, n); changed.push(p.file); }
  }
  // A custom domain needs a route (a workers.dev host does not); the old workers.dev host stays on until the owner retires it.
  const hostname = new URL(to).hostname;
  const toml = path.join(root, 'bot/wrangler.toml'), t = fs.readFileSync(toml, 'utf8');
  if (!/\.workers\.dev$/.test(hostname) && !t.includes(`pattern = "${hostname}"`)) {
    fs.writeFileSync(toml, `${t.replace(/\n*$/, '\n')}\n# Worker custom domain (phoenix/worker-host.mjs flip). The workers.dev address keeps answering until it is retired.\n[[routes]]\npattern = "${hostname}"\ncustom_domain = true\n`);
    changed.push('bot/wrangler.toml (route)');
  }
  const meta = JSON.parse(read(root, HOST_FILE));
  fs.writeFileSync(path.join(root, HOST_FILE), JSON.stringify({ ...meta, current: to }, null, 2) + '\n');
  changed.push(HOST_FILE);
  return { from, to, changed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'check') {
    const bad = check(root);
    if (bad.length) { bad.forEach((b) => console.log(`✘ ${b}`)); process.exit(1); }
    console.log(`✔ every place agrees on ${currentHost(root)}`);
  } else if (cmd === 'flip' && arg) {
    const r = flip(root, arg);
    console.log(`Worker host ${r.from} -> ${r.to}\n  changed: ${r.changed.join(', ') || 'nothing'}`);
  } else { console.log('usage: node phoenix/worker-host.mjs check | flip <https://host>'); process.exit(2); }
}
