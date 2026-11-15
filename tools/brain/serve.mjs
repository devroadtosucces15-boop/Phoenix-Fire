// Project brain: local live dashboard. No dependencies.
//   node tools/brain/serve.mjs [--port 4577]     then open http://127.0.0.1:4577 (app mode: chrome --app=http://127.0.0.1:4577)
// Serves tools/brain/index.html and /api/model; /events pushes "change" when a library file changes, so the open window stays current.
// Binds to 127.0.0.1 only: private to this computer.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { model, WATCH, ROOT } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png' };
const clients = new Set();

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/model') {
      try { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(model())); }
      catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message || e) })); }
      return;
    }
    if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 2000\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (url.pathname === '/crest.png') { res.writeHead(200, { 'content-type': MIME['.png'] }); res.end(fs.readFileSync(path.join(ROOT, 'phoenix/overlay/crest-sm.png'))); return; }
    if (url.pathname === '/' || url.pathname === '/index.html') { res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }); res.end(fs.readFileSync(path.join(HERE, 'index.html'))); return; }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
  });
}

export function watch() {
  let timer = null;
  const ping = () => { clearTimeout(timer); timer = setTimeout(() => { for (const c of clients) c.write(`event: change\ndata: ${Date.now()}\n\n`); }, 150); };
  const ws = WATCH.map((p) => fs.watch(path.join(ROOT, p), { recursive: false }, ping));
  return () => { clearTimeout(timer); ws.forEach((w) => w.close()); for (const c of clients) c.end(); };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port');
  const port = i > 0 ? Number(process.argv[i + 1]) : 4577;
  createServer().listen(port, '127.0.0.1', () => console.log(`Phoenix brain: http://127.0.0.1:${port}`));
  watch();
}
