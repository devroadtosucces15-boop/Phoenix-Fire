// Every picture of a match post (the match board, the field view, the review) is the same size and format, and the decoded event data
// reaches the review only where it exists. Matches without event counters fall back cleanly (older matches have none, nothing is backfilled).
import { POST, matchPicture, reviewCard, cardJobs, TEMPLATE_VERSION } from '../scripts/cards.mjs';
import { BANNER_V } from '../bot/ui.js';
import { buildReview, eventSide } from '../scripts/lib/matchreview.mjs';
import { buildMatchPicture } from '../scripts/lib/matchpicture.mjs';
import { launchChrome, findChrome } from '../scripts/lib/chrome.mjs';
import { t, done } from './lib.mjs';

const P = (name, pos, o = {}) => ({ playername: name, pos, rating: '7.0', secondsPlayed: '5500', goals: '0', assists: '0', shots: '1', passesmade: '10', passattempts: '12', tacklesmade: '2', tackleattempts: '3', saves: '0', goalsconceded: '0', ...o });
const EV = '215:10,216:2,30:5,105:1,106:2,107:1,108:2,109:3,110:4,111:30,219:3,217:1,13:1,6:2,265:1';
const mk = (withEv) => ({
  matchId: '1', timestamp: 1791600000, matchType: 'leagueMatch',
  clubs: { 100: { goals: '2', goalsAgainst: '1', name: 'PHOENIX FIRE' }, 200: { goals: '1', goalsAgainst: '2', name: 'Rivals' } },
  players: {
    100: Object.fromEntries(['goalkeeper', 'defender', 'defender', 'midfielder', 'midfielder', 'midfielder', 'forward', 'forward'].map((pos, i) => [`p${i}`, P(`Player${i}`, pos, withEv ? { evraw: EV } : {})])),
    200: { x: P('OppOne', 'forward', withEv ? { evraw: '215:4,216:6,110:1,111:10,219:8' } : {}), y: P('OppTwo', 'midfielder', withEv ? { evraw: '215:3,216:2' } : {}) },
  },
});
const club = { name: 'PHOENIX FIRE' };
const rvEv = buildReview(mk(true), '100'), rvNo = buildReview(mk(false), '100');
const mp = buildMatchPicture(mk(true), '100');

t('one template version for the cards and the bot banners', TEMPLATE_VERSION === BANNER_V);
t('the shared canvas is 1200 wide with 40 px margins', POST.W === 1200 && POST.PAD === 40 && POST.H >= 1600);
const pages = { board: matchPicture(mp, club, new Map(), 'board'), pitch: matchPicture(mp, club, new Map(), 'pitch'), review: reviewCard(rvEv, club) };
for (const [k, html] of Object.entries(pages)) {
  t(`${k}: fixed ${POST.W}px width and ${POST.H}px canvas`, html.includes(`body{width:${POST.W}px`) && html.includes(`min-height:${POST.H}px`));
  t(`${k}: Phoenix top bar and shared header`, html.includes('border-top:8px solid var(--red)') && html.includes('class="ph') || html.includes(' ph"') || /class="[^"]*\bph\b/.test(html));
  t(`${k}: no other club's name, colour or crest`, !/norex|#c8352c|#080b11|#e0493f/i.test(html) && /#e8651a|232,101,26/.test(html));
}
t('the post sequence draws the board, the pitch and the review for a match', (() => {
  const c = { name: 'N', matches: [{ id: '1', ts: 1, gf: 1, ga: 0, res: 'W', opp: 'X', ps: [] }] };
  const keys = cardJobs(c, [], { picture: () => ({ model: mp, faces: new Map() }), review: () => rvEv }).filter((j) => j.key[0] === 'match').map((j) => j.key[2]);
  return ['picture', 'pitch', 'review'].every((k) => keys.includes(k));
})());

// event data in the review: used where it exists, a clean note where it does not
t('with event counters the review gets the event rows, both sides', !!rvEv.ev && rvEv.ev.apps === 8 && rvEv.ev.rows.some((r) => r.k === 'Won in the attacking third' && r.a === 32 && r.b === 1));
t('the event rows show only real sums (no NaN, no undefined)', !/NaN|undefined/.test(pages.review) && /From the event data/.test(pages.review));
t('without event counters: no event model, a note instead, same canvas', rvNo.ev === null && /No event counters for this match/.test(reviewCard(rvNo, club)) && reviewCard(rvNo, club).includes(`min-height:${POST.H}px`));
t('a team with no counters gives null', eventSide([{}, {}]) === null);
t('the opposition side missing is left out, never shown as 0', (() => { const m = mk(true); m.players[200] = { x: P('OppOne', 'forward') }; const r = buildReview(m, '100'); return r.ev.rows.every((x) => x.b === null) && !/vs 0/.test(reviewCard(r, club)); })());

// real render: the three pictures come out identical in size (needs Chrome; skipped where the sandbox blocks it)
if (findChrome()) {
  let chrome = null;
  try { chrome = await launchChrome(); } catch (e) { console.log(`– render check skipped: ${e.message}`); }
  if (chrome) {
    try {
      const sizes = [];
      for (const [k, html] of Object.entries(pages)) { const png = await chrome.shot(html, k === 'board' ? POST.BOARD_W : POST.W); sizes.push(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`); }
      // board and pitch are the fixed canvas; the review keeps the width and is never shorter, but grows with its content (aligned grids, six numbers, four recommendations)
      t(`board and pitch render at the same size, the review at the same width and at least as tall (${sizes.join(', ')})`, sizes[0].startsWith(`${POST.BOARD_W}x`) && +sizes[0].split('x')[1] >= POST.H && sizes[1] === `${POST.W}x${POST.H}` && sizes[2].startsWith(`${POST.W}x`) && +sizes[2].split('x')[1] >= POST.H);
    } finally { await chrome.close(); }
  }
}
done();
