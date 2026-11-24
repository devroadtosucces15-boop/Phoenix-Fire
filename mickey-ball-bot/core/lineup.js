// Lineups: the editor (formation menus + one player menu per position), the posted lineup and the picture data.
// A lineup stores its formation name and 11 slots [{u, n}] (Discord user id + display name) in formation order, goalkeeper first.
import { message, header, text, sep, footer, cards, button, menu } from './ui.js';
import { hash } from './data.js';
import { FORMATION_NAMES, slotsOf } from './formations.js';
import { eventTitle } from './matchday.js';

export const blank = () => Array.from({ length: 11 }, () => ({ u: null, n: null }));
export const slotsOfLineup = (lu) => { try { const a = JSON.parse(lu.slots); return Array.from({ length: 11 }, (_, k) => a[k] ?? { u: null, n: null }); } catch { return blank(); } };
export const filledCount = (slots) => slots.filter((s) => s?.u).length;
const at = (e) => Math.floor(e.start / 1000);
const title = (e) => e.title || eventTitle(e.kind, e.opponent);

// Switching formation keeps a player where the same role still exists.
export function carry(oldFormation, oldSlots, newFormation) {
  const out = blank(), from = oldFormation ? slotsOf(oldFormation) : [], to = slotsOf(newFormation), used = new Set();
  to.forEach((s, k) => {
    const j = from.findIndex((f, idx) => f.role === s.role && !used.has(idx) && oldSlots[idx]?.u);
    if (j >= 0) { used.add(j); out[k] = oldSlots[j]; }
  });
  return out;
}
// Same person in two positions is never right: choosing them again moves them.
export function place(slots, k, user) {
  const out = slots.map((s) => (user && s.u === user.u ? { u: null, n: null } : s));
  out[k] = user ?? { u: null, n: null };
  return out;
}

// One line per row of the formation, keeper first (the same order as the position menus below it).
export function rowsText(formation, slots, { mention = true } = {}) {
  if (!formation) return '_No formation yet – pick one below._';
  const sl = slotsOf(formation), lines = [];
  for (const s of sl) {
    const who = slots[s.i]?.u ? (mention ? `<@${slots[s.i].u}>` : slots[s.i].n) : '_empty_';
    const last = lines[lines.length - 1];
    if (last && last.x === s.x) last.parts.push(`\`${s.role}\` ${who}`); else lines.push({ x: s.x, parts: [`\`${s.role}\` ${who}`] });
  }
  return lines.map((l) => l.parts.join(' · ')).join('\n');
}
export const lineupData = (lu, e, club) => ({ L: { title: title(e), formation: lu.formation, slots: slotsOf(lu.formation).map((s) => ({ n: slotsOfLineup(lu)[s.i].n, role: s.role, x: s.x, y: s.y })) }, club: { name: club?.name ?? 'Match day' } });
export const lineupKey = (e, lu) => `events/${e.id}/lineup-${hash([title(e), e.start, lu.formation, slotsOfLineup(lu).map((s) => s.n)])}.png`;

const lineupMenu = (id, field, list, placeholder, current) => ({ type: 1, components: [{ type: 3, custom_id: `ml:sl:${id}:${field}`, placeholder, min_values: 1, max_values: 1, options: list.map((f) => ({ label: f, value: f, default: f === current || undefined })) }] });

// The editor everyone with the lineup permission sees (private to them).
export function editorPanel(lu, e, { club = null, flash = null } = {}) {
  const slots = slotsOfLineup(lu), n = filledCount(slots), need = Math.min(11, e.players ?? 11);
  const a = FORMATION_NAMES.slice(0, 15), b = FORMATION_NAMES.slice(15);
  const roles = lu.formation ? slotsOf(lu.formation) : [];
  const picks = roles.map((s) => ({ type: 1, components: [{ type: 5, custom_id: `ml:sl:${lu.id}:s${s.i}`, placeholder: `${s.i + 1} · ${s.role} – pick a player`, min_values: 0, max_values: 1, default_values: slots[s.i]?.u ? [{ id: slots[s.i].u, type: 'user' }] : undefined }] }));
  return message({ accent: 'info', ephemeral: true, blocks: [
    text(`-# ${(club?.name ? `${club.name} · ` : '').toUpperCase()}LINEUP EDITOR\n## ${title(e)}\n-# <t:${at(e)}:F> · ${lu.posted ? '📣 posted – saving will repost it' : '📝 draft'}${lu.formation ? ` · ${lu.formation}` : ''} · ${n}/${roles.length || 11} placed`),
    flash ? text(`✅ ${flash}`) : null,
    text(rowsText(lu.formation, slots)),
    sep(),
    lineupMenu(lu.id, 'fa', a, `Formation · ${a[0]} … ${a[a.length - 1]}`, lu.formation),
    lineupMenu(lu.id, 'fb', b, `More formations · ${b[0]} … ${b[b.length - 1]}`, lu.formation),
    ...picks,
    { type: 1, components: [
      button({ label: lu.posted ? 'Save & repost' : 'Save & post', id: `ml:sl:${lu.id}:post`, style: 'ok', emoji: '📣', disabled: !lu.formation || n < Math.min(need, roles.length) || n === 0 }),
      button({ label: 'Save draft', id: `ml:sl:${lu.id}:draft`, emoji: '📝' }),
      button({ label: 'Favorite', id: `ml:sl:${lu.id}:fav`, emoji: '⭐', disabled: !lu.formation }),
      button({ label: 'Load favorite', id: `ml:sl:${lu.id}:favs`, emoji: '📂' }),
      button({ label: 'Delete', id: `ml:sl:${lu.id}:del`, style: 'no', emoji: '🗑️' }),
    ] },
  ] });
}

export function favoritesPanel(lu, e, favs, { club = null } = {}) {
  const body = favs.length
    ? menu({ id: `ml:sl:${lu.id}:fp`, placeholder: 'Pick a saved lineup to load', options: favs.map((f) => ({ label: String(f.name || f.formation).slice(0, 100), value: f.id, description: `${f.formation} · ${slotsOfLineup(f).filter((s) => s.u).length} players` })) })
    : text('_No favorites yet. Fill a lineup and press ⭐ Favorite._');
  return message({ accent: 'info', ephemeral: true, blocks: [
    text(`-# ${(club?.name ? `${club.name} · ` : '').toUpperCase()}FAVORITE LINEUPS\n## ${title(e)}\n-# Loading one replaces what is in the editor`),
    body,
    { type: 1, components: [button({ label: 'Back to the editor', id: `ml:sl:${lu.id}:back` })] },
  ] });
}

// The public post. `url` = the drawn pitch (null → text only until it is ready).
export function lineupPostPanel(lu, e, url, club = null, ping = []) {
  const slots = slotsOfLineup(lu);
  return message({ accent: 'info', blocks: [
    ping.length ? text(`${ping.map((u) => `<@${u}>`).join(' ')} you are in the lineup.`) : null,
    header({ eyebrow: `${club?.name ? `${club.name} · ` : ''}Lineup`, title: title(e), sub: `<t:${at(e)}:F> · <t:${at(e)}:R> · ${lu.formation}`, thumb: club?.crest }),
    cards(url && { url, alt: `Lineup in a ${lu.formation}` }),
    url ? null : text(rowsText(lu.formation, slots)),
    footer(`${filledCount(slots)} starting · set by <@${lu.by_user}>`),
    { type: 1, components: [button({ label: 'Edit lineup', id: `ml:sl:${lu.id}:edit`, emoji: '✏️' })] },
  ] });
}

export function suggestionPanel(e, best, { club = null, unlinked = 0, signed = 0 } = {}) {
  const lines = []; let last = null;
  for (const s of best.slots) {
    const who = s.c ? `${s.c.name}${s.c.pos === s.role ? '' : s.c.pos ? ` _(picked ${s.c.pos})_` : ''}` : '_empty_';
    if (last && last.x === s.x) last.parts.push(`\`${s.role}\` ${who}`); else lines.push(last = { x: s.x, parts: [`\`${s.role}\` ${who}`] });
  }
  const pct = Math.round((best.total / 11) * 100);
  return message({ accent: 'info', ephemeral: true, blocks: [
    header({ eyebrow: `${club?.name ? `${club.name} · ` : ''}Suggested lineup`, title: best.formation, sub: `${title(e)} · from ${signed} sign-up${signed === 1 ? '' : 's'} · ${best.exact}/11 in the position they picked`, thumb: club?.crest }),
    text(lines.map((l) => l.parts.join(' · ')).join('\n')),
    sep(),
    footer(`Fit score ${pct}% · uses everyone's chosen position first, then match ratings${unlinked ? ` · ${unlinked} have no stats yet (they can use /link)` : ''}`),
    { type: 1, components: [button({ label: 'Use as my draft', id: `ml:sg:${e.id}:use`, style: 'ok', emoji: '📝' })] },
  ] });
}
