// Runs inside GitHub Actions (EA lets Actions through, but blocks Cloudflare Workers; Chrome for the pictures is preinstalled here).
// Modes: search | stats | track (answer a waiting Discord reply), poll (scheduled: feed tracked clubs' new matches), draw (refresh a club's
// pictures), banners (draw the fixed header pictures once). Input comes from env so nothing user-typed reaches a shell.
import { searchHits } from '../core/ea.js';

const { RELAY_REF: ref, RELAY_KIND: kind = 'poll', RELAY_Q: q = '', RELAY_GAME: game = '1', RELAY_EXTRA: extra = '', MICKEY_WORKER_URL, RELAY_KEY } = process.env;
if (!MICKEY_WORKER_URL || !RELAY_KEY) { console.error('relay: MICKEY_WORKER_URL and RELAY_KEY are required'); process.exit(1); }
const worker = MICKEY_WORKER_URL.replace(/\/$/, '');

const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', Referer: 'https://www.ea.com/', Origin: 'https://www.ea.com' };
async function ea(endpoint, params) {
  const r = await fetch(`https://proclubs.ea.com/api/fc/${endpoint}?${new URLSearchParams({ platform: 'common-gen5', ...params })}`, { headers: H, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`EA answered ${r.status}`);
  return r.json();
}
async function post(path, body, { fatal = true } = {}) {
  const r = await fetch(`${worker}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Key': RELAY_KEY }, body: JSON.stringify(body) });
  console.log(`worker ${path} → ${r.status}`);
  if (!r.ok && fatal) process.exit(1);
  return r.ok ? r.json().catch(() => ({})) : null;
}

async function matchesFor(id, count) {
  const seen = new Map();
  for (const matchType of ['leagueMatch', 'playoffMatch', 'gameType5']) {
    try { for (const m of await ea('clubs/matches', { clubIds: id, matchType, maxResultCount: String(count) })) seen.set(String(m.matchId), { ...m, _type: matchType }); }
    catch (e) { if (matchType === 'leagueMatch') throw e; }
  }
  return [...seen.values()];
}

async function resolve(query) {
  const s = String(query).trim().slice(0, 60);
  if (/^\d{1,12}$/.test(s)) {
    const c = (await ea('clubs/info', { clubIds: s }))?.[s];
    return { club: c?.name ? { id: s, name: c.name, crest: c.customKit?.crestAssetId ?? null } : null, hits: [] };
  }
  let hits = [];
  for (const ep of ['allTimeLeaderboard/search', 'clubs/search']) {
    try { const r = await ea(ep, { clubName: s }); if (Array.isArray(r) && r.length) { hits = searchHits(r); break; } } catch (e) { if (ep === 'clubs/search') throw e; }
  }
  const exact = hits.find((h) => h.name.toLowerCase() === s.toLowerCase());
  return { club: exact ?? (hits.length === 1 ? hits[0] : null), hits };
}

// ---- pictures -----------------------------------------------------------------------------------
async function htmlFor(T, M, j) {
  const d = j.data;
  switch (j.kind) {
    case 'board': return M.boardCard(d.mp, d.club);
    case 'pitch': return M.pitchCard(d.mp, d.club);
    case 'review': return M.reviewCard(d.model, d.club);
    case 'recap': return M.recapCard(d.r, d.club);
    case 'box': return T.boxScoreCard(d.m, d.club);
    case 'club': return T.clubCard(d.club);
    case 'results': return T.resultsCard(d.club);
    case 'top': return T.tableCard(d.players, d.stat, d.club);
    case 'player': return T.playerCard(d.p, d.club);
    case 'compare': return T.compareCard(d.a, d.b, d.club);
    case 'lineup': return T.lineupCard(d.L, d.club);
    case 'banner': return T.bannerCard(d);
    case 'avatar': return `<!doctype html><html><body style="margin:0;background:transparent"><img src="${d.url}" width="128" height="128" style="display:block;border-radius:50%"></body></html>`;
    default: throw new Error(`unknown card ${j.kind}`);
  }
}
async function drawAll(jobs) {
  if (!jobs?.length) return;
  const T = await import('../cards/templates.mjs'), M = await import('../cards/match.mjs'), { openRenderer } = await import('../cards/render.mjs');
  const r = await openRenderer();
  let ok = 0;
  try {
    for (const j of jobs) {
      try {
        const png = await r.png(await htmlFor(T, M, j), j.kind === 'avatar' ? { transparent: true, clip: { x: 0, y: 0, width: 128, height: 128 } } : undefined);
        const qs = new URLSearchParams({ key: j.key, ...(j.club?.id ? { club: j.club.id, kind: j.kind, ref: j.ref ?? '' } : {}) });
        const res = await fetch(`${worker}/card?${qs}`, { method: 'PUT', headers: { 'X-Key': RELAY_KEY, 'Content-Type': 'text/plain' }, body: png.toString('base64') });
        if (!res.ok) throw new Error(`upload ${res.status}`);
        ok++;
      } catch (e) { console.error(`card ${j.kind} ${j.ref ?? ''}: ${e.message}`); }
    }
  } finally { await r.close(); }
  console.log(`drew ${ok}/${jobs.length} picture(s)`);
}

const BANNERS = [['help', 'Commands', 'Everything the bot can do', '📖'], ['history', 'Head to head', 'Record against one club', '⚔️'], ['insight', 'Form guide', 'Form, last 5 and streaks', '📈'],
  ['search', 'Club search', 'Find any Pro Clubs club', '🔎'], ['track', 'Tracking', 'New matches post by themselves', '📡'], ['recap', 'Session recap', 'The night, in one post', '📝']];

try {
  if (kind === 'banners') {
    await drawAll(BANNERS.map(([name, title, sub, icon]) => ({ kind: 'banner', ref: name, key: `banners/${name}-v1.png`, data: { title, sub, icon } })));
  } else if (kind === 'poll') {
    const { clubs = [] } = await (await fetch(`${worker}/tracked`, { headers: { 'X-Key': RELAY_KEY } })).json();
    console.log(`poll: ${clubs.length} tracked club(s)`);
    const out = [];
    for (const id of clubs) { try { out.push({ id, matches: await matchesFor(id, 5) }); } catch (e) { console.error(`poll ${id}: ${e.message}`); } }
    if (out.length) { const r = await post('/ingest', { clubs: out }); await drawAll(r?.draw); }
    await post('/flush', {}, { fatal: false });
  } else if (kind === 'draw') {
    const r = await post('/draw', { club: q, extra });
    await drawAll(r?.draw);
    if (ref) await post('/done', { ref }, { fatal: false }); // a waiting reply (e.g. /lineup) finishes once its picture is up
  } else {
    if (!ref || !q) throw new Error('missing ref or q');
    try {
      const { club, hits } = await resolve(q);
      console.log(`relay ${ref}: ${kind} "${q}" → ${club ? `club ${club.id}` : `${hits.length} hit(s)`}`);
      const r = await post('/relay', club ? { ref, club, matches: await matchesFor(club.id, kind === 'track' ? 10 : Math.max(5, Number(game) || 1)) } : { ref, q, hits });
      if (r?.draw?.length) { await drawAll(r.draw); await post('/done', { ref }, { fatal: false }); }
    } catch (e) { await post('/relay', { ref, error: e.message }, { fatal: false }); }
  }
} catch (e) { console.error(e.message); process.exit(1); }
