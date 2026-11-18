// PF-024 Item 21 – the GIF maker, /gif make | mine | delete | list in the matchday app (the tools app is at the 25 help-page limit).
//   make    a member attaches a short video (mp4 / webm / mov, at most 15 s) and gets back a GIF others can favourite (Discord's own "add to favourites" works on any posted GIF).
//           The Worker cannot transcode video, so the work is a GitHub Actions job (OWNER DECISION 2026-11-18, same pattern as the EA relay in bot/burners.js):
//             1. the Worker validates type and size, copies the video into R2 (gifin/…), writes a gif_jobs row, dispatches .github/workflows/gif-convert.yml with ONE input (the job ref)
//                and edits the member's reply into a "Converting" panel;
//             2. the job pulls the video from GET /api/gif/input, runs ffmpeg (scripts/gif-convert.mjs, fixed arguments, width/fps/caps from config.json `gif`);
//             3. it posts the GIF to POST /api/gif/result (or POST /api/gif/fail with a code); the Worker stores the GIF in R2 (gif/…), deletes the input and edits the reply into the finished
//                receipt with the GIF attached. The keyed routes use the shared key (X-Phoenix-Key, bot/gifkey.js) like /api/crawl.
//   A job that never answers is failed by gifTick() (1-minute timer) after `timeoutMin`: a clear error reply, the input deleted. Failure at any step does the same.
// Limits come from config (config.json `gif`, copied to the Worker var GIF by bot.yml); code only holds safe defaults and hard ceilings.
// Safety: the video is validated by declared type AND first bytes, only from Discord's CDN hosts, never more than the declared size; the per-member daily limit and the waiting-jobs cap are
// enforced inside the INSERT (atomic); the output is checked to be a GIF and under the cap; nothing a member typed reaches a shell (the job gets a hex ref only). Nothing about a clip is logged.
import { can, flagOn } from './roles.js';
import { message, notice, reply, header, text, sep, footer, cards, bannerUrl, IS_V2 } from './ui.js';
import { orgName } from './orgconfig.js';
import { usedBytes, mb, hex, MB, REFUSE_AT } from './media.js';
import { TYPES, typeOf, cdnUrl, checked } from './highlight.js';
import { gifKey } from './gifkey.js';
import { sharedKey } from './sharedkey.js';

export const GIF_COMMANDS = new Set(['gif']);
export const GIF_FLAG = 'gif';
export const DEFAULTS = { maxInMb: 25, hardInMb: 50, maxOutMb: 8, hardOutMb: 25, perDay: 5, maxSeconds: 15, width: 480, fps: 12, timeoutMin: 10, maxWaiting: 4 };
export const WORKFLOW = 'gif-convert.yml';
export const FAILS = {
  too_long: ['That video is too long', (l) => `GIFs are ${l.maxSeconds} seconds at most. Trim the clip and try again.`],
  unreadable: ['I could not read that video', () => 'The file may be damaged or not a real MP4, WebM or MOV. Try another clip.'],
  too_big: ['The GIF came out too big', (l) => `Even at the smallest setting it is over ${l.maxOutMb} MB. Try a shorter or calmer clip.`],
  timeout: ['The converter did not answer in time', () => 'Nothing was made and nothing was kept. Try again in a few minutes.'],
  dispatch: ['The converter is not available right now', () => 'Nothing was made and nothing was kept. Tell a manager if this keeps happening.'],
  other: ['The conversion did not finish', () => 'Nothing was made and nothing was kept. Try again in a minute.'],
};
const DAY = 864e5;
const clean = (s, n) => String(s ?? '').replace(/<(@[!&]?|#)\d+>|@(everyone|here)/g, '').replace(/[\u0000-\u001f<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const note = (title, body = '') => reply(notice(title, body));
const userOf = (i) => i.member?.user?.id ?? i.user?.id ?? '';
const byOf = (i) => i.member?.nick || i.member?.user?.global_name || i.member?.user?.username || i.user?.username || 'Member';
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

/** limits from the Worker var GIF (config.json `gif`), clamped to safe values */
export function limits(env) {
  let c = {}; try { c = JSON.parse(env.GIF || '{}'); } catch { /* defaults */ }
  const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) && Number(v) >= lo ? Math.min(Number(v), hi) : d);
  const maxInMb = num(c.maxInMb, DEFAULTS.maxInMb, 1, DEFAULTS.hardInMb), maxOutMb = num(c.maxOutMb, DEFAULTS.maxOutMb, 1, DEFAULTS.hardOutMb);
  return {
    maxInBytes: maxInMb * MB, maxInMb, maxOutBytes: maxOutMb * MB, maxOutMb, perDay: Math.floor(num(c.perDay, DEFAULTS.perDay, 1, 50)),
    maxSeconds: num(c.maxSeconds, DEFAULTS.maxSeconds, 1, 15), width: Math.floor(num(c.width, DEFAULTS.width, 120, 720)), fps: Math.floor(num(c.fps, DEFAULTS.fps, 4, 20)),
    timeoutMs: Math.floor(num(c.timeoutMin, DEFAULTS.timeoutMin, 2, 14)) * 60_000, // Discord's reply token lives 15 minutes
    maxWaiting: Math.floor(num(c.maxWaiting, DEFAULTS.maxWaiting, 1, 20)),
  };
}

// ---------- the panels ----------
const head = (env, title, sub) => [cards(bannerUrl(env, 'gif')), header({ eyebrow: `${orgName(env)} · GIF maker`, title, sub, size: 3 })];
/** the "converting" state the member sees first */
export function convertingMessage(env, row, lim) {
  return message({
    accent: 'red', mentions: { parse: [] },
    blocks: [...head(env, 'Converting your video', row.title || 'Your clip'), text([['Status', '⏳ Converting'], ['Source', `${mb(row.in_size)} ${TYPES[row.in_type]?.toUpperCase() ?? 'VIDEO'}`], ['Output', `GIF up to ${lim.width}px at ${lim.fps} fps`]].map(([k, v]) => `**${k}**\n${v}`).join('\n\n')), sep(),
      text('This takes a minute or two. This message turns into your GIF when it is ready.'), footer(`${orgName(env)} · Rise. Burn. Repeat.`)],
  });
}
/** the finished receipt: the GIF itself is the attachment `phoenix-gif.gif` */
export function doneMessage(env, row) {
  return message({
    accent: 'red', mentions: { parse: [] },
    blocks: [...head(env, 'GIF ready', row.title || 'Your clip'), cards({ url: 'attachment://phoenix-gif.gif', alt: row.title || 'Your GIF' }),
      text([['GIF', `#${row.id}`], ['By', row.user_id ? `<@${row.user_id}>` : '-'], ['Length', `${Number(row.secs || 0).toFixed(1)} s`], ['Size', `${mb(row.out_size)} · ${row.width}px · ${row.fps} fps`]].map(([k, v]) => `**${k}**\n${v}`).join('\n\n')), sep(),
      text('Tap or right-click the GIF and choose Add to Favourites to keep it for later.'), footer(`${orgName(env)} · Rise. Burn. Repeat.`)],
  });
}
/** the clear error the member sees when a job fails or times out */
export function failedMessage(env, code, lim) {
  const [title, body] = FAILS[code] ?? FAILS.other;
  return message({ accent: 'steel', mentions: { parse: [] }, blocks: [...head(env, title, 'GIF maker'), text(body(lim)), footer(`${orgName(env)} · Rise. Burn. Repeat.`)] });
}

// ---------- editing the waiting reply ----------
/** PATCH the member's waiting reply (V2 panel, optional GIF attachment). Resolves true when Discord accepted it. */
export async function editReply(env, row, m, gifBytes) {
  if (!row.token) return false;
  const url = `https://discord.com/api/v10/webhooks/${row.app_id || env.DISCORD_APP_ID}/${row.token}/messages/@original`;
  const payload = { flags: IS_V2, components: m.components, allowed_mentions: m.allowed_mentions ?? { parse: [] } };
  let init;
  if (gifBytes) {
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ ...payload, attachments: [{ id: 0, filename: 'phoenix-gif.gif' }] }));
    form.append('files[0]', new Blob([gifBytes], { type: 'image/gif' }), 'phoenix-gif.gif');
    init = { method: 'PATCH', body: form };
  } else init = { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  return !!res?.ok;
}

// ---------- making a GIF ----------
/** end a job that did not work: row failed, input deleted, token cleared, the member told. Idempotent: only a queued/converting row can fail. */
export async function failJob(env, ref, code, now = Date.now()) {
  const row = await env.DB.prepare("SELECT * FROM gif_jobs WHERE ref = ? AND status IN ('queued', 'converting')").bind(ref).first();
  if (!row) return false;
  const claimed = await env.DB.prepare("UPDATE gif_jobs SET status = 'failed', error = ?, token = NULL, done_at = ? WHERE id = ? AND status IN ('queued', 'converting')").bind(FAILS[code] ? code : 'other', now, row.id).run();
  if (!claimed.meta?.changes) return false;
  if (env.MEDIA) await env.MEDIA.delete(row.in_key).catch(() => null);
  await editReply(env, row, failedMessage(env, FAILS[code] ? code : 'other', limits(env))).catch(() => null);
  return true;
}

/** the whole submission: validate, reserve, copy to R2, dispatch, show "converting". → a message (the converting panel, or a notice) */
export async function startJob(env, i, att, o, now = Date.now()) {
  const lim = limits(env), uid = userOf(i);
  if (!uid) return notice('I could not tell who you are');
  if (!env.MEDIA) return notice('GIF storage is not switched on yet', 'A manager has to connect the media storage first.');
  if (!env.GH_DISPATCH_TOKEN || !env.GITHUB_REPO) return notice('The GIF converter is not switched on yet', 'A manager has to connect it first.');
  const type = typeOf(att), url = cdnUrl(att?.url), size = Number(att?.size) || 0;
  if (!att || !url) return notice('I need a video', 'Attach an MP4, WebM or MOV video of up to ' + lim.maxSeconds + ' seconds.');
  if (!type) return notice('That file type is not allowed', 'Videos only: MP4, WebM or MOV.');
  if (!size) return notice('That file is empty');
  if (size > lim.maxInBytes) return notice('That video is too big', `The limit is ${lim.maxInMb} MB and this one is ${mb(size)}. Trim it to ${lim.maxSeconds} seconds and try again.`);
  const sum = await env.DB.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM highlights WHERE status IN ('pending', 'stored')").first().catch(() => null);
  const mediaSum = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM media WHERE gone = 0').first().catch(() => null);
  if (Math.max(await usedBytes(env), (sum?.n || 0) + (mediaSum?.n || 0)) + size >= REFUSE_AT) return notice('Club storage is nearly full', 'GIFs are paused until old files are cleared. Tell a manager.');
  const ref = hex(12), inKey = `gifin/${ref}.${TYPES[type]}`, title = clean(o.title, 80), priv = o.private ? 1 : 0;
  // reserve the row first: the daily limit and the waiting-jobs cap sit inside the INSERT so parallel submissions cannot slip past them
  const ins = await env.DB.prepare(`INSERT INTO gif_jobs (ref, user_id, user_name, title, in_key, in_type, in_size, status, token, app_id, private, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM gif_jobs WHERE user_id = ? AND created_at > ? AND status != 'failed') < ?
    AND (SELECT COUNT(*) FROM gif_jobs WHERE status IN ('queued', 'converting') AND created_at > ?) < ?`)
    .bind(ref, uid, clean(byOf(i), 40), title, inKey, type, size, i.token ?? null, String(env.DISCORD_APP_ID ?? ''), priv, now, uid, now - DAY, lim.perDay, now - lim.timeoutMs, lim.maxWaiting).run();
  if (!ins.meta?.changes) {
    const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM gif_jobs WHERE user_id = ? AND created_at > ? AND status != 'failed'").bind(uid, now - DAY).first();
    return (mine?.n ?? 0) >= lim.perDay ? notice('That is today\'s limit', `${lim.perDay} GIFs a day per member. More tomorrow.`) : notice('The converter is busy', 'Several GIFs are being made right now. Try again in a few minutes.');
  }
  try {
    const res = await fetch(url);
    const len = Number(res.headers.get('Content-Length')) || size;
    if (!res.ok || !res.body) { await dropJob(env, ref, inKey, 'other'); return notice('The upload did not finish', 'Discord would not hand over the file. Try again.'); }
    if (len !== size || len > lim.maxInBytes) { await dropJob(env, ref, inKey, 'other'); return notice('The upload did not finish', 'The file size did not match. Try again.'); }
    await env.MEDIA.put(inKey, checked(res.body, len, type), { httpMetadata: { contentType: type }, customMetadata: { user: uid, kind: 'gif-in' } });
  } catch (e) {
    await dropJob(env, ref, inKey, 'other');
    return notice('The upload did not finish', e.message === 'type' ? 'That does not look like a real MP4, WebM or MOV file.' : 'Try again in a minute.'); // nothing about the clip is logged
  }
  await env.DB.prepare("UPDATE gif_jobs SET status = 'converting' WHERE ref = ?").bind(ref).run();
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'phoenix-bot' },
    body: JSON.stringify({ ref: 'main', inputs: { ref } }), signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) { await dropJob(env, ref, inKey, 'dispatch'); return failedMessage(env, 'dispatch', lim); }
  return convertingMessage(env, { title, in_size: size, in_type: type }, lim);
}
// a job that never started converting: mark failed, delete whatever was copied (no reply edit: the caller answers the member directly)
async function dropJob(env, ref, inKey, code) {
  await env.DB.prepare("UPDATE gif_jobs SET status = 'failed', error = ?, token = NULL, done_at = ? WHERE ref = ?").bind(code, Date.now(), ref).run().catch(() => null);
  await env.MEDIA.delete(inKey).catch(() => null);
}

// ---------- the keyed routes the Actions job calls ----------
// GET  /api/gif/input?ref=…                               the member's video (only while the job is `converting`)
// POST /api/gif/result?ref=…&secs=…&w=…&fps=…  body: GIF   store it, delete the input, edit the reply into the receipt
// POST /api/gif/fail?ref=…&code=…                         failure code → the reply becomes the error
export async function gifRoute(request, env, now = Date.now()) {
  if (!env.DISCORD_CLIENT_SECRET || sharedKey(request) !== await gifKey(env.DISCORD_CLIENT_SECRET)) return json({ error: 'Forbidden' }, 403);
  if (!env.DB || !env.MEDIA) return json({ error: 'Not available' }, 503);
  const url = new URL(request.url), ref = url.searchParams.get('ref') ?? '', what = url.pathname.replace(/^\/api\/gif\/?/, '');
  if (!/^[0-9a-f]{24}$/.test(ref)) return json({ error: 'Bad ref' }, 400);
  const row = await env.DB.prepare("SELECT * FROM gif_jobs WHERE ref = ? AND status = 'converting'").bind(ref).first();
  if (!row) return json({ error: 'Unknown or finished job' }, 404);
  const lim = limits(env);
  if (what === 'input' && request.method === 'GET') {
    const obj = await env.MEDIA.get(row.in_key);
    if (!obj) { await failJob(env, ref, 'other', now); return json({ error: 'Input missing' }, 404); }
    return new Response(obj.body, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
  }
  if (what === 'fail' && request.method === 'POST') {
    await failJob(env, ref, url.searchParams.get('code') ?? 'other', now);
    return json({ ok: true });
  }
  if (what === 'result' && request.method === 'POST') {
    const declared = Number(request.headers.get('Content-Length')) || 0;
    if (declared > lim.maxOutBytes) { await failJob(env, ref, 'too_big', now); return json({ error: 'Too big' }, 413); }
    const buf = new Uint8Array(await request.arrayBuffer());
    if (!buf.length || buf.length > lim.maxOutBytes) { await failJob(env, ref, buf.length ? 'too_big' : 'other', now); return json({ error: 'Bad size' }, 413); }
    if (String.fromCharCode(...buf.subarray(0, 4)) !== 'GIF8') { await failJob(env, ref, 'unreadable', now); return json({ error: 'Not a GIF' }, 415); }
    const num = (k, hi) => Math.min(hi, Math.max(0, Number(url.searchParams.get(k)) || 0));
    const outKey = `gif/${ref}.gif`, secs = num('secs', lim.maxSeconds), w = Math.floor(num('w', 720)), fps = Math.floor(num('fps', 20));
    const claim = await env.DB.prepare("UPDATE gif_jobs SET status = 'done', out_key = ?, out_size = ?, secs = ?, width = ?, fps = ?, done_at = ? WHERE id = ? AND status = 'converting'").bind(outKey, buf.length, secs, w, fps, now, row.id).run();
    if (!claim.meta?.changes) return json({ error: 'Unknown or finished job' }, 404);
    try { await env.MEDIA.put(outKey, buf, { httpMetadata: { contentType: 'image/gif' }, customMetadata: { user: row.user_id, kind: 'gif' } }); } catch {
      await env.DB.prepare("UPDATE gif_jobs SET status = 'failed', error = 'other' WHERE id = ?").bind(row.id).run();
      await env.MEDIA.delete(row.in_key).catch(() => null);
      await editReply(env, row, failedMessage(env, 'other', lim)).catch(() => null);
      return json({ error: 'Storage failed' }, 502);
    }
    await env.MEDIA.delete(row.in_key).catch(() => null); // the member's video is not kept
    const done = { ...row, out_key: outKey, out_size: buf.length, secs, width: w, fps, status: 'done' };
    const shown = await editReply(env, row, doneMessage(env, done), buf);
    await env.DB.prepare('UPDATE gif_jobs SET token = NULL WHERE id = ?').bind(row.id).run();
    return json({ ok: true, shown });
  }
  return json({ error: 'Not found' }, 404);
}

/** 1-minute timer: a job that has not answered in `timeoutMin` fails cleanly (error reply, input deleted); old rows' leftover tokens are cleared */
export async function gifTick(env, now = Date.now()) {
  if (!env.DB) return 0;
  const lim = limits(env);
  const rows = (await env.DB.prepare("SELECT ref FROM gif_jobs WHERE status IN ('queued', 'converting') AND created_at < ? LIMIT 20").bind(now - lim.timeoutMs).all()).results ?? [];
  let n = 0;
  for (const r of rows) if (await failJob(env, r.ref, 'timeout', now)) n++;
  await env.DB.prepare("UPDATE gif_jobs SET token = NULL WHERE token IS NOT NULL AND created_at < ?").bind(now - 15 * 60_000).run().catch(() => null);
  return n;
}

// ---------- the other subcommands ----------
const line = (r) => `🎞️ #${r.id} · ${r.title || 'Untitled'} · ${r.status === 'done' ? `${mb(r.out_size)} · ${Number(r.secs || 0).toFixed(1)} s` : r.status}`;
async function mine(env, uid) {
  const rows = (await env.DB.prepare("SELECT * FROM gif_jobs WHERE user_id = ? AND status IN ('converting', 'done') ORDER BY id DESC LIMIT 10").bind(uid).all()).results ?? [];
  return note('Your GIFs', rows.length ? rows.map(line).join('\n') : 'None yet. Try /gif make with a short video.');
}
async function remove(env, i, who, n, now) {
  const uid = userOf(i), row = n ? await env.DB.prepare('SELECT * FROM gif_jobs WHERE id = ?').bind(n).first() : await env.DB.prepare("SELECT * FROM gif_jobs WHERE user_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1").bind(uid).first();
  if (!row || row.status !== 'done' || (row.user_id !== uid && !can(who, 'gif.manage'))) return note('Nothing to delete', 'No finished GIF with that number is yours.');
  if (env.MEDIA && row.out_key) await env.MEDIA.delete(row.out_key).catch(() => null);
  await env.DB.prepare("UPDATE gif_jobs SET status = 'deleted', deleted_at = ?, deleted_by = ? WHERE id = ?").bind(now, uid, row.id).run();
  return note('GIF deleted', `#${row.id} is removed from storage. A copy you already posted in Discord stays there until you delete that message.`);
}

/** i = the interaction; ctx = the Worker's execution context (the copy and the dispatch can take longer than Discord's 3 seconds). → the interaction response */
export async function gifCommand(i, env, who, ctx, now = Date.now()) {
  if (!flagOn(env, who, GIF_FLAG)) return note('Not switched on yet', 'The GIF maker is being tested.');
  if (!can(who, 'gif.make')) return note('Members only');
  if (!env.DB) return note('The member database is not connected');
  const sub = i.data?.options?.[0], o = Object.fromEntries((sub?.options ?? []).map((x) => [x.name, x.value]));
  if (sub?.name === 'make') {
    const att = i.data?.resolved?.attachments?.[o.video];
    const flags = (1 << 15) | (o.private ? 64 : 0);
    const work = (async () => {
      const m = await startJob(env, i, att, o, now).catch(() => notice('The conversion did not start', 'Try again in a minute.'));
      await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${i.token}/messages/@original`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flags: IS_V2, components: m.components, allowed_mentions: m.allowed_mentions ?? { parse: [] } }),
      }).catch(() => null);
    })();
    if (ctx?.waitUntil) { ctx.waitUntil(work); return { type: 5, data: { flags } }; }
    await work; return { type: 5, data: { flags } };
  }
  if (sub?.name === 'mine') return mine(env, userOf(i));
  if (sub?.name === 'delete') return remove(env, i, who, Number(o.number) || 0, now);
  if (sub?.name === 'list') {
    if (!can(who, 'gif.manage')) return note('Managers only');
    const rows = (await env.DB.prepare("SELECT * FROM gif_jobs WHERE status IN ('converting', 'done') ORDER BY id DESC LIMIT 25").all()).results ?? [];
    return reply(message({ accent: 'red', ephemeral: true, blocks: [header({ eyebrow: `${orgName(env)} · GIF maker`, title: 'Latest GIFs', size: 3 }), text(rows.length ? rows.map((r) => `${line(r)} · <@${r.user_id}>`).join('\n') : 'No GIFs yet.'), footer('Videos are deleted as soon as the GIF is made.')] }));
  }
  return note('Pick make, mine, delete or list');
}
