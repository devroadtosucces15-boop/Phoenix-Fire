// GIF maker converter (see .github/workflows/gif-convert.yml, PF-024 Item 21). Runs in GitHub Actions, where ffmpeg is allowed and the Worker is not.
//   1. GET  /api/gif/input?ref=…   the member's video (the Worker only hands it out while the job is `converting`)
//   2. ffprobe length check, then ffmpeg with fixed arguments (palette GIF; width, fps and caps from config.json `gif`)
//   3. POST /api/gif/result?ref=…  the GIF (the Worker stores it and edits the member's reply)  or  POST /api/gif/fail?ref=…&code=…
// The video is untrusted: it is written to a fixed file name, handed to ffprobe/ffmpeg as an argument array (no shell), with a stripped environment (no secrets), a timeout and the
// local-file protocol whitelist. The shared key is only ever sent to the Worker.
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gifKey } from '../bot/gifkey.js';
import { IN_FILE, OUT_FILE, REF_RE, convertLimits, probeArgs, ffmpegArgs, ladder, GIF_MAGIC } from './gif-lib.mjs';

const run = promisify(execFile);
const { GIF_REF: ref, DISCORD_CLIENT_SECRET: secret } = process.env;
const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const api = (config.members?.api ?? config.membersApi ?? '').replace(/\/$/, '');
if (!REF_RE.test(ref ?? '') || !secret || !api) { console.error('gif: missing or bad input'); process.exit(1); }
const lim = convertLimits(config.gif);
const headers = { 'X-Phoenix-Key': await gifKey(secret) };
const sandboxEnv = { PATH: process.env.PATH, LANG: 'C' }; // ffmpeg never sees the secret

const fail = async (code) => {
  console.log(`gif ${ref}: failed (${code})`);
  const res = await fetch(`${api}/api/gif/fail?ref=${ref}&code=${code}`, { method: 'POST', headers }).catch(() => null);
  console.log(`worker answered ${res?.status ?? 'nothing'}`);
  process.exit(res?.ok ? 0 : 1); // the workflow still ends cleanly when the Worker took the failure; the Worker's own timeout covers a lost call
};

const input = await fetch(`${api}/api/gif/input?ref=${ref}`, { headers, signal: AbortSignal.timeout(60_000) }).catch(() => null);
if (!input?.ok) { console.error(`gif: input not available (${input?.status})`); await fail('other'); }
fs.writeFileSync(IN_FILE, Buffer.from(await input.arrayBuffer()));

let secs = 0;
try {
  const { stdout } = await run('ffprobe', probeArgs(), { env: sandboxEnv, timeout: 30_000 });
  secs = Number(String(stdout).trim());
} catch { await fail('unreadable'); }
if (!Number.isFinite(secs) || secs <= 0) await fail('unreadable');
if (secs > lim.maxSeconds + 0.5) await fail('too_long');

let done = null;
for (const step of ladder(lim)) {
  try { await run('ffmpeg', ffmpegArgs({ ...step, maxSeconds: lim.maxSeconds }), { env: sandboxEnv, timeout: 120_000, maxBuffer: 1 << 20 }); } catch { await fail('unreadable'); }
  const buf = fs.readFileSync(OUT_FILE);
  if (!GIF_MAGIC(buf)) await fail('unreadable');
  if (buf.length <= lim.maxOutMb * 1e6) { done = { buf, ...step }; break; }
  console.log(`gif ${ref}: ${buf.length} bytes at ${step.width}px is over the cap, trying smaller`);
}
if (!done) await fail('too_big');

const q = new URLSearchParams({ ref, secs: String(Math.min(secs, lim.maxSeconds).toFixed(1)), w: String(done.width), fps: String(done.fps) });
const res = await fetch(`${api}/api/gif/result?${q}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'image/gif' }, body: done.buf, signal: AbortSignal.timeout(90_000) });
console.log(`gif ${ref}: ${done.buf.length} bytes, ${done.width}px, ${done.fps} fps → worker answered ${res.status}`);
if (!res.ok) process.exit(1);
