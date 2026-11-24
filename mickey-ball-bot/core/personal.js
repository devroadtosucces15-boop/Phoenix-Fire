// "Show my match": one player's night, as data for the drawn card and as short insights for the text under it.
import { decodeEvents } from './events.js';
import { crestUrl } from './ea.js';

const pc = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
const n = (v) => +v || 0;

// season = store.playerCard() row (per-player totals over tracked matches) or null
export function personalModel(club, m, p, season) {
  const s = season?.gp ? season : null, e = p.ev ? decodeEvents(p.ev) : null;
  const ev = e && {
    pass: { done: n(e.passesCompleted), failed: n(e.passesFailed), fwd: n(e.passesCompletedForward), back: n(e.passesCompletedBackward), side: n(e.passesCompletedSideways),
      short: n(e.passesCompletedShort), med: n(e.passesCompletedMedium), long: n(e.passesCompletedLong), cross: n(e.passesCompletedCross), through: n(e.throughPasses), first: n(e.firstTimePasses), switches: n(e.switchesOfPlay) },
    shoot: { on: n(e.shotsOnTarget), off: n(e.shotsOffTarget), inBox: n(e.shotsOnTargetInsideBox) + n(e.shotsOffTargetInsideBox), outBox: n(e.shotsOnTargetOutsideBox) + n(e.shotsOffTargetOutsideBox) },
    drib: { done: n(e.dribblesCompleted), carried: n(e.dribblesCarried), skill: n(e.dribblesSkillMoveBeat) },
    def: { ints: n(e.interceptions), won: n(e.tacklesWon), lost: n(e.tacklesLost), stand: n(e.standingTacklesWon), slide: n(e.slidingTacklesWon), clean: n(e.cleanTackles), disp: n(e.opponentsDispossessed), blocks: n(e.crossesBlocked), aer: n(e.aerialDuelsWonAttacking) + n(e.aerialDuelsWonDefending) },
    poss: { wonD: n(e.possessionWonDefensiveThird), wonM: n(e.possessionWonMiddleThird), wonA: n(e.possessionWonAttackingThird), lostD: n(e.possessionLostDefensiveThird), lostM: n(e.possessionLostMiddleThird), lostA: n(e.possessionLostAttackingThird) },
    pos: { in: n(e.inPosition), out: n(e.outOfPosition), pct: pc(n(e.inPosition), n(e.inPosition) + n(e.outOfPosition)) },
    misc: { foulsWon: n(e.foulsWon), fouls: n(e.foulsConcededDefensiveThird), yellow: n(e.yellowCardsImmediate) + n(e.yellowCardsDelayed), corners: n(e.cornersTaken) },
  };
  return {
    name: p.name, pos: p.pos, mom: !!p.mom, rating: n(p.rating), goals: n(p.goals), assists: n(p.assists), shots: n(p.shots), saves: n(p.saves),
    passes: { made: n(p.passesMade), att: n(p.passAtt) }, tackles: { made: n(p.tacklesMade), att: n(p.tackleAtt) },
    m: { res: m.res, gf: m.home.goals, ga: m.away.goals, opp: m.away.name, oppCrest: crestUrl(m.away.crestId), ts: m.ts },
    avg: s ? { r: n(s.avg), g: n(s.g) / s.gp, a: n(s.a) / s.gp, pass: pc(n(s.pm), n(s.pa)), tackle: pc(n(s.tm), n(s.ta)), gp: s.gp } : null,
    ev,
  };
}

// Short, specific lines about this player's night. Only what the numbers support; at most six.
export function playerInsights(d) {
  const out = [], a = d.avg, passPct = pc(d.passes.made, d.passes.att), tackPct = pc(d.tackles.made, d.tackles.att), e = d.ev;
  const diff = (v, base, t) => (base == null ? 0 : Math.abs(v - base) < t ? 0 : v > base ? 1 : -1);
  if (a) { const r = diff(d.rating, a.r, 0.3); if (r) out.push(`${r > 0 ? '📈' : '📉'} Rated **${d.rating.toFixed(1)}**, ${r > 0 ? 'above' : 'below'} their **${a.r.toFixed(1)}** average over ${a.gp} games.`); }
  const gc = d.goals + d.assists;
  if (gc >= 3) out.push(`🔥 **${gc} goal contributions** (${d.goals}G ${d.assists}A)${a && a.g + a.a ? `, vs ${(a.g + a.a).toFixed(1)} a game on average` : ''}.`);
  else if (d.mom) out.push('⭐ Man of the match.');
  if (d.shots >= 3) out.push(`🎯 ${d.goals} goal${d.goals === 1 ? '' : 's'} from **${d.shots} shots** (${pc(d.goals, d.shots)}% scored)${e ? `, ${pc(e.shoot.on, e.shoot.on + e.shoot.off) ?? 0}% on target, ${e.shoot.inBox} from inside the box` : ''}.`);
  if (passPct != null && d.passes.att >= 8) { const r = diff(passPct, a?.pass, 4); out.push(`🅿️ **${passPct}%** pass completion (${d.passes.made}/${d.passes.att})${r ? `, ${r > 0 ? 'up' : 'down'} on their ${a.pass}% norm` : ''}${e && e.pass.fwd >= 10 ? `, with **${e.pass.fwd}** forward passes completed` : ''}.`); }
  if (e && e.def.ints >= 3) out.push(`🛡️ **${e.def.ints} interceptions**${e.poss.wonA ? `, and won the ball back ${e.poss.wonA} time${e.poss.wonA === 1 ? '' : 's'} in the attacking third` : ''}.`);
  else if (tackPct != null && d.tackles.att >= 4) out.push(`🛡️ Won **${d.tackles.made} of ${d.tackles.att}** tackles (${tackPct}%)${a?.tackle != null ? ` vs ${a.tackle}% usually` : ''}.`);
  if (e && e.drib.done >= 5) out.push(`🏃 **${e.drib.done} dribbles** completed${e.drib.skill ? `, ${e.drib.skill} beating a defender with skill moves` : ''}.`);
  if (e && e.pos.pct != null) out.push(e.pos.pct >= 90 ? `📍 Stayed in position **${e.pos.pct}%** of the time: very disciplined.` : e.pos.pct < 70 ? `📍 In position only **${e.pos.pct}%** of the time: worth a look at their role.` : null);
  const lost = e ? e.poss.lostD + e.poss.lostM + e.poss.lostA : 0, won = e ? e.poss.wonD + e.poss.wonM + e.poss.wonA : 0;
  if (lost >= 8 && lost > won * 1.5) out.push(`⚠️ Lost possession **${lost}** times against **${won}** won back: protect the ball more.`);
  if (d.saves >= 3) out.push(`🧤 **${d.saves} saves**.`);
  return out.filter(Boolean).slice(0, 6);
}
