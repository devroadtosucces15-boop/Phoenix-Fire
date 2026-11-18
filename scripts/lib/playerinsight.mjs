// The player's own breakdown of one match: every number against his own average, which of them are strengths and which are weak spots, and a few
// plain-English insights that say what each number does for the team and how to lift it. Pure, rule-based, no AI call and no I/O, so it can never
// fail a card. Inputs: line = one club.json match `ps` row (rating, goals, passes, tackles, shots and the decoded counters in `ev`), p = the players.json
// entry (`s` season totals, `i` counter averages per game, `tr` last ratings), m = the match (for the result and friendly flag).
// Rules for the wording: speak to the player ("your"), say what the number means on the pitch first, then one thing to do, never name anyone else, and
// never claim more than the number supports. A friendly carries no counters, so only rating, passing, tackling and shots are judged there.

const n = (v) => +v || 0;
const pct = (a, b) => (n(b) > 0 ? Math.round((100 * n(a)) / n(b)) : null);
const round1 = (v) => Math.round(v * 10) / 10;

// id, label, why it matters, what to do, unit, decimals, lower-is-better, the scale of "a big difference" (relative or in points), and which positions care most
const CATALOG = [
  { id: 'rating', label: 'Rating', unit: '', dec: 1, scale: 1, why: 'EA grades everything you did on the pitch in one number.', fix: 'Win the basics cleanly: simple passes, won duels and staying in position all feed it.', roles: ['FWD', 'MID', 'DEF', 'GK'] },
  { id: 'goals', label: 'Goals', unit: '', dec: 0, rel: true, why: 'Goals decide games.', fix: 'Get into the box earlier and shoot first time when the chance is on.', roles: ['FWD', 'MID'] },
  { id: 'assists', label: 'Assists', unit: '', dec: 0, rel: true, why: 'Assists turn possession into goals.', fix: 'Look for the runner behind the line before you pick the safe pass.', roles: ['FWD', 'MID'] },
  { id: 'shots', label: 'Shots', unit: '', dec: 0, rel: true, why: 'You cannot score without shooting.', fix: 'Shoot when you have the space instead of one more touch.', roles: ['FWD', 'MID'] },
  { id: 'saves', label: 'Saves', unit: '', dec: 0, rel: true, why: 'Every save keeps the team in the game.', fix: 'Set your feet early and stay big to the shooter.', roles: ['GK'] },
  { id: 'pm', label: 'Passes made', unit: '', dec: 0, rel: true, why: 'Passes completed are how you keep the ball and set the tempo.', fix: 'Show for the ball more often and play it first time when you can.', roles: ['MID', 'DEF'] },
  { id: 'tm', label: 'Tackles won', unit: '', dec: 0, rel: true, why: 'Won tackles stop attacks.', fix: 'Pick your moment: close the ball down when the touch is heavy.', roles: ['DEF', 'MID'] },
  { id: 'pass', label: 'Pass accuracy', unit: '%', dec: 0, scale: 20, why: 'Every completed pass keeps the ball and keeps an attack alive.', fix: 'When you are marked, take the safe pass to feet and move; save the risky ball for when you are free.', roles: ['MID', 'DEF'] },
  { id: 'tackle', label: 'Tackle success', unit: '%', dec: 0, scale: 25, why: 'Won tackles end attacks and hand the ball back to the team.', fix: 'Jockey first and only commit when the ball is loose or their touch is heavy.', roles: ['DEF', 'MID'] },
  { id: 'int', label: 'Interceptions', unit: '', dec: 0, rel: true, why: 'Interceptions cut out a pass before it becomes a chance.', fix: 'Stand between the passer and the receiver and read the pass instead of chasing the ball.', roles: ['DEF', 'MID'] },
  { id: 'aer', label: 'Aerial duels won', unit: '', dec: 0, rel: true, why: 'Winning headers decides crosses, long balls and corners.', fix: 'Stay goal-side of your target, time the jump and call for the ball.', roles: ['DEF', 'FWD'] },
  { id: 'won', label: 'Possession won', unit: '', dec: 0, rel: true, why: 'Every loose ball you take back is a new attack for the team.', fix: 'Press the second ball and be first to the knock-down.', roles: ['MID', 'DEF'] },
  { id: 'fwd', label: 'Forward passes', unit: '', dec: 0, rel: true, why: 'Forward passes are how the team gets up the pitch.', fix: 'Look up for the first forward option before you go sideways.', roles: ['MID', 'DEF'] },
  { id: 'pos', label: 'In position', unit: '%', dec: 0, scale: 20, why: 'Holding your position keeps the shape and covers the space teammates leave.', fix: 'Come back to your slot after every attack and keep your marker in view.', roles: ['DEF', 'MID', 'FWD'] },
  { id: 'sot', label: 'Shots on target', unit: '', dec: 0, rel: true, why: 'Only shots on target can score.', fix: 'Take the shot earlier and aim for the corners, not at the keeper.', roles: ['FWD', 'MID'] },
  { id: 'fouls', label: 'Fouls conceded', unit: '', dec: 0, rel: true, lower: true, why: 'Fouls give away free kicks and risk cards.', fix: 'Stay on your feet, jockey and let the ball come to you.', roles: ['DEF', 'MID'] },
];

const GROUP = { goalkeeper: 'GK', defender: 'DEF', midfielder: 'MID', forward: 'FWD', attacker: 'FWD' };
export const groupOf = (pos) => GROUP[String(pos ?? '').toLowerCase()] ?? 'MID';

// this match's value and the player's own average for one catalog entry; null when either side is missing (never a made-up zero)
function read(id, line, p) {
  const e = line.ev, av = p?.i?.pg, rt = p?.i?.r, s = p?.s;
  switch (id) {
    case 'rating': return s?.gp >= 3 && s.r ? [n(line.r), s.r] : [null, null];
    case 'goals': return s?.gp >= 3 ? [n(line.g), s.g / s.gp] : [null, null];
    case 'assists': return s?.gp >= 3 ? [n(line.a), s.a / s.gp] : [null, null];
    case 'shots': return p?.b ? [n(line.sh), p.b.sh] : [null, null];
    case 'saves': return p?.b && (n(line.sv) > 0 || p.b.sv >= 1) ? [n(line.sv), p.b.sv] : [null, null];
    case 'pm': return p?.b && n(line.pa) > 0 ? [n(line.pm), p.b.pm] : [null, null];
    case 'tm': return p?.b && n(line.ta) > 0 ? [n(line.tm), p.b.tm] : [null, null];
    case 'pass': return n(line.pa) >= 8 && s?.p ? [pct(line.pm, line.pa), s.p] : [null, null];
    case 'tackle': return n(line.ta) >= 3 && s?.t ? [pct(line.tm, line.ta), s.t] : [null, null];
    case 'int': return e && av ? [n(e.int), av.int] : [null, null];
    case 'aer': return e && av ? [n(e.aer), av.aer] : [null, null];
    case 'won': return e && av ? [n(e.won), av.won] : [null, null];
    case 'fwd': return e && av ? [n(e.fwd), av.fwd] : [null, null];
    case 'pos': return e && e.pos != null && rt?.pos != null ? [n(e.pos), rt.pos] : [null, null];
    case 'sot': return e && av && (n(line.sh) > 0 || av.sot >= 0.3) ? [n(e.sot), av.sot] : [null, null];
    case 'fouls': return e && av ? [n(e.fouls), av.fouls] : [null, null];
    default: return [null, null];
  }
}

// How far above (+) or below (−) his own average, as a fraction of a normal swing for that number; fouls count the other way round.
const deviation = (c, v, avg) => {
  const raw = c.rel ? (v - avg) / Math.max(avg, 1) : (v - avg) / c.scale;
  return Math.max(-1.5, Math.min(1.5, c.lower ? -raw : raw));
};
const fmt = (c, v) => (v == null ? '–' : c.dec ? round1(v).toFixed(c.dec) + c.unit : `${Math.round(v * (c.rel ? 10 : 1)) / (c.rel ? 10 : 1)}${c.unit}`.replace(/\.0(?=%?$)/, ''));

export function playerBreakdown(line, p, m = {}) {
  const role = groupOf(line.pos ?? p?.pos);
  const rows = [];
  for (const c of CATALOG) {
    const [v, avg] = read(c.id, line, p);
    if (v == null || avg == null) continue;
    if (c.rel && v === 0 && avg < 0.5) continue; // nothing to judge: he rarely does this and did not do it
    const dev = deviation(c, v, avg), weight = c.roles.includes(role) ? 1.25 : 1; // the numbers that belong to his job count a little more
    rows.push({ id: c.id, label: c.label, v, avg, text: fmt(c, v), avgText: fmt(c, avg), dev, rank: dev * weight, tone: Math.abs(dev) < 0.1 ? 'even' : dev > 0 ? 'good' : 'bad', lower: !!c.lower, c });
  }
  rows.sort((a, b) => b.rank - a.rank);
  const detail = rows.filter((r) => r.id !== 'rating'); // the rating is the headline; strengths and weak spots are the numbers that make it up
  const strengths = detail.filter((r) => r.tone === 'good'), weak = detail.filter((r) => r.tone === 'bad').sort((a, b) => a.rank - b.rank);
  const even = detail.filter((r) => r.tone === 'even');

  // insights: a headline on the night, then up to two weak spots (what it does, what to do, a target) and one strength to keep
  const insights = [];
  const rate = rows.find((r) => r.id === 'rating');
  const driver = rate && rate.tone === 'good' ? strengths[0] : rate && rate.tone === 'bad' ? weak[0] : null;
  if (rate) {
    const d = round1(rate.v - rate.avg);
    insights.push(rate.tone === 'good'
      ? { icon: 'check', lead: `A better game than your usual: ${rate.text} against ${rate.avgText}.`, text: `${d >= 0.1 ? `That is ${d.toFixed(1)} up on your average` : 'Level with your average'}${driver ? `, and ${driver.label.toLowerCase()} (${driver.text} against ${driver.avgText}) led the way` : ''}.` }
      : rate.tone === 'bad'
        ? { icon: 'team', lead: `A quieter game than your usual: ${rate.text} against ${rate.avgText}.`, text: `${driver ? `${driver.label} (${driver.text} against ${driver.avgText}) pulled it down the most. ` : ''}One game does not change who you are as a player: pick one weak spot from this card and work on it.` }
        : { icon: 'team', lead: `Right on your average: ${rate.text}.`, text: 'A steady game. The rows below show where you were above and below your own level.' });
  }
  for (const r of weak.filter((w) => w !== driver || w.rank < -0.6).slice(0, 2)) {
    const target = r.lower ? Math.max(0, Math.floor(r.avg)) : r.c.unit === '%' ? Math.min(95, Math.ceil(r.avg / 5) * 5) : Math.max(Math.ceil(r.avg), n(r.v) + 1);
    insights.push({ icon: r.c.id === 'pass' || r.c.id === 'fwd' ? 'flow' : r.c.id === 'sot' ? 'goal' : r.c.id === 'tackle' || r.c.id === 'aer' || r.c.id === 'int' ? 'shield' : 'team',
      lead: `${r.label}: ${r.text} against your ${r.avgText}.`, text: `${r.c.why} ${r.c.fix}`, aim: `Aim for ${r.lower ? `${target} or fewer` : `${target}${r.c.unit}`} next game.` });
  }
  const best = strengths.find((r) => r !== driver) ?? (rate?.tone === 'good' ? null : strengths[0]);
  if (best) insights.push({ icon: 'goal', lead: `Keep this up: ${best.label.toLowerCase()} ${best.text} against your ${best.avgText}.`, text: best.c.why });
  if (!line.ev) insights.push({ icon: 'chip', lead: 'Event stats are not sent for friendlies.', text: 'Interceptions, aerials, possession won, forward passes and in-position appear for league and playoff games.' });
  return { role, rows, strengths, weak, even, insights: insights.slice(0, 4) };
}

// His rating trend against his own average: last ten ratings, and the last five against the whole run. null with fewer than three ratings.
export function trend(p) {
  const tr = (p?.tr ?? []).map(Number).filter((x) => x > 0), last = tr.slice(-10);
  if (last.length < 3) return null;
  const avg = p?.s?.gp >= 3 && p.s.r ? p.s.r : tr.reduce((a, b) => a + b, 0) / tr.length;
  const l5 = last.slice(-5), l5avg = l5.reduce((a, b) => a + b, 0) / l5.length;
  return { points: last, avg: round1(avg), last5: round1(l5avg), delta: round1(l5avg - avg) };
}
