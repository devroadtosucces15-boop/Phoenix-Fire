// Rush screenshot scans: the leaderboard (managers) and end-of-season cards (members). See bot/scanocr.js for the reading and
// bot/lbinsights.js for the numbers; this file is the plumbing: routes, storage, Discord posts and the /board command.
//
//   GET  /api/lb                        members: latest leaderboard, movement, insights, chart series, history       (flag `rushBoard`)
//   POST /api/lb/scan                   managers: { image } → what the photo says + quality checks (nothing saved)
//   POST /api/lb/save                   managers: { rows, us, takenAt?, post? } → stored, insights worked out, posted to Discord
//   POST /api/lb/remove                 managers: { id } take a bad photo out of the history
//   POST /api/lb/season                 managers: { name, start, end, cardsFor? } the season clock (end = the day it rolls over, not
//                                       counted) and which season the end-of-season cards are for
//   GET  /api/seasoncard                members: my card, rankings; managers also get flags, grades, praise / concern     (flag `seasonCards`)
//   POST /api/seasoncard/scan           members: { image } → what the photo says + quality checks (nothing saved)
//   POST /api/seasoncard/save           members: { stats } → checked again, stored (replaces my earlier card), posted with @here + me
//   POST /api/seasoncard/remove         managers: { id } take a card down
// Discord: /board scan image:<photo> (managers) does scan + save + post in one go; /board latest shows the last post again.
// Posts go to the channels set for the purposes `rush_board` and `season_stats` (Boardroom → Organization). No channel, no post.
import { can, flagOn } from './roles.js';
import { kvOf } from './kv.js';
import { notifyManagers, safely } from './notify.js';
import { appConfigured, appEnv } from './apps.js';
import { orgName, resolveChannel } from './orgconfig.js';
import { message, header, text, sep, facts, footer, buttons, notice, reply } from './ui.js';
import { parseDataUrl, attachmentToDataUrl, scanBoard, scanSeason, cleanBoard, validateSeason } from './scanocr.js';
import { boardInsights, boardSeries, ladder, seasonBoard, seasonClock, fmt, signed } from './lbinsights.js';

export const DEFAULT_SEASON = { name: 'Season 2', start: '2026-10-22', end: '2026-12-03' };
const HOUR = 3600e3, DAY = 24 * HOUR;
const SCANS_PER_HOUR = { member: 6, manager: 30 };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);
const all = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results);
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
const parse = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const site = (env) => String(env.SITE_URL || '').replace(/\/?$/, '/');
const SPARK = '▁▂▃▄▅▆▇█';
export const sparkline = (xs) => { const v = xs.filter((x) => x != null); if (v.length < 2) return ''; const lo = Math.min(...v), hi = Math.max(...v); return v.map((x) => SPARK[hi === lo ? 3 : Math.round(((x - lo) / (hi - lo)) * 7)]).join(''); };

// ---------- season clock ----------
export async function getSeason(env) {
  const row = await one(env, "SELECT value FROM meta WHERE key = 'rush_season'");
  const s = { ...DEFAULT_SEASON, ...parse(row?.value, {}) };
  return { ...s, cardsFor: s.cardsFor || s.name };
}
async function setSeason(env, body) {
  const name = String(body.name ?? '').replace(/[\u0000-\u001f<>@`]/g, ' ').trim().slice(0, 30);
  const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T00:00:00Z`));
  if (!name) return { error: 'Give the season a name, e.g. Season 3.' };
  if (!ok(body.start) || !ok(body.end) || body.end < body.start) return { error: 'Start and end must be dates (YYYY-MM-DD), the end not before the start.' };
  const cardsFor = String(body.cardsFor ?? '').replace(/[\u0000-\u001f<>@`]/g, ' ').trim().slice(0, 30) || name;
  const value = JSON.stringify({ name, start: body.start, end: body.end, cardsFor });
  await run(env, "INSERT INTO meta (key, value) VALUES ('rush_season', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", value);
  return { season: { name, start: body.start, end: body.end, cardsFor } };
}

// ---------- AI budget: Workers AI is metered, so each person gets a few reads an hour ----------
async function spendScan(env, me) {
  const kv = kvOf(env);
  if (!kv) return true;
  const limit = can(me, 'board.scan') ? SCANS_PER_HOUR.manager : SCANS_PER_HOUR.member;
  const key = `scanrl:${me.u}:${Math.floor(Date.now() / HOUR)}`;
  const n = Number(await kv.get(key)) || 0;
  if (n >= limit) return false;
  await kv.put(key, String(n + 1), { expirationTtl: 2 * 3600 });
  return true;
}

// ---------- Discord ----------
const rushEnv = (env) => (appConfigured(env, 'rush') ? appEnv(env, 'rush') : env);
async function channelFor(env, purpose) { return (await resolveChannel(env, purpose))?.channelId ?? null; }
async function postTo(env, channel, msg) {
  const token = rushEnv(env).DISCORD_BOT_TOKEN || env.DISCORD_BOT_TOKEN; // the Rush app's own bot, else core's
  if (!channel) return { ok: false, error: 'No channel is set for this post yet (Boardroom → Organization).' };
  if (!token) return { ok: false, channel, error: 'Discord is not connected.' };
  const r = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, { method: 'POST', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, channel, error: `Discord refused the post (${r.status}${d.message ? `: ${d.message}` : ''}).` };
  return { ok: true, channel, id: d.id };
}

const trunc = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
// The leaderboard as a code-block table: top three, then us with two clubs either side. Δ = VP gained since the last photo.
export function tableText(lad, us) {
  const keep = new Set([0, 1, 2]);
  for (let i = us - 2; i <= us + 2; i++) if (i >= 0 && i < lad.length) keep.add(i);
  const lines = [`${'#'.padStart(2)}  ${'Club'.padEnd(17)}${'VP'.padStart(7)}${'AVG'.padStart(7)}${'Δ'.padStart(6)}`];
  let prev = -1;
  for (const i of [...keep].filter((i) => i < lad.length).sort((a, b) => a - b)) {
    if (prev >= 0 && i - prev > 1) lines.push('   …');
    const r = lad[i];
    lines.push(`${String(r.rank).padStart(2)}${i === us ? '▶' : ' '} ${trunc(r.club, 16).padEnd(17)}${fmt(r.vp).padStart(7)}${(r.avg == null ? '–' : r.avg.toFixed(1)).padStart(7)}${(r.dVp == null ? '' : signed(r.dVp)).padStart(6)}`);
    prev = i;
  }
  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

export function boardMessage(env, cur, ins, lad, series, { season, by } = {}) {
  const me = cur.rows[cur.us], d = ins.delta, clock = ins.season;
  const move = d ? (d.rank > 0 ? `▲${d.rank}` : d.rank < 0 ? `▼${-d.rank}` : '=') : null;
  const g = ins.gaps;
  const sub = [season?.name, clock ? `Day ${clock.day}/${clock.total}` : null, `photo <t:${Math.floor(cur.taken_at / 1000)}:R>`].filter(Boolean).join(' · ');
  const gaps = [
    g.leader ? `**To #1** ${fmt(g.leader)} VP behind ${ins.near.leader}${d?.leaderGap != null ? ` (${signed(d.leaderGap)} since the last photo)` : ''}` : '**Leading** the board',
    g.above != null && ins.near.above !== ins.near.leader ? `**Ahead of us** ${ins.near.above} +${fmt(g.above)} VP${d?.aboveGap != null ? ` (${signed(d.aboveGap)})` : ''}` : null,
    g.below != null ? `**Behind us** ${ins.near.below} −${fmt(g.below)} VP${d?.belowGap != null ? ` (${signed(d.belowGap)})` : ''}` : null,
  ].filter(Boolean).join('\n');
  const trend = series.points.length > 1 ? `**VP trend** \`${sparkline(series.points.slice(-14).map((p) => p.vp))}\`   **Rank** ${series.points.slice(-6).map((p) => `#${p.rank}`).join(' → ')}` : null;
  const pace = ins.pace?.mine != null ? [`**Pace** ${ins.pace.mine} VP/h`, ins.pace.above != null ? `${ins.near.above}: ${ins.pace.above}` : null, ins.pace.below != null ? `${ins.near.below}: ${ins.pace.below}` : null].filter(Boolean).join(' · ') : null;
  const f = ins.forecast;
  return message({
    accent: d?.rank > 0 ? 'win' : d?.rank < 0 ? 'loss' : 'red',
    blocks: [
      header({ eyebrow: `${orgName(env)} · Rush leaderboard`, title: `#${me.rank}${move ? ` ${move}` : ''} · ${fmt(me.vp)} VP`, sub }),
      text(tableText(lad, cur.us)),
      sep(), text(gaps),
      d ? text(`**Since the last photo (${d.hours}h)** ${signed(d.vp)} VP${d.m != null ? ` · ${d.m} matches` : ''}`) : null,
      trend ? text(trend) : null, pace ? text(pace) : null,
      f?.projected ? text(`**Projected finish** ~${fmt(f.projected)} VP at this pace (${f.daysLeft} days left)`) : null,
      ins.advice.length ? sep() : null,
      ins.advice.length ? text(ins.advice.map((a) => `• ${a}`).join('\n')) : null,
      footer(`${by ? `Photo by ${by} · ` : ''}Numbers are read from the photo and checked`),
      buttons([{ label: 'Full leaderboard and charts', url: `${site(env)}rushboard.html` }]),
    ].filter(Boolean),
  });
}

export function seasonCardMessage(env, card, rankInfo) {
  const s = card.stats, wr = s.matches ? Math.round((s.wins / s.matches) * 100) : 0;
  const share = s.clubVp ? `${((s.myVp / s.clubVp) * 100).toFixed(1)}% of the club's VP` : null;
  return message({
    accent: wr >= 60 ? 'win' : wr >= 45 ? 'red' : 'loss',
    ping: `@here <@${card.user_id}>`, mentions: { parse: ['everyone'], users: [card.user_id] },
    blocks: [
      header({ eyebrow: `${orgName(env)} · ${card.season} Rush card`, title: card.name, sub: [s.tier, s.club].filter(Boolean).join(' · ') || null }),
      facts([['🎮 Matches', fmt(s.matches)], ['🏆 Wins', `${fmt(s.wins)} (${wr}%)`], ['⚽ Goals', `${fmt(s.goals)} (${s.matches ? (s.goals / s.matches).toFixed(2) : '0'} per match)`], ['🔥 Contribution', `${fmt(s.myVp)} VP${share ? ` · ${share}` : ''}`]]),
      rankInfo ? sep() : null,
      rankInfo ? text(`**#${rankInfo.vp}** by VP · **#${rankInfo.winRate}** by win rate · **#${rankInfo.goals}** by goals — of ${rankInfo.of} ${rankInfo.of === 1 ? 'card' : 'cards'} in`) : null,
      footer('Read from the member’s own screenshot and checked'),
      buttons([{ label: 'Season rankings', url: `${site(env)}seasoncards.html` }]),
    ].filter(Boolean),
  });
}

// ---------- leaderboard ----------
async function loadBoards(env, season, limit = 120) {
  const rows = await all(env, 'SELECT * FROM rush_boards WHERE season = ? ORDER BY taken_at DESC, id DESC LIMIT ?', season, limit);
  return rows.map((r) => ({ id: r.id, taken_at: r.taken_at, rows: parse(r.rows, []), us: r.us, by_name: r.by_name, qc: parse(r.qc, {}), posted: !!r.posted_msg })).reverse(); // oldest first
}

export async function boardView(env, me) {
  const season = await getSeason(env);
  const snaps = await loadBoards(env, season.name);
  const latest = snaps.at(-1) ?? null;
  const base = { season, clock: seasonClock(season), canScan: can(me, 'board.scan'), club: orgName(env) };
  if (!latest) return { ...base, latest: null, history: [] };
  const prior = snaps.slice(0, -1);
  const ins = boardInsights(latest, prior, { season });
  return {
    ...base, insights: ins, series: boardSeries(snaps), ladder: ladder(latest, prior.at(-1)),
    latest: { id: latest.id, taken_at: latest.taken_at, by: latest.by_name, us: latest.us, rows: latest.rows, qc: latest.qc },
    history: snaps.slice().reverse().slice(0, 40).map((s) => ({ id: s.id, taken_at: s.taken_at, by: s.by_name, rank: s.rows[s.us]?.rank ?? null, vp: s.rows[s.us]?.vp ?? null })),
  };
}

// Stores a checked leaderboard, works out the insights and posts them. `input` = { rows, us?, takenAt?, post? }.
export async function saveBoard(env, me, input, { log } = {}) {
  const ours = orgName(env);
  const { rows, us, qc } = cleanBoard({ rows: input.rows, highlighted_rank: Number.isInteger(input.us) ? input.rows?.[input.us]?.rank : null }, { ours });
  const pick = Number.isInteger(input.us) && rows[input.us] ? input.us : us; // the person's choice of our row wins when it is valid
  if (pick != null) qc.errors = qc.errors.filter((e) => !/not found/.test(e));
  qc.edited = !!input.edited;
  if (qc.errors.length) return { error: qc.errors[0], qc, status: 422 };
  const season = await getSeason(env);
  const now = Date.now();
  let takenAt = Number(input.takenAt);
  if (!Number.isFinite(takenAt) || takenAt > now + 5 * 60e3 || takenAt < now - 14 * DAY) takenAt = now;
  const prior = await loadBoards(env, season.name);
  const last = prior.at(-1);
  if (last && !input.force && JSON.stringify(last.rows.map((r) => [r.club, r.vp, r.m])) === JSON.stringify(rows.map((r) => [r.club, r.vp, r.m]))) {
    return { error: 'This is the same leaderboard as the last photo. Nothing has changed since.', qc, status: 409 };
  }
  const cur = { taken_at: takenAt, rows, us: pick };
  const r = await run(env, 'INSERT INTO rush_boards (season, taken_at, at, by_id, by_name, rows, us, qc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', season.name, takenAt, now, me.u, me.n, JSON.stringify(rows), pick, JSON.stringify(qc));
  const id = r.meta?.last_row_id;
  const snaps = [...prior, { ...cur, id }].sort((a, b) => a.taken_at - b.taken_at);
  const before = snaps.filter((s) => s.taken_at < takenAt);
  const ins = boardInsights(cur, before, { season, now: takenAt });
  let posted = { ok: false, skipped: true };
  if (input.post !== false) {
    const msg = boardMessage(env, cur, ins, ladder(cur, before.at(-1)), boardSeries(snaps), { season, by: me.n });
    posted = await postTo(env, await channelFor(env, 'rush_board'), msg);
    if (posted.ok) await run(env, 'UPDATE rush_boards SET posted_channel = ?, posted_msg = ? WHERE id = ?', posted.channel, posted.id, id);
  }
  await log?.(env, me, 'rush-board', `#${rows[pick].rank} · ${rows[pick].vp} VP`);
  return { id, insights: ins, posted, qc, status: 200 };
}

// ---------- season cards ----------
async function claimOf(env, uid) { return one(env, "SELECT player, player_name FROM claims WHERE user_id = ? AND status = 'approved'", uid); }
async function loadCards(env, season) {
  return (await all(env, "SELECT * FROM rush_season_cards WHERE season = ? AND status = 'saved' ORDER BY at", season))
    .map((c) => ({ id: c.id, season: c.season, user_id: c.user_id, name: c.name, avatar: c.avatar, player: c.player, stats: parse(c.stats, {}), qc: parse(c.qc, {}), at: c.at, posted: !!c.posted_msg }));
}

export async function cardsView(env, me) {
  const season = await getSeason(env);
  const cards = await loadCards(env, season.cardsFor);
  const board = seasonBoard(cards);
  const manager = can(me, 'season.manage');
  const mine = cards.find((c) => c.user_id === me.u) ?? null;
  const people = board.people.map((p) => ({ ...p, flags: manager ? p.flags : undefined, grade: manager ? p.grade : undefined, id: cards.find((c) => c.user_id === p.user_id)?.id }));
  const missing = manager ? (await all(env, "SELECT u.id, u.name FROM users u WHERE u.role IN ('member','claimed','manager','owner') AND u.last_at > ? ORDER BY u.name", Date.now() - 45 * DAY)).filter((u) => !cards.some((c) => c.user_id === u.id)).slice(0, 80) : undefined;
  return { season: { name: season.cardsFor, current: season.name, clock: seasonClock(season) }, mine, totals: board.totals, people, praise: manager ? board.praise : undefined, concern: manager ? board.concern : undefined, missing, canManage: manager, club: orgName(env) };
}

export async function saveCard(env, me, input, { log } = {}) {
  const ours = orgName(env);
  const { stats, qc } = validateSeason(input.stats ?? {}, { ours });
  qc.edited = !!input.edited;
  if (qc.errors.length) return { error: qc.errors[0], qc, status: 422 };
  const season = await getSeason(env);
  const claim = await claimOf(env, me.u);
  const at = Date.now();
  await run(env, `INSERT INTO rush_season_cards (season, user_id, name, avatar, player, stats, qc, at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'saved')
    ON CONFLICT (season, user_id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, player = excluded.player, stats = excluded.stats, qc = excluded.qc, at = excluded.at, status = 'saved', posted_channel = NULL, posted_msg = NULL`,
  season.cardsFor, me.u, me.n, me.a ?? null, claim?.player ?? null, JSON.stringify(stats), JSON.stringify(qc), at);
  const cards = await loadCards(env, season.cardsFor);
  const board = seasonBoard(cards);
  const card = cards.find((c) => c.user_id === me.u);
  const mine = board.people.find((p) => p.user_id === me.u);
  const msg = seasonCardMessage(env, card, { ...mine.rank, of: board.people.length });
  const posted = await postTo(env, await channelFor(env, 'season_stats'), msg);
  if (posted.ok) await run(env, 'UPDATE rush_season_cards SET posted_channel = ?, posted_msg = ? WHERE season = ? AND user_id = ?', posted.channel, posted.id, season.cardsFor, me.u);
  if (qc.warnings.length) await safely(notifyManagers(env, { icon: '🧐', title: `Season card to look at: ${me.n}`, body: qc.warnings.slice(0, 2).join(' '), link: 'seasoncards.html' }, me.u));
  await log?.(env, me, 'season-card', `${season.cardsFor} · ${stats.matches} matches · ${stats.myVp} VP`);
  return { card, posted, qc, rank: mine.rank, of: board.people.length, status: 200 };
}

// ---------- routes ----------
export async function rushScanRoute(p, method, body, me, env, log) {
  if (!/^\/api\/(lb|seasoncard)(\/|$)/.test(p)) return null; // NB: not /api/rushboard – members.js sends everything under /api/rush* to the Rush log
  if (!env.DB) return fail('The member database is not connected.', 503);
  const board = p.startsWith('/api/lb');
  if (!flagOn(env, me, board ? 'rushBoard' : 'seasonCards')) return fail('Not available yet.', 404);
  const sub = p.replace(/^\/api\/(lb|seasoncard)/, '') || '/';

  if (board) {
    if (sub === '/' && method === 'GET') return json(await boardView(env, me));
    if (!can(me, 'board.scan')) return fail('Managers only.', 403);
    if (method !== 'POST') return fail('Not found', 404);
    if (sub === '/scan') {
      const img = parseDataUrl(body.image);
      if (img.error) return fail(img.error);
      if (!(await spendScan(env, me))) return fail('That is the hourly limit for photo reads. Try again in a bit.', 429);
      try { const d = await scanBoard(env, img.url, { ours: orgName(env) }); return json({ ...d, season: (await getSeason(env)).name, read: d.season }); } catch (e) { return fail(e.message, 502); }
    }
    if (sub === '/save') { const r = await saveBoard(env, me, body, { log }); const { status, ...out } = r; return json(out, status); }
    if (sub === '/remove') {
      const r = await run(env, 'DELETE FROM rush_boards WHERE id = ?', Number(body.id) || 0);
      if (!(r.meta?.changes ?? r.changes)) return fail('Photo not found', 404);
      await log?.(env, me, 'rush-board-remove', String(body.id));
      return json(await boardView(env, me));
    }
    if (sub === '/season') {
      if (!can(me, 'season.manage')) return fail('Managers only.', 403);
      const r = await setSeason(env, body);
      if (r.error) return fail(r.error);
      await log?.(env, me, 'rush-season', r.season.name);
      return json(await boardView(env, me));
    }
    return fail('Not found', 404);
  }

  if (sub === '/' && method === 'GET') return json(await cardsView(env, me));
  if (method !== 'POST') return fail('Not found', 404);
  if (!can(me, 'season.submit')) return fail('Members only.', 403);
  if (sub === '/scan') {
    const img = parseDataUrl(body.image);
    if (img.error) return fail(img.error);
    if (!(await spendScan(env, me))) return fail('That is the hourly limit for photo reads. Try again in a bit.', 429);
    try { const d = await scanSeason(env, img.url, { ours: orgName(env) }); return json(d); } catch (e) { return fail(e.message, 502); }
  }
  if (sub === '/save') { const r = await saveCard(env, me, body, { log }); const { status, ...out } = r; return json(out, status); }
  if (sub === '/remove') {
    if (!can(me, 'season.manage')) return fail('Managers only.', 403);
    const c = await one(env, 'SELECT * FROM rush_season_cards WHERE id = ?', Number(body.id) || 0);
    if (!c) return fail('Card not found', 404);
    await run(env, "UPDATE rush_season_cards SET status = 'removed' WHERE id = ?", c.id);
    await log?.(env, me, 'season-card-remove', `${c.name} · ${c.season}`);
    return json(await cardsView(env, me));
  }
  return fail('Not found', 404);
}

// ---------- /board (Phoenix Rush app, managers) ----------
const say = (title, body = '', accent) => reply(notice(title, body, accent ? { accent } : {}));
export async function boardCommand(i, env, ctx, who, { defer, edit }) {
  if (!flagOn(env, who, 'rushBoard')) return say('Not switched on for you yet', 'Ask the owner.');
  if (!can(who, 'board.scan')) return say('Managers only', 'Leaderboard photos are taken by managers.');
  const top = i.data.options?.[0], sub = top?.name ?? 'latest';
  if (sub === 'latest') {
    const v = await boardView(env, who);
    if (!v.latest) return say('No leaderboard photo yet', 'Use /board scan with a photo of the Rush leaderboard.');
    const cur = { ...v.latest };
    return reply(boardMessage(env, cur, v.insights, v.ladder, v.series, { season: v.season, by: v.latest.by }));
  }
  const opt = top.options?.find((o) => o.name === 'image')?.value;
  const att = i.data.resolved?.attachments?.[opt];
  if (!att) return say('Attach the photo', 'Add the leaderboard image to the command.');
  ctx.waitUntil((async () => {
    let msg;
    try {
      const img = await attachmentToDataUrl(att);
      if (img.error) throw new Error(img.error);
      if (!(await spendScan(env, who))) throw new Error('That is the hourly limit for photo reads. Try again in a bit.');
      const d = await scanBoard(env, img.url, { ours: orgName(env) });
      if (d.qc.errors.length) {
        msg = notice('The photo needs a quick fix', `${d.qc.errors.slice(0, 3).join('\n')}\nCheck it on the site and save from there: ${site(env)}rushboard.html`);
      } else {
        const r = await saveBoard(env, who, { rows: d.rows, us: d.us, post: true });
        if (r.error) msg = notice('Not saved', r.error);
        else msg = notice('Leaderboard saved', `#${r.insights.rank} with ${fmt(r.insights.vp)} VP. ${r.posted.ok ? `Posted in <#${r.posted.channel}>.` : (r.posted.error ?? '')}${d.qc.warnings.length ? `\nHeads up: ${d.qc.warnings.slice(0, 2).join(' ')}` : ''}`, { accent: 'win' });
      }
    } catch (e) { msg = notice('Could not read that photo', e.message); }
    await edit(msg);
  })());
  return defer();
}
