// End-of-season Rush stats: every player uploads a screenshot of their season screen, the Worker reads it, checks it and posts a card in
// Discord. Everyone sees the rankings; managers also get the dashboard (filters, grades, who to praise, who to look at, who is missing).
// The page is a shell; static/seasoncards.js reads GET /api/seasoncard and draws everything.
import { shell } from '../lib/ui.mjs';

export function seasoncards() {
  const body = `<div class="wrap"><section class="sec" style="margin-top:34px"><header><div><div class="eyebrow">End of season · Rush</div><h2>Season <span class="gold-t">cards</span></h2></div><div id="sc-season" class="lb-clock"></div></header>
   <div id="sc-msg" class="panel muted" data-sc-load>Loading the season cards…</div>
   <div id="sc-kpi" class="lb-kpi"></div></section>
  <section class="sec" id="sc-mine-sec" hidden><header><div><span class="ribbon" id="sc-mine-h">Your season card</span></div></header><div class="panel flat"><div id="sc-mine"></div><div id="sc-up"></div><div id="sc-review"></div></div></section>
  <section class="sec" id="sc-rank-sec" hidden><header><div><span class="ribbon">Rankings</span></div></header>
   <div class="chips" id="sc-by" role="tablist" aria-label="Rank by"><button type="button" class="chip on" data-k="vp">VP</button><button type="button" class="chip" data-k="wins">Wins</button><button type="button" class="chip" data-k="goals">Goals</button><button type="button" class="chip" data-k="winRate">Win rate</button><button type="button" class="chip" data-k="vpm">VP per match</button><button type="button" class="chip" data-k="matches">Matches</button></div>
   <div id="sc-rank" class="panel flat tbx"></div></section>
  <section class="sec" id="sc-dash-sec" hidden><header><div><span class="ribbon">Dashboard · managers</span></div></header>
   <div class="chips" id="sc-view" role="tablist" aria-label="View"><button type="button" class="chip on" data-v="people">People</button><button type="button" class="chip" data-v="scatter">Matches vs VP</button><button type="button" class="chip" data-v="share">Share of club VP</button><button type="button" class="chip" data-v="missing">Missing</button></div>
   <div class="chips" id="sc-fl" aria-label="Filter"><button type="button" class="chip on" data-g="">Everyone</button><button type="button" class="chip" data-g="star">⭐ Praise</button><button type="button" class="chip" data-g="concern">⚠️ Work on</button><button type="button" class="chip" data-g="flag">🧐 Flagged</button></div>
   <div id="sc-dash" class="panel flat tbx"></div></section></div>`;
  return shell({ group: 'matches', page: 'seasoncards.html', title: 'Season cards', body, extraHead: '<link rel="stylesheet" href="rushboard.css"><script src="scanup.js" defer></script><script src="seasoncards.js" defer></script>' });
}

export default function (P) { P('seasoncards.html', seasoncards()); }
