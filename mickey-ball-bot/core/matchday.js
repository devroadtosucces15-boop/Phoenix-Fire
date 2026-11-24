// Match days: scheduling, sign-ups and the lineup. Pure builders (no I/O) so the Worker and the tests share them.
// A match day is posted once with ✅ ❔ ❌ buttons and a position picker; everyone sees the time in their own zone (Discord timestamps).
import { message, notice, header, text, sep, footer, facts, cards, menu, button } from './ui.js';
import { hash } from './data.js';

export const KINDS = {
  league: ['League', null], playoffs: ['Playoffs', null], friendly: ['Friendly', 'Friendly'], tournament: ['Tournament', 'Tournament'], vpg: ['VPG match', 'VPG match'],
  session: ['Session', null],
};
export const POSITIONS = ['GK', 'RB', 'RWB', 'CB', 'LB', 'LWB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST', 'CF'];
// which line each position belongs to (the lineup picture groups by line), and left→right order inside a line
import { LINE } from './formations.js';
const SIDE = { LB: 0, LWB: 0, LM: 0, LW: 0, CB: 1, CDM: 1, CM: 1, CAM: 1, ST: 1, CF: 1, GK: 1, RB: 2, RWB: 2, RM: 2, RW: 2 };
const WHO = { yes: '✅', maybe: '❔', no: '❌' };

// What the title of a new match day reads: "League vs Rivals FC" / "Friendly" / "League night".
export function eventTitle(kind, opponent) {
  const [name, fixed] = KINDS[kind] ?? KINDS.league, base = fixed ?? name;
  return opponent ? `${base} vs ${String(opponent).trim()}` : fixed ? base : `${name} night`;
}

const by = (rs, st) => rs.filter((r) => r.status === st);
const face = (r) => (r.emoji_id && r.emoji_name ? `<:${r.emoji_name}:${r.emoji_id}> ` : '');
const nm = (r) => `${r.checked_in ? '🟢' : ''}${face(r)}${r.name}${r.pos ? ` \`${r.pos}\`` : ''}`;
const clip = (a, n = 1500) => { const s = a.join(', '); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const at = (e) => Math.floor(e.start / 1000);

// Which of the main roles nobody has taken yet (keeper first: no keeper is the one gap that matters).
export function missing(e, rs) {
  const yes = by(rs, 'yes'), have = new Set(yes.map((r) => r.pos).filter(Boolean)), out = [];
  if (e.players >= 5 && !have.has('GK') && yes.length) out.push('a goalkeeper');
  const short = e.players - yes.length;
  if (short > 0) out.push(`${short} more player${short === 1 ? '' : 's'}`);
  return out;
}

// The sign-up post. `who` = the full roster view (used by /matchday who).
export function eventPanel(e, rs, { club = null, who = false, ephemeral = false, answers = true, ping = null } = {}) {
  const yes = by(rs, 'yes'), maybe = by(rs, 'maybe'), no = by(rs, 'no');
  const need = missing(e, rs), [kindName] = KINDS[e.kind] ?? KINDS.league;
  const blocks = [
    ping ? text(`<@&${ping}> a match day is up – answer below.`) : null,
    header({ eyebrow: `${club?.name ? `${club.name} · ` : ''}Match day · ${kindName}`, title: e.title || eventTitle(e.kind, e.opponent), sub: `<t:${at(e)}:F> · <t:${at(e)}:R>`, thumb: club?.crest }),
    facts([['👥 Players', `${yes.length}/${e.players}`], ['⏱️ Length', `${e.duration} min`], ['🆚 Opponent', e.opponent || null], ['📝 Notes', e.notes || null]]),
    sep(),
    text(`**✅ In (${yes.length})**\n${yes.length ? clip(yes.map(nm)) : '_nobody yet_'}`),
    maybe.length ? text(`**❔ Maybe (${maybe.length})**\n${clip(maybe.map(nm))}`) : null,
    who || no.length ? text(`**❌ Out (${no.length})**\n${no.length ? clip(no.map((r) => `${face(r)}${r.name}`)) : '_nobody_'}`) : null,
    need.length ? text(`⚠️ **Still needed:** ${need.join(' · ')}`) : yes.length ? text('✅ **Full squad.**') : null,
    footer(`Times show in your own time zone · 🟢 = checked in · pick your position below`),
  ];
  if (answers) {
    blocks.push({ type: 1, components: [button({ label: 'In', id: `ml:ev:${e.id}:yes`, style: 'ok', emoji: '✅' }), button({ label: 'Maybe', id: `ml:ev:${e.id}:maybe`, emoji: '❔' }), button({ label: 'Out', id: `ml:ev:${e.id}:no`, style: 'no', emoji: '❌' })] });
    blocks.push(menu({ id: `ml:evp:${e.id}`, placeholder: '📍 Your position (optional)', options: POSITIONS.map((p) => ({ label: p, value: p })) }));
  }
  return message({ accent: 'info', ephemeral, blocks });
}

// /matchday schedule: the next few, each with its own answer buttons.
export function schedulePanel(events, countsOf, club = null, ephemeral = true) {
  if (!events.length) return notice('Nothing scheduled', 'Managers add a match day with `/matchday create` or `/host`.');
  const rows = events.slice(0, 4).flatMap((e) => {
    const c = countsOf(e.id);
    return [text(`**${e.title || eventTitle(e.kind, e.opponent)}**\n<t:${at(e)}:F> · <t:${at(e)}:R>\n✅ ${c.yes}/${e.players} · ❔ ${c.maybe} · ❌ ${c.no}`),
      { type: 1, components: [button({ label: 'In', id: `ml:ev:${e.id}:yes`, style: 'ok', emoji: '✅' }), button({ label: 'Maybe', id: `ml:ev:${e.id}:maybe`, emoji: '❔' }), button({ label: 'Out', id: `ml:ev:${e.id}:no`, style: 'no', emoji: '❌' })] }];
  });
  return message({ accent: 'info', ephemeral, blocks: [header({ eyebrow: `${club?.name ? `${club.name} · ` : ''}Schedule`, title: 'Upcoming match days', sub: `${events.length} scheduled`, thumb: club?.crest }), ...rows, footer('Answer right here · times show in your own time zone')] });
}

export function createdPanel(e, where, extra = []) {
  return notice(`✅ Scheduled for <t:${at(e)}:F>`, [`<t:${at(e)}:R> · everyone sees it in their own time zone.`, where, ...extra].filter(Boolean).join('\n'), { accent: 'win', ephemeral: true });
}

// ---------- lineup ----------
// Players who said ✅ (plus checked in), placed by the position they picked; no position → the squad list.
export function lineupOf(rs) {
  const yes = rs.filter((r) => r.status === 'yes');
  const placed = yes.filter((r) => r.pos && LINE[r.pos]).sort((a, b) => (SIDE[a.pos] ?? 1) - (SIDE[b.pos] ?? 1) || String(a.name).localeCompare(b.name));
  return { placed: placed.map((r) => ({ n: r.name, pos: LINE[r.pos], role: r.pos })), unplaced: yes.filter((r) => !r.pos || !LINE[r.pos]).map((r) => r.name), maybe: rs.filter((r) => r.status === 'maybe').map((r) => r.name) };
}
export const lineupKey = (e, L) => `events/${e.id}/lineup-${hash([e.title, e.start, L.placed, L.unplaced])}.png`;

export function lineupPanel(e, rs, url, club = null) {
  const L = lineupOf(rs), by2 = (line) => L.placed.filter((p) => p.pos === line).map((p) => `\`${p.role}\` ${p.n}`);
  const lines = [['🧤 Keeper', 'goalkeeper'], ['🛡️ Defence', 'defender'], ['⚙️ Midfield', 'midfielder'], ['🎯 Attack', 'forward']].map(([t, l]) => (by2(l).length ? `**${t}** ${by2(l).join(' · ')}` : null)).filter(Boolean);
  return message({ accent: 'info', blocks: [
    header({ eyebrow: `${club?.name ? `${club.name} · ` : ''}Lineup`, title: e.title || eventTitle(e.kind, e.opponent), sub: `<t:${at(e)}:F> · ${L.placed.length + L.unplaced.length} in`, thumb: club?.crest }),
    cards(url && { url, alt: 'The lineup on the pitch' }),
    !url || L.unplaced.length ? text([...(!url ? lines : []), L.unplaced.length ? `**No position picked** ${L.unplaced.join(', ')}` : null].filter(Boolean).join('\n') || '_nobody has signed up yet_') : null,
    L.maybe.length ? text(`**❔ Maybe** ${L.maybe.join(', ')}`) : null,
    footer('No lineup is set yet – this is the sign-up list · /suggestlineup shows a suggestion, /setlineup sets it'),
  ] });
}

