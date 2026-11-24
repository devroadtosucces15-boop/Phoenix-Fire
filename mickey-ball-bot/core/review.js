// The match review picture's wording (what went well, what to work on, next-match targets, squad recommendations), in football terms with
// the number as proof. Rule-based, no AI, so it can never fail a post. Same rules as the club bots this one is modelled on: lead with what
// it meant on the pitch, praise may name players, problems name a line and never a person, never claim more than the number supports.
import { eventSide } from './events.js';

const n = (v) => +v || 0;
const GROUP = { goalkeeper: 'GK', defender: 'DEF', midfielder: 'MID', forward: 'FWD' };
const LINE_NAME = { GK: 'Keeper', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' };
const sum = (a, f) => a.reduce((t, x) => t + n(x[f]), 0);
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null);
const mean = (a) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : null);
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const up5 = (v) => Math.ceil(v / 5) * 5;
const lineOf = (players, g) => players.filter((p) => GROUP[p.pos] === g);
const stats = (ps) => ({ n: ps.length, r: mean(ps.map((p) => n(p.rating))), pm: sum(ps, 'passesMade'), pa: sum(ps, 'passAtt'), tm: sum(ps, 'tacklesMade'), ta: sum(ps, 'tackleAtt'), sh: sum(ps, 'shots'), goals: sum(ps, 'goals') });

// Played to the end? EA keeps abandoned games with numbers that are not real play. Matches stored before minutes were kept count as full.
export const isFullMatch = (m) => {
  const ps = m.home.players;
  if (!ps.length || m.dnf) return false;
  return !ps.some((p) => p.secs != null) || Math.max(...ps.map((p) => n(p.secs))) >= 4800;
};

// history: earlier normalized matches of the same club (for the keepers' save-rate baseline).
export function buildReview(m, { history = [] } = {}) {
  if (!isFullMatch(m)) return null;
  const all = m.home.players, theirs = m.away.players, them = m.away, gf = m.home.goals, ga = m.away.goals, res = m.res;
  const T = stats(all), O = stats(theirs), L = Object.fromEntries(Object.keys(LINE_NAME).map((g) => [g, stats(lineOf(all, g))]));
  const teamPass = pct(T.pm, T.pa), oppPass = pct(O.pm, O.pa), tk = pct(T.tm, T.ta), oppTk = pct(O.tm, O.ta);
  const best = (g, f) => lineOf(all, g).sort((a, b) => n(b[f]) - n(a[f]))[0];
  const gk = lineOf(all, 'GK')[0];
  const hist = history.filter(isFullMatch).flatMap((h) => lineOf(h.home.players, 'GK'));
  const histSave = pct(sum(hist, 'saves'), sum(hist, 'saves') + sum(hist, 'conceded'));
  const gkFaced = gk ? n(gk.saves) + n(gk.conceded) : 0, gkSave = pct(gk ? n(gk.saves) : 0, gkFaced);
  const good = [], work = [];

  // ---- what went well ----
  if (O.sh <= 3 || (tk != null && oppTk != null && tk - oppTk >= 12 && T.tm > O.tm)) {
    const tackler = [...all].filter((p) => GROUP[p.pos] !== 'GK').sort((a, b) => n(b.tacklesMade) - n(a.tacklesMade))[0];
    good.push({ s: 9 + (O.sh <= 3 ? 1 : 0), icon: 'team', lead: 'We shut the door.', text: `${O.sh <= 3 ? `${them.name ?? 'They'} had ${O.sh} shot${O.sh === 1 ? '' : 's'} all night. ` : ''}We won ${T.tm} tackles to ${O.tm}${tackler && n(tackler.tacklesMade) >= 3 ? `, ${tackler.name} taking ${tackler.tacklesMade}` : ''}.` });
  }
  if (gk && gkFaced >= 2 && gkSave != null && (histSave == null || gkSave >= histSave)) {
    good.push({ s: 8, icon: 'glove', lead: 'Safe hands.', text: `${gk.name} saved ${gk.saves} of ${gkFaced} shots (${gkSave}%${histSave != null ? ` against the club keepers’ ${histSave}%` : ''}).` });
  }
  if (ga === 0 && L.DEF.n) {
    const dp = pct(L.DEF.pm, L.DEF.pa), topDef = best('DEF', 'rating');
    good.push({ s: 8.5, icon: 'shield', lead: 'A solid back line.', text: `Nothing conceded${dp != null ? `, ${dp}% passing` : ''}.${topDef ? ` ${topDef.name} rated ${n(topDef.rating).toFixed(1)}.` : ''}` });
  }
  const midBest = lineOf(all, 'MID').sort((a, b) => n(b.rating) - n(a.rating)).slice(0, 2);
  if (L.MID.n && L.MID.r != null && L.MID.r >= 7.2 && L.MID.r >= Math.max(...['DEF', 'FWD'].map((g) => L[g].r ?? 0)) - 0.05 && midBest.length) {
    good.push({ s: 7.5, icon: 'flow', lead: 'The middle set the rhythm.', text: `${list(midBest.map((p) => `${p.name} (${n(p.rating).toFixed(1)}) ${p.passesMade} of ${p.passAtt} passes`))}.` });
  }
  if (gf >= 2 && T.sh > 0 && gf / T.sh >= 0.3) {
    const scorers = all.filter((p) => n(p.goals) > 0);
    good.push({ s: 9, icon: 'goal', lead: 'Chances made to count.', text: `${gf} goals from ${T.sh} shots${scorers.length ? `. ${list(scorers.map((p) => p.name))} ${scorers.length > 1 ? 'got the goals' : 'scored'}` : ''}.` });
  }
  const onTarget = T.sh > 0 ? eventSide(all)?.t?.shotsOnTarget : null;
  if (onTarget != null && T.sh >= 4 && onTarget / T.sh >= 0.7) good.push({ s: 8, icon: 'goal', lead: 'We hit the target.', text: `${onTarget} of ${T.sh} shots on target (${pct(onTarget, T.sh)}%).` });
  if (teamPass != null && oppPass != null && teamPass >= 80 && teamPass - oppPass >= 5) good.push({ s: 7, icon: 'flow', lead: 'We kept the ball.', text: `${teamPass}% passing to their ${oppPass}%.` });
  if (!good.some((g) => g.icon === 'goal') && gf >= 1) {
    const scorers = all.filter((p) => n(p.goals) > 0);
    if (scorers.length) good.push({ s: 5, icon: 'goal', lead: gf > 1 ? 'We found the net.' : 'We got on the scoresheet.', text: `${gf} goal${gf > 1 ? 's' : ''}: ${list(scorers.map((p) => `${p.name}${n(p.goals) > 1 ? ` ×${p.goals}` : ''}`))}.` });
  }

  // ---- what to work on (a line, never a person) ----
  const fp = pct(L.FWD.pm, L.FWD.pa), dt = pct(L.DEF.tm, L.DEF.ta), mt = pct(L.MID.tm, L.MID.ta);
  const linePass = ['DEF', 'MID', 'FWD'].map((g) => [g, pct(L[g].pm, L[g].pa)]).filter(([, v]) => v != null);
  if (L.FWD.n && L.FWD.pa >= 10 && fp != null && teamPass != null && fp < teamPass - 8) {
    const lowest = linePass.every(([g, v]) => g === 'FWD' || v >= fp);
    work.push({ s: 9, kind: 'fwdPass', icon: 'goal', lead: 'Forwards: hold the ball up better.', text: `${fp}% passing (${L.FWD.pm} of ${L.FWD.pa})${lowest ? ', the lowest of any line' : ''}.` });
  }
  if (L.DEF.n && L.DEF.ta >= 4 && dt != null && dt < 45 && (mt == null || dt < mt)) {
    work.push({ s: 8.5, kind: 'defTackle', icon: 'shield', lead: 'Defenders: win more of the duels.', text: `${L.DEF.tm} of ${L.DEF.ta} tackles (${dt}%)${mt != null && L.MID.ta ? `, while the midfield won ${L.MID.tm} of ${L.MID.ta}` : ''}.` });
  }
  if (L.MID.n >= 3 && L.MID.sh <= 2) work.push({ s: 7, kind: 'midShots', icon: 'flow', lead: 'Midfielders: get forward and shoot.', text: `${L.MID.n} midfielders, ${L.MID.sh} shot${L.MID.sh === 1 ? '' : 's'}.` });
  if (O.sh >= 8) work.push({ s: 8, kind: 'shotsAgainst', icon: 'team', lead: 'Team: we gave them too much room.', text: `${them.name ?? 'They'} had ${O.sh} shots against ${T.sh} of ours.` });
  if (gf === 0 && T.sh >= 1) work.push({ s: 9, kind: 'noGoal', icon: 'goal', lead: 'Attack: nothing to show for the shots.', text: `No goal from ${T.sh} shot${T.sh === 1 ? '' : 's'}.` });
  if (teamPass != null && oppPass != null && oppPass - teamPass >= 5) work.push({ s: 7, kind: 'control', icon: 'team', lead: 'Team: they had the ball more.', text: `${teamPass}% passing to their ${oppPass}%.` });
  else if (res === 'W' && teamPass != null && oppPass != null && Math.abs(teamPass - oppPass) <= 2 && T.sh > O.sh) work.push({ s: 5, kind: 'control', icon: 'team', lead: 'Team: won on chances, not control.', text: `Passing level, ${teamPass}% to ${oppPass}%. Slow the tempo when ahead.` });
  if (gk && gkFaced >= 3 && gkSave != null && histSave != null && gkSave < histSave - 15) work.push({ s: 6, kind: 'gk', icon: 'glove', lead: 'Keeper: a few more saves to find.', text: `${gk.saves} of ${gkFaced} shots saved (${gkSave}%), the club keepers average ${histSave}%.` });
  if (!work.length) {
    const rated = Object.entries(L).filter(([, v]) => v.n && v.r != null).sort((a, b) => a[1].r - b[1].r)[0];
    if (rated) work.push({ s: 1, kind: 'low', icon: 'team', lead: `${LINE_NAME[rated[0]]}: the quietest line.`, text: `Rated ${rated[1].r.toFixed(1)}, the lowest of the night. Nothing to fix, keep the standard.` });
  }

  // ---- from the decoded event counters (only where EA sent them) ----
  const E = eventSide(all), EO = eventSide(theirs);
  let ev = null;
  if (E) {
    const o = EO ?? { insideBox: 0, forward: 0, wonHigh: 0, lostLow: 0, ints: 0, aerial: 0, positioning: null };
    ev = { apps: E.apps, of: all.length, rows: [
      { k: 'Won in the attacking third', a: E.wonHigh, b: EO ? o.wonHigh : null },
      { k: 'Lost in our own third', a: E.lostLow, b: EO ? o.lostLow : null, lower: true },
      { k: 'Forward passes completed', a: E.forward, b: EO ? o.forward : null },
      { k: 'Shots inside the box', a: E.insideBox, b: EO ? o.insideBox : null },
      { k: 'Interceptions', a: E.ints, b: EO ? o.ints : null },
      { k: 'Players in position', a: E.positioning, b: EO ? o.positioning ?? null : null, u: '%' },
    ] };
    if (EO && E.wonHigh - o.wonHigh >= 3) good.push({ s: 6.5, icon: 'flow', lead: 'We won it high up the pitch.', text: `${E.wonHigh} balls won in their third to ${o.wonHigh}.` });
    if (E.positioning != null && E.apps >= 6 && E.positioning < 70) work.push({ s: 6, kind: 'position', icon: 'team', lead: 'Team: hold your positions.', text: `In position ${E.positioning}% of the time (event data, ${E.apps} players).` });
    if (EO && E.lostLow >= 10 && E.lostLow - o.lostLow >= 4) work.push({ s: 6.5, kind: 'lostLow', icon: 'shield', lead: 'Defenders and keeper: stop giving it away at the back.', text: `${E.lostLow} balls lost in our own third, they lost ${o.lostLow}.` });
  }
  good.sort((a, b) => b.s - a.s); work.sort((a, b) => b.s - a.s);
  if (!good.length) good.push({ s: 1, icon: 'team', lead: res === 'W' ? 'We got the win.' : 'We played it out.', text: `${all.length} players on the pitch, team rating ${(T.r ?? 0).toFixed(1)}.` });

  // ---- next match targets ----
  const next = [];
  for (const w of work) {
    if (w.kind === 'fwdPass') next.push({ k: 'Forward passing', a: fp, b: Math.min(95, up5(fp + 7)), u: '%' });
    if (w.kind === 'defTackle') next.push({ k: 'Defender tackles won', a: dt, b: Math.max(50, up5(dt + 8)), u: '%' });
    if (w.kind === 'midShots') next.push({ k: 'Midfield shots', a: L.MID.sh, b: L.MID.sh + 2, u: '' });
    if (w.kind === 'shotsAgainst') next.push({ k: 'Shots against', a: O.sh, b: Math.max(3, O.sh - 3), u: '', lower: true });
    if (w.kind === 'noGoal') next.push({ k: 'Shots', a: T.sh, b: T.sh + 4, u: '' });
    if (w.kind === 'position' && E?.positioning != null) next.push({ k: 'In position', a: E.positioning, b: Math.min(95, up5(E.positioning + 8)), u: '%' });
  }
  if (E?.positioning != null && next.length < 3 && !next.some((x) => x.k === 'In position')) next.push({ k: 'In position', a: E.positioning, b: Math.min(95, up5(E.positioning)), u: '%' });
  if (next.length < 2 && teamPass != null) next.push({ k: 'Pass accuracy', a: teamPass, b: Math.min(95, up5(teamPass + 4)), u: '%' });

  // ---- squad recommendations (no names) ----
  const humans = all.length, ai = Math.max(0, 11 - humans), recs = [];
  const why = (k) => work.find((w) => w.kind === k)?.text;
  if (work.some((w) => w.kind === 'defTackle' || w.kind === 'shotsAgainst')) recs.push({ icon: 'flow', t: 'Name an anchor midfielder', tr: 'He drops between the defenders when we lose it; the others push on.', why: why('defTackle') ?? why('shotsAgainst') });
  if (ai >= 1) recs.push({ icon: 'chip', t: 'Plan around the AI slot', tr: 'Decide who covers beside it, and check where it sits in the lineup.', why: `${ai} of 11 slots ${ai === 1 ? 'was' : 'were'} AI. EA does not say which.` });
  if (work.some((w) => w.kind === 'fwdPass')) recs.push({ icon: 'assist', t: 'Give the forwards an easy pass', tr: 'Feed them when a midfielder is close for a wall pass, otherwise play wide.', why: `Forwards passed ${fp}%, the team ${teamPass}%.` });
  if (work.some((w) => w.kind === 'midShots' || w.kind === 'noGoal')) recs.push({ icon: 'goal', t: 'Send a second runner', tr: 'One midfielder arrives late at the edge of the box on every attack.', why: why('midShots') ?? why('noGoal') });
  if (work.some((w) => w.kind === 'control')) recs.push({ icon: 'team', t: 'Slow the tempo', tr: 'Keep it in the back line for a few passes before going forward.', why: why('control') });

  const margin = Math.abs(gf - ga);
  const title = res === 'W' ? (margin >= 3 ? 'Comfortable win' : margin === 2 ? 'Solid win' : 'Narrow win') : res === 'D' ? (gf === 0 ? 'Goalless draw' : 'Level game') : margin >= 3 ? 'Heavy defeat' : margin === 2 ? 'Defeat' : 'Narrow defeat';
  const sub = [ga === 0 ? 'Clean sheet' : null, gf > 0 && T.sh > 0 ? `${gf} goal${gf > 1 ? 's' : ''} from ${T.sh} shot${T.sh === 1 ? '' : 's'}` : null, T.r != null && O.r != null ? `rating ${T.r.toFixed(1)} to ${O.r.toFixed(1)}` : null].filter(Boolean).join(' · ');
  const shape = ['DEF', 'MID', 'FWD'].map((g) => L[g].n);
  return { id: m.id, res, title, sub, opp: them.name ?? 'Opponent',
    shape: { label: `${L.GK.n ? '1-' : ''}${shape.join('-')}`, humans, ai, line: { GK: L.GK.n, DEF: L.DEF.n, MID: L.MID.n, FWD: L.FWD.n }, players: all.map((p) => ({ g: GROUP[p.pos], r: n(p.rating), n: p.name, pos: p.pos, goals: p.goals, assists: p.assists, mom: p.mom })) },
    ev, good: good.slice(0, 5).map(({ s, ...x }) => x), work: work.slice(0, 4).map(({ s, kind, ...x }) => x), next: next.slice(0, 3), recs: recs.slice(0, 4) };
}
