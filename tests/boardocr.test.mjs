// Offline Rush leaderboard reader (tools/board-ocr) and the optional hook in bot/scanocr.js scanBoard().
// The reader's JSON is checked against the real cleanBoard(); the HTTP call and the vision model are faked.
// If a Python env with the reader's requirements exists (BOARD_OCR_PY or tools/board-ocr/.venv) the CLI also runs on the sample photo.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { t, tt, done } from './lib.mjs';
import { cleanBoard, scanBoard } from '../bot/scanocr.js';

const DIR = fileURLToPath(new URL('../tools/board-ocr/', import.meta.url));
const golden = JSON.parse(fs.readFileSync(`${DIR}sample/rush-board.golden.json`, 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const IMG = 'data:image/png;base64,' + 'A'.repeat(3000);

// ---------- the reader's JSON is what cleanBoard() takes ----------
const c = cleanBoard(golden, { ours: 'Phoenix Fire' });
t('golden: 15 rows, all numbers kept', c.rows.length === 15 && c.rows[0].vp === 12539 && c.rows[0].gp === 7464 && c.rows[14].vp === 1919);
t('golden: our row found by name (rank 2)', c.us === 1 && c.rows[c.us].club === 'Phoenix Fire');
t('golden: no errors, no checksum warnings (every row has VP ÷ M = AVG VP)', c.qc.errors.length === 0 && c.qc.warnings.length === 0);
t('golden: touching VP/GP were split (12,539 / 7,464)', c.rows[0].vp === 12539 && c.rows[0].gp === 7464 && c.rows[0].m === 50);
t('golden: the highlighted row is reported', golden.highlighted_rank === 1);
t('golden: uncertain rows are flagged for review, not hidden', golden.meta.needs_review && golden.meta.review_ranks.join() === '1,14');
t('golden: the pinned bottom row is not listed twice', new Set(golden.rows.map((r) => r.rank)).size === golden.rows.length);

// ---------- scanBoard hook ----------
const env = { BOARD_OCR_URL: 'http://127.0.0.1:8788/', BOARD_OCR_KEY: 'k'.repeat(20) };
let visionCalls = 0, fetched = null;
env.AI = { run: async (model, input) => {
  if (input.prompt === 'agree') return {};
  visionCalls++;
  return { response: JSON.stringify({ highlighted_rank: 2, rows: golden.rows.slice(0, 6).map((r) => ({ rank: r.rank, club: r.club, vp: r.vp, gp: r.gp, m: r.m, bfg: r.bfg, avg_vp: r.avg_vp })) }) };
} };
const realFetch = globalThis.fetch;
const offline = (res) => { globalThis.fetch = async (url, init) => { fetched = { url: String(url), init }; return res(); }; };
const ok = (obj) => () => new Response(JSON.stringify(obj), { status: 200 });

offline(ok(golden));
const a = await scanBoard(env, IMG, { ours: 'Phoenix Fire' });
t('hook: offline read is used, the vision model is not called', a.source === 'offline' && visionCalls === 0 && a.rows.length === 15);
t('hook: posts to <url>/scan with the bearer key and the image', fetched.url === 'http://127.0.0.1:8788/scan' && fetched.init.headers.Authorization === `Bearer ${env.BOARD_OCR_KEY}` && JSON.parse(fetched.init.body).image === IMG);
t('hook: rows the reader was unsure about become a warning for the review step', a.qc.warnings.some((w) => /rank(s)? 1, 14/.test(w)));

offline(() => new Response('nope', { status: 500 }));
const b = await scanBoard(env, IMG, { ours: 'Phoenix Fire' });
t('hook: a failing reader falls back to the vision model', b.source === 'vision' && visionCalls === 1 && b.rows.length === 6);

offline(() => { throw new Error('connection refused'); });
const d = await scanBoard(env, IMG, { ours: 'Phoenix Fire' });
t('hook: an unreachable reader falls back too', d.source === 'vision' && visionCalls === 2);

const bad = clone(golden); bad.highlighted_rank = null; bad.rows.forEach((r) => { r.club = `Club ${r.rank}`; });   // our club missing = cleanBoard error
offline(ok(bad));
const e = await scanBoard(env, IMG, { ours: 'Phoenix Fire' });
t('hook: a read cleanBoard rejects (our club not found) falls back to the vision model', e.source === 'vision' && visionCalls === 3);

offline(ok({ rows: golden.rows.slice(0, 2) }));
const f = await scanBoard(env, IMG, { ours: 'Phoenix Fire' });
t('hook: too few rows falls back', f.source === 'vision' && visionCalls === 4);

fetched = null; offline(ok(golden));
const g = await scanBoard({ AI: env.AI }, IMG, { ours: 'Phoenix Fire' });
t('hook: dark without BOARD_OCR_URL and BOARD_OCR_KEY (no request is made)', g.source === 'vision' && fetched === null);
const h = await scanBoard({ AI: env.AI, BOARD_OCR_URL: env.BOARD_OCR_URL }, IMG, { ours: 'Phoenix Fire' });
t('hook: a URL without a key stays dark', h.source === 'vision' && fetched === null);
globalThis.fetch = realFetch;

// ---------- the real reader on the sample photo (only when its Python env exists) ----------
const py = [process.env.BOARD_OCR_PY, `${DIR}.venv/bin/python`].find((p) => p && fs.existsSync(p));
if (!py) console.log('· live reader skipped (no BOARD_OCR_PY / tools/board-ocr/.venv)');
else await tt('live: the sample photo reads to the golden rows, exactly', () => {
  const r = spawnSync(py, [`${DIR}board_ocr.py`, `${DIR}sample/rush-board.jpg`, '--roster', `${DIR}sample/roster.txt`], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const got = JSON.parse(r.stdout);
  const core = (x) => x.rows.map(({ rank, club, vp, gp, m, bfg, avg_vp }) => ({ rank, club, vp, gp, m, bfg, avg_vp }));
  return JSON.stringify(core(got)) === JSON.stringify(core(golden)) && got.highlighted_rank === 1;
});
// Regression: Discord/phones recompress and shrink photos. Re-encoded JPEGs merged the VP+GP headers, a glued-on M digit turned
// GP into 265836, and a stray digit made rank 15 read 515. Every size from 640 to 3200 px must read all rows exactly.
if (py) await tt('live: recompressed and shrunk copies (3200 / 1600 q70 / 1000 / 800 / 640 px) all read every row exactly', () => {
  const code = `import io,json,sys; sys.path.insert(0,${JSON.stringify(DIR)}); import board_ocr as b
from PIL import Image
g=json.load(open(${JSON.stringify(`${DIR}sample/rush-board.golden.json`)})); core=lambda d:[(r['rank'],r['vp'],r['gp'],r['m'],r['bfg'],r['avg_vp']) for r in d['rows']]
roster=b.load_roster(${JSON.stringify(`${DIR}sample/roster.txt`)}); src=Image.open(${JSON.stringify(`${DIR}sample/rush-board.jpg`)}); bad=[]
for w,q in ((3200,85),(1600,70),(1000,85),(800,85),(640,85)):
    im=src.resize((w,round(src.height*w/src.width)),Image.LANCZOS); buf=io.BytesIO(); im.save(buf,'JPEG',quality=q)
    if core(b.read_bytes(buf.getvalue(),roster))!=core(g): bad.append(w)
print(json.dumps(bad))`;
  const r = spawnSync(py, ['-c', code], { encoding: 'utf8', maxBuffer: 1 << 24 });
  return r.stdout.trim().split('\n').pop() === '[]';
});
// Regression: RapidOCR thresholds persisted on the shared engine, so the 2nd photo in one process (the server) failed.
if (py) await tt('live: reading the same photo twice in one process gives the same rows (the server keeps one engine)', () => {
  const code = `import json,sys; sys.path.insert(0,${JSON.stringify(DIR)}); import board_ocr as b
raw=open(${JSON.stringify(`${DIR}sample/rush-board.jpg`)},'rb').read()
a=b.read_bytes(raw); c=b.read_bytes(raw)
print(json.dumps([len(a['rows']), len(c['rows']), a['rows']==c['rows']]))`;
  const r = spawnSync(py, ['-c', code], { encoding: 'utf8', maxBuffer: 1 << 24 });
  return r.stdout.trim().split('\n').pop() === '[15, 15, true]';
});
done();
