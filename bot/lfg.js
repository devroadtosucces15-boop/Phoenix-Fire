// MB5 – Rush LFG (PLANNING/BOT-SPLIT.md "Rush bot, later"). /lfg now posts "available for Rush" to the channel, tagging the
// Rush role (never @everyone), with "I'm in" / "later" buttons. It expires on its own (default 60 min, max 180), each player
// has a cooldown, moderation-muted members cannot post, and members can mute the alerts in the notification settings (type
// `lfg`). Flag `rushLfg` (default owner). Dark until the Phoenix Rush app is configured (bot/apps.js HELD).
import { can, flagOn, muted } from './roles.js';
import { pingRoleFor } from './orgconfig.js';
import { RUSH_POSITIONS, ANY, cleanPositions, posLabel, dm } from './rushmatch.js';
import { resolveOffer, matchNewPlayer, passCaptainTo, loadQueue, saveQueue, join, setMembers, find, commit, ping, rushEnv, postAll, getState, MAX_CREW } from './rushqueue.js';
import { discord } from './servertools.js';
import { message, header, text, facts, footer, buttons, reply, pictureNote, picture, sep } from './ui.js';

export const LFG_DEFAULT_MIN = 30, LFG_MAX_MIN = 180, LFG_COOLDOWN_MIN = 10;
export const LFG_EXTEND_MIN = 60, LFG_HARD_MAX_MIN = 360, LFG_ASK_BEFORE_MIN = 10, LFG_REPOST_GAP = 90e3, ASK_TTL_MIN = 15;
// `later` stays matched only to answer "that option was removed". down / plus = the poster's Take down and +1 hour; keep / done = the "still here?" DM;
// lobby = Make a lobby; alert = Alert me; ask:y|n:<id> = a lobby request DM (Accept / No thanks).
export const LFG_ID = /^pf:lfg:(\d+:(in|later|down|plus|keep|done|lobby)|(acc|dec):\d+|alert|ask:(y|n):\d+)$/;
const MIN = 60e3;
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>@`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// Short private replies carry a drawn picture: the shared "not available" / "check and try again" ones, or this command's own (scripts/cards.mjs SLASH).
const say = (env, key, title, body, accent) => reply(pictureNote(env, key, title, body, accent ? { accent } : {}));
const rows = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results);

// What a post looks like. `answers` = [{ user_id, name, answer }]. Only the role (if any) may be pinged: never everyone or users.
const posText = (post) => cleanPositions(post.positions).map(posLabel).join(' / ');
export function lfgMessage(post, answers = [], { roleId = '', now = Date.now(), env = null } = {}) {
  const open = post.status === 'open' && post.expires > now;
  const names = (a) => answers.filter((x) => x.answer === a).map((x) => x.name);
  const list = (a) => (a.length ? a.slice(0, 20).join(', ') + (a.length > 20 ? ' …' : '') : '–');
  const unix = Math.floor(post.expires / 1000);
  return message({
    accent: open ? 'red' : 'steel', ping: open && roleId ? `<@&${roleId}>` : null, mentions: open && roleId ? { parse: [], roles: [roleId] } : { parse: [] },
    blocks: [
      picture(env, 'cmd-lfg-post'),
      header({ eyebrow: 'PHOENIX FIRE · Rush', title: `⚡ ${post.name} is available for Rush`, sub: open ? `Until <t:${unix}:t> · <t:${unix}:R>` : post.status === 'matched' ? 'They are in a lobby' : 'This call is over' }),
      post.note ? text(`📝 ${post.note}`) : null,
      sep(),
      facts([['🎯 Position', posText(post)], ['✅ In', list(names('in'))]]),
      footer(open ? 'Tap I’m in to answer · the poster can add an hour or take it down' : 'Expired, taken down or matched'),
      open ? buttons([
        { label: 'I’m in', emoji: '✅', style: 'ok', id: `pf:lfg:${post.id}:in` }, { label: 'Make a lobby', emoji: '🎮', style: 'brand', id: `pf:lfg:${post.id}:lobby` },
        { label: '+1 hour', emoji: '⏱️', id: `pf:lfg:${post.id}:plus` }, { label: 'Take down', emoji: '✋', id: `pf:lfg:${post.id}:down` }, { label: 'Alert me', emoji: '🔔', id: 'pf:lfg:alert' },
      ]) : null,
    ].filter(Boolean),
  });
}

// Marks posts past their time as expired (cron). Returns how many.
export async function lfgExpire(env, now = Date.now()) {
  const r = await env.DB.prepare("UPDATE rush_lfg SET status = 'expired' WHERE status = 'open' AND expires <= ?").bind(now).run();
  return r.meta?.changes ?? r.changes ?? 0;
}

// Closes a post's Discord message (edit it into the "over" card, no buttons) and forgets the message id so it is only done once. Never throws.
async function closeMessage(env, post, status, answers = []) {
  if (!post?.msg_id || !post.channel) return;
  try { await discord(rushEnv(env), 'PATCH', `/channels/${post.channel}/messages/${post.msg_id}`, lfgMessage({ ...post, status }, answers, { env })); } catch { /* the message is gone or not ours: nothing to clean */ }
  await env.DB.prepare('UPDATE rush_lfg SET msg_id = NULL WHERE id = ?').bind(post.id).run().catch(() => null);
}
const answersOf = (env, id) => rows(env, 'SELECT user_id, name, answer FROM rush_lfg_answers WHERE lfg_id = ? ORDER BY at', id);

// The 1-minute job: (1) posts that ended turn into the "over" card, (2) the poster gets one "still here?" DM shortly before the end, (3) every open post
// that someone else has posted under is sent again at the bottom and the old one deleted (quiet: no new ping), so it is always the newest message.
export async function lfgTick(env, now = Date.now()) {
  if (!env.DB) return { closed: 0, asked: 0, resent: 0 };
  const ended = await rows(env, "SELECT * FROM rush_lfg WHERE status = 'open' AND expires <= ? AND msg_id IS NOT NULL", now);
  await lfgExpire(env, now);
  for (const p of ended) await closeMessage(env, p, 'expired', await answersOf(env, p.id));
  const soon = await rows(env, "SELECT * FROM rush_lfg WHERE status = 'open' AND asked = 0 AND expires > ? AND expires <= ?", now, now + LFG_ASK_BEFORE_MIN * MIN);
  let asked = 0;
  for (const p of soon) {
    await env.DB.prepare('UPDATE rush_lfg SET asked = 1 WHERE id = ?').bind(p.id).run();
    const ok = await dm(rushEnv(env), p.user_id, message({ accent: 'steel', mentions: { parse: [] }, blocks: [
      header({ eyebrow: 'PHOENIX FIRE · Rush', title: '⏳ Still available for Rush?', sub: `Your call ends <t:${Math.floor(p.expires / 1000)}:R>` }),
      text('Add an hour if you are staying, or close it now. If you do not answer it simply ends on time.'),
      buttons([{ label: 'Keep it up (+1 hour)', emoji: '⏱️', style: 'ok', id: `pf:lfg:${p.id}:keep` }, { label: 'I’m done', emoji: '✋', id: `pf:lfg:${p.id}:done` }]),
    ] }));
    if (ok) asked++;
  }
  const open = await rows(env, "SELECT * FROM rush_lfg WHERE status = 'open' AND expires > ? AND msg_id IS NOT NULL AND channel IS NOT NULL ORDER BY at", now);
  const by = new Map();
  for (const p of open) by.set(p.channel, [...(by.get(p.channel) ?? []), p]);
  let resent = 0;
  for (const [ch, posts] of by) {
    if (now - Math.max(...posts.map((p) => p.posted_at ?? p.at)) < LFG_REPOST_GAP) continue; // just sent: leave it
    let last; try { last = (await discord(rushEnv(env), 'GET', `/channels/${ch}`))?.last_message_id; } catch { continue; }
    if (!last || BigInt(last) <= posts.reduce((m, p) => (BigInt(p.msg_id) > m ? BigInt(p.msg_id) : m), 0n)) continue; // ours is already the newest
    for (const p of posts.slice(-3)) {
      const { sent } = await postAll(rushEnv(env), [ch], lfgMessage(p, await answersOf(env, p.id), { env, now }), 'lfg repost');
      if (!sent[0]) continue;
      await discord(rushEnv(env), 'DELETE', `/channels/${ch}/messages/${p.msg_id}`).catch(() => null);
      await env.DB.prepare('UPDATE rush_lfg SET msg_id = ?, posted_at = ? WHERE id = ?').bind(sent[0].id, now, p.id).run();
      resent++;
    }
  }
  return { closed: ended.length, asked, resent };
}

// `sub` = now | cancel | list; o = its options by name; me/who resolved by the caller. `now` is injectable for tests.
export async function lfgCommand(i, env, me, who, sub, o = {}, now = Date.now()) {
  if (!env.DB) return say(env, 'cmd-problem', 'The member database is not connected', '');
  if (!flagOn(env, who, 'rushLfg')) return say(env, 'cmd-locked', 'Rush LFG is not switched on for you yet', 'Ask a manager.');
  if (!can(who, 'events.rsvp')) return say(env, 'cmd-locked', 'Members only', 'Join the Phoenix Fire server and link your account first.');
  await lfgExpire(env, now);
  if (sub === 'list') {
    const open = await rows(env, "SELECT * FROM rush_lfg WHERE status = 'open' AND expires > ? ORDER BY at", now);
    if (!open.length) return say(env, 'cmd-empty', 'Nobody is available right now', 'Post with /lfg now and the Rush role is tagged.');
    return say(env, 'cmd-lfg-list', `⚡ Available for Rush (${open.length})`, open.map((p) => `**${p.name}** · ${posText(p)} · until <t:${Math.floor(p.expires / 1000)}:t>${p.note ? ` · ${p.note}` : ''}`).join('\n'));
  }
  if (sub === 'cancel') {
    const mine = await rows(env, "SELECT * FROM rush_lfg WHERE user_id = ? AND status = 'open'", me.u);
    const r = await env.DB.prepare("UPDATE rush_lfg SET status = 'cancelled' WHERE user_id = ? AND status = 'open'").bind(me.u).run();
    for (const p of mine) await closeMessage(env, p, 'cancelled', await answersOf(env, p.id));
    return (r.meta?.changes ?? r.changes ?? 0) ? say(env, 'cmd-lfg-off', 'Taken down', 'Your Rush availability is off.', 'win') : say(env, 'cmd-empty', 'Nothing to take down', 'You have no open Rush call.');
  }
  if (sub === 'captain') return passCaptainTo(env, null, await loadQueue(env), me.u, o.member ? String(o.member) : null, now); // pass or give up the captain role of your lobby (same as /queue captain)
  if (sub !== 'now') return say(env, 'cmd-problem', 'Unknown /lfg command', 'Use now, cancel, list or captain.');
  if (await muted(env, me.u)) return say(env, 'cmd-locked', 'You are muted', 'A manager has muted you; you cannot post calls until it ends.');
  const last = await env.DB.prepare('SELECT at FROM rush_lfg WHERE user_id = ? ORDER BY at DESC LIMIT 1').bind(me.u).first();
  if (last && now - last.at < LFG_COOLDOWN_MIN * MIN) {
    const free = Math.floor((last.at + LFG_COOLDOWN_MIN * MIN) / 1000);
    return say(env, 'cmd-problem', 'Slow down', `You can post again <t:${free}:R>. Your last call is still up – use /lfg cancel to take it down.`);
  }
  const minutes = Math.min(LFG_MAX_MIN, Math.max(15, Math.round(Number(o.minutes) || LFG_DEFAULT_MIN)));
  for (const p of await rows(env, "SELECT * FROM rush_lfg WHERE user_id = ? AND status = 'open'", me.u)) await closeMessage(env, p, 'cancelled', []); // a new call replaces the old one
  await env.DB.prepare("UPDATE rush_lfg SET status = 'cancelled' WHERE user_id = ? AND status = 'open'").bind(me.u).run();
  const positions = cleanPositions(o.position ? [o.position] : await profilePositions(env, me.u));
  const post = { positions, user_id: me.u, name: clean(me.n, 40) || 'A member', avatar: me.a ?? null, note: clean(o.note, 80), channel: i.channel_id ?? null, at: now, expires: now + minutes * MIN, status: 'open' };
  const res = await env.DB.prepare('INSERT INTO rush_lfg (user_id, name, avatar, note, channel, at, expires, status, positions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(post.user_id, post.name, post.avatar, post.note, post.channel, post.at, post.expires, post.status, JSON.stringify(positions)).run();
  post.id = res.meta?.last_row_id ?? res.lastRowId;
  const roleId = (await pingRoleFor(env, 'ping_rush')) ?? '';
  await matchNewPlayer(env, now).catch((e) => console.log('rush match failed', e.message)); // a lobby that needs this position is offered the player
  // The post is sent by the Rush app so it can be re-sent to stay the newest message and edited when it ends; only you see the confirmation. When the app cannot
  // post (token, access), the slash reply itself is the post, as before (no re-send, no clean-up).
  const channel = i.channel_id ? String(i.channel_id) : null;
  if (channel) {
    const { sent } = await postAll(rushEnv(env), [channel], lfgMessage(post, [], { roleId, now, env }), 'lfg post');
    if (sent[0]) {
      await env.DB.prepare('UPDATE rush_lfg SET msg_id = ?, posted_at = ?, channel = ? WHERE id = ?').bind(sent[0].id, now, channel, post.id).run();
      return say(env, 'cmd-lfg-list', '⚡ Your call is posted', 'Press **+1 hour** on it if you stay longer, or **Take down** when you are done. You get a DM shortly before it ends.', 'win');
    }
  }
  return reply(lfgMessage(post, [], { roleId, now, env }));
}
// Their Rush positions from the profile pre-select the choice, but any option is allowed and "Any" too (profile stays unchanged).
async function profilePositions(env, userId) {
  const r = await env.DB.prepare('SELECT rush_positions FROM profiles WHERE user_id = ?').bind(userId).first().catch(() => null);
  try { const v = JSON.parse(r?.rush_positions ?? '[]'); return v.map((x) => ({ LB: 'CB', RB: 'CB', CDM: 'CB', CM: 'W', CAM: 'W', LM: 'W', RM: 'W', LW: 'W', RW: 'W', CF: 'ST' }[x] ?? x)); } catch { return []; }
}

// Buttons: I'm in / Take down / +1 hour / Make a lobby / Alert me on a post, "still here?" Keep / Done in the poster's DM, and the Accept / No thanks of a lobby request.
export async function lfgButton(i, env, me, who, now = Date.now(), ctx = null) {
  if (!env.DB) return say(env, 'cmd-problem', 'The member database is not connected', '');
  if (!flagOn(env, who, 'rushLfg') || !can(who, 'events.rsvp')) return say(env, 'cmd-locked', 'Rush LFG is not switched on for you yet', '');
  const [, , id, answer, askId] = String(i.data?.custom_id).split(':');
  if (id === 'acc' || id === 'dec') return resolveOffer(env, null, answer, 'player', id === 'acc', now); // the player's side of a match offer (DM)
  if (id === 'alert') return toggleAlert(env, me);
  if (id === 'ask') return lobbyAnswer(env, ctx, Number(askId), answer === 'y', me, now);
  if (answer === 'later') return say(env, 'cmd-empty', 'That option was removed', 'Press I’m in, or post your own with /lfg now.');
  const post = await env.DB.prepare('SELECT * FROM rush_lfg WHERE id = ?').bind(Number(id)).first();
  if (!post) return say(env, 'cmd-empty', 'That call is gone', '');
  const mine = String(post.user_id) === String(me.u), live = post.status === 'open' && post.expires > now;
  if (answer === 'down' || answer === 'done' || answer === 'plus' || answer === 'keep') {
    if (!mine) return say(env, 'cmd-locked', 'Only the poster can do that', `This is ${post.name}'s call.`);
    if (!live) return say(env, 'cmd-empty', 'That call is over', 'Post a new one with /lfg now.');
    if (answer === 'down' || answer === 'done') {
      await env.DB.prepare("UPDATE rush_lfg SET status = 'cancelled' WHERE id = ?").bind(post.id).run();
      await closeMessage(env, post, 'cancelled', await answersOf(env, post.id));
      return say(env, 'cmd-lfg-off', 'Taken down', 'Your Rush availability is off.', 'win');
    }
    const cap = post.at + LFG_HARD_MAX_MIN * MIN, expires = Math.min(post.expires + LFG_EXTEND_MIN * MIN, cap);
    if (expires <= post.expires) return say(env, 'cmd-problem', 'That is the longest a call can run', `${LFG_HARD_MAX_MIN / 60} hours in total. Post a fresh one if you are still around.`);
    await env.DB.prepare('UPDATE rush_lfg SET expires = ?, asked = 0 WHERE id = ?').bind(expires, post.id).run();
    const next = { ...post, expires };
    if (answer === 'plus') return { type: 7, data: lfgMessage(next, await answersOf(env, post.id), { roleId: '', now, env }) }; // on the post itself
    return say(env, 'cmd-lfg-list', '⏱️ Added an hour', `Your call now runs until <t:${Math.floor(expires / 1000)}:t>.`, 'win');
  }
  if (!live) return say(env, 'cmd-empty', 'That call is over', 'Post your own with /lfg now.');
  if (answer === 'lobby') return makeLobby(env, post, me, who, now);
  await env.DB.prepare('INSERT INTO rush_lfg_answers (lfg_id, user_id, name, answer, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (lfg_id, user_id) DO UPDATE SET answer = excluded.answer, name = excluded.name, at = excluded.at')
    .bind(post.id, me.u, clean(me.n, 40), 'in', now).run();
  return { type: 7, data: lfgMessage(post, await answersOf(env, post.id), { roleId: '', now, env }) }; // a refresh never pings again; if others posted below it, the 1-minute job sends it again at the bottom
}

// ---------- Alert me ----------
async function toggleAlert(env, me) {
  const on = await env.DB.prepare('SELECT 1 AS x FROM rush_lfg_alerts WHERE user_id = ?').bind(String(me.u)).first();
  if (on) {
    await env.DB.prepare('DELETE FROM rush_lfg_alerts WHERE user_id = ?').bind(String(me.u)).run();
    return say(env, 'cmd-lfg-off', '🔕 Alerts off', 'You will not get lobby offers unless you post `/lfg now`.', 'steel');
  }
  const positions = cleanPositions(await profilePositions(env, me.u));
  await env.DB.prepare('INSERT INTO rush_lfg_alerts (user_id, positions, at) VALUES (?, ?, ?)').bind(String(me.u), JSON.stringify(positions), Date.now()).run();
  return say(env, 'cmd-lfg-list', '🔔 Alerts on', `When a lobby needs **${positions.map(posLabel).join(' / ')}** you get a DM with Accept and No thanks. Nothing happens unless you accept. Press **Alert me** again to turn it off.`, 'win');
}

// ---------- Make a lobby: requests, never an automatic add ----------
// Whoever presses it (the poster or someone who tapped I'm in) becomes the proposed captain. Everyone else on the post (the poster and the people who said
// I'm in) gets a DM request. Only the people who accept join the crew; the lobby goes on the queue board with the first accept.
const askMessage = (ask, org = 'Phoenix Fire') => message({ accent: 'red', mentions: { parse: [] }, blocks: [
  header({ eyebrow: `${org} · Rush`, title: '🎮 A Rush lobby request', sub: 'Nobody is added unless you accept' }),
  text(`<@${ask.captain_id}> wants to make a lobby with you from the available list. Join their crew?`),
  footer(`Accept and you are in their group on the queue board. This request runs out in ${ASK_TTL_MIN} minutes.`),
  buttons([{ label: 'Accept', emoji: '✅', style: 'ok', id: `pf:lfg:ask:y:${ask.id}` }, { label: 'No thanks', emoji: '✖️', id: `pf:lfg:ask:n:${ask.id}` }]),
] });
async function makeLobby(env, post, me, who, now) {
  if (!flagOn(env, who, 'rushQueue')) return say(env, 'cmd-locked', 'The Rush queue is not switched on for you yet', 'Ask a manager.');
  const answers = await answersOf(env, post.id), ins = answers.filter((a) => a.answer === 'in').map((a) => String(a.user_id));
  if (String(post.user_id) !== String(me.u) && !ins.includes(String(me.u))) return say(env, 'cmd-locked', 'Tap I’m in first', 'Only the poster and the people who said they are in can make a lobby.');
  const q = await loadQueue(env), state = await getState(env);
  if (state.closed === 'staff' && !q.length) return say(env, 'cmd-locked', 'The queue is stopped', 'A manager stopped it; only a manager can start it again.');
  if (q.some((e) => [e.captain, ...e.members].includes(String(me.u)))) return say(env, 'cmd-problem', 'You are already in a group', 'Leave it first, or use **Edit my crew** on the board.');
  const busy = new Set(q.flatMap((e) => [e.captain, ...e.members]));
  const people = [...new Set([String(post.user_id), ...ins])].filter((u) => u !== String(me.u) && !busy.has(u)).slice(0, MAX_CREW - 1);
  if (!people.length) return say(env, 'cmd-empty', 'Nobody to ask yet', 'Ask people to tap **I’m in** first (people already in a group are skipped).');
  const recent = new Set((await rows(env, "SELECT user_id FROM rush_lobby_asks WHERE captain_id = ? AND status = 'open' AND created_at > ?", String(me.u), now - ASK_TTL_MIN * MIN)).map((r) => String(r.user_id)));
  let sent = 0;
  for (const u of people) {
    if (recent.has(u)) continue;
    const r = await env.DB.prepare('INSERT INTO rush_lobby_asks (captain_id, user_id, lfg_id, created_at) VALUES (?, ?, ?, ?)').bind(String(me.u), u, post.id, now).run();
    const ask = { id: r.meta?.last_row_id ?? r.lastRowId, captain_id: String(me.u) };
    if (await dm(rushEnv(env), u, askMessage(ask))) sent++; else await env.DB.prepare("UPDATE rush_lobby_asks SET status = 'declined' WHERE id = ?").bind(ask.id).run();
  }
  return say(env, 'cmd-lfg-list', sent ? `🎮 ${sent} request${sent === 1 ? '' : 's'} sent` : 'Requests already sent', 'They are asked by DM. Your lobby goes on the queue board when the first person accepts; you can then pass the captain role with **Pass captain**.', 'win');
}
async function lobbyAnswer(env, ctx, askId, yes, me, now) {
  const ask = await env.DB.prepare('SELECT * FROM rush_lobby_asks WHERE id = ?').bind(askId).first();
  if (!ask || String(ask.user_id) !== String(me.u)) return say(env, 'cmd-empty', 'That request is not yours', '');
  if (ask.status !== 'open') return say(env, 'cmd-empty', 'That request is over', ask.status === 'accepted' ? 'You are already in the crew.' : 'It was declined or ran out of time.');
  if (ask.created_at <= now - ASK_TTL_MIN * MIN) { await env.DB.prepare("UPDATE rush_lobby_asks SET status = 'expired' WHERE id = ?").bind(askId).run(); return say(env, 'cmd-empty', 'That request ran out', 'Ask them to send it again.'); }
  if (!yes) { await env.DB.prepare("UPDATE rush_lobby_asks SET status = 'declined' WHERE id = ?").bind(askId).run(); return say(env, 'cmd-empty', 'Noted', 'They are not told it was you.', 'steel'); }
  const q = await loadQueue(env), cap = find(q, ask.captain_id);
  if (q.some((e) => e.captain !== String(ask.captain_id) && [e.captain, ...e.members].includes(String(me.u)))) return say(env, 'cmd-problem', 'You are already in another group', 'Leave it first, then accept again.');
  if (!cap && q.some((e) => e.members.includes(String(ask.captain_id)))) return say(env, 'cmd-problem', 'They joined another group', 'Ask them to make the lobby again.');
  if (cap && [cap.captain, ...cap.members].length >= MAX_CREW) return say(env, 'cmd-problem', 'That lobby is full', 'A Rush crew is at most 5.');
  const res = cap ? setMembers(q, ask.captain_id, [...cap.members, String(me.u)]) : join(q, { captain: ask.captain_id, members: [String(me.u)] }, now);
  if (res.error) return say(env, 'cmd-problem', 'Could not join that lobby', 'Someone in it is already in another group.');
  await env.DB.prepare("UPDATE rush_lobby_asks SET status = 'accepted' WHERE id = ?").bind(askId).run();
  await env.DB.prepare("UPDATE rush_lfg SET status = 'matched' WHERE user_id = ? AND status = 'open'").bind(String(me.u)).run(); // their call turns into "in a lobby"
  await commit(env, ctx, q, res, now, [ping([ask.captain_id], `<@${me.u}> accepted your lobby request and is in your crew.`)]);
  return say(env, 'cmd-lfg-list', '✅ You are in the lobby', `You are in <@${ask.captain_id}>'s crew. <@${ask.captain_id}> searches and invites; watch the queue board for your turn.`, 'win');
}
