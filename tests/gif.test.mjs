// PF-024 Item 21 – the GIF maker: /gif make | mine | delete | list, the keyed converter routes /api/gif/*, the timeout tick, and the GitHub Actions job's pure parts.
// Guardrails: type and size validated, limits from config, per-member daily limit and waiting-jobs cap, the dispatch call (fake fetch) carries ONE input (the hex ref) and never a secret,
// the callback routes reject a wrong or missing key, failure and timeout end cleanly (error reply, input deleted, token cleared), Phoenix branding with no NOREX name/colour/crest.
import fs from 'node:fs';
import { env, sqlite, R2, r2objects } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { COMMANDS, APP_COMMANDS } from '../bot/commanddefs.js';
import { PERMS } from '../bot/roles.js';
import { limits, gifCommand, gifRoute, gifTick, startJob, doneMessage, convertingMessage, failedMessage, FAILS, DEFAULTS, WORKFLOW } from '../bot/gif.js';
import { gifKey } from '../bot/gifkey.js';
import { convertLimits, ffmpegArgs, probeArgs, ladder, REF_RE, GIF_MAGIC } from '../scripts/gif-lib.mjs';

const FEAT0 = JSON.parse(env.FEATURES);
env.FEATURES = JSON.stringify({ ...FEAT0, gif: 'members' });
Object.assign(env, { DISCORD_BOT_TOKEN: 'tok', DISCORD_GUILD_ID: 'g-gif', DISCORD_APP_ID: '100', DISCORD_CLIENT_SECRET: 'client-secret-for-test', GH_DISPATCH_TOKEN: 'ghp_FAKE_TEST_TOKEN', GITHUB_REPO: 'owner/repo' });
const T = Date.UTC(2026, 11, 1, 12), SECRET = 'my private title note';
const calls = [], real = globalThis.fetch; let ghOk = true, served;
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(200, 1)]);
const NOTMP4 = Buffer.alloc(300, 7);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(500, 3)]);
served = MP4;
globalThis.fetch = async (u, init = {}) => {
  u = String(u);
  if (u.startsWith('https://discord.com/')) {
    const isForm = init.body instanceof FormData;
    calls.push({ kind: 'discord', u, method: init.method, body: isForm ? JSON.parse(init.body.get('payload_json')) : init.body ? JSON.parse(init.body) : null, file: isForm ? init.body.get('files[0]') : null });
    return Response.json({});
  }
  if (u.startsWith('https://api.github.com/')) { calls.push({ kind: 'github', u, method: init.method, headers: init.headers, body: JSON.parse(init.body) }); return ghOk ? new Response(null, { status: 204 }) : new Response('no', { status: 403 }); }
  if (u.startsWith('https://cdn.discordapp.com/')) return new Response(served, { headers: { 'Content-Length': String(served.length) } });
  return real(u, init);
};
const logs = []; const reallog = console.log; console.log = (...a) => { logs.push(a.join(' ')); reallog(...a); };
const reset = () => { calls.length = 0; served = MP4; ghOk = true; sqlite.exec('DELETE FROM gif_jobs'); for (const k of [...r2objects.keys()]) if (k.startsWith('gif')) r2objects.delete(k); };
const MEMBER = { u: '500', role: 'member' }, MGR = { u: '900', role: 'manager' };
const att = (o = {}) => ({ id: 'a1', filename: 'goal.mp4', content_type: 'video/mp4', size: MP4.length, url: 'https://cdn.discordapp.com/attachments/1/2/goal.mp4?ex=1', ...o });
const ia = (id, sub, options = [], attachment) => ({ member: { user: { id, username: `u${id}` }, nick: id === '500' ? 'Ash' : 'Coach' }, token: `tok-${id}`, channel_id: 'c1',
  data: { name: 'gif', options: [{ name: sub, type: 1, options }], resolved: attachment ? { attachments: { a1: attachment } } : {} } });
const o = (obj) => Object.entries(obj).map(([name, value]) => ({ name, value }));
const make = async (id, who, attachment, extra = {}, e = env) => {
  calls.length = 0; const waits = [];
  const r = await gifCommand(ia(id, 'make', o({ video: 'a1', ...extra }), attachment), e, who, { waitUntil: (p) => waits.push(p) }, T);
  await Promise.all(waits);
  return { r, patch: calls.find((c) => c.kind === 'discord' && c.method === 'PATCH')?.body, gh: calls.find((c) => c.kind === 'github') };
};
const txt = (m) => plainText(m?.data ?? m ?? {});
const job = () => sqlite.prepare('SELECT * FROM gif_jobs ORDER BY id DESC LIMIT 1').get();
const KEY = await gifKey(env.DISCORD_CLIENT_SECRET);
const call = (path, { method = 'GET', key = KEY, body } = {}, e = env) => gifRoute(new Request(`https://w.test/api/gif/${path}`, { method, headers: key ? { 'X-Phoenix-Key': key, ...(body ? { 'Content-Type': 'image/gif' } : {}) } : {}, body }), e, T + 1000);

// ---------- pure helpers ----------
t('limits: defaults, config override, clamped to the hard ceilings (15 s, 50 MB in, 25 MB out)', limits({}).maxSeconds === 15 && limits({}).maxInMb === DEFAULTS.maxInMb && limits({ GIF: '{"maxInMb":10,"perDay":2,"maxSeconds":10}' }).maxInBytes === 10e6 && limits({ GIF: '{"maxSeconds":999,"maxInMb":9999,"maxOutMb":999,"timeoutMin":99}' }).maxSeconds === 15 && limits({ GIF: '{"maxInMb":9999}' }).maxInMb === DEFAULTS.hardInMb && limits({ GIF: '{"maxOutMb":999}' }).maxOutMb === DEFAULTS.hardOutMb && limits({ GIF: '{"timeoutMin":99}' }).timeoutMs < 15 * 60_000 && limits({ GIF: 'not json' }).perDay === DEFAULTS.perDay);
t('converter limits (scripts/gif-lib.mjs) clamp the same way', convertLimits({}).maxSeconds === 15 && convertLimits({ maxSeconds: 60, width: 99999, fps: 500 }).width === 720 && convertLimits({ fps: 500 }).fps === 20 && convertLimits({ maxOutMb: 1000 }).maxOutMb === 25);
const args = ffmpegArgs({ width: 480, fps: 12, maxSeconds: 15 });
t('ffmpeg arguments are fixed: no shell, local-file protocol only, no stdin, 15 s cap, palette GIF; fixed file names', args.includes('-nostdin') && args[args.indexOf('-protocol_whitelist') + 1] === 'file' && args[args.indexOf('-t') + 1] === '15' && args.some((a) => /palettegen/.test(a) && /paletteuse/.test(a)) && args.at(-1) === 'out.gif' && args.includes('in.bin') && !args.some((a) => /[;&|`$]/.test(a.replace(/\[|\]|;|,|:|=/g, '')) ) && probeArgs().includes('in.bin'));
t('the size ladder only gets smaller and lighter', ladder({ width: 480, fps: 12 }).every((s, k, l) => !k || (s.width < l[k - 1].width && s.fps <= l[k - 1].fps)) && ladder({ width: 480, fps: 12 }).length === 3);
t('ref and GIF magic checks', REF_RE.test('0123456789abcdef01234567') && !REF_RE.test('../../etc/passwd') && !REF_RE.test('0123456789ABCDEF01234567') && GIF_MAGIC(GIF) && !GIF_MAGIC(MP4));

// ---------- gates ----------
reset();
const off = await gifCommand(ia('500', 'mine'), { ...env, FEATURES: JSON.stringify({ ...FEAT0, gif: 'off' }) }, MEMBER);
t('flag off → not switched on, nothing stored', /Not switched on/.test(txt(off)));
const guest = await gifCommand(ia('500', 'mine'), env, { u: '500', role: 'guest' });
t('guests cannot use it', /Members only|Not switched on/.test(txt(guest)));
const noGh = await make('500', MEMBER, att(), {}, { ...env, GH_DISPATCH_TOKEN: '' });
t('no GitHub token → clear "not switched on", nothing stored, no dispatch', /not switched on/.test(plainText(noGh.patch)) && sqlite.prepare('SELECT COUNT(*) n FROM gif_jobs').get().n === 0 && !noGh.gh);

// ---------- make: validation ----------
const bad = await make('500', MEMBER, att({ content_type: 'image/png', filename: 'a.png' }));
t('a non-video type is refused, nothing stored, no dispatch', /not allowed/.test(plainText(bad.patch)) && sqlite.prepare('SELECT COUNT(*) n FROM gif_jobs').get().n === 0 && !bad.gh);
const big = await make('500', MEMBER, att({ size: 40e6 }));
t('over the size limit is refused before anything is downloaded', /too big/.test(plainText(big.patch)) && sqlite.prepare('SELECT COUNT(*) n FROM gif_jobs').get().n === 0);
const smaller = await make('500', MEMBER, att({ size: 11e6 }), {}, { ...env, GIF: '{"maxInMb":10}' });
t('the size limit comes from config', /limit is 10 MB/.test(plainText(smaller.patch)));
const evil = await make('500', MEMBER, att({ url: 'https://evil.example/x.mp4' }));
t('a file not on Discord\'s CDN is refused', /need a video/.test(plainText(evil.patch)));
served = NOTMP4;
const fake = await make('500', MEMBER, att({ size: NOTMP4.length }));
const failed = sqlite.prepare("SELECT * FROM gif_jobs WHERE status = 'failed'").get();
t('a file that is not really a video (bad first bytes) is refused, marked failed, not left in R2, never dispatched', /real MP4/.test(plainText(fake.patch)) && !!failed && !(await R2.get(failed.in_key)) && !fake.gh && failed.token === null);
served = MP4;
t('no attachment → asks for one', /need a video/.test(plainText((await make('500', MEMBER, undefined)).patch)));

// ---------- make: the happy path up to "converting" ----------
reset();
const ok = await make('500', MEMBER, att(), { title: 'Top bins', private: true });
const row = job();
t('make: deferred reply (components v2, private when asked), then the converting panel is patched in', ok.r.type === 5 && (ok.r.data.flags & 64) === 64 && (ok.r.data.flags & (1 << 15)) !== 0 && /Converting/.test(plainText(ok.patch)));
t('make: public by default', ((await make('501', { u: '501', role: 'member' }, att())).r.data.flags & 64) === 0);
reset(); const ok2 = await make('500', MEMBER, att(), { title: 'Top bins' }); const row2 = job();
t('input in R2 under gifin/, row converting with user, title, size, type, the waiting token', /^gifin\/[0-9a-f]{24}\.mp4$/.test(row2.in_key) && !!(await R2.get(row2.in_key)) && row2.status === 'converting' && row2.user_id === '500' && row2.title === 'Top bins' && row2.in_size === MP4.length && row2.token === 'tok-500' && REF_RE.test(row2.ref));
t('the dispatch call: workflow file, main, ONE input (the hex ref), the token only in the auth header, no secret or user text in the body', ok2.gh.u === `https://api.github.com/repos/owner/repo/actions/workflows/${WORKFLOW}/dispatches` && ok2.gh.body.ref === 'main' && JSON.stringify(Object.keys(ok2.gh.body.inputs)) === '["ref"]' && ok2.gh.body.inputs.ref === row2.ref && ok2.gh.headers.Authorization === 'Bearer ghp_FAKE_TEST_TOKEN' && !JSON.stringify(ok2.gh.body).includes('ghp_') && !JSON.stringify(ok2.gh.body).includes('Top bins') && !JSON.stringify(ok2.gh.body).includes(env.DISCORD_CLIENT_SECRET));
const conv = plainText(ok2.patch);
t('converting panel: Phoenix name, states the wait, size, no NOREX name/colour/crest', /phoenix fire/i.test(conv) && /Converting/.test(conv) && /minute or two/.test(conv) && !/norex/i.test(JSON.stringify(ok2.patch)) && !/c8352c/i.test(JSON.stringify(ok2.patch)) && !/080b11/i.test(JSON.stringify(ok2.patch)));

// ---------- the dispatch fails ----------
reset(); ghOk = false;
const nd = await make('500', MEMBER, att());
const ndRow = job();
t('dispatch refused → clear error, row failed (dispatch), input deleted, token cleared, no GIF', /not available right now/.test(plainText(nd.patch)) && ndRow.status === 'failed' && ndRow.error === 'dispatch' && !(await R2.get(ndRow.in_key)) && ndRow.token === null);

// ---------- rate limits ----------
reset();
const lim = { ...env, GIF: '{"perDay":2,"maxWaiting":10}' };
await make('500', MEMBER, att(), {}, lim); await make('500', MEMBER, att(), {}, lim);
const third = await make('500', MEMBER, att(), {}, lim);
const other = await make('501', { u: '501', role: 'member' }, att(), {}, lim);
t('per-member daily limit (from config) stops the third; another member is unaffected', /today.s limit/.test(plainText(third.patch)) && /Converting/.test(plainText(other.patch)) && sqlite.prepare('SELECT COUNT(*) n FROM gif_jobs').get().n === 3);
reset();
const busy = { ...env, GIF: '{"perDay":10,"maxWaiting":2}' };
await make('500', MEMBER, att(), {}, busy); await make('501', { u: '501', role: 'member' }, att(), {}, busy);
const queued = await make('502', { u: '502', role: 'member' }, att(), {}, busy);
t('too many conversions waiting → "converter is busy", nothing stored, no dispatch', /busy/.test(plainText(queued.patch)) && !queued.gh && sqlite.prepare('SELECT COUNT(*) n FROM gif_jobs').get().n === 2);

// ---------- the keyed routes ----------
reset(); await make('500', MEMBER, att(), { title: 'Top bins' }); const J = job();
const noKey = await call(`input?ref=${J.ref}`, { key: null }), wrongKey = await call(`input?ref=${J.ref}`, { key: 'a'.repeat(64) });
t('wrong or missing key is rejected (403) on every route, and nothing changes', noKey.status === 403 && wrongKey.status === 403 && (await call(`result?ref=${J.ref}`, { method: 'POST', key: 'x', body: GIF })).status === 403 && (await call(`fail?ref=${J.ref}&code=other`, { method: 'POST', key: 'x' })).status === 403 && job().status === 'converting');
t('a bad ref or an unknown job is refused', (await call('input?ref=../../x')).status === 400 && (await call('input?ref=' + '0'.repeat(24))).status === 404);
const inp = await call(`input?ref=${J.ref}`);
t('GET input hands the stored video to the job (no-store)', inp.status === 200 && Buffer.from(await inp.arrayBuffer()).equals(MP4) && inp.headers.get('Cache-Control') === 'no-store');
calls.length = 0;
const res = await call(`result?ref=${J.ref}&secs=7.4&w=480&fps=12`, { method: 'POST', body: GIF });
const fin = job(), edit = calls.find((c) => c.method === 'PATCH');
t('result: GIF stored in R2 under gif/, row done with size/length/dimensions, input deleted, token cleared', res.status === 200 && fin.status === 'done' && /^gif\/[0-9a-f]{24}\.gif$/.test(fin.out_key) && !!(await R2.get(fin.out_key)) && fin.out_size === GIF.length && fin.secs === 7.4 && fin.width === 480 && fin.fps === 12 && !(await R2.get(J.in_key)) && fin.token === null);
const rcpt = plainText(edit.body);
t('result: the waiting reply is edited into the receipt with the GIF attached (multipart), Phoenix branded, favourites hint, no NOREX name/colour/crest', edit.u.includes(`/${J.token}/messages/@original`) && edit.file?.size === GIF.length && edit.body.attachments?.[0]?.filename === 'phoenix-gif.gif' && /GIF ready/.test(rcpt) && /Top bins/.test(rcpt) && /7\.4 s/.test(rcpt) && /Favourites/.test(rcpt) && /phoenix fire/i.test(rcpt) && !/norex/i.test(JSON.stringify(edit.body)) && !/c8352c|080b11/i.test(JSON.stringify(edit.body)) && JSON.stringify(edit.body).includes('attachment://phoenix-gif.gif') && edit.body.allowed_mentions.parse.length === 0);
t('a second result for the same job is refused (no double post)', (await call(`result?ref=${J.ref}&secs=1`, { method: 'POST', body: GIF })).status === 404);

// ---------- result and failure paths ----------
reset(); await make('500', MEMBER, att()); const J2 = job();
const notGif = await call(`result?ref=${J2.ref}`, { method: 'POST', body: Buffer.alloc(100, 5) });
t('a result that is not a GIF fails the job cleanly (error reply, input deleted)', notGif.status === 415 && job().status === 'failed' && job().error === 'unreadable' && !(await R2.get(J2.in_key)) && /could not read/.test(plainText(calls.filter((c) => c.method === 'PATCH').at(-1).body)));
reset(); await make('500', MEMBER, att()); const J3 = job();
const tooBig = await call(`result?ref=${J3.ref}`, { method: 'POST', body: Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(9e6)]) });
t('a GIF over the output cap (config) is refused and the job fails with too_big', tooBig.status === 413 && job().status === 'failed' && job().error === 'too_big' && !(await R2.get(J3.in_key)));
reset(); await make('500', MEMBER, att()); const J4 = job(); calls.length = 0;
const fr = await call(`fail?ref=${J4.ref}&code=too_long`, { method: 'POST' });
const fe = calls.find((c) => c.method === 'PATCH');
t('fail route: row failed with the code, input deleted, token cleared, the reply becomes a clear error naming the 15 s limit', fr.status === 200 && job().status === 'failed' && job().error === 'too_long' && !(await R2.get(J4.in_key)) && job().token === null && /too long/.test(plainText(fe.body)) && /15 seconds/.test(plainText(fe.body)));
t('an unknown failure code is stored as "other"; every code has a title and body', (async () => true) && Object.values(FAILS).every(([a, b]) => a && b({ maxSeconds: 15, maxOutMb: 8 })) && !!FAILS.timeout && !!FAILS.dispatch);
reset(); await make('500', MEMBER, att()); const J5 = job();
await call(`fail?ref=${J5.ref}&code=not-a-code`, { method: 'POST' });
t('unknown code → other', job().error === 'other');

// ---------- timeout ----------
reset(); await make('500', MEMBER, att()); const J6 = job(); calls.length = 0;
const early = await gifTick(env, T + 5 * 60_000);
t('timeout: a job still inside the window is left alone', early === 0 && job().status === 'converting');
const late = await gifTick(env, T + 11 * 60_000);
const to = calls.find((c) => c.method === 'PATCH');
t('timeout: after timeoutMin the job fails cleanly: error reply, input deleted, token cleared', late === 1 && job().status === 'failed' && job().error === 'timeout' && !(await R2.get(J6.in_key)) && job().token === null && /did not answer in time/.test(plainText(to.body)));
const lateResult = await call(`result?ref=${J6.ref}`, { method: 'POST', body: GIF });
t('a result that arrives after the timeout is refused and stores nothing', lateResult.status === 404 && ![...r2objects.keys()].some((k) => k.startsWith('gif/')));

// ---------- mine, delete, list ----------
reset(); await make('500', MEMBER, att(), { title: 'Top bins', private: true }); const J7 = job();
await call(`result?ref=${J7.ref}&secs=5&w=480&fps=12`, { method: 'POST', body: GIF });
const mine = await gifCommand(ia('500', 'mine'), env, MEMBER, null, T);
t('/gif mine lists the member\'s GIFs', txt(mine).includes(`#${J7.id}`));
const stranger = await gifCommand(ia('501', 'delete', o({ number: J7.id })), env, { u: '501', role: 'member' }, null, T);
t('another member cannot delete it', /Nothing to delete/.test(txt(stranger)) && job().status === 'done');
const memList = await gifCommand(ia('500', 'list'), env, MEMBER, null, T), mgrList = await gifCommand(ia('900', 'list'), env, MGR, null, T);
t('/gif list is for managers', /Managers only/.test(txt(memList)) && txt(mgrList).includes('<@500>'));
const del = await gifCommand(ia('900', 'delete', o({ number: J7.id })), env, MGR, null, T);
t('a manager can delete any GIF: R2 object gone, row kept as deleted with who and when', /GIF deleted/.test(txt(del)) && !(await R2.get(J7.out_key ?? `gif/${J7.ref}.gif`)) && job().status === 'deleted' && job().deleted_by === '900');
t('nothing logged the title, the token or the secret', !logs.some((l) => l.includes('Top bins') || l.includes('tok-500') || l.includes(env.DISCORD_CLIENT_SECRET) || l.includes('ghp_')));

// ---------- wiring ----------
const src = fs.readFileSync(new URL('../bot/gif.js', import.meta.url), 'utf8');
const media = fs.readFileSync(new URL('../bot/media.js', import.meta.url), 'utf8');
const yml = fs.readFileSync(new URL('../.github/workflows/gif-convert.yml', import.meta.url), 'utf8');
const botYml = fs.readFileSync(new URL('../.github/workflows/bot.yml', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../scripts/gif-convert.mjs', import.meta.url), 'utf8');
const cmd = COMMANDS.find((c) => c.name === 'gif');
t('/gif has make (required attachment video, optional title and private), mine, delete, list; lives in the fun app', ['make', 'mine', 'delete', 'list'].every((n) => cmd.options.some((s) => s.name === n)) && cmd.options[0].options[0].type === 11 && cmd.options[0].options[0].required && APP_COMMANDS.fun.includes('gif'));
t('permissions member/manager; the flag ships owner-only; limits in config.json and copied to the Worker var GIF by bot.yml', PERMS['gif.make'] === 'member' && PERMS['gif.manage'] === 'manager' && JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).features.gif === 'owner' && !!JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).gif.maxSeconds && /\["GIF", c\.gif/.test(botYml));
t('the module names no channel, id or NOREX; the storage guard skips gif/ and gifin/; GitHub repo and token come from the Worker env', !/\b\d{17,20}\b/.test(src) && !/norex/i.test(src) && /startsWith\('gif\/'\)/.test(media) && /startsWith\('gifin\/'\)/.test(media) && /env\.GITHUB_REPO/.test(src) && /env\.GH_DISPATCH_TOKEN/.test(src));
t('the workflow: dispatch-only with one input, read-only permissions, pinned action SHAs, the secret only in the convert step, the ref never interpolated into the shell', /workflow_dispatch:/.test(yml) && (yml.match(/^\s{6}\w+:\n\s+description/gm) ?? []).length === 1 && /permissions:\n\s+contents: read/.test(yml) && (yml.match(/uses: [^\n]+/g) ?? []).every((u) => /@[0-9a-f]{40}/.test(u)) && /GIF_REF: \$\{\{ inputs\.ref \}\}/.test(yml) && !/run:[^\n]*\$\{\{/.test(yml) && /timeout-minutes: \d+/.test(yml) && !/echo[^\n]*secret/i.test(yml));
t('the converter job: no shell (execFile with argument arrays), stripped environment, validated ref, key sent only to the Worker', /execFile/.test(script) && !/\bexec\(|execSync|spawnSync\(['"`]/.test(script) && /env: sandboxEnv/.test(script) && /REF_RE\.test/.test(script) && !/console\.(log|error)\([^)]*secret/i.test(script));
t('migration 0075 creates gif_jobs', /CREATE TABLE IF NOT EXISTS gif_jobs/.test(fs.readFileSync(new URL('../bot/migrations/0075_gif_jobs.sql', import.meta.url), 'utf8')));
t('panels use the Phoenix motto footer and the gif banner', /Rise\. Burn\. Repeat\./.test(txt(convertingMessage(env, { title: 'x', in_size: 5, in_type: 'video/mp4' }, limits(env)))) && /Rise\. Burn\. Repeat\./.test(plainText(failedMessage(env, 'timeout', limits(env)))) && /banner-gif\.png/.test(JSON.stringify(convertingMessage({ ...env, SITE_URL: 'https://x.test/' }, { title: 'x', in_size: 5, in_type: 'video/mp4' }, limits(env)))));

// ---------- the Worker routes it ----------
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
const waits = [];
const send = async (payload) => { const body = JSON.stringify(payload), ts = String(Date.now()); const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const res = await worker.fetch(new Request('https://w.test/interactions', { method: 'POST', headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts }, body }), env, { waitUntil: (p) => waits.push(p) }); return { s: res.status, d: await res.json().catch(() => null) }; };
await tt('the Worker routes /gif make with a deferred reply and starts a conversion', async () => {
  reset();
  const r = await send({ type: 2, member: { user: { id: '500', username: 'Ash' }, roles: [] }, channel_id: 'c1', token: 'tok', data: { name: 'gif', options: [{ name: 'make', type: 1, options: o({ video: 'a1' }) }], resolved: { attachments: { a1: att() } } } });
  await Promise.all(waits);
  return r.s === 200 && r.d?.type === 5 && sqlite.prepare("SELECT COUNT(*) n FROM gif_jobs WHERE status = 'converting'").get().n === 1;
});
await tt('the Worker serves /api/gif/* only with the key', async () => {
  const j = job();
  const bad = await worker.fetch(new Request(`https://w.test/api/gif/input?ref=${j.ref}`, { headers: { 'X-Phoenix-Key': 'nope' } }), env, { waitUntil() {} });
  const good = await worker.fetch(new Request(`https://w.test/api/gif/input?ref=${j.ref}`, { headers: { 'X-Phoenix-Key': KEY } }), env, { waitUntil() {} });
  return bad.status === 403 && good.status === 200;
});
globalThis.fetch = real; console.log = reallog;
done();
