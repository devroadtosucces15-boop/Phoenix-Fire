// Auto-posted results: the panel carries the score card and field view as attachments, the icons, and falls back to a plain post.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { postResults } from '../scripts/lib/resultpost.mjs';
import { plainText, images } from '../bot/ui.js';
import { t, done } from './lib.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-post-'));
fs.writeFileSync(path.join(dir, 'score-1.png'), 'x'); fs.writeFileSync(path.join(dir, 'field-1.png'), 'y');
const m = { matchId: '1', timestamp: 1791600000, matchType: 'leagueMatch',
  clubs: { 100: { wins: '1', losses: '0', goals: '3', details: { name: 'NOREX UNITED' } }, 200: { wins: '0', losses: '1', goals: '1', details: { name: 'Poundin P.' } } },
  players: { 100: { a: { playername: 'Mike', goals: '2', assists: '0', rating: '9.8', mom: '1' }, b: { playername: 'Jez', goals: '1', assists: '1', rating: '7.1' } } } };
const config = { siteUrl: 'https://x.test/', features: { discordMatch: 'members' }, hiddenPlayers: [] };

const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).includes('/webhooks/')) return new Response(JSON.stringify({ channel_id: 'chan-1' }), { status: 200 });
  return new Response('{}', { status: 200 });
};
process.env.DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1/abc';
process.env.DISCORD_BOT_TOKEN = 'tok';
const manifest = { match: { 1: { score: 'score-1.png', field: 'field-1.png' } } };
const route = async (cfg, purpose, club) => ({ ok: true, channelId: purpose === 'match_results' && club === '100' ? 'chan-1' : null }); // Organization config says: club 100's results go to chan-1

await postResults([m], { config, homeId: '100', route, drawn: { dir, manifest } });
const post = calls.find((c) => c.url.endsWith('/channels/chan-1/messages'));
t('the result is posted by the bot into the channel the Organization config resolves for the source club', !!post);
t('with the pictures it goes up as a multipart form', post?.init.body instanceof FormData);
const payload = JSON.parse(post?.init.body.get('payload_json') ?? '{}');
t('the crest, score card and field view are attached', post?.init.body.get('files[0]') && post?.init.body.get('files[2]'));
t('both pictures sit in the panel', images(payload).filter((u) => u.startsWith('attachment://') && !u.endsWith('crest.png')).join() === 'attachment://score-1.png,attachment://field-1.png');
t('score card comes before the facts, field view after', (() => { const s = JSON.stringify(payload); return s.indexOf('score-1.png') < s.indexOf('Goals') && s.indexOf('Goals') < s.indexOf('field-1.png'); })());
t('goals and man of the match are there', /Goals/.test(plainText(payload)) && /Man of the match/.test(plainText(payload)) && /Mike/.test(plainText(payload)));
t('the "Show my match" menu is still on it', JSON.stringify(payload).includes('norex:mm:1'));

calls.length = 0;
await postResults([m], { config, homeId: '100', route, drawn: null });
const plain = calls.find((c) => c.url.endsWith('/channels/chan-1/messages'));
t('without cards it carries only the Phoenix crest, no pictures', plain?.init.body instanceof FormData && !plain.init.body.get('files[1]') && !plain.init.body.get('payload_json').replace('attachment://crest.png', '').includes('attachment://'));

// Missing destination: reported, nothing posted anywhere (not the webhook's own channel, not another club's channel).
calls.length = 0;
const cwd = process.cwd(); process.chdir(dir);
const lost = await postResults([m], { config, homeId: '100', route: async () => ({ ok: true, channelId: null }), drawn: null });
t('no match_results destination → nothing is posted', !calls.some((c) => /\/channels\/|\/webhooks\/1\/abc$/.test(c.url) && c.init.method === 'POST'));
t('…and it is reported with the club and purpose', lost.missing.length === 1 && lost.missing[0].club === '100' && lost.missing[0].purpose === 'match_results');
t('…and written to .outbox/missing-destinations.json', fs.existsSync(path.join(dir, '.outbox', 'missing-destinations.json')));
const failedLookup = await postResults([m], { config, homeId: '100', route: async () => ({ ok: false, error: 'HTTP 500' }), drawn: null });
t('a failed destination lookup is reported too, never guessed', failedLookup.missing.length === 1 && /lookup failed/.test(failedLookup.missing[0].why));
// A derby between two of our clubs fetched from club 101 posts to club 101's destination, from 101's side.
calls.length = 0;
const derby = { ...m, matchId: '9', fetchedFrom: '101', clubs: { 100: m.clubs[100], 101: { wins: '0', losses: '1', goals: '1', details: { name: 'NOREX B' } } }, players: { 100: m.players[100], 101: { z: { playername: 'Zed', goals: '1', rating: '6.5' } } } };
const seen = [];
await postResults([derby], { config, homeId: '100', orgIds: ['100', '101'], route: async (c, p, club) => (seen.push(club), { ok: true, channelId: 'chan-101' }), drawn: null });
t('a match is routed by its source club ID', seen.join() === '101' && calls.some((c) => c.url.endsWith('/channels/chan-101/messages')));
process.chdir(cwd);

globalThis.fetch = realFetch;
done();
