#!/usr/bin/env node
/* Local stand-in for Discord's Activity sandbox, so the watch Activity (next/stream/activity) can be tried and fixed without a deploy and without Discord.
   It copies the parts of Discord that matter here:
     - the page is served from a host like <app id>.discordsays.localhost (the real one is <app id>.discordsays.com),
     - the Developer Portal URL mappings: "/" is the Activity folder, "/.proxy/<name>/..." is another host (default: twitch -> player.twitch.tv, preview -> static-cdn.jtvnw.net),
     - a strict Content-Security-Policy (default mode "strict": everything must come from the Activity's own origin, as Discord's proxy requires),
     - the Embedded App SDK is replaced by a stub (the real one needs Discord's parent window).
   It does not copy Discord's real CSP text (not public), so treat "strict" as the worst realistic case and compare it with --csp off.
   Every request is logged (stdout and /__sim/log) so a blank player shows which address the page asked for and what answered.
   Usage: node tools/activity-sim/server.mjs [--port 5173] [--channel phoenixfirefc] [--csp strict|off] [--strip-frame] [--map name=host ...] [--app-id 1234567890123456789]
   Then open http://<app id>.discordsays.localhost:<port>/  (Chromium resolves *.localhost to this machine). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const ACTIVITY = path.join(repo, 'next/stream/activity');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const STRICT = "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; font-src 'self' data:";
const DROP = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie', 'strict-transport-security', 'keep-alive']);

/** The Phoenix brand and channel the real build writes into the Activity (phoenix/build.mjs), read from config.json the same way. */
function brandAndChannel(channelOverride) {
  const rc = JSON.parse(fs.readFileSync(path.join(repo, 'config.json'), 'utf8')), b = rc.brand || {};
  const ch = channelOverride || /twitch\.tv\/(?:popout\/)?([A-Za-z0-9_]{3,25})/i.exec(rc.streams?.twitch ?? '')?.[1]?.toLowerCase() || '';
  return {
    channel: ch,
    brandJs: `window.PF_BRAND = ${JSON.stringify({ name: 'PHOENIX FIRE', motto: b.motto, accent: b.red, ink: b.ink, goldTop: b.plate?.top, goldBottom: b.plate?.bottom, crest: 'crest-sm.png' })};\n`,
  };
}

/** Stand-in for vendor-discord-sdk.min.js: ready() resolves at once, external links open a tab. */
const SDK_STUB = "window.DiscordSDK = function (id) { this.clientId = id; this.commands = { openExternalLink: function (o) { window.open(o.url, '_blank', 'noopener'); return Promise.resolve(); } }; }; window.DiscordSDK.prototype.ready = function () { return Promise.resolve(); };\n";

/** Twitch names the page host in frame-ancestors with https://; the simulator is http, so allow the same host over http and on the simulator's port too (the real proxy is https). */
function allowHttp(csp, port) { return csp.replace(/frame-ancestors([^;]*)/i, (m, hosts) => 'frame-ancestors' + hosts + hosts.replace(/https:\/\/([^\s;]+)/g, `http://$1${port ? ':' + port : ''}`)); }

export function startSim(opts = {}) {
  const o = { port: 5173, csp: 'strict', stripFrame: false, appId: '1234567890123456789', upstreamScheme: 'https', maps: { twitch: 'player.twitch.tv', preview: 'static-cdn.jtvnw.net' }, ...opts };
  const { channel, brandJs } = brandAndChannel(o.channel), log = [];
  const policy = o.csp === 'off' ? null : STRICT;
  const note = (e) => { e.t = new Date().toISOString().slice(11, 23); log.push(e); if (log.length > 2000) log.shift(); if (!o.quiet) console.log(`${e.t} ${String(e.status).padEnd(3)} ${e.kind.padEnd(7)} ${e.method} ${e.url}${e.note ? '  ← ' + e.note : ''}`); };
  const send = (res, status, type, body, extra = {}) => { const h = { 'content-type': type, 'cache-control': 'no-store', ...extra }; if (policy) h['content-security-policy'] = policy; res.writeHead(status, h); res.end(body); };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname), base = { method: req.method, url: req.url, referer: req.headers.referer ? new URL(req.headers.referer).pathname : '' };
    if (p === '/__sim/log') return send(res, 200, 'application/json', JSON.stringify(log));
    if (p === '/__sim/config') return send(res, 200, 'application/json', JSON.stringify({ appId: o.appId, channel, csp: o.csp, stripFrame: o.stripFrame, maps: o.maps }));

    const m = /^\/\.proxy\/([a-z0-9_-]+)(\/.*)?$/i.exec(p);
    if (m) { // a URL mapping: /.proxy/<name>/... -> https://<host>/...
      const host = o.maps[m[1].toLowerCase()];
      if (!host) { note({ ...base, kind: 'proxy', status: 404, note: `no mapping named "${m[1]}"` }); return send(res, 404, 'text/plain', 'No URL mapping for /' + m[1]); }
      const target = `${o.upstreamScheme}://${host}${m[2] || '/'}${url.search}`;
      try {
        const up = await fetch(target, { redirect: 'manual', headers: { 'user-agent': req.headers['user-agent'] || 'Mozilla/5.0', accept: req.headers.accept || '*/*', 'accept-language': req.headers['accept-language'] || 'en-US,en;q=0.9' } });
        const h = {}; up.headers.forEach((v, k) => { if (!DROP.has(k)) h[k] = v; });
        if (h.location) h.location = h.location.replace(/^https?:\/\/[^/]+/, '/.proxy/' + m[1]); // keep redirects inside the mapping
        const csp = [];
        if (h['content-security-policy'] && !o.stripFrame) csp.push(allowHttp(h['content-security-policy'], /:(\d+)$/.exec(req.headers.host || '')?.[1]));
        delete h['content-security-policy']; if (o.stripFrame) delete h['x-frame-options'];
        if (policy) csp.push(policy);
        h['cache-control'] = 'no-store'; if (csp.length) h['content-security-policy'] = csp.join(', ');
        const buf = Buffer.from(await up.arrayBuffer());
        res.writeHead(up.status, h); res.end(buf);
        const rel = /text\/html/.test(h['content-type'] || '') ? (buf.toString('utf8').match(/(?:src|href)=["']\/(?!\/)/g) || []).length : 0;
        const abs = /text\/html/.test(h['content-type'] || '') ? [...new Set((buf.toString('utf8').match(/<script[^>]+src="https?:\/\/[^"/]+/g) || []).map((s) => s.replace(/.*"https?:\/\//, '')))] : [];
        note({ ...base, kind: 'proxy', status: up.status, bytes: buf.length, note: [rel ? `${rel} root-path refs` : '', abs.length ? `scripts from other hosts: ${abs.join(', ')}` : ''].filter(Boolean).join('; ') });
      } catch (e) { note({ ...base, kind: 'proxy', status: 502, note: String(e.message || e) }); send(res, 502, 'text/plain', 'Proxy error: ' + (e.message || e)); }
      return;
    }

    // "/" is the Activity folder; the files the real build writes are made here the same way
    const name = p === '/' ? 'index.html' : p.slice(1);
    if (name === 'activity-config.js') { note({ ...base, kind: 'root', status: 200 }); return send(res, 200, MIME['.js'], `window.PF_ACTIVITY = ${JSON.stringify({ channel })};\n`); }
    if (name === 'overlay-brand.js') { note({ ...base, kind: 'root', status: 200 }); return send(res, 200, MIME['.js'], brandJs); }
    if (name === 'vendor-discord-sdk.min.js') { note({ ...base, kind: 'root', status: 200, note: 'SDK stub' }); return send(res, 200, MIME['.js'], SDK_STUB); }
    if (name === 'crest-sm.png') { note({ ...base, kind: 'root', status: 200 }); return send(res, 200, 'image/png', fs.readFileSync(path.join(repo, 'phoenix/overlay/crest-sm.png'))); }
    const file = path.join(ACTIVITY, name);
    if (!file.startsWith(ACTIVITY + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { note({ ...base, kind: 'root', status: 404, note: 'not in the Activity folder (the root mapping) — a root-path file from the player lands here' }); return send(res, 404, 'text/plain', 'Not found'); }
    let body = fs.readFileSync(file);
    if (name === 'activity.js') body = body.toString('utf8').replace('discordsays\\.com', 'discordsays\\.localhost'); // the page tests its host name; the simulator's is *.discordsays.localhost
    note({ ...base, kind: 'root', status: 200 });
    send(res, 200, MIME[path.extname(file)] || 'application/octet-stream', body);
  });
  return new Promise((resolve) => server.listen(o.port, '127.0.0.1', () => resolve({ server, log, port: server.address().port, url: `http://${o.appId}.discordsays.localhost:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) })));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const a = process.argv.slice(2), val = (n) => { const i = a.indexOf('--' + n); return i < 0 ? undefined : a[i + 1]; };
  const maps = { twitch: 'player.twitch.tv', preview: 'static-cdn.jtvnw.net' };
  a.forEach((x, i) => { if (x === '--map' && a[i + 1]?.includes('=')) { const [k, v] = a[i + 1].split('='); maps[k] = v; } });
  const s = await startSim({ port: Number(val('port')) || 5173, channel: val('channel'), csp: val('csp') === 'off' ? 'off' : 'strict', stripFrame: a.includes('--strip-frame'), appId: val('app-id') || undefined, maps });
  console.log(`Activity simulator on ${s.url}\n  csp: ${val('csp') === 'off' ? 'off' : 'strict'}   frame headers: ${a.includes('--strip-frame') ? 'stripped' : 'kept'}   log: ${s.url}__sim/log`);
}
