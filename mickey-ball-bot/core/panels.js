// Every message the bot sends, built from the layout kit (core/ui.js) the same way for every command: panel with a result-coloured stripe,
// header with the club crest, a drawn picture, a few facts, a footer line and the buttons. `u(kind, ref)` returns a picture URL or null;
// when a picture is missing the message falls back to plain text, so a post never breaks.
import { message, notice, header, text, sep, footer, label, facts, cards, buttons, menu, tagBlock, side, thumb, resultAccent, RESULT_ICON, RESULT_WORD, ICON } from './ui.js';
import { ratingDot } from './theme.js';
import { decodeEvents, eventRows, boxEv } from './events.js';
import { BOARD_LIST, BOARD_TITLE } from './boards.js';

const r1 = (v) => (+v || 0).toFixed(1);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const KIND = { friendly: 'Friendly', playoff: 'Playoff' };
const POS = { goalkeeper: 'GK', defender: 'DEF', midfielder: 'MID', forward: 'FWD' };
const list = (ps, f) => ps.filter((p) => p[f] > 0).map((p) => `${p.name}${p[f] > 1 ? ` ×${p[f]}` : ''}`).join(', ');
const UPDATED = 'Updates every 15 min';
// "From the event data": decoded EA counters, us first then them. Text, so it works with or without the pictures.
const evLines = (m) => {
  const x = eventRows(m.home.players, m.away.players);
  if (!x) return null;
  return [`**📡 From the event data** · ${x.apps} of ${x.of} players`, ...x.rows.map((r) => `${r.k}: **${r.a ?? '–'}${r.a != null ? r.u ?? '' : ''}**${r.b != null ? ` vs ${r.b}${r.u ?? ''}` : ''}`)].join('\n');
};
export const banner = (env, name) => `${String(env.PUBLIC_URL).replace(/\/$/, '')}/c/banners/${name}-v1.png`;

// ---------- match centre (the post under /last, /match stats and every auto-post) ----------
// Three pictures: the big board (score, goals and assists, man of the match, the stats), then the pitch and the match review side by side
// below a faint divider. Without pictures the same facts come as text.
export function matchPanel(club, m, u, { ephemeral = false } = {}) {
  const ps = m.home.players, kind = KIND[m.type] ?? 'League';
  const avg = ps.length ? ps.reduce((t, p) => t + p.rating, 0) / ps.length : null;
  const motm = ps.find((p) => p.mom);
  const board = u('board', m.id), pitch = u('pitch', m.id), review = u('review', m.id);
  const best = [...ps].sort((a, b) => b.rating - a.rating);
  const alt = `${club.name} ${m.home.goals}–${m.away.goals} ${m.away.name}`;
  return message({ accent: resultAccent(m.res), ephemeral, blocks: [
    tagBlock(club.name, kind),
    header({ eyebrow: `${club.name} · Match centre · ${kind}`, title: `${club.name} ${board ? 'vs' : `${m.home.goals}–${m.away.goals}`} ${m.away.name}`, sub: `<t:${m.ts}:f> · ${RESULT_WORD[m.res]}`, thumb: club.crest }),
    cards(board && { url: board, alt: `${alt}: scoreboard, goals and assists, man of the match and the team stats` }),
    board && (pitch || review) ? sep({ big: false }) : null,
    cards(pitch && { url: pitch, alt: 'Rating by line, our players on the pitch with their ratings, and every rating' }, review && { url: review, alt: 'Match review: what went well, what to work on and the event data' }),
    !board ? [facts([[`${ICON.goal} Goals`, list(ps, 'goals') || 'none'], [`${ICON.assist} Assists`, list(ps, 'assists')], ['📊 Team rating', avg != null ? r1(avg) : null]]),
      motm ? facts([[`${ICON.motm} Man of the match`, `${motm.name} · ${r1(motm.rating)}`]]) : null, evLines(m) ? text(evLines(m)) : null, sep(),
      !pitch && ps.length ? text(best.map((p) => `\`${r1(p.rating)}\` ${p.name}`).join('\n')) : null] : null,
    footer(pitch ? 'Gold = man of the match · green 7+ · orange 6–6.9 · red under 6 · pick your name below to see your own match' : 'Pick your name below to see your own match'),
    ps.length ? menu({ id: `ml:pm:${club.id}:${m.id}`.slice(0, 100), placeholder: '📊 Show my match – pick your player',
      options: best.slice(0, 25).map((p) => ({ label: p.name.slice(0, 100), value: p.name.slice(0, 100), emoji: { name: ratingDot(p.rating) }, description: `Rating ${r1(p.rating)}${p.goals ? ` · ⚽ ${p.goals}` : ''}${p.assists ? ` · 🎯 ${p.assists}` : ''}`.slice(0, 100) })) }) : null,
    buttons([{ label: 'Box score', id: `ml:box:${club.id}:${m.id}`, emoji: '📊' }, { label: 'Club stats', id: `ml:cs:${club.id}:${m.id}`, emoji: '🏟️' }, { label: 'Leaderboard', id: `ml:lb:${club.id}:${m.id}`, emoji: '🏆' }]),
  ] });
}

// "Box score" button: the drawn table, privately.
export function boxPanel(club, m, u) {
  const box = u('box', m.id), ps = [...m.home.players].sort((a, b) => b.rating - a.rating);
  return message({ ephemeral: true, accent: resultAccent(m.res), blocks: [
    header({ eyebrow: `${club.name} · Box score`, title: `${club.name} ${m.home.goals}–${m.away.goals} ${m.away.name}`, sub: `<t:${m.ts}:f>` }),
    box ? cards({ url: box, alt: 'Every player: rating, goals, assists, passes, tackles and shots' })
      : text(ps.map((p) => { const b = boxEv(p.ev); return `\`${r1(p.rating)}\` **${p.name}** · ${p.goals}G ${p.assists}A · pass ${pct(p.passesMade, p.passAtt) ?? '–'}% · tackles ${p.tacklesMade}/${p.tackleAtt} · shots ${p.shots}${b ? ` · int ${b.int} · won ${b.won} · lost ${b.lost} · aer ${b.aer}` : ''}`; }).join('\n')),
    evLines(m) ? text(evLines(m)) : null,
  ] });
}

// "Show my match": one player's line in one match against their usual numbers, privately.
const vs = (val, avg, dec = 1, unit = '') => {
  if (avg == null || !Number.isFinite(+avg)) return '';
  const d = +val - +avg;
  return ` · avg ${(+avg).toFixed(dec)}${unit} ${Math.abs(d) < (dec ? 0.05 : 0.5) ? '＝' : d > 0 ? '▲' : '▼'}`;
};
export function personalPanel(club, m, p, season) {
  const s = season?.gp ? season : null, g = (v) => (s ? (+v || 0) / s.gp : null);
  const passPct = pct(p.passesMade, p.passAtt), tacklePct = pct(p.tacklesMade, p.tackleAtt);
  const rows = [
    `**${ratingDot(p.rating)} Rating**\n**${r1(p.rating)}**${vs(p.rating, s?.avg)}${p.mom ? '\n⭐ **Man of the match**' : ''}`,
    `**⚽ Goals · 🎯 Assists**\n**${p.goals}** · **${p.assists}**${s ? `\navg ${g(s.g).toFixed(2)} · ${g(s.a).toFixed(2)} per game` : ''}`,
    p.passAtt ? `**🅿️ Passes**\n**${p.passesMade}/${p.passAtt}**${passPct != null ? ` (${passPct}%)` : ''}${passPct != null && s?.pa ? vs(passPct, pct(s.pm, s.pa), 0, '%') : ''}` : null,
    p.tackleAtt ? `**🛡️ Tackles**\n**${p.tacklesMade}/${p.tackleAtt}**${tacklePct != null ? ` (${tacklePct}%)` : ''}${tacklePct != null && s?.ta ? vs(tacklePct, pct(s.tm, s.ta), 0, '%') : ''}` : null,
    p.shots ? `**🥅 Shots**\n**${p.shots}**${p.goals ? ` · ${pct(p.goals, p.shots)}% scored` : ''}` : null,
    p.saves ? `**🧤 Saves**\n**${p.saves}**` : null,
    ...(p.ev ? (() => { const e = decodeEvents(p.ev), b = boxEv(p.ev); return [`**📡 From the event data**\nInterceptions **${b.int}** · won **${b.won}** · lost **${b.lost}** · aerials **${b.aer}**`,
      `**➡️ Passing**\nForward **${e.passesCompletedForward}** · through **${e.throughPasses}** · long **${e.passesCompletedLong}**${e.passesCompleted + e.passesFailed ? ` · ${pct(e.passesCompleted, e.passesCompleted + e.passesFailed)}% completed` : ''}`,
      e.dribblesCompleted || e.shotsOnTarget ? `**🏃 Attack**\nDribbles **${e.dribblesCompleted}** · shots on target **${e.shotsOnTarget}** · inside the box **${e.shotsOnTargetInsideBox + e.shotsOffTargetInsideBox}**` : null,
      b.pos != null ? `**📍 Positioning**\nIn position **${b.pos}%**` : null]; })() : []),
  ].filter(Boolean);
  return message({ ephemeral: true, accent: resultAccent(m.res), blocks: [
    header({ eyebrow: `${club.name} · Player match`, title: `${p.name} · ${m.home.goals}–${m.away.goals} ${m.away.name}`.slice(0, 250), sub: `${RESULT_WORD[m.res]}${p.pos ? ` · ${POS[p.pos] ?? p.pos}` : ''} · <t:${m.ts}:R>`, thumb: club.crest }),
    text(rows.join('\n\n')),
    sep(),
    footer('🟢 8+  🟡 7+  🟠 6+  🔴 under 6 · only you can see this'),
  ] });
}

// ---------- club, results, player, compare, leaderboard ----------
export function clubPanel(club, t, form, streak, u, { ephemeral = false } = {}) {
  if (!t?.gp) return notice('No matches stored yet', 'Run /match track first; the first result shows up here a few minutes after it is played.', { ephemeral });
  const card = u('club', ''), gd = t.gf - t.ga;
  return message({ ephemeral, accent: 'info', blocks: [
    header({ eyebrow: `${club.name} · Club`, title: club.name, sub: `${t.gp} played · ${Math.round((t.w / t.gp) * 100)}% wins${streak?.n > 1 ? ` · 🔥 ${streak.n} ${{ W: 'win', D: 'draw', L: 'loss' }[streak.res]} streak` : ''}`, thumb: card ? null : club.crest }),
    cards(card && { url: card, alt: `${t.w} wins, ${t.d} draws, ${t.l} losses` }),
    !card && facts([['Record', `${t.w}W ${t.d}D ${t.l}L (${t.gp} played)`], ['Goals', `${t.gf} scored · ${t.ga} conceded (${gd >= 0 ? '+' : ''}${gd})`], ['Form', form.map((r) => RESULT_ICON[r]).join('') || '–']]),
    footer(`${UPDATED} · newest result on the right`),
  ] });
}

export function resultsPanel(club, rows, u) {
  const n = rows.length, card = u('results', '');
  if (!n) return notice('No matches yet', 'The first result shows up here a few minutes after it is played.');
  return message({ accent: 'info', blocks: [
    header({ eyebrow: `${club.name} · Results`, title: `Last ${n} results`, sub: `${rows.filter((m) => m.res === 'W').length}W ${rows.filter((m) => m.res === 'D').length}D ${rows.filter((m) => m.res === 'L').length}L`, thumb: card ? null : club.crest }),
    cards(card && { url: card, alt: 'Recent results' }),
    (!card || n > 8) && n ? text(rows.slice(card ? 8 : 0).map((m) => `${RESULT_ICON[m.res]} **${m.gf}–${m.ga}** vs ${m.opp_name} · <t:${m.ts}:d>`).join('\n')) : null,
    footer(UPDATED),
  ] });
}

export function playerPanel(club, name, p, u, ev = null) {
  if (!p) return notice(`No player called ${name}`, 'Start typing and pick a name from the list.');
  const card = u('player', p.player);
  return message({ accent: 'info', blocks: [
    header({ eyebrow: `${club.name} · Player`, title: p.player, sub: `${POS[p.pos] ?? p.pos ?? ''} · ${p.gp} game${p.gp === 1 ? '' : 's'}`.replace(/^ · /, ''), thumb: card ? null : club.crest }),
    cards(card && { url: card, alt: `${p.player}: rating, goals, assists and recent form` }),
    !card && facts([['Rating', `${(+p.avg).toFixed(2)} avg · best ${r1(p.best)}`], ['Goals · Assists', `${p.g} · ${p.a}`], ['Passes', `${pct(p.pm, p.pa) ?? '–'}%`], ['Tackles', `${pct(p.tm, p.ta) ?? '–'}%`], ['Man of the match', p.mom || '0'], ['Form', p.form?.length ? p.form.map(ratingDot).join('') : '']]),
    ev ? text(`**📡 From the event data** · ${ev.apps} game${ev.apps === 1 ? '' : 's'}\nInterceptions **${ev.ints}** · possession won **${ev.won}** · lost **${ev.lost}** · aerials **${ev.aerial}**\nForward passes **${ev.forward}** · pass accuracy **${ev.passAcc ?? '–'}%**${ev.positioning != null ? ` · in position **${ev.positioning}%**` : ''}`) : null,
    footer(`${UPDATED} · only tracked matches count`),
  ] });
}

export function comparePanel(club, a, b, cardUrl) {
  if (!a || !b) return notice('Couldn’t find both players', 'Pick both names from the list as you type.');
  const rows = [['Games', a.gp, b.gp], ['Goals', a.g, b.g], ['Assists', a.a, b.a], ['Rating', +a.avg, +b.avg, 1], ['MOTM', a.mom, b.mom], ['Pass %', pct(a.pm, a.pa), pct(b.pm, b.pa)], ['Tackle %', pct(a.tm, a.ta), pct(b.tm, b.ta)]];
  const w = Math.max(10, a.player.length, b.player.length) + 2, fmt = (v, dec = 0) => (+v || 0).toFixed(dec);
  const table = ['STAT'.padEnd(10) + a.player.slice(0, w - 2).padStart(w) + b.player.slice(0, w - 2).padStart(w),
    ...rows.map(([k, x, y, dec]) => `${k.padEnd(10)}${(fmt(x, dec) + (+x > +y ? ' ◀' : '  ')).padStart(w)}${(fmt(y, dec) + (+y > +x ? ' ◀' : '  ')).padStart(w)}`)].join('\n');
  return message({ accent: 'info', blocks: [
    header({ eyebrow: `${club.name} · Compare`, title: `${a.player} vs ${b.player}`, sub: `${POS[a.pos] ?? a.pos ?? ''} vs ${POS[b.pos] ?? b.pos ?? ''} · tracked matches`.replace(/^ vs  · /, '') , thumb: cardUrl ? null : club.crest }),
    cardUrl ? cards({ url: cardUrl, alt: `${a.player} and ${b.player} compared stat by stat` }) : text(`\`\`\`\n${table}\n\`\`\``),
    footer('◀ marks the better number'),
  ] });
}

export function leaderboardPanel(club, stat, rows, u, { ephemeral = false } = {}) {
  const card = u('top', stat);
  if (!rows.length) return message({ ephemeral, accent: 'info', blocks: [text(`**No ${(BOARD_TITLE[stat] ?? 'leaderboard').toLowerCase()} data yet**\n${BOARD_LIST.find((b) => b.key === stat)?.label.includes('event data') ? 'EA only sends event counters for recent matches, so this fills in as new matches are tracked.' : 'Track a club with /match track and the boards fill in as matches are played.'}`), menu({ id: `ml:lbs:${club.id}`, placeholder: '🏆 Switch stat', options: BOARD_LIST.map((b) => ({ label: b.label, value: b.key, default: b.key === stat })) })] });
  const medal = ['🥇', '🥈', '🥉'];
  return message({ ephemeral, accent: 'info', blocks: [
    header({ eyebrow: `${club.name} · Leaderboard`, title: BOARD_TITLE[stat] ?? 'Leaders', sub: `Top ${Math.min(10, rows.length)} · tracked matches`, thumb: card ? null : club.crest }),
    cards(card && { url: card, alt: BOARD_TITLE[stat] }),
    !card && text(rows.map((r, i) => `${medal[i] ?? `\`${i + 1}.\``} **${r.player}** · ${r.shown} _(${r.gp} g)_`).join('\n')),
    footer(`${UPDATED} · pick another stat below`),
    menu({ id: `ml:lbs:${club.id}`, placeholder: '🏆 Switch stat', options: BOARD_LIST.map((b) => ({ label: b.label, value: b.key, default: b.key === stat })) }),
  ] });
}

// ---------- history, insight, help, search ----------
export function historyPanel(env, club, q, rows) {
  const pic = cards({ url: banner(env, 'history'), alt: 'Head to head' });
  if (!rows.length) return message({ accent: 'info', blocks: [header({ eyebrow: `${club.name} · Head to head`, title: `No games against “${q}”`, sub: 'Only tracked matches count', thumb: club.crest }), pic] });
  const w = rows.filter((r) => r.res === 'W').length, d = rows.filter((r) => r.res === 'D').length, l = rows.length - w - d;
  const gf = rows.reduce((t, r) => t + r.gf, 0), ga = rows.reduce((t, r) => t + r.ga, 0);
  return message({ accent: 'info', blocks: [
    header({ eyebrow: `${club.name} · Head to head`, title: `${club.name} vs ${rows[0].opp_name}`, sub: `${rows.length} played · ${w}W ${d}D ${l}L · goals ${gf}–${ga}`, thumb: club.crest }),
    pic,
    text(rows.slice(0, 8).map((r) => `${RESULT_ICON[r.res]} **${r.gf}–${r.ga}** vs ${r.opp_name} · <t:${r.ts}:d>`).join('\n')),
    footer(UPDATED),
  ] });
}

export function insightPanel(env, club, kind, rows, streak) {
  const pic = cards({ url: banner(env, 'insight'), alt: 'Form guide' });
  const dots = (a) => a.map((r) => RESULT_ICON[r.res]).join('');
  let title, body;
  if (kind === 'last5') {
    const l = rows.slice(0, 5), w = l.filter((r) => r.res === 'W').length, gf = l.reduce((t, r) => t + r.gf, 0), ga = l.reduce((t, r) => t + r.ga, 0);
    title = `Last ${l.length} matches`; body = `${dots(l)}\n**${w}** wins · scored **${gf}** · conceded **${ga}**\n${w >= 4 ? '🔥 Flying.' : w >= 3 ? '📈 Solid run.' : w >= 2 ? '⚖️ Mixed.' : '📉 Needs a reset.'}`;
  } else if (kind === 'streaks') {
    title = 'Streaks'; body = `Current: **${streak.n}** ${{ W: 'win', D: 'draw', L: 'loss' }[streak.res]}${streak.n === 1 ? '' : 's'}\nBest win run **${streak.best.W}** · worst losing run **${streak.best.L}**\nClean sheets **${rows.filter((r) => r.ga === 0).length}** · games scoring 3+ **${rows.filter((r) => r.gf >= 3).length}**`;
  } else {
    const l = rows.slice(0, 10), pts = l.reduce((t, r) => t + (r.res === 'W' ? 3 : r.res === 'D' ? 1 : 0), 0);
    title = 'Club form'; body = `${dots(l)}\n**${pts}** points from the last **${l.length}** (${(pts / l.length).toFixed(2)} per game)`;
  }
  return message({ accent: 'info', blocks: [header({ eyebrow: `${club.name} · Insight`, title, thumb: club.crest }), pic, text(body), footer(UPDATED)] });
}

export function helpPanel(env) {
  return message({ accent: 'info', ephemeral: true, blocks: [
    header({ eyebrow: 'Mickey Ball Bot', title: 'What I can do', sub: 'Pro Clubs match stats for any club' }),
    cards({ url: banner(env, 'help'), alt: 'Mickey Ball Bot commands' }),
    text('**Find & post**\n`/match search` find a club or its opponents\n`/match stats` post a match (Box score · Club stats · Leaderboard)\n`/match track` track a club: its new matches post by themselves (track as many as you like)\n`/match main` pick the default club · `/match untrack` · `/match list`'),
    sep(),
    text('**Stats from tracked matches**\n`/club` record, form, streak · `/results` recent scores · `/last` latest match\n`/player` player card · `/compare` two players · `/leaderboard` top players (incl. interceptions, possession won, aerials)\n`/history` record vs an opponent · `/insight` form, last 5, streaks'),
    sep(),
    text('**Match days**\n`/host` or `/matchday create` managers schedule a session, league night, friendly… with ✅ ❔ ❌ sign-ups\n`/matchday next` · `schedule` · `who` · `checkin` · `cancel`\n`/lineup` the lineup from the sign-ups, on a pitch'),
    footer('Leave `club` empty to use the main club · match cards include EA’s decoded event stats'),
  ] });
}

export function pickerPanel(env, hits, query, kind, game, crestOf) {
  return message({ accent: 'info', blocks: [
    header({ eyebrow: 'Club search', title: `Clubs matching “${query}”`, sub: `${hits.length} found · pick one below`, thumb: crestOf(hits[0]) }),
    cards({ url: banner(env, 'search'), alt: 'Club search' }),
    text(hits.map((c, i) => `**${i + 1}.** ${c.name} · \`${c.id}\``).join('\n')),
    menu({ id: `ml:pick:${kind}:${game}`, placeholder: 'Pick the club', options: hits.map((c) => ({ label: c.name.slice(0, 100), value: c.id, description: `ID ${c.id}` })) }),
  ] });
}

export function clubFound(env, club, label2) {
  return message({ accent: 'info', blocks: [
    header({ eyebrow: 'Club search', title: club.name, sub: label2, thumb: club.crest }),
    cards({ url: banner(env, 'search'), alt: 'Club search' }),
    text(`Club ID \`${club.id}\``),
  ] });
}

export function opponentsPanel(env, club, opps) {
  return message({ accent: 'info', blocks: [
    header({ eyebrow: 'Club search', title: `${club.name} · recent opponents`, sub: `${opps.length} club${opps.length === 1 ? '' : 's'} from the latest matches`, thumb: club.crest }),
    cards({ url: banner(env, 'search'), alt: 'Club search' }),
    text(opps.map((c, i) => `**${i + 1}.** ${c.name} · \`${c.id}\``).join('\n') || 'No recent matches found.'),
  ] });
}

export function trackedPanel(env, club, added, channelId) {
  return message({ accent: 'info', blocks: [
    header({ eyebrow: 'Tracking', title: `Now tracking ${club.name}`, sub: `Imported ${added} recent match${added === 1 ? '' : 'es'}`, thumb: club.crest }),
    cards({ url: banner(env, 'track'), alt: 'Club tracking' }),
    text(`New matches post in <#${channelId}> by themselves. Try \`/club\`, \`/leaderboard\` and \`/player\`. Track more clubs any time: each keeps its own history.`),
    footer(`Checked every 15 min · club ${club.id}`),
  ] });
}

export function trackedList(env, rows) {
  return message({ accent: 'info', ephemeral: true, blocks: [
    header({ eyebrow: 'Tracking', title: 'Tracked clubs', sub: `${rows.length} in this server` }),
    text(rows.length ? rows.map((r) => `• **${r.name}** \`${r.club_id}\` → <#${r.channel_id}>${r.main ? ' · ⭐ main' : ''}`).join('\n') + '\n\n⭐ main = the club the stat commands use when `club` is empty (`/match main` changes it).' : 'No clubs tracked yet. Use `/match track`.'),
  ] });
}

// ---------- session recap: one post per playing session, after it ends ----------
export function recapPanel(env, club, r, u) {
  const diff = r.gf - r.ga, card = u('recap', r.key);
  const title = r.w === r.count ? `${r.count} from ${r.count}` : r.l === r.count ? `${r.count} defeats` : `${r.w} won, ${r.d} drawn, ${r.l} lost`;
  const lines = r.matches.map((m) => `${RESULT_ICON[m.res]} **${m.gf}–${m.ga}** ${m.opp} · ${m.mode}`).join('\n');
  const perf = r.scorers.map((p) => `${ICON.goal} **${p.n}** ${[p.g && `${p.g} goal${p.g > 1 ? 's' : ''}`, p.a && `${p.a} assist${p.a > 1 ? 's' : ''}`].filter(Boolean).join(', ')}`).join('\n');
  const best = r.best.map((p) => `**${p.n}** ${p.avg.toFixed(1)} average over ${p.apps}`).join(' · ');
  const motm = r.motms.map((p) => `${ICON.motm} **${p.n}**${p.c > 1 ? ` ×${p.c}` : ''}`).join(' · ');
  const stand = r.standout
    ? [r.standout.lines.map((x) => `**${x.k}** ${x.n} (${x.v}${x.u})`).join('\n'), r.standout.positioning != null ? `Team in position ${r.standout.positioning}% of the time.` : null, `-# From EA's event counters, ${r.standout.matches} of ${r.standout.of} matches.`].filter(Boolean).join('\n')
    : 'No event counters in this session. EA keeps them only for recent matches, so earlier games cannot be filled in.';
  return message({ accent: r.w > r.l ? 'win' : r.w === r.l ? 'draw' : 'loss', blocks: [
    tagBlock(club.name, r.modes.join(' + ')),
    cards({ url: banner(env, 'recap'), alt: 'Session recap' }),
    header({ eyebrow: `${club.name} · Session recap`, title, sub: `<t:${r.start}:f> to <t:${r.end}:t> · ${r.count} match${r.count === 1 ? '' : 'es'}` }),
    facts([['Record', `${r.w}W ${r.d}D ${r.l}L`], ['Goals', `${r.gf}–${r.ga} (${diff >= 0 ? '+' : '−'}${Math.abs(diff)})`], ['Clean sheets', String(r.cs)]]),
    sep(), label('Matches'), card ? cards({ url: card, alt: 'Every match of the session: result, score, scorers and man of the match' }) : text(lines),
    r.scorers.length || r.best.length || r.motms.length ? sep() : null,
    r.scorers.length ? [label('Goals and assists'), text(perf)] : null,
    r.best.length ? [label('Best average rating'), text(best)] : null,
    r.motms.length ? [label('Man of the match'), text(motm)] : null,
    sep(), label('Standout stats'), text(stand),
    sep(), label('What to work on'), text(r.work.map((x) => `• ${x}`).join('\n')),
    footer('One recap per session · written from the match numbers'),
  ] });
}
