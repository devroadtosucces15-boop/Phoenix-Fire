// PF-021: decoded EA stats in the match box score (site page + Discord card). Every number is a sum of stored counters (evraw),
// only for players that have them; per 90 only from 10 minutes; Phoenix theme, no NOREX in what these outputs add.
import fs from 'node:fs';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';
import { decodeEvents } from '../scripts/lib/events.mjs';
import { BOX_COLS, boxEv, boxCell, per90, evCoverage } from '../scripts/lib/boxscore.mjs';
import { boxScoreCard } from '../scripts/cards.mjs';
import { match } from '../next/pages/matches.mjs';
import { matches } from '../next/lib/data.mjs';

// ---- helpers (pure maths, fixture built from real counter ids)
const ev = decodeEvents('30:7,6:3,108:1,109:2,110:1,105:1,106:2,107:4,265:2,266:1,111:9,219:1');
const box = boxEv(ev);
t('boxEv: forward passes, interceptions, possession won/lost summed over the thirds, aerials both ways', box.fwd === 7 && box.int === 3 && box.won === 4 && box.lost === 7 && box.aer === 3);
t('boxEv: in-position share is a whole percent of in + out', box.pos === 90);
t('boxEv: null without event data (no fake zeros)', boxEv(null) === null && boxCell(null, 'fwd', 4800).total === null);
t('per90: 80 minutes (4800 s) scales by 5400/4800, rounded to one decimal', per90(8, 4800) === 9 && per90(3, 4800) === 3.4);
t('per90: null under 10 minutes; rates (Pos%) have no per-90', per90(2, 599) === null && boxCell(box, 'pos', 4800).p90 === null && boxCell(box, 'fwd', 4800).p90 === 7.9);
t('evCoverage counts players with counters', evCoverage([{ ev }, { ev: null }, { ev }]).have === 2);
t('every box column has a key, a header and a long label', BOX_COLS.every(([k, h, long]) => k && h && long));

// ---- site page, from a real archived match that carries counters
const m = matches.find((x) => x.intel?.us);
t('fixture: an archived match carries event data', !!m);
const html = match(m);
t('match page: tab renamed Box score and Total / Per 90 switch present', html.includes('data-mv="table">📋 Box score') && html.includes('data-evm="p"'));
t('match page: decoded headers with tooltips for our table', BOX_COLS.every(([, h, long]) => html.includes(`title="${long}">${h}</th>`)));
t('match page: cells carry total and per-90 values', /<td class="evc" data-t="\d+" data-p="[\d.]+">/.test(html));
t('match page: a player without counters shows a dash, never 0', !m.lines.some((l) => !l.ev) || /<td class="evc muted">–<\/td>/.test(html) || !m.olines.some((l) => !l.ev));
t('match page: team (event data) row and coverage note', html.includes('Team (event data)') && /From EA's event counters for \d+ of \d+ players/.test(html));
t('match page: possession percentage still not claimed', /does not publish a possession percentage/.test(html) && !/Possession %|possession share/i.test(html));
const old = matches.find((x) => !x.intel?.us && !x.intel?.opp);
t('match page without counters: no decoded columns, no switch', !old || (!match(old).includes('data-evm') && !match(old).includes('class="evc"')));
t('match page: team comparison extended from counters', ['Won in their third', 'Possession net', 'Fouls conceded', 'Corners taken', 'Yellow cards'].every((s) => html.includes(s)));

// ---- Discord card
const club = { name: 'PHOENIX FIRE', crest: '' };
const ps = [{ n: 'A', r: 8, g: 1, pm: 9, pa: 10, pos: 'midfielder', ev: { fwd: 5, int: 2, won: 3, lost: 1, aer: 0, pos: 90 } }, { n: 'B', r: 6, pos: 'defender' }];
const card = boxScoreCard({ id: 'x', gf: 2, ga: 1, opp: 'Them', res: 'W', ps }, club);
t('box card: decoded columns Int / Won / Lost / Aer when a player has counters', ['Int', 'Won', 'Lost', 'Aer'].every((h) => card.includes(`<span>${h}</span>`)));
t('box card: a player without counters gets dashes; team total only over players that have them', card.includes('<span class="v ev">–</span>') && card.includes('<span>2</span><span>3</span><span>1</span><span>0</span>'));
t('box card without counters keeps the old layout', !boxScoreCard({ id: 'x', gf: 1, ga: 0, opp: 'Them', res: 'W', ps: [{ n: 'A', r: 7 }] }, club).includes('class="v ev"'));
t('box card: Phoenix, no NOREX name or red', /PHOENIX FIRE/.test(card) && !/norex|c8352c/i.test(card));
// the new site code adds no NOREX name or NOREX red
const added = ['scripts/lib/boxscore.mjs'].map((f) => fs.readFileSync(ROOT + f, 'utf8')).join('\n').replace(/NOREX/g, '');
t('new box score code carries no NOREX reference', !/norex|c8352c/i.test(added));
// the ps rows the bot reads carry decoded columns (from stored evraw)
t('build adds decoded columns to ps rows from evraw', /boxEv\(decodeEvents\(p\.evraw\)\)/.test(fs.readFileSync(ROOT + 'scripts/build.mjs', 'utf8')));
done();
