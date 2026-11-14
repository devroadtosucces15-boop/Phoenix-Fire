// Draws the merged match picture and the review for a sample loss, to look at them: node tools/bot-audit/render-result.mjs <outdir>
import fs from 'node:fs';
import { buildMatchPicture } from '../../scripts/lib/matchpicture.mjs';
import { buildReview } from '../../scripts/lib/matchreview.mjs';
import { matchPicture, reviewCard } from '../../scripts/cards.mjs';
import { launchChrome } from '../../scripts/lib/chrome.mjs';
const P = (name, pos, o = {}) => ({ playername: name, pos, rating: '6.0', secondsPlayed: '5500', goals: '0', assists: '0', shots: '0', passesmade: '6', passattempts: '8', tacklesmade: '0', tackleattempts: '1', saves: '0', goalsconceded: '0', mom: '0', ...o });
const m = { matchId: '900', timestamp: 1791600000, matchType: 'leagueMatch',
  clubs: { 100: { goals: '0', goalsAgainst: '3', name: 'PHOENIX FIRE' }, 200: { goals: '3', goalsAgainst: '0', name: 'Autistic United' } },
  players: { 100: { a: P('Ghostz_x12', 'forward', { rating: '6.1' }), b: P('KOEN WIE', 'midfielder', { rating: '5.8' }) }, 200: { x: P('OppOne', 'forward', { shots: '4', passesmade: '18', passattempts: '21', rating: '9.6' }) } } };
const club = { name: 'PHOENIX FIRE', crest: null };
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  fs.writeFileSync(`${out}/picture.png`, await chrome.shot(matchPicture({ ...buildMatchPicture(m, '100'), oppCrest: null }, club, new Map()), 1200));
  fs.writeFileSync(`${out}/review.png`, await chrome.shot(reviewCard(buildReview(m, '100'), club), 1200));
} finally { await chrome.close(); }
