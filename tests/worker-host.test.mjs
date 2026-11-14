// B1 prep: the Worker host lives in phoenix/worker-host.json and one flip moves every place that names it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { t, done } from './lib.mjs';
import { PLACES, check, flip, currentHost, HOST_FILE } from '../phoenix/worker-host.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
t('every place agrees with worker-host.json today', check(ROOT).length === 0);
t('config.json members.api is the current host', JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).members.api === currentHost(ROOT));
t('live.json api is the current host', JSON.parse(fs.readFileSync(path.join(ROOT, 'phoenix/live.json'), 'utf8')).api === currentHost(ROOT));
t('wrangler PUBLIC_URL is the current host', new RegExp(`PUBLIC_URL = "${currentHost(ROOT).replace(/\./g, '\\.')}"`).test(fs.readFileSync(path.join(ROOT, 'bot/wrangler.toml'), 'utf8')));

// flip on a scratch copy
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-'));
for (const f of [...PLACES.map((p) => p.file), HOST_FILE]) { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)); }
const r = flip(tmp, 'https://api.example-phoenix.com/some/path');
t('flip reports the new origin only', r.to === 'https://api.example-phoenix.com');
t('every place now names the new host', check(tmp).length === 0 && PLACES.every((p) => fs.readFileSync(path.join(tmp, p.file), 'utf8').includes('api.example-phoenix.com')));
t('the old host is gone from the runtime places', PLACES.filter((p) => p.runtime).every((p) => !fs.readFileSync(path.join(tmp, p.file), 'utf8').includes(r.from)));
const toml = fs.readFileSync(path.join(tmp, 'bot/wrangler.toml'), 'utf8');
t('a custom domain adds the route once', (toml.match(/\[\[routes\]\]/g) || []).length === 1 && /pattern = "api\.example-phoenix\.com"/.test(toml) && /custom_domain = true/.test(toml));
flip(tmp, 'https://api.example-phoenix.com');
t('flipping to the same host is a no-op', (fs.readFileSync(path.join(tmp, 'bot/wrangler.toml'), 'utf8').match(/\[\[routes\]\]/g) || []).length === 1);
t('worker-host.json records the new host', currentHost(tmp) === 'https://api.example-phoenix.com');
let threw = false; try { flip(tmp, 'http://insecure.example'); } catch { threw = true; }
t('an http host is refused', threw);
done();
