// Intelligence from Rush leaderboard photos. Pure functions: no I/O, so every number here is unit-tested.
//
// A "snapshot" is { id, taken_at (ms), rows: [{rank, club, vp, gp, m, bfg, avg}], us (index in rows) }. Everything compares our
// club against the clubs around it and against our own earlier snapshots of the same season:
//   - gaps to first, to the club above and to the club below, and how each moved since the last photo;
//   - pace in VP per hour (ours and the neighbours'), and what it implies: who catches whom and roughly when;
//   - season position: day n of N, a projected final total at the current pace, and the pace needed to reach the next place;
//   - efficiency: average VP per match against the leader and the top five, and how many matches the gap is worth;
//   - plain-language advice built from those numbers (rules, not guesses: each line cites the figure that triggered it).
// An empty history is fine: deltas and pace are simply absent and the advice sticks to the current picture.
const HOUR = 3600e3, DAY = 24 * HOUR;
const r1 = (n) => Math.round(n * 10) / 10;
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const fmt = (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-GB'));
export const signed = (n, d = 0) => (n == null ? '–' : `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(d ? n : Math.round(n)).toLocaleString('en-GB', d ? { maximumFractionDigits: d } : {})}`);
const find = (snap, club) => snap?.rows?.find((r) => norm(r.club) === norm(club)) ?? null;
const hoursBetween = (a, b) => (b.taken_at - a.taken_at) / HOUR;

// Season clock from { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }. The end is the day the season rolls over (not counted):
// 22 Oct → 3 Dec is 42 days, which is how the game counts ("Day 19/42").
export function seasonClock(season, now = Date.now()) {
  const s = Date.parse(`${season?.start}T00:00:00Z`), e = Date.parse(`${season?.end}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  const total = Math.round((e - s) / DAY);
  const day = Math.min(total, Math.max(1, Math.floor((now - s) / DAY) + 1));
  const left = Math.max(0, (e - now) / DAY);
  return { day, total, daysLeft: r1(left), pct: Math.round((day / total) * 100), over: now >= e };
}

// Pace of one club in VP/hour between two snapshots (null when the clock does not move or the club is missing).
function pace(prev, cur, club) {
  const a = find(prev, club), b = find(cur, club), h = prev && cur ? hoursBetween(prev, cur) : 0;
  if (!a || !b || h < 0.25) return null;
  return (b.vp - a.vp) / h;
}
const eta = (hours) => {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  if (hours < 1) return 'within the hour';
  if (hours < 48) return `in about ${Math.round(hours)}h`;
  return `in about ${Math.round(hours / 24)} days`;
};

// `history` = earlier snapshots of the same season, any order; `cur` = the newest. Returns the whole picture.
export function boardInsights(cur, history = [], { season = null, now = cur?.taken_at ?? Date.now() } = {}) {
  const rows = cur.rows, me = rows[cur.us];
  const prior = history.filter((h) => h.taken_at < cur.taken_at).sort((a, b) => a.taken_at - b.taken_at);
  const prev = prior.at(-1) ?? null;
  const base = prior.find((h) => cur.taken_at - h.taken_at <= 3 * DAY && h.taken_at < (prev?.taken_at ?? Infinity)) ?? prev; // a longer baseline for pace
  const leader = rows[0], above = cur.us > 0 ? rows[cur.us - 1] : null, below = rows[cur.us + 1] ?? null;
  const out = {
    taken_at: cur.taken_at, rank: me.rank, vp: me.vp, club: me.club, clubs: rows.length,
    gaps: { leader: leader === me ? 0 : leader.vp - me.vp, above: above ? above.vp - me.vp : null, below: below ? me.vp - below.vp : null },
    near: { leader: leader === me ? null : leader.club, above: above?.club ?? null, below: below?.club ?? null },
    delta: null, pace: null, forecast: null, efficiency: null, season: seasonClock(season, now), advice: [],
  };

  // movement since the last photo
  if (prev) {
    const was = find(prev, me.club), hrs = hoursBetween(prev, cur);
    if (was) {
      // "gain on X" = how much VP we gained on that club since the last photo: positive is good for us (closing on the clubs
      // ahead, stretching away from the club behind). It uses the clubs around us NOW, wherever they were before.
      const gainOn = (x) => { const px = x && x !== me ? find(prev, x.club) : null; return px ? (me.vp - was.vp) - (x.vp - px.vp) : null; };
      out.delta = {
        hours: r1(hrs), rank: was.rank - me.rank, vp: me.vp - was.vp, m: me.m != null && was.m != null ? me.m - was.m : null,
        leaderGap: gainOn(leader), aboveGap: gainOn(above), belowGap: gainOn(below), since: prev.taken_at,
      };
    }
  }

  // pace (VP per hour) from the baseline photo
  if (base) {
    const mine = pace(base, cur, me.club), pa = above ? pace(base, cur, above.club) : null, pb = below ? pace(base, cur, below.club) : null, pl = leader === me ? null : pace(base, cur, leader.club);
    out.pace = { hours: r1(hoursBetween(base, cur)), mine: mine == null ? null : r1(mine), above: pa == null ? null : r1(pa), below: pb == null ? null : r1(pb), leader: pl == null ? null : r1(pl) };
    const catchUp = mine != null && pa != null && above && mine > pa ? (above.vp - me.vp) / (mine - pa) : null;
    const caught = mine != null && pb != null && below && pb > mine ? (me.vp - below.vp) / (pb - mine) : null;
    out.pace.passAboveIn = catchUp == null ? null : r1(catchUp);
    out.pace.caughtByBelowIn = caught == null ? null : r1(caught);
  }

  // season forecast
  const clock = out.season;
  const mineRate = out.pace?.mine != null && out.pace.mine >= 0 ? out.pace.mine : null; // VP/hour
  if (clock && !clock.over) {
    const left = clock.daysLeft * 24;
    const proj = (club, rate) => (rate == null ? null : Math.round(club.vp + rate * left));
    out.forecast = {
      daysLeft: clock.daysLeft, projected: proj(me, mineRate),
      leaderProjected: proj(leader, out.pace?.leader), aboveProjected: above ? proj(above, out.pace?.above) : null,
      needPerDayForAbove: above && left > 0 ? Math.ceil(((above.vp + (out.pace?.above ?? 0) * left) - me.vp) / (left / 24)) : null,
      needPerDayForFirst: leader !== me && left > 0 ? Math.ceil(((leader.vp + (out.pace?.leader ?? 0) * left) - me.vp) / (left / 24)) : null,
    };
  }

  // efficiency: VP per match against the field
  const top5 = rows.slice(0, 5).filter((r) => r.avg != null);
  out.efficiency = {
    avg: me.avg ?? null, leaderAvg: leader.avg ?? null, top5Avg: top5.length ? r1(top5.reduce((s, r) => s + r.avg, 0) / top5.length) : null,
    m: me.m ?? null, leaderM: leader.m ?? null,
    matchesToPassAbove: above && me.avg > 0 ? Math.ceil((above.vp - me.vp + 1) / me.avg) : null,
    matchesToLead: leader !== me && me.avg > 0 ? Math.ceil((leader.vp - me.vp + 1) / me.avg) : null,
  };
  out.advice = advise(out, me, above, below, leader);
  return out;
}

function advise(o, me, above, below, leader) {
  const a = [], e = o.efficiency, p = o.pace, d = o.delta;
  if (o.gaps.above != null && o.gaps.above <= 3 * (me.avg || 50)) a.push(`**${above.club}** is only ${fmt(o.gaps.above)} VP ahead${e.matchesToPassAbove ? ` – about ${e.matchesToPassAbove} match${e.matchesToPassAbove === 1 ? '' : 'es'} at our ${e.avg} average` : ''}. Push for #${above.rank}.`);
  if (o.gaps.below != null && o.gaps.below <= 3 * (me.avg || 50)) a.push(`**${below.club}** is only ${fmt(o.gaps.below)} VP behind us. Defend #${me.rank} – every win adds a cushion.`);
  if (p?.caughtByBelowIn != null && p.caughtByBelowIn < 72) a.push(`${below.club} is gaining ${r1(p.below - p.mine)} VP/h on us and would pass us ${eta(p.caughtByBelowIn)} at this pace.`);
  if (p?.passAboveIn != null && p.passAboveIn < 24 * 14) a.push(`At the current pace we pass ${above.club} ${eta(p.passAboveIn)}. Keep the tempo.`);
  if (p?.mine != null && p.above != null && above && p.above > p.mine) a.push(`${above.club} is pulling away: ${r1(p.above)} VP/h against our ${r1(p.mine)}.`);
  if (e.leaderAvg && e.avg && me.m != null && leader.m != null) {
    if (e.avg >= e.leaderAvg * 0.97 && me.m < leader.m) a.push(`We earn as much per match as the leader (${e.avg} vs ${e.leaderAvg}) but have played ${leader.m - me.m} fewer. Volume is the lever: play more Rush.`);
    else if (e.avg < e.leaderAvg * 0.9) a.push(`Our average is ${e.avg} VP per match against the leader's ${e.leaderAvg}. Quality is the lever: fewer risky games, stronger line-ups, better squads.`);
  }
  if (e.top5Avg && e.avg && e.avg < e.top5Avg * 0.9 && !a.some((x) => /Quality/.test(x))) a.push(`The top five average ${e.top5Avg} VP per match; we are on ${e.avg}.`);
  if (o.forecast?.needPerDayForAbove != null && o.forecast.needPerDayForAbove > 0 && o.season) a.push(`To finish ahead of ${above.club} we need about ${fmt(o.forecast.needPerDayForAbove)} VP a day for the remaining ${o.season.daysLeft} days.`);
  if (d && d.vp === 0 && d.hours >= 6) a.push(`No VP gained in ${d.hours} hours. Time for a session?`);
  if (d?.rank > 0) a.unshift(`Up ${d.rank} place${d.rank === 1 ? '' : 's'} since the last photo. 🔥`);
  if (d?.rank < 0) a.unshift(`Down ${-d.rank} place${d.rank === -1 ? '' : 's'} since the last photo.`);
  if (!above) a.push('We are first. Hold the lead and keep the gap behind us growing.');
  return a.slice(0, 6);
}

// The leaderboard as the site and Discord draw it: every row with how far it moved since `prev`.
export function ladder(cur, prev) {
  return cur.rows.map((r, i) => {
    const was = find(prev, r.club);
    return { ...r, us: i === cur.us, dVp: was ? r.vp - was.vp : null, dRank: was ? was.rank - r.rank : null };
  });
}

// Chart data: one point per snapshot, for us and for the clubs around us in the latest one.
export function boardSeries(snaps, { rivals = 3 } = {}) {
  const list = [...snaps].sort((a, b) => a.taken_at - b.taken_at);
  const last = list.at(-1);
  if (!last) return { points: [], rivals: [] };
  const names = [];
  for (const i of [last.us - 1, last.us + 1, last.us - 2, last.us + 2, 0]) {
    const r = last.rows[i];
    if (r && i !== last.us && !names.includes(r.club)) names.push(r.club);
  }
  const clubs = names.slice(0, rivals);
  return {
    clubs: [last.rows[last.us].club, ...clubs],
    points: list.map((s) => {
      const me = s.rows[s.us];
      return { t: s.taken_at, rank: me.rank, vp: me.vp, avg: me.avg ?? null, gapLeader: s.rows[0].vp - me.vp, gapAbove: s.us > 0 ? s.rows[s.us - 1].vp - me.vp : null, by: Object.fromEntries([[me.club, me.vp], ...clubs.map((c) => [c, find(s, c)?.vp ?? null])]) };
    }),
  };
}

// ---------- season cards: rankings and dashboard numbers (pure) ----------
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
// cards = [{ user_id, name, stats: {matches, wins, goals, clubVp, myVp, tier}, qc: {warnings} }]
export function seasonBoard(cards) {
  const people = cards.map((c) => {
    const s = c.stats, m = s.matches || 0;
    return { user_id: c.user_id, name: c.name, avatar: c.avatar ?? null, player: c.player ?? null, matches: m, wins: s.wins ?? 0, goals: s.goals ?? 0, vp: s.myVp ?? 0,
      winRate: m ? s.wins / m : 0, gpm: m ? s.goals / m : 0, vpm: m ? (s.myVp ?? 0) / m : 0, share: s.clubVp ? (s.myVp ?? 0) / s.clubVp : null, flags: c.qc?.warnings ?? [], at: c.at };
  });
  const tot = (k) => people.reduce((s, p) => s + p[k], 0);
  const med = { vp: median(people.map((p) => p.vp)), winRate: median(people.map((p) => p.winRate)), matches: median(people.map((p) => p.matches)) };
  const rank = (key, dir = -1) => [...people].sort((a, b) => dir * (a[key] - b[key]) || b.vp - a.vp).map((p) => p.user_id);
  for (const p of people) {
    // How this person sits against the group (only meaningful with a few cards).
    p.grade = people.length < 4 ? null : p.vp >= med.vp * 1.25 && p.winRate >= med.winRate ? 'star' : p.vp < med.vp * 0.5 || (p.matches < med.matches * 0.4) ? 'concern' : p.winRate < med.winRate - 0.1 ? 'watch' : 'steady';
  }
  const by = { vp: rank('vp'), wins: rank('wins'), goals: rank('goals'), winRate: rank('winRate'), vpm: rank('vpm'), matches: rank('matches') };
  const pos = (id) => Object.fromEntries(Object.entries(by).map(([k, ids]) => [k, ids.indexOf(id) + 1]));
  for (const p of people) p.rank = pos(p.user_id);
  const clubVp = Math.max(0, ...cards.map((c) => c.stats.clubVp || 0));
  return {
    people: people.sort((a, b) => b.vp - a.vp),
    totals: { people: people.length, matches: tot('matches'), wins: tot('wins'), goals: tot('goals'), vp: tot('vp'), clubVp, winRate: tot('matches') ? tot('wins') / tot('matches') : 0, median: med },
    praise: people.filter((p) => p.grade === 'star').map((p) => p.user_id), concern: people.filter((p) => p.grade === 'concern').map((p) => p.user_id),
  };
}
