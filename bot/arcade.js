// PF-024 Item 23 – the arcade, first slice: turn-based games between two members played with buttons in one channel message (the Discord Activity version waits for the owner's hosting decision,
// PLANNING/PF-024-GO-LIVE.md). /arcade play <game> <member> | top | me. The rules are pure functions in bot/arcadegames.js (noughts and crosses, connect four, rock paper scissors, penalty shootout);
// this file is the Discord layer and the records. State lives in D1 (migration 0078): arcade_games (one row per game, compare-and-set `ver`) and arcade_scores (the arcade's own score).
// Score: win 4, draw 2, loss 1 (a played game 1 plus 3 for the win). Shared points use bot/points.js awardRule('games.played' | 'games.won') only: once per game per member through `ref`, only for
// games with at least MIN_MOVES moves (so opening and resigning pays nothing), and at most PAY_CAP paid games per member per day. No channel or role is hardcoded: the game is played where it was started.
// Phoenix look: orange panel, the Phoenix fire and ice marks, org name from config; flag `arcade` (owner first).
import { can, flagOn } from './roles.js';
import { message, notice, reply, header, text, sep, footer, button } from './ui.js';
import { orgName } from './orgconfig.js';
import { awardRule } from './points.js';
import { GAMES, GAME_KEYS, ROWS_C4, COLS_C4 } from './arcadegames.js';

export const ARCADE_COMMANDS = new Set(['arcade']);
export const ARCADE_ID = /^pf:arc:/;
export const ARCADE_FLAG = 'arcade';
export const MIN_MOVES = 4; // fewer moves than this: no score, no points
export const PAY_CAP = 10; // paid games per member per rolling day
export const OPEN_CAP = 3; // games a member may have open (invited or playing) at once as the starter
export const EXPIRE_MS = 24 * 3600 * 1000;
export const SEAT = ['🔥', '🧊'];
const SCORE = { win: 4, draw: 2, loss: 1 };
const note = (title, body = '') => reply(notice(title, body));
const userOf = (i) => i.member?.user?.id ?? i.user?.id ?? '';
const nameOf = (u) => String(u?.global_name || u?.username || 'Member').replace(/[\u0000-\u001f<>@`*_~|]/g, '').slice(0, 32) || 'Member';
const memberName = (i) => nameOf(i.member?.nick ? { global_name: i.member.nick } : (i.member?.user ?? i.user));

const row = (...b) => ({ type: 1, components: b.filter(Boolean) });
const seatOf = (g, user) => (g.p1 === user ? 0 : g.p2 === user ? 1 : -1);
const nameSeat = (g, s) => (s === 0 ? g.p1_name : g.p2_name);
const parse = (g) => JSON.parse(g.state);

// ---------- the game message ----------
function boardText(g, s) {
  if (g.game === 'c4') {
    return s.g.map((r) => r.map((v) => (v === null ? '⚫' : SEAT[v])).join('')).join('\n') + '\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';
  }
  if (g.game === 'rps') {
    const sym = { r: '🪨', p: '📄', s: '✂️' };
    const picked = [0, 1].map((k) => `${SEAT[k]} ${nameSeat(g, k)} ${s.pick[k] === null ? '…thinking' : '✔️ locked in'}`).join('\n');
    const past = s.log.map(([a, b], k) => `Round ${k + 1}: ${sym[a]} vs ${sym[b]}`).join('\n');
    return `**${s.wins[0]} – ${s.wins[1]}** (first to 2)\n${picked}${past ? `\n${past}` : ''}`;
  }
  if (g.game === 'pens') {
    const sym = { l: '⬅️', m: '⬆️', r: '➡️' };
    const done = s.k, shooter = done % 2;
    const past = s.log.map((x) => `${SEAT[x.s]} ${sym[x.a]} vs 🧤 ${sym[x.b]} ${x.g ? '⚽ goal' : '🧤 saved'}`).join('\n');
    return `**${SEAT[0]} ${s.score[0]} – ${s.score[1]} ${SEAT[1]}** · kick ${Math.min(done + 1, 99)}\n${SEAT[shooter]} ${nameSeat(g, shooter)} shoots, ${SEAT[1 - shooter]} ${nameSeat(g, 1 - shooter)} keeps${past ? `\n${past}` : ''}`;
  }
  return '';
}
function controls(g, s, over) {
  const id = (arg) => `pf:arc:mv:${g.id}:${arg}`;
  if (g.game === 'ttt') {
    return [0, 1, 2].map((r) => row(...[0, 1, 2].map((c) => {
      const v = s.b[r * 3 + c];
      return button({ id: id(r * 3 + c), label: v === null ? '·' : undefined, emoji: v === null ? undefined : SEAT[v], style: v === 0 ? 'brand' : 'grey', disabled: over || v !== null });
    })));
  }
  if (g.game === 'c4') {
    const full = (c) => s.g[0][c] !== null;
    const cols = Array.from({ length: COLS_C4 }, (_, c) => button({ id: id(c), label: String(c + 1), disabled: over || full(c) }));
    return [row(...cols.slice(0, 4)), row(...cols.slice(4))];
  }
  if (g.game === 'rps') return [row(button({ id: id('r'), label: 'Rock', emoji: '🪨', disabled: over }), button({ id: id('p'), label: 'Paper', emoji: '📄', disabled: over }), button({ id: id('s'), label: 'Scissors', emoji: '✂️', disabled: over }))];
  return [row(button({ id: id('l'), label: 'Left', emoji: '⬅️', disabled: over }), button({ id: id('m'), label: 'Middle', emoji: '⬆️', disabled: over }), button({ id: id('r'), label: 'Right', emoji: '➡️', disabled: over }))];
}
function resultLine(g) {
  if (g.status === 'declined') return `${g.p2_name} declined the challenge.`;
  if (g.status === 'expired') return 'This game timed out after a day with no move.';
  if (g.winner === null || g.winner === undefined) return `**Draw** between <@${g.p1}> and <@${g.p2}>.`;
  const w = g.winner, who = w === 0 ? g.p1 : g.p2;
  return `${SEAT[w]} **<@${who}> wins**${g.ended_by === 'resign' ? ` (${nameSeat(g, 1 - w)} resigned)` : ''}.`;
}
/** the whole game as a channel message (invite, board, or result) */
export function view(g, env, { ping = false } = {}) {
  const G = GAMES[g.game], s = parse(g), over = g.status === 'done' || g.status === 'declined' || g.status === 'expired';
  const blocks = [header({ eyebrow: `${orgName(env)} · Arcade`, title: `${G.icon} ${G.name}`, sub: `${SEAT[0]} ${g.p1_name} vs ${SEAT[1]} ${g.p2_name}`, size: 2 })];
  if (g.status === 'invited') {
    blocks.push(text(`<@${g.p2}>, <@${g.p1}> challenges you.\n${G.blurb}.`), sep(), row(button({ id: `pf:arc:acc:${g.id}`, label: 'Accept', style: 'ok' }), button({ id: `pf:arc:dec:${g.id}`, label: 'Decline', style: 'grey' })));
  } else {
    const wait = G.waiting(s);
    const status = over ? resultLine(g) : wait.length === 1 ? `${SEAT[wait[0]]} <@${wait[0] === 0 ? g.p1 : g.p2}> to play.` : 'Both players choose now.';
    blocks.push(text(boardText(g, s)), text(status), sep());
    blocks.push(...controls(g, s, over));
    if (!over) blocks.push(row(button({ id: `pf:arc:res:${g.id}`, label: 'Resign' })));
  }
  blocks.push(footer(`${orgName(env)} · Rise. Burn. Repeat.${over ? '' : ` · game #${g.id}`}`));
  const m = message({ accent: g.status === 'done' ? (g.winner == null ? 'gold' : 'win') : 'red', blocks, mentions: ping ? { users: [g.p2] } : { parse: [] } });
  return m;
}
const update = (g, env) => ({ type: 7, data: view(g, env) });

// ---------- records ----------
const load = (env, id) => env.DB.prepare('SELECT * FROM arcade_games WHERE id = ?').bind(id).first();
async function addScore(env, userId, name, kind) {
  const col = { win: 'wins', draw: 'draws', loss: 'losses' }[kind];
  await env.DB.prepare(`INSERT INTO arcade_scores (user_id, name, score, played, ${col}) VALUES (?, ?, ?, 1, 1)
    ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, score = score + excluded.score, played = played + 1, ${col} = ${col} + 1`).bind(userId, name, SCORE[kind]).run();
}
/** score and shared points for a game that has just ended (called once, by the request whose UPDATE closed it) */
export async function settle(env, g, now = Date.now()) {
  if (g.moves < MIN_MOVES) return { paid: false };
  const kinds = g.winner == null ? ['draw', 'draw'] : g.winner === 0 ? ['win', 'loss'] : ['loss', 'win'];
  for (const [k, uid, name] of [[kinds[0], g.p1, g.p1_name], [kinds[1], g.p2, g.p2_name]]) {
    await addScore(env, uid, name, k).catch(() => {});
    const paid = (await env.DB.prepare("SELECT COUNT(*) AS n FROM arcade_games WHERE status = 'done' AND moves >= ? AND (p1 = ? OR p2 = ?) AND updated_at > ? AND id <> ?").bind(MIN_MOVES, uid, uid, now - 86400000, g.id).first('n').catch(() => 0)) || 0;
    if (paid >= PAY_CAP) continue;
    await awardRule(env, uid, 'games.played', `Arcade · ${GAMES[g.game].name}`, { ref: `arcade:${g.id}:p:${uid}` });
    if (k === 'win') await awardRule(env, uid, 'games.won', `Arcade win · ${GAMES[g.game].name}`, { ref: `arcade:${g.id}:w:${uid}` });
  }
  return { paid: true };
}
/** close a game with a compare-and-set; true only for the request that closed it */
async function close(env, g, status, winner, endedBy, now) {
  const r = await env.DB.prepare('UPDATE arcade_games SET status = ?, winner = ?, ended_by = ?, ver = ver + 1, updated_at = ? WHERE id = ? AND ver = ? AND status IN (\'invited\', \'playing\')').bind(status, winner, endedBy, now, g.id, g.ver).run();
  return !!r.meta?.changes;
}

// ---------- /arcade ----------
async function start(i, env, who, now) {
  const o = Object.fromEntries((i.data.options?.[0]?.options ?? []).map((x) => [x.name, x.value]));
  const game = GAMES[o.game] ? o.game : null;
  if (!game) return note('Pick a game', GAME_KEYS.map((k) => GAMES[k].name).join(', '));
  const me = userOf(i), opp = String(o.opponent ?? ''), ou = i.data.resolved?.users?.[opp];
  if (!opp || !ou) return note('Pick a member to play');
  if (opp === me) return note('Pick someone else', 'You need another member to play against.');
  if (ou.bot) return note('Pick a person', 'Bots do not play.');
  const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM arcade_games WHERE p1 = ? AND status IN ('invited', 'playing') AND updated_at > ?").bind(me, now - EXPIRE_MS).first('n');
  if (open >= OPEN_CAP) return note('Too many open games', `Finish or resign one first (limit ${OPEN_CAP}).`);
  const oppMember = i.data.resolved?.members?.[opp];
  const oppName = nameOf(oppMember?.nick ? { global_name: oppMember.nick } : ou);
  const state = JSON.stringify(GAMES[game].init());
  const r = await env.DB.prepare('INSERT INTO arcade_games (game, p1, p1_name, p2, p2_name, state, status, channel_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(game, me, memberName(i), opp, oppName, state, 'invited', i.channel_id ?? null, now, now).run();
  return reply(view(await load(env, r.meta.last_row_id), env, { ping: true }));
}
async function top(env) {
  const rows = (await env.DB.prepare('SELECT * FROM arcade_scores ORDER BY score DESC, wins DESC, played ASC LIMIT 10').all()).results ?? [];
  return reply(message({ accent: 'gold', ephemeral: true, blocks: [header({ eyebrow: `${orgName(env)} · Arcade`, title: 'Top players', size: 3 }),
    text(rows.length ? rows.map((r, k) => `**${k + 1}.** ${r.name || 'Member'} · ${r.score} pts · ${r.wins}W ${r.draws}D ${r.losses}L`).join('\n') : 'No finished games yet. Start one with `/arcade play`.'), footer(`${orgName(env)} · Rise. Burn. Repeat.`)] }));
}
async function mine(env, me) {
  const r = await env.DB.prepare('SELECT * FROM arcade_scores WHERE user_id = ?').bind(me).first();
  return reply(message({ accent: 'red', ephemeral: true, blocks: [header({ eyebrow: `${orgName(env)} · Arcade`, title: 'Your record', size: 3 }),
    text(r ? `**${r.score}** arcade points · ${r.played} played · ${r.wins}W ${r.draws}D ${r.losses}L` : 'You have not finished a game yet. Start one with `/arcade play`.'), footer(`${orgName(env)} · Rise. Burn. Repeat.`)] }));
}
export async function arcadeCommand(i, env, who, now = Date.now()) {
  if (!flagOn(env, who, ARCADE_FLAG)) return note('Not switched on yet', 'The arcade is being tested.');
  if (!can(who, 'arcade.play')) return note('Members only');
  if (!env.DB) return note('The member database is not connected');
  const sub = i.data?.options?.[0]?.name;
  if (sub === 'play') return start(i, env, who, now);
  if (sub === 'top') return top(env);
  if (sub === 'me') return mine(env, userOf(i));
  return note('Pick play, top or me');
}

/** every button on a game message */
export async function arcadeButton(i, env, who, now = Date.now()) {
  if (!flagOn(env, who, ARCADE_FLAG) || !can(who, 'arcade.play')) return note('Not switched on yet', 'The arcade is being tested.');
  if (!env.DB) return note('The member database is not connected');
  const [, , verb, idRaw, arg] = String(i.data?.custom_id ?? '').split(':'), id = Number(idRaw), me = userOf(i);
  let g = Number.isInteger(id) ? await load(env, id) : null;
  if (!g) return note('Game not found', 'It may be too old.');
  const seat = seatOf(g, me);
  if (seat < 0) return note('This is not your game', 'Only the two players can press these. Start your own with `/arcade play`.');
  if (g.status === 'done' || g.status === 'declined' || g.status === 'expired') return update(g, env);
  if (now - g.updated_at > EXPIRE_MS) { await close(env, g, 'expired', null, 'expire', now); return update(await load(env, id), env); }
  if (verb === 'acc' || verb === 'dec') {
    if (g.status !== 'invited') return update(g, env);
    if (verb === 'acc') {
      if (seat !== 1) return note('Waiting for them', 'Only the invited member can accept.');
      await env.DB.prepare("UPDATE arcade_games SET status = 'playing', ver = ver + 1, updated_at = ? WHERE id = ? AND ver = ? AND status = 'invited'").bind(now, id, g.ver).run();
    } else await close(env, g, 'declined', null, 'decline', now);
    return update(await load(env, id), env);
  }
  if (g.status !== 'playing') return note('Not started', 'The invited member has to accept first.');
  if (verb === 'res') {
    if (!(await close(env, g, 'done', 1 - seat, 'resign', now))) return update(await load(env, id), env);
    g = await load(env, id); await settle(env, g, now); return update(g, env);
  }
  if (verb !== 'mv') return note('Unknown button');
  const G = GAMES[g.game], s = parse(g), move = g.game === 'ttt' || g.game === 'c4' ? Number(arg) : arg;
  const res = G.play(s, seat, move);
  if (res.error) return note(res.error);
  const out = G.outcome(res.state), status = out ? 'done' : 'playing', winner = out ? out.winner : null;
  const r = await env.DB.prepare('UPDATE arcade_games SET state = ?, status = ?, winner = ?, ended_by = ?, moves = moves + 1, ver = ver + 1, updated_at = ? WHERE id = ? AND ver = ? AND status = \'playing\'')
    .bind(JSON.stringify(res.state), status, winner, out ? 'finish' : null, now, id, g.ver).run();
  g = await load(env, id);
  if (!r.meta?.changes) return update(g, env); // someone else's click landed first: show the current board
  if (out) await settle(env, g, now);
  return update(g, env);
}
