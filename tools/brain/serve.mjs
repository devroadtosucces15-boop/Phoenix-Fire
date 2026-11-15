// Project brain: local live dashboard. No dependencies.
//   node tools/brain/serve.mjs [--port 4577]     then open http://127.0.0.1:4577 (app mode: chrome --app=http://127.0.0.1:4577)
// Serves tools/brain/index.html and /api/model; /events pushes "change" when a library file changes, so the open window stays current.
// Binds to 127.0.0.1 only: private to this computer. Read-only except the two Brainstorm routes (local, JSON, size-capped).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { model, WATCH, ROOT } from './lib.mjs';
import { addNote, setStatus } from './inbox.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png' };
const clients = new Set();
const MAX_BODY = 4096;
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const LOCAL_ADDR = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };

// Write routes (POST /api/inbox, POST /api/inbox/<id>): this computer only, JSON text only, body capped. Anything else is refused.
function writeRoute(req, res, url) {
  if (!LOCAL_ADDR.has(req.socket.remoteAddress) || !LOCAL_HOST.test(req.headers.host || '')) return json(res, 403, { error: 'local requests only' });
  const origin = req.headers.origin;
  if (origin && !LOCAL_HOST.test(origin.replace(/^https?:\/\//, ''))) return json(res, 403, { error: 'local requests only' });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'send application/json' });
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) { req.resume(); return json(res, 413, { error: 'body too large' }); }
  let body = ''; let over = false;
  req.on('data', (d) => { body += d; if (body.length > MAX_BODY) { over = true; req.destroy(); } });
  req.on('close', () => { if (over && !res.writableEnded) json(res, 413, { error: 'body too large' }); });
  req.on('end', () => {
    if (over) return;
    let b; try { b = JSON.parse(body); } catch { return json(res, 400, { error: 'bad json' }); }
    const id = url.pathname.slice('/api/inbox/'.length);
    const r = url.pathname === '/api/inbox' ? addNote(b && b.text, b && b.source) : setStatus(id, b && b.status);
    json(res, r.ok ? 200 : 400, r);
  });
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && (url.pathname === '/api/inbox' || /^\/api\/inbox\/[\w-]+$/.test(url.pathname))) return writeRoute(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { 'content-type': 'text/plain' }); res.end('method not allowed'); return; }
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
