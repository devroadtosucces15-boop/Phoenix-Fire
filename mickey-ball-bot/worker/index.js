// Mickey Ball Bot – Cloudflare Worker. Discord talks to it over HTTP (no always-on process). EA blocks Workers, so anything that needs EA
// (and every picture, which is drawn with headless Chrome) goes through a GitHub Actions job (mickey-relay.yml). That job posts EA's raw
// answer to /relay, draws the pictures the Worker asks for, uploads them to /card and calls /done, which edits the Discord
// reply that was waiting. Stats commands read D1 and the pictures already drawn (kept in D1 as base64).
import { makeStore, d1Executor } from '../core/store.js';
import { normalizeMatch, searchHits, crestUrl } from '../core/ea.js';
import { buildJobs, clubView, streaks, hash } from '../core/data.js';
import { findSessions, isDue, buildRecap } from '../core/recap.js';
import { notice, IS_V2, EPHEMERAL } from '../core/ui.js';
import * as P from '../core/panels.js';
import { MATCHDAY_COMMANDS, matchdayCommand, eventComponent, zoneAutocomplete, reminders } from './matchday.js';
import { lineupComponent, lineupJob, lineupPostDone, setupComponent, suggestUse } from './lineup.js';
import { gate } from './access.js';

const API = 'https://discord.com/api/v10';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const STAT_COMMANDS = new Set(['club', 'last', 'results', 'player', 'compare', 'leaderboard', 'history', 'insight', 'help']);
const reply = (data, status = 4) => json({ type: status, data });

// ---- Discord request signature (Ed25519) --------------------------------------------------------
const hex = (s) => Uint8Array.from(s.match(/.{2}/g).map((b) => parseInt(b, 16)));
async function verified(req, body, pub) {
  const sig = req.headers.get('x-signature-ed25519'), ts = req.headers.get('x-signature-timestamp');
  if (!sig || !ts) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hex(pub), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(sig), new TextEncoder().encode(ts + body));
  } catch { return false; }
}

// ---- Discord REST ---------------------------------------------------------------------------------
const editOriginal = (env, token, data) => fetch(`${API}/webhooks/${env.DISCORD_APP_ID}/${token}/messages/@original`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flags: data.flags & IS_V2, components: data.components, allowed_mentions: { parse: [] } }) });
const postChannel = (env, channel, data) => fetch(`${API}/channels/${channel}/messages`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bot ${env.DISCORD_TOKEN}` }, body: JSON.stringify({ flags: data.flags & IS_V2, components: data.components, allowed_mentions: { parse: [] } }) });

// ---- GitHub Actions dispatch ----------------------------------------------------------------------
async function dispatch(env, inputs) {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/mickey-relay.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mickey-ball-bot', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs }) }).catch(() => null);
  return !!res?.ok;
}

// Defers the Discord reply, parks it in D1, and asks Actions. The interaction token never leaves D1.
async function askEA(env, ctx, st, i, { kind, q, game = 1, opponents = false, channel = null }) {
  const ref = crypto.randomUUID().slice(0, 12);
  await st.prunePending();
  await st.addPending({ ref, token: i.token, guild: i.guild_id, channel: channel ?? i.channel_id, user: (i.member?.user ?? i.user)?.id, kind, game, opponents });
  ctx.waitUntil((async () => {
    const ok = await dispatch(env, { ref, kind, q: String(q).slice(0, 60), game: String(game) });
    if (!ok) { await st.delPending(ref); await editOriginal(env, i.token, notice('Could not reach the data relay', 'Try again in a minute.')); }
  })());
}
// Missing pictures are drawn in the background; the message already went out with a text fallback.
const queueDraw = (env, ctx, club, extra = '') => ctx.waitUntil(dispatch(env, { kind: 'draw', q: String(club.id), game: '1', ref: '', extra }));

const urlOf = (env, map) => (kind, ref = '') => { const k = map.get(`${kind}|${ref}`); return k ? `${String(env.PUBLIC_URL).replace(/\/$/, '')}/c/${k}` : null; };
const opt = (i, name) => {
  const walk = (os) => (os ?? []).flatMap((o) => (o.options ? walk(o.options) : [o]));
  return walk(i.data.options).find((o) => o.name === name)?.value;
};
const H = { reply, json, opt, dispatch, edit: editOriginal };
async function statsClub(st, i) {
  const rows = await st.trackedFor(i.guild_id);
  const v = opt(i, 'club');
  const r = v ? rows.find((x) => x.club_id === v || x.name.toLowerCase() === String(v).toLowerCase()) : rows[0];
  return r ? clubView(r) : null;
}
const needClub = () => reply(notice('No tracked club yet', 'Use `/match track club:<name>` first.'));
const pairRef = (a, b) => [a, b].map((s) => String(s).toLowerCase()).sort().join('|');

async function onCommand(env, ctx, st, i) {
  const name = i.data.name;
  if (name === 'help') return reply(P.helpPanel(env));
  if (MATCHDAY_COMMANDS.has(name)) return matchdayCommand(env, ctx, st, i, H);

  if (STAT_COMMANDS.has(name)) {
    const club = await statsClub(st, i);
    if (!club) return needClub();
    const map = await st.cardMap(club.id), u = urlOf(env, map);
    switch (name) {
      case 'club': {
        const t = await st.clubTotals(club.id), rows = await st.allResults(club.id);
        if (t?.gp && !u('club', '')) queueDraw(env, ctx, club);
        return reply(P.clubPanel(club, t, rows.slice(0, 10).map((r) => r.res).reverse(), streaks(rows), u));
      }
      case 'results': {
        const rows = await st.recentResults(club.id, opt(i, 'count') ?? 5);
        if (rows.length && !u('results', '')) queueDraw(env, ctx, club);
        return reply(P.resultsPanel(club, rows, u));
      }
      case 'player': {
        const p = await st.playerCard(club.id, opt(i, 'gamertag'));
        if (p && !u('player', p.player)) queueDraw(env, ctx, club);
        return reply(P.playerPanel(club, opt(i, 'gamertag'), p, u, p ? await st.playerEvents(club.id, p.player) : null));
      }
      case 'compare': {
        const [a, b] = await Promise.all([st.playerCard(club.id, opt(i, 'player1')), st.playerCard(club.id, opt(i, 'player2'))]);
        const ref = a && b ? pairRef(a.player, b.player) : '';
        const card = ref ? u('compare', ref) : null;
        if (a && b && !card) queueDraw(env, ctx, club, ref);
        return reply(P.comparePanel(club, a, b, card));
      }
      case 'leaderboard': {
        const stat = opt(i, 'stat') ?? 'rating', b = await st.leaderboard(club.id, stat);
        if (b.rows.length && !u('top', stat)) queueDraw(env, ctx, club);
        return reply(P.leaderboardPanel(club, stat, b.rows, u));
      }
      case 'history': return reply(P.historyPanel(env, club, opt(i, 'opponent'), await st.headToHead(club.id, opt(i, 'opponent'))));
      case 'insight': {
        const rows = await st.allResults(club.id);
        return rows.length ? reply(P.insightPanel(env, club, opt(i, 'type') ?? 'form', rows, streaks(rows))) : reply(notice('No matches stored yet', 'Run `/match track` first.'));
      }
      case 'last': {
        const m = (await st.recentMatches(club.id, 1))[0];
        if (!m) { await askEA(env, ctx, st, i, { kind: 'stats', q: club.id, game: 1 }); return json({ type: 5 }); }
        if (!u('board', m.id)) queueDraw(env, ctx, club);
        return reply(P.matchPanel(club, m, u));
      }
    }
  }

  const sub = i.data.options?.[0]?.name;
  if (['track', 'untrack', 'main'].includes(sub)) { const bad = await gate(st, i, 'tracking'); if (bad) return reply(bad); }
  if (sub === 'list') return reply(P.trackedList(env, await st.trackedFor(i.guild_id)));
  if (sub === 'untrack') {
    const q = String(opt(i, 'club') ?? '').toLowerCase();
    const r = (await st.trackedFor(i.guild_id)).find((x) => x.club_id === q || x.name.toLowerCase() === q);
    const done = r && (await st.untrack(i.guild_id, r.club_id));
    return reply({ ...notice(done ? `Stopped tracking ${r.name}` : 'That club is not tracked here', done ? 'Stored history is kept.' : 'Use /match list to see tracked clubs.'), flags: IS_V2 | EPHEMERAL });
  }
  if (sub === 'main') {
    const q = String(opt(i, 'club') ?? '').toLowerCase(), rows = await st.trackedFor(i.guild_id);
    const r = q ? rows.find((x) => x.club_id === q || x.name.toLowerCase() === q) : null;
    if (!r) return reply({ ...notice('Pick one of the tracked clubs', 'Start typing in `club:` and choose from the list. `/match list` shows them.'), flags: IS_V2 | EPHEMERAL });
    await st.setMain(i.guild_id, r.club_id);
    return reply({ ...notice(`${r.name} is now the main club`, 'Stat commands use it whenever you leave `club` empty.', { accent: 'win' }), flags: IS_V2 | EPHEMERAL });
  }
  await askEA(env, ctx, st, i, { kind: sub, q: opt(i, 'club'), game: opt(i, 'game') ?? 1, opponents: !!opt(i, 'opponents'), channel: sub === 'track' ? opt(i, 'channel') : null });
  return json({ type: 5 });
}

async function onComponent(env, ctx, st, i) {
  const [, a, clubId, matchId] = i.data.custom_id.split(':');
  if (a === 'ev' || a === 'evp') return eventComponent(env, ctx, st, i, H, a, clubId, matchId);
  if (a === 'sl') return lineupComponent(env, ctx, st, i, H, clubId, matchId);
  if (a === 'sg') return suggestUse(st, i, H, clubId);
  if (a === 'cfg') return setupComponent(st, i, H, clubId);
  if (a === 'pick') { // club picker: ml:pick:<kind>:<game>, value = club id
    if (clubId === 'track') { const bad = await gate(st, i, 'tracking'); if (bad) return reply(bad); }
    await askEA(env, ctx, st, i, { kind: clubId === 'search' ? 'stats' : clubId, q: i.data.values[0], game: Number(matchId) || 1 });
    return reply(notice('Fetching that club from EA…', 'This takes up to a minute.'), 7);
  }
  const row = (await st.trackedFor(i.guild_id)).find((t) => t.club_id === clubId);
  const club = row ? clubView(row) : { id: clubId, name: 'Club', crest: null };
  const map = await st.cardMap(clubId), u = urlOf(env, map);
  if (a === 'cs') { const t = await st.clubTotals(clubId), rows = await st.allResults(clubId); return reply(P.clubPanel(club, t, rows.slice(0, 10).map((r) => r.res).reverse(), streaks(rows), u, { ephemeral: true })); }
  if (a === 'lbs') { // stat picker under a leaderboard: update that message in place
    const stat = i.data.values?.[0] ?? 'rating', b = await st.leaderboard(clubId, stat);
    if (b.rows.length && !u('top', stat)) queueDraw(env, ctx, club);
    const panel = P.leaderboardPanel(club, stat, b.rows, u);
    return reply({ ...panel, flags: panel.flags & IS_V2 }, 7);
  }
  if (a === 'lb') return reply(P.leaderboardPanel(club, 'rating', (await st.leaderboard(clubId, 'rating')).rows, u, { ephemeral: true }));
  const m = await st.storedMatch(clubId, matchId);
  if (!m) return reply({ ...notice('That match is no longer stored'), flags: IS_V2 | EPHEMERAL });
  if (a === 'box') return reply(P.boxPanel(club, m, u));
  if (a === 'pm') {
    const name = i.data.values?.[0], p = m.home.players.find((x) => x.name === name);
    return p ? reply(P.personalPanel(club, m, p, await st.playerCard(clubId, name))) : reply({ ...notice('Player not found'), flags: IS_V2 | EPHEMERAL });
  }
  return json({ error: 'unsupported' }, 400);
}

async function onAutocomplete(st, i) {
  const f = (function walk(os) { for (const o of os ?? []) { if (o.focused) return o; const r = walk(o.options); if (r) return r; } })(i.data.options);
  const q = String(f?.value ?? '');
  let out = [];
  if (f?.name === 'timezone') out = zoneAutocomplete(q);
  else if (f?.name === 'club') out = (await st.trackedFor(i.guild_id)).filter((r) => r.name.toLowerCase().includes(q.toLowerCase())).map((r) => ({ name: r.name, value: r.club_id }));
  else {
    const club = await statsClub(st, i);
    if (club && ['gamertag', 'player1', 'player2'].includes(f?.name)) out = (await st.playerNames(club.id, q)).map((r) => ({ name: `${r.player} (${r.gp} g)`, value: r.player }));
    if (club && f?.name === 'opponent') out = (await st.opponentNames(club.id, q)).map((r) => ({ name: `${r.opp_name} (${r.n})`, value: r.opp_name }));
  }
  return json({ type: 8, data: { choices: out.slice(0, 25).map((c) => ({ name: String(c.name).slice(0, 100), value: String(c.value).slice(0, 100) })) } });
}

// ---- relay: Actions → Worker ---------------------------------------------------------------------
const crestOf = (c) => crestUrl(c?.crest ?? c?.crestId);
async function finish(env, st, p) { // the pictures are uploaded: build the final reply
  const reply2 = (d) => editOriginal(env, p.token, d);
  if (p.kind === 'lineuppost') return lineupPostDone(env, st, p);
  const club = (await st.trackedFor(p.guild_id)).find((t) => t.club_id === p.club_id);
  const m = await st.storedMatch(p.club_id, p.match_id);
  if (p.kind === 'track') { const c = clubView(club ?? { club_id: p.club_id, name: 'Club' }); return reply2(P.trackedPanel(env, c, p.game, p.channel_id)); }
  if (!m) return reply2(notice('No match found'));
  const c = { id: p.club_id, name: m.home.name, crest: m.home.crest };
  return reply2(P.matchPanel(c, m, urlOf(env, await st.cardMap(p.club_id))));
}

async function onRelay(env, st, body) {
  const p = await st.getPending(body.ref);
  if (!p) return json({ ok: false, error: 'unknown ref' }, 404);
  const reply2 = (d) => editOriginal(env, p.token, d);
  if (body.error) { await st.delPending(p.ref); await reply2(notice('Something went wrong', String(body.error).slice(0, 300))); return json({ ok: true }); }
  const hits = searchHits(body.hits);
  if (!body.club) { // not resolved: nothing found, or several to pick from
    await st.delPending(p.ref);
    if (!hits.length) { await reply2(notice('No club found', 'Try the exact name or the club ID.')); return json({ ok: true }); }
    await reply2(P.pickerPanel(env, hits, body.q ?? 'search', p.kind, p.game, (c) => crestUrl(c?.crest)));
    return json({ ok: true });
  }
  const club = { id: String(body.club.id), name: body.club.name, crestId: body.club.crest ?? null, crest: crestUrl(body.club.crest) };
  const matches = (body.matches ?? []).map((m) => normalizeMatch(m, club.id)).sort((a, b) => b.ts - a.ts);
  if (p.kind === 'search') {
    await st.delPending(p.ref);
    if (p.opponents) {
      const seen = new Map();
      for (const m of matches) seen.set(m.away.id, { id: m.away.id, name: m.away.name });
      await reply2(P.opponentsPanel(env, club, [...seen.values()]));
    } else await reply2(P.clubFound(env, club, `Latest: ${matches[0] ? `${matches[0].home.goals}–${matches[0].away.goals} vs ${matches[0].away.name}` : 'no recent matches'}`));
    return json({ ok: true });
  }
  let added = 0;
  for (const m of matches) if (await st.saveMatch(club.id, m)) added++;
  const shown = p.kind === 'track' ? matches[0] : matches[(p.game || 1) - 1];
  if (!shown) { await st.delPending(p.ref); await reply2(notice(`${club.name} has no recent matches`)); return json({ ok: true }); }
  if (p.kind === 'track') {
    await st.track(p.guild_id, { id: club.id, name: club.name, crest: club.crestId }, p.channel_id, p.user_id);
    await st.setLastTs(p.guild_id, club.id, Math.max(0, ...matches.map((m) => m.ts)));
  }
  await st.setPendingMatch(p.ref, club.id, shown.id, added);
  const jobs = await buildJobs(st, club, [shown]);
  if (!jobs.length) { await finish(env, st, { ...(await st.getPending(p.ref)) }); await st.delPending(p.ref); }
  return json({ ok: true, draw: jobs });
}

// Pictures are in: edit the waiting reply.
async function onDone(env, st, body) {
  const p = await st.getPending(body.ref);
  if (!p) return json({ ok: false, error: 'unknown ref' }, 404);
  await finish(env, st, p);
  await st.delPending(p.ref);
  return json({ ok: true });
}

// Scheduled poll: store new matches, queue their posts, hand back the pictures to draw.
async function onIngest(env, st, body) {
  const jobs = [];
  const tracked = await st.allTracked();
  for (const c of body.clubs ?? []) {
    const rows = tracked.filter((x) => x.club_id === String(c.id));
    if (!rows.length) continue;
    const matches = (c.matches ?? []).map((m) => normalizeMatch(m, c.id)).sort((a, b) => a.ts - b.ts);
    const floor = Math.min(...rows.map((r) => r.last_match_ts));
    const fresh = matches.filter((m) => m.ts > floor);
    for (const m of matches) await st.saveMatch(c.id, m);
    for (const t of rows) for (const m of fresh.filter((x) => x.ts > t.last_match_ts)) { await st.addOutbox({ guild: t.guild_id, channel: t.channel_id, club: t.club_id, match: m.id }); await st.setLastTs(t.guild_id, t.club_id, m.ts); }
    if (fresh.length) jobs.push(...await buildJobs(st, clubView(rows[0]), fresh));
    jobs.push(...await recapJobs(st, c.id, rows));
  }
  return json({ ok: true, draw: jobs });
}

// Ended playing sessions: one recap per (session, server), claimed first so it is never posted twice; its matches picture is drawn, then /flush posts it.
async function recapJobs(st, clubId, rows) {
  const now = Math.floor(Date.now() / 1000), jobs = [];
  const sessions = findSessions(clubId, await st.matchesSince(clubId, now - 24 * 3600)).filter((s) => isDue(s, now));
  for (const s of sessions) {
    const r = buildRecap(s);
    for (const t of rows) if (await st.claimRecap(r.key, t.guild_id, clubId, t.channel_id, r)) {
      const club = clubView(t), key = `${club.id}/recap-${hash(r)}.png`;
      jobs.push({ kind: 'recap', ref: r.key, key, club: { id: club.id }, data: { club: { name: club.name, crest: club.crest }, r } });
    }
  }
  return jobs;
}
async function postRecaps(env, st) {
  for (const o of await st.openRecaps()) {
    const t = (await st.trackedFor(o.guild_id)).find((x) => x.club_id === o.club_id), r = JSON.parse(o.model);
    if (!t || !o.channel_id) { await st.markRecap(o.key, o.guild_id); continue; }
    const club = clubView(t), u = urlOf(env, await st.cardMap(club.id));
    if (!u('recap', r.key) && Date.now() - o.created_at < 2 * 3600_000) continue; // wait for the picture (text fallback after 2 hours)
    if ((await postChannel(env, o.channel_id, P.recapPanel(env, club, r, u))).ok) await st.markRecap(o.key, o.guild_id);
  }
}

// Pictures are in: post what is waiting (a few per call, D1 caps queries per request).
async function onFlush(env, st) {
  let posted = 0;
  await postRecaps(env, st).catch((e) => console.error('recaps', e));
  await reminders(env, st).catch((e) => console.error('reminders', e)); // match-day reminders ride the 15-minute poll (the account has no spare cron triggers)
  const rows = (await st.takeOutbox()).slice(0, 6), tracked = await st.allTracked();
  for (const o of rows) {
    const t = tracked.find((x) => x.club_id === o.club_id && x.guild_id === o.guild_id), m = await st.storedMatch(o.club_id, o.match_id);
    if (t && m && o.channel_id) {
      const club = clubView(t);
      if ((await postChannel(env, o.channel_id, P.matchPanel(club, m, urlOf(env, await st.cardMap(club.id))))).ok) posted++;
    }
    await st.delOutbox(o.id);
  }
  return json({ ok: true, posted, left: Math.max(0, (await st.takeOutbox()).length) });
}

// Pictures a club is missing (club-wide cards, or one compare card).
async function onDraw(env, st, body) {
  if (String(body.extra ?? '').startsWith('lineup:')) { const j = await lineupJob(st, String(body.extra).slice(7)); return json({ ok: true, draw: j ? [j] : [] }); }
  const row = (await st.allTracked()).find((t) => t.club_id === String(body.club));
  if (!row) return json({ ok: true, draw: [] });
  const club = clubView(row), jobs = await buildJobs(st, club, body.extra ? [] : await st.recentMatches(club.id, 3)); // a refresh redraws the latest matches too, so older cards pick up new data
  if (body.extra) {
    const [x, y] = String(body.extra).split('|'), players = await st.rosterData(club.id);
    const a = players.find((p) => p.n.toLowerCase() === x), b = players.find((p) => p.n.toLowerCase() === y);
    if (a && b) { const data = { club: { name: club.name, crest: club.crest }, a, b }; jobs.push({ kind: 'compare', ref: body.extra, key: `${club.id}/compare-${hash(body.extra)}-${hash(data)}.png`, club: { id: club.id }, data }); }
  }
  return json({ ok: true, draw: jobs });
}

async function onUpload(env, st, url, req) {
  const key = url.searchParams.get('key') ?? '';
  if (!/^[a-z0-9][a-z0-9/_.-]{3,150}\.png$/.test(key)) return json({ error: 'bad key' }, 400);
  const b64 = await req.text(); // the picture as base64 text: stored as is, nothing to decode here
  if (!/^[A-Za-z0-9+/=]+$/.test(b64.slice(0, 200)) || b64.length > 1_800_000) return json({ error: 'bad picture' }, 400);
  await st.putBlob(key, b64);
  const club = url.searchParams.get('club');
  if (club) await st.putCard(club, url.searchParams.get('kind') ?? '', url.searchParams.get('ref') ?? '', key);
  await st.pruneBlobs();
  return json({ ok: true });
}

async function serveCard(st, key) {
  const b64 = await st.getBlob(key);
  if (!b64) return new Response('Not found', { status: 404 });
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), st = makeStore(d1Executor(env.DB));
    if (url.pathname === '/') return new Response('Mickey Ball Bot is running.');
    if (req.method === 'GET' && url.pathname.startsWith('/c/')) return serveCard(st, decodeURIComponent(url.pathname.slice(3)));
    if (url.pathname === '/interactions' && req.method === 'POST') {
      const body = await req.text();
      if (!(await verified(req, body, env.DISCORD_PUBLIC_KEY))) return new Response('Bad signature', { status: 401 });
      const i = JSON.parse(body);
      try {
        if (i.type === 1) return json({ type: 1 });
        if (i.type === 2) return await onCommand(env, ctx, st, i);
        if (i.type === 3) return await onComponent(env, ctx, st, i);
        if (i.type === 4) return await onAutocomplete(st, i);
      } catch (e) { console.error(e); return reply({ ...notice('Something went wrong', String(e.message ?? e).slice(0, 200)), flags: IS_V2 | EPHEMERAL }); }
      return json({ error: 'unsupported' }, 400);
    }
    // Everything below is for the GitHub Actions job and needs the shared key.
    if (!env.RELAY_KEY || req.headers.get('x-key') !== env.RELAY_KEY) return new Response('Forbidden', { status: 403 });
    if (url.pathname === '/tracked' && req.method === 'GET') return json({ clubs: [...new Set((await st.allTracked()).map((t) => t.club_id))] });
    if (url.pathname === '/card' && req.method === 'PUT') return onUpload(env, st, url, req);
    if (req.method !== 'POST') return new Response('Not found', { status: 404 });
    const body = await req.json().catch(() => ({}));
    if (url.pathname === '/relay') return onRelay(env, st, body);
    if (url.pathname === '/done') return onDone(env, st, body);
    if (url.pathname === '/ingest') return onIngest(env, st, body);
    if (url.pathname === '/flush') return onFlush(env, st);
    if (url.pathname === '/draw') return onDraw(env, st, body);
    return new Response('Not found', { status: 404 });
  },
};
