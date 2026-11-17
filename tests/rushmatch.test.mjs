// PF-023: Rush queue + LFG as one matchmaking system (bot/rushmatch.js). Positions, matching, two-sided accept, board banner, Phoenix look.
import { env, sqlite } from './mock.mjs';
import { t, done } from './lib.mjs';
import { RUSH_POSITIONS, cleanPositions, matchLfg, answerOffer, findPlayerLines, lobbyOfferMessage, playerOfferMessage, saveNeed, createOffers, getOffer, saveOffer, expireNeeds, openNeeds } from '../bot/rushmatch.js';
import { boardMessage, needMessage, POSITIONS } from '../bot/rushqueue.js';
import { plainText } from '../bot/ui.js';
import { readFileSync } from 'node:fs';

t('Rush positions are only goalkeeper, striker, centre back, winger', Object.keys(RUSH_POSITIONS).join() === 'GK,ST,CB,W' && !('FB' in POSITIONS) && !('CM' in POSITIONS));
t('cleanPositions: max 2, junk dropped, empty or ANY means any', cleanPositions(['st', 'cb', 'w']).join() === 'ST,CB' && cleanPositions(['LB']).join() === 'ANY' && cleanPositions(['ST', 'any']).join() === 'ANY' && cleanPositions('["GK"]').join() === 'GK');

const players = [{ user_id: '1', positions: ['CB'] }, { user_id: '2', positions: ['ST'] }, { user_id: '3', positions: ['ANY'] }, { user_id: '4', positions: ['W', 'ST'] }];
const m = matchLfg({ positions: ['ST'] }, players);
t('matcher: exact first, then open-to-any, then different position (alt)', m.map((x) => x.user_id + x.kind).join() === '2exact,4exact,3any,1alt');
t('matcher: an already offered player is skipped; empty need accepts any position', matchLfg({ positions: ['ST'] }, players, ['2']).every((x) => x.user_id !== '2') && matchLfg({ positions: [] }, [players[0]])[0].kind === 'exact');

let o = { id: 1, status: 'open', lobby_ok: 0, player_ok: 0 };
let r = answerOffer(o, 'lobby', true);
t('accept: one yes waits for the other side', r.done === null && r.offer.lobby_ok === 1 && r.offer.status === 'open');
r = answerOffer(r.offer, 'player', true);
t('accept: both yes accepts', r.done === 'accepted' && r.offer.status === 'accepted');
t('accept: a no from either side declines; a finished offer is stale', answerOffer(o, 'player', false).done === 'declined' && answerOffer(r.offer, 'lobby', true).stale === true);

const needs = [1, 2, 3, 4, 5, 6, 7].map((k) => ({ captain: String(k), positions: ['ST'], count: 1, size: 3 }));
const lines = findPlayerLines(needs);
t('banner: only open calls, capped at 5 with "+N more", empty when none', findPlayerLines([]).length === 0 && lines.length === 7 && lines.at(-1) === '+2 more' && /Striker/.test(lines[1]));
const board = boardMessage([], { needs: needs.slice(0, 1) });
t('board: the Find a player section rides the one queue board (no second panel)', /FIND A PLAYER/.test(plainText(board)) && !/FIND A PLAYER/.test(plainText(boardMessage([], { needs: [] }))));
const need = needMessage({ captain: '9', members: [], needs: 1, status: 'waiting' }, { positions: ['ST'] });
t('need post has no Later option', !/needlater/.test(JSON.stringify(need)) && /needin/.test(JSON.stringify(need)));

const offer = { id: 5, user_id: '2', position: 'ST', kind: 'alt', status: 'open', lobby_ok: 0, player_ok: 0 };
const msgs = [lobbyOfferMessage(offer, { playerName: 'Bo' }), playerOfferMessage(offer, { captain: '9' }), board, need];
const flat = JSON.stringify(msgs);
t('DM buttons carry the offer id on both sides', /pf:rq:offer:y:5/.test(flat) && /pf:rq:offer:n:5/.test(flat) && /pf:lfg:acc:5/.test(flat) && /pf:lfg:dec:5/.test(flat));
t('alt offer tells the player it is not their usual position', /not\*\* your usual position/.test(plainText(playerOfferMessage(offer, { captain: '9' })) .replace(/\*\*/g, '**')) || /not your usual position/.test(plainText(playerOfferMessage(offer, { captain: '9' }))));
t('Phoenix look on every output: name, accent, no NOREX name, red or crest', /PHOENIX FIRE/.test(plainText(msgs[0])) && msgs.every((x) => x.components.some((c) => c.accent_color === 0xe8651a)) && !/norex|c8352c|080b11/i.test(flat.replace(/norex:\w+(:\w+)*/g, '')));
const src = readFileSync(new URL('../bot/rushmatch.js', import.meta.url), 'utf8');
t('no channel or role id is hardcoded in the matcher', !/\b\d{17,20}\b/.test(src) && !/norex/i.test(src));

// D1: need, offers, expiry
const T0 = Date.parse('2026-11-20T20:00:00Z'), MIN = 60e3;
sqlite.exec(`INSERT INTO rush_lfg (user_id, name, note, at, expires, status, positions) VALUES ('21', 'Ann', '', ${T0}, ${T0 + 60 * MIN}, 'open', '["ST"]'), ('22', 'Bo', '', ${T0}, ${T0 + 60 * MIN}, 'open', '["CB"]'), ('23', 'Cy', '', ${T0}, ${T0 - MIN}, 'open', '["ST"]')`);
const n1 = await saveNeed(env, { captain: '900', positions: ['ST'], count: 1, now: T0, expires: T0 + 60 * MIN });
const offers = await createOffers(env, n1, T0, { busy: [] });
t('createOffers: matches available players only (expired LFG and busy players skipped), best fit first', offers.map((x) => x.user_id + x.kind).join() === '21exact,22alt');
t('createOffers: no duplicate proposal for the same need', (await createOffers(env, n1, T0)).length === 0);
t('a second call by the same captain replaces the first', (await saveNeed(env, { captain: '900', positions: ['GK'], count: 1, now: T0, expires: T0 + 60 * MIN })).id !== n1.id && (await openNeeds(env, T0)).length === 1);
const g = await getOffer(env, offers[0].id); await saveOffer(env, { ...g, status: 'accepted' });
t('offers persist their state', (await getOffer(env, offers[0].id)).status === 'accepted');
t('expiry closes calls and stale offers', (await expireNeeds(env, T0 + 61 * MIN)) === 1 && (await openNeeds(env, T0 + 61 * MIN)).length === 0);
done();
