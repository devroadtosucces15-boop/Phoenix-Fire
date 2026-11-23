// The Activity simulator (tools/activity-sim): a local stand-in for Discord's Activity sandbox. Checked against a local stub instead of Twitch.
import http from 'node:http';
import { t, tt, done } from './lib.mjs';
import { startSim } from '../tools/activity-sim/server.mjs';

const stub = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'image/jpeg', 'content-security-policy': 'frame-ancestors https://abc.discordsays.localhost' }); res.end('JPEGBYTES'); });
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const up = `127.0.0.1:${stub.address().port}`;
const sim = await startSim({ port: 0, quiet: true, upstreamScheme: 'http', maps: { preview: up } });
const base = `http://127.0.0.1:${sim.port}`;
const get = (p, h = {}) => fetch(base + p, { headers: h });

await tt('the root mapping serves the Activity page with the club channel from config.json', async () => { const r = await get('/'), b = await (await get('/activity-config.js')).text(); return r.status === 200 && /"channel":"[a-z0-9_]{3,25}"/.test(b); });
await tt('the page host test is moved to *.discordsays.localhost, the source file stays untouched', async () => /discordsays\\\.localhost/.test(await (await get('/activity.js')).text()));
await tt('a URL mapping /.proxy/<name>/ answers from the mapped host', async () => { const r = await get('/.proxy/preview/a.jpg'); return r.status === 200 && (await r.text()) === 'JPEGBYTES'; });
await tt('an unmapped name is a 404, like Discord with no mapping', async () => (await get('/.proxy/nope/x')).status === 404);
await tt('a root-path file that is not in the Activity folder is a 404 and is logged', async () => { await get('/assets/x.js'); return sim.log.some((e) => e.kind === 'root' && e.status === 404 && e.url === '/assets/x.js'); });
await tt('strict mode sends a CSP that allows only the Activity origin for scripts and frames', async () => { const c = (await get('/')).headers.get('content-security-policy') || ''; return /script-src 'self'/.test(c) && /frame-src 'self'/.test(c); });
await tt("the upstream frame-ancestors is widened to the simulator's http host and port", async () => (await get('/.proxy/preview/a.jpg', { host: `abc.discordsays.localhost:${sim.port}` })).headers.get('content-security-policy').includes(`http://abc.discordsays.localhost:${sim.port}`));
await tt('csp off sends no policy', async () => { const s2 = await startSim({ port: 0, quiet: true, csp: 'off' }); const r = await fetch(s2.url.replace('1234567890123456789.discordsays.localhost', '127.0.0.1')); const ok = !r.headers.get('content-security-policy'); await s2.close(); return ok; });
t('the simulator names no other club', !/norex|c8352c/i.test(await (await get('/overlay-brand.js')).text()));

await sim.close(); stub.close();
done();
