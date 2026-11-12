// The automated result post (match picture message + review message) is Phoenix on every output: orange accent, the Phoenix crest in the
// thumbnail slot at send time (never NOREX, never the opponent's, win or loss), our name from config, no NOREX red or opponent crest.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { postResults } from '../scripts/lib/resultpost.mjs';
import { t, done } from './lib.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'px-post-'));
for (const f of ['picture-1.png', 'review-1.png']) fs.writeFileSync(path.join(dir, f), 'x');
const cfg = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const config = { ...cfg, siteUrl: 'https://x.test/', features: { discordMatch: 'members', matchPicture: 'members', matchReview: 'members' }, hiddenPlayers: [] };
const mk = (id, ours, theirs) => ({ matchId: id, timestamp: 1791600000, matchType: 'leagueMatch', clubs: {
  100: { wins: ours > theirs ? '1' : '0', losses: ours < theirs ? '1' : '0', goals: String(ours), details: { name: 'Phoenix FIIIre' } },
  200: { wins: '0', losses: '0', goals: String(theirs), details: { name: 'Autistic United', customKit: { crestAssetId: '12345' } } } },
  players: { 100: { a: { playername: 'Mike', goals: '0', assists: '0', rating: '6.1' } } } });
const manifest = { match: { 1: { picture: 'picture-1.png', review: 'review-1.png' }, 2: { picture: 'picture-1.png', review: 'review-1.png' } } };
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => { sent.push({ url: String(url), init }); return new Response('{}', { status: 200 }); };
process.env.DISCORD_BOT_TOKEN = 'tok'; process.env.DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1/abc';
const route = async () => ({ ok: true, channelId: 'c1' });

for (const [label, id, ours, theirs] of [['loss', '1', 0, 3], ['win', '2', 3, 0]]) {
  sent.length = 0;
  await postResults([mk(id, ours, theirs)], { config, homeId: '100', route, drawn: { dir, manifest } });
  const posts = sent.filter((c) => c.url.endsWith('/channels/c1/messages'));
  t(`${label}: result and review both posted`, posts.length === 2);
  for (const [k, c] of posts.entries()) {
    const body = c.init.body, json = body.get('payload_json'), p = JSON.parse(json);
    const which = k === 0 ? 'result' : 'review';
    t(`${label} ${which}: accent is Phoenix orange`, p.components.at(-1).accent_color === 0xe8651a);
    t(`${label} ${which}: thumbnail is the attached Phoenix crest`, json.includes('"url":"attachment://crest.png"') && !!body.get('files[0]'));
    t(`${label} ${which}: no opponent crest URL, no NOREX red or blue-black`, !/easports|crestAssetId|c8352c|080b11|ef4444|22c55e/i.test(json) && !json.includes(String(0xc8352c)));
    t(`${label} ${which}: our name comes from config, not EA's spelling`, json.includes('PHOENIX FIRE') && !json.includes('FIIIre'));
  }
}
// Webhook fallback (no bot path): the embed colour is the brand colour, not result red/green, and the thumbnail is the site crest, not the opponent's.
sent.length = 0; delete process.env.DISCORD_BOT_TOKEN;
await postResults([mk('1', 0, 3)], { config: { ...config, features: {} }, homeId: '100', route, drawn: null });
const hook = JSON.parse(sent.find((c) => c.url.includes('/webhooks/'))?.init.body ?? '{}');
t('webhook embed colour is the Phoenix orange', hook.embeds?.[0]?.color === 0xe8651a);
t('webhook thumbnail is the Phoenix site crest, not the opponent', hook.embeds?.[0]?.thumbnail?.url === 'https://x.test/assets/crest.png?v=phoenix2');
globalThis.fetch = realFetch;
// Bot replies: any crest on our own site is versioned (Discord caches by URL, so an old NOREX crest sticks), and a defeat keeps the orange stripe.
const { header, thumb, resultAccent, ACCENT } = await import('../bot/ui.js');
const crestUrls = [header({ title: 'x', thumb: 'https://x.test/assets/crest.png' }).accessory.media.url, thumb('https://x.test/assets/crest.png').media.url];
t('the site crest in a bot header or thumbnail carries the Phoenix version', crestUrls.every((u) => u === 'https://x.test/assets/crest.png?v=phoenix2'));
t('an EA crest or an already versioned URL is left alone', header({ title: 'x', thumb: 'https://x.test/assets/crest.png?v=9' }).accessory.media.url.endsWith('?v=9') && header({ title: 'x', thumb: 'https://eafc.test/c/1.png' }).accessory.media.url === 'https://eafc.test/c/1.png');
t('a defeat stripe is Phoenix orange, not red', ACCENT[resultAccent('L')] === 0xe8651a);
done();
