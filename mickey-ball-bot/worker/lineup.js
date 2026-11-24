// /setup, /setlineup (the editor), /suggestlineup, /lineup and /link, plus every button and menu they own (ml:cfg:*, ml:sl:*, ml:sg:*).
import { notice, IS_V2, EPHEMERAL } from '../core/ui.js';
import { allowed, needText, setupPanel, PERM_KEYS } from '../core/perms.js';
import { FORMATION_NAMES, LINE } from '../core/formations.js';
import { blank, slotsOfLineup, filledCount, carry, place, editorPanel, favoritesPanel, lineupPostPanel, suggestionPanel, lineupData, lineupKey } from '../core/lineup.js';
import { lineupOf, lineupPanel } from '../core/matchday.js';
import { suggest } from '../core/suggest.js';
import { who, mainClub, nextOne, publicUrl, gate } from './access.js';

const API = 'https://discord.com/api/v10';
const bot = (env) => ({ 'Content-Type': 'application/json', Authorization: `Bot ${env.DISCORD_TOKEN}` });
const say = (h, title, body, o = {}) => h.reply(notice(title, body, { ephemeral: true, ...o }));
const upd = (h, p) => h.reply({ ...p, flags: p.flags & IS_V2 }, 7);
const nameOf = (i, u) => i.data.resolved?.members?.[u]?.nick ?? i.data.resolved?.users?.[u]?.global_name ?? i.data.resolved?.users?.[u]?.username ?? 'Player';
const rid = () => crypto.randomUUID().slice(0, 8);

// ---------------- /setup ----------------
export async function setupCommand(st, i, h) {
  let cfg = await st.getCfg(i.guild_id);
  const roles = await st.perms(i.guild_id);
  if (!cfg && allowed(i, 'setup', null, roles)) { await st.claimSetup(i.guild_id, who(i).id); cfg = await st.getCfg(i.guild_id); }
  if (!allowed(i, 'setup', cfg, roles)) return say(h, 'Setup is locked', cfg ? needText('setup', roles) : 'Ask someone with the Manage Server permission to open `/setup` first.', { accent: 'loss' });
  return h.reply(setupPanel(cfg, roles));
}
export async function setupComponent(st, i, h, field) {
  const cfg = await st.getCfg(i.guild_id), roles = await st.perms(i.guild_id);
  if (!allowed(i, 'setup', cfg, roles)) return say(h, 'Setup is locked', needText('setup', roles), { accent: 'loss' });
  let flash = null, warn = false;
  if (field === 'reset') { await st.clearPerms(i.guild_id); flash = 'Everything is back to Manage Server.'; }
  else if (PERM_KEYS[field]) {
    const role = i.data.values?.[0] ?? null, mine = i.member?.roles ?? [], admin = (BigInt(i.member?.permissions ?? 0) & 0x8n) !== 0n;
    if (field === 'setup' && role && !admin && cfg?.owner_id !== who(i).id && !mine.includes(role)) warn = true;
    else { await st.setPerm(i.guild_id, field, role); flash = role ? `${PERM_KEYS[field].label} is now locked to <@&${role}>.` : `${PERM_KEYS[field].label} is back to Manage Server.`; }
  }
  const panel = setupPanel(cfg, await st.perms(i.guild_id), { flash });
  if (warn) panel.components[0].components.splice(1, 0, { type: 10, content: '⚠️ Not changed: you would lock yourself out of this panel. Pick a role you have.' });
  return upd(h, panel);
}

// ---------------- /setlineup ----------------
async function loadEditor(st, i, e) {
  let lu = await st.workLineup(e.id);
  if (!lu) { const l = { id: rid(), guild_id: i.guild_id, event_id: e.id, kind: 'work', formation: null, slots: blank(), by_user: who(i).id }; await st.saveLineup(l); lu = await st.getLineup(l.id); }
  return lu;
}
export async function setLineup(env, ctx, st, i, h) {
  const bad = await gate(st, i, 'lineup');
  if (bad) return h.reply(bad);
  const e = await nextOne(st, i);
  if (!e) return say(h, 'No match day to set a lineup for', 'A lineup belongs to a scheduled match day (upcoming or in progress). Schedule one with `/host` or `/matchday create`.');
  return h.reply(editorPanel(await loadEditor(st, i, e), e, { club: await mainClub(st, i.guild_id) }));
}

// Remove the posted message, post a fresh one (pinging the players) and have the picture drawn into it.
async function postLineup(env, ctx, st, h, i, lu, e, club) {
  const channel = e.channel_id ?? i.channel_id, slots = slotsOfLineup(lu), ids = slots.filter((s) => s.u).map((s) => s.u);
  if (lu.message_id && lu.channel_id) await fetch(`${API}/channels/${lu.channel_id}/messages/${lu.message_id}`, { method: 'DELETE', headers: bot(env) }).catch(() => null);
  const key = lineupKey(e, lu), cached = await st.hasBlob(key), url = cached ? `${publicUrl(env)}/c/${key}` : null;
  const panel = lineupPostPanel({ ...lu, by_user: who(i).id }, e, url, club, ids);
  const res = await fetch(`${API}/channels/${channel}/messages`, { method: 'POST', headers: bot(env), body: JSON.stringify({ flags: panel.flags & IS_V2, components: panel.components, allowed_mentions: { users: ids } }) }).catch(() => null);
  if (!res?.ok) return { ok: false, status: res?.status ?? 0, channel };
  const msg = await res.json().catch(() => ({}));
  await st.saveLineup({ ...lu, posted: 1, channel_id: channel, message_id: msg.id ?? null, by_user: who(i).id });
  if (!cached) {
    const ref = crypto.randomUUID().slice(0, 12);
    await st.prunePending();
    await st.addPending({ ref, token: i.token, guild: i.guild_id, channel, user: who(i).id, kind: 'lineuppost', game: 1 });
    await st.setPendingMatch(ref, '0', lu.id, 0);
    ctx.waitUntil((async () => { if (!(await h.dispatch(env, { ref, kind: 'draw', q: '-', game: '1', extra: `lineup:${lu.id}` }))) await st.delPending(ref); })());
  }
  return { ok: true, channel, drawing: !cached };
}

export async function lineupComponent(env, ctx, st, i, h, lid, field) {
  const bad = await gate(st, i, 'lineup');
  if (bad) return h.reply(bad);
  let lu = await st.getLineup(lid);
  const e = lu?.event_id ? await st.getEvent(lu.event_id) : null;
  if (!lu || !e) return say(h, 'This lineup is gone', 'Its match day was cancelled or already played. Use `/setlineup` for the next one.');
  const club = await mainClub(st, i.guild_id);
  const edit = (flash) => upd(h, editorPanel(lu, e, { club, flash }));
  const slots = slotsOfLineup(lu);
  if (field === 'edit') return h.reply(editorPanel(lu, e, { club }));
  if (field === 'fa' || field === 'fb') {
    const f = i.data.values?.[0];
    if (!FORMATION_NAMES.includes(f)) return edit();
    lu = { ...lu, formation: f, slots: carry(lu.formation, slots, f) };
    await st.saveLineup(lu); return edit();
  }
  if (/^s\d+$/.test(field)) {
    const k = Number(field.slice(1)), u = i.data.values?.[0] ?? null;
    if (k > 10 || !lu.formation) return edit();
    lu = { ...lu, slots: place(slots, k, u ? { u, n: nameOf(i, u) } : null) };
    await st.saveLineup(lu); return edit();
  }
  if (field === 'back') return edit();
  if (field === 'draft') { await st.saveLineup(lu); return edit('Draft saved. Come back any time with /setlineup.'); }
  if (field === 'fav') {
    if (!lu.formation) return edit();
    await st.saveLineup({ id: rid(), guild_id: i.guild_id, event_id: null, kind: 'fav', name: `${lu.formation} · ${filledCount(slots)} players · ${new Date().toISOString().slice(0, 10)}`, formation: lu.formation, slots, by_user: who(i).id });
    await st.pruneFavorites(i.guild_id);
    return edit('Saved as a favorite. Load it from 📂 Load favorite.');
  }
  if (field === 'favs') return upd(h, favoritesPanel(lu, e, await st.favorites(i.guild_id), { club }));
  if (field === 'fp') {
    const f = await st.getLineup(i.data.values?.[0]);
    if (f && f.kind === 'fav' && f.guild_id === i.guild_id) { lu = { ...lu, formation: f.formation, slots: f.slots }; await st.saveLineup(lu); return edit('Favorite loaded. Swap anyone you like.'); }
    return edit();
  }
  if (field === 'del') {
    if (lu.message_id && lu.channel_id) ctx.waitUntil(fetch(`${API}/channels/${lu.channel_id}/messages/${lu.message_id}`, { method: 'DELETE', headers: bot(env) }).catch(() => null));
    await st.delLineup(lu.id);
    return upd(h, notice('Lineup deleted', lu.posted ? 'Its post was removed too. `/setlineup` starts a new one.' : '`/setlineup` starts a new one.', { accent: 'loss', ephemeral: true }));
  }
  if (field === 'post') {
    if (!lu.formation || !filledCount(slots)) return edit();
    const r = await postLineup(env, ctx, st, h, i, lu, e, club);
    lu = await st.getLineup(lu.id);
    if (!r.ok) return edit(`I couldn’t post in <#${r.channel}> (${r.status === 403 || r.status === 404 ? 'give me View Channel and Send Messages there' : `Discord said ${r.status}`}).`.replace('✅', ''));
    return edit(`Posted in <#${r.channel}>${r.drawing ? ' · the pitch picture joins it in about a minute' : ''}.`);
  }
  return edit();
}

// The picture's data for the Actions job; and the edit of the posted message once the picture is up.
export async function lineupJob(st, lid) {
  const lu = await st.getLineup(lid), e = lu?.event_id ? await st.getEvent(lu.event_id) : null;
  if (!lu || !e || !lu.formation) return null;
  return { kind: 'lineup', ref: '', key: lineupKey(e, lu), data: lineupData(lu, e, await mainClub(st, e.guild_id)) };
}
export async function lineupPostDone(env, st, p) {
  const lu = await st.getLineup(p.match_id), e = lu?.event_id ? await st.getEvent(lu.event_id) : null;
  if (!lu || !e || !lu.message_id || !lu.channel_id) return null;
  const panel = lineupPostPanel(lu, e, `${publicUrl(env)}/c/${lineupKey(e, lu)}`, await mainClub(st, e.guild_id));
  return fetch(`${API}/channels/${lu.channel_id}/messages/${lu.message_id}`, { method: 'PATCH', headers: bot(env), body: JSON.stringify({ flags: panel.flags & IS_V2, components: panel.components, allowed_mentions: { parse: [] } }) }).catch(() => null);
}

// ---------------- /lineup : what is posted (or the sign-up list when nothing is set yet) ----------------
export async function lineupView(env, ctx, st, i, h) {
  const e = await nextOne(st, i);
  if (!e) return say(h, 'Nothing scheduled yet', 'Managers add a match day with `/matchday create`.');
  const lu = await st.workLineup(e.id), club = await mainClub(st, i.guild_id);
  if (lu?.posted && lu.formation) {
    const key = lineupKey(e, lu), cached = await st.hasBlob(key);
    if (!cached) ctx.waitUntil(h.dispatch(env, { ref: '', kind: 'draw', q: '-', game: '1', extra: `lineup:${lu.id}` }));
    return h.reply(lineupPostPanel(lu, e, cached ? `${publicUrl(env)}/c/${key}` : null, club));
  }
  return h.reply(lineupPanel(e, await st.rsvps(e.id), null, club));
}

// ---------------- /suggestlineup ----------------
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
async function candidates(st, e, g, club) {
  const rs = (await st.rsvps(e.id)).filter((r) => r.status === 'yes'), roster = club ? await st.rosterData(club.id) : [];
  const linked = new Map((await st.links(g)).map((l) => [l.user_id, l.gamertag]));
  let unlinked = 0;
  const list = rs.map((r) => {
    const tag = linked.get(r.user_id), s = roster.find((p) => (tag ? p.n.toLowerCase() === tag.toLowerCase() : norm(p.n) === norm(r.name)));
    if (!s) unlinked++;
    const hist = String(s?.pos ?? '').toLowerCase();
    return { id: r.user_id, name: r.name, pos: r.pos && LINE[r.pos] ? r.pos : null, hist: ['goalkeeper', 'defender', 'midfielder', 'forward'].includes(hist) ? hist : null, rating: s?.s?.r || null };
  });
  return { list, unlinked, signed: rs.length };
}
export async function suggestCommand(st, i, h) {
  const e = await nextOne(st, i);
  if (!e) return say(h, 'Nothing scheduled yet', 'A lineup is suggested for a scheduled match day. Managers add one with `/matchday create`.');
  const club = await mainClub(st, i.guild_id), c = await candidates(st, e, i.guild_id, club);
  if (!c.list.length) return say(h, 'Nobody has said ✅ yet', 'The suggestion is built from the people who signed up. Ask them to press In on the match day post.');
  return h.reply(suggestionPanel(e, suggest(c.list), { club, unlinked: c.unlinked, signed: c.signed }));
}
export async function suggestUse(st, i, h, eventId) {
  const bad = await gate(st, i, 'lineup');
  if (bad) return h.reply(bad);
  const e = await st.getEvent(eventId);
  if (!e) return say(h, 'That match day is gone');
  const lu = await st.workLineup(e.id);
  if (lu?.posted) return say(h, 'A lineup is already posted', 'Open `/setlineup` and edit that one instead.');
  const club = await mainClub(st, i.guild_id), best = suggest((await candidates(st, e, i.guild_id, club)).list);
  const slots = best.slots.map((s) => (s.c ? { u: s.c.id, n: s.c.name } : { u: null, n: null }));
  await st.saveLineup({ id: lu?.id ?? rid(), guild_id: i.guild_id, event_id: e.id, kind: 'work', formation: best.formation, slots, by_user: who(i).id });
  return say(h, '📝 Saved as your draft', `${best.formation} for **${e.title}**. Run \`/setlineup\` to change anyone and post it.`, { accent: 'win' });
}

// ---------------- /link ----------------
export async function linkCommand(st, i, h) {
  const tag = String(h.opt(i, 'gamertag') ?? '').trim().slice(0, 40);
  if (!tag) return say(h, 'Which gamertag?', 'Start typing in `gamertag:` and pick yours.');
  await st.setLink(i.guild_id, who(i).id, tag);
  return say(h, '🔗 Linked', `You are **${tag}**. Lineup suggestions now use your stats.`, { accent: 'win' });
}
