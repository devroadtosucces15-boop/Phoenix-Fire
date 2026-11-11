// Rush leaderboard page: managers photograph the global Rush leaderboard, the Worker reads and stores it, and this page draws the story
// (position, gaps, movement, pace, forecast, charts, advice). Everyone signed in can read it; scanning is for managers and above.
// The page is a shell; static/rushboard.js reads GET /api/lb and draws everything.
import { shell } from '../lib/ui.mjs';

export function rushboard() {
  const body = `<div class="wrap"><section class="sec" style="margin-top:34px"><header><div><div class="eyebrow">Global Rush · current season</div><h2>Rush <span class="gold-t">leaderboard</span></h2></div><div id="lb-clock" class="lb-clock"></div></header>
   <div id="lb-msg" class="panel muted" data-lb-load>Loading the leaderboard…</div>
   <div id="lb-kpi" class="lb-kpi"></div></section>
  <section class="sec" id="lb-up-sec" hidden><header><div><span class="ribbon">New photo</span></div></header><div class="panel flat"><div id="lb-up"></div><div id="lb-review"></div></div></section>
  <section class="sec" id="lb-adv-sec" hidden><header><div><span class="ribbon">What to do next</span></div></header><div id="lb-adv" class="lb-adv"></div></section>
  <section class="sec" id="lb-ch-sec" hidden><header><div><span class="ribbon">The story so far</span></div></header>
   <div class="chips" id="lb-tabs" role="tablist" aria-label="Chart"><button type="button" class="chip on" data-c="vp">VP vs rivals</button><button type="button" class="chip" data-c="rank">Rank</button><button type="button" class="chip" data-c="gap">Gaps</button><button type="button" class="chip" data-c="avg">VP per match</button></div>
   <div class="panel flat lb-chart" id="lb-chart"></div></section>
  <section class="sec" id="lb-tb-sec" hidden><header><div><span class="ribbon">The ladder</span></div></header><div id="lb-tb" class="panel flat tbx"></div></section>
  <section class="sec" id="lb-hist-sec" hidden><header><div><span class="ribbon">Photos taken</span></div></header><div id="lb-hist" class="lb-hist"></div></section>
  <section class="sec" id="lb-set-sec" hidden><header><div><span class="ribbon">Season clock</span></div></header><div class="panel flat" id="lb-set"></div></section></div>`;
  return shell({ group: 'stats', page: 'rushboard.html', title: 'Rush leaderboard', body, extraHead: '<link rel="stylesheet" href="rushboard.css"><script src="scanup.js" defer></script><script src="rushboard.js" defer></script>' });
}

export default function (P) { P('rushboard.html', rushboard()); }
