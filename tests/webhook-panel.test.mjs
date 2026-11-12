// Step 7: the plain-webhook result post is the same Phoenix panel (no buttons), the classic embed fallback uses palette colours,
// and the strict studio check stays at zero warnings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { postResults, staticPanel } from '../scripts/lib/resultpost.mjs';
import { ACCENT } from '../bot/ui.js';
import { t, done } from './lib.mjs';

const m = { matchId: '1', timestamp: 1791600000, matchType: 'leagueMatch',
  clubs: { 100: { wins: '0', losses: '1', goals: '0', details: { name: 'Phoenix Fire' } }, 200: { wins: '1', losses: '0', goals: '2', details: { name: 'A2Touch' } } },
  players: { 100: { a: { playername: 'Mike', goals: '0', assists: '0', rating: '6.1' } } } };
const config = { siteUrl: 'https://x.test/', features: {}, hiddenPlayers: [], matchAlert: { loseBy: 3 } };
process.env.DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1/abc'; process.env.DISCORD_BOT_TOKEN = '';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-')); const cwd = process.cwd(); process.chdir(dir);
const realFetch = globalThis.fetch;
let calls = [], refuse = false;
globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return new Response('{}', { status: refuse && /with_components/.test(String(url)) ? 400 : 200 }); };
const warn = console.warn; console.warn = () => {};

await postResults([m], { config, homeId: '100', alert: async () => ({ ok: true, posted: 1 }) });
const panel = calls.find((c) => /with_components=true/.test(c.url));
const body = JSON.parse(panel?.init.body ?? '{}');
t('the webhook gets the design-system panel (Components V2, with_components)', !!panel && (body.flags & 32768) === 32768 && !body.embeds);
t('it has no buttons or menus (a webhook cannot carry them)', !/"type":(1|2|3),/.test(JSON.stringify(body.components)) && !/"custom_id"/.test(JSON.stringify(body)));
t('it is the Phoenix stripe', JSON.stringify(body).includes(String(ACCENT.loss)) && !/c8352c|norex/i.test(JSON.stringify(body)));
const sp = staticPanel({ components: [{ type: 17, components: [{ type: 10, content: 'x' }, { type: 1, components: [{ type: 2 }] }, { type: 9, components: [{ type: 10, content: 'y' }], accessory: { type: 2 } }] }] });
t('staticPanel drops action rows and button accessories only', sp.components[0].components.length === 2 && !sp.components[0].components[1].accessory && sp.components[0].components[1].components[0].content === 'y');

calls = []; refuse = true;
await postResults([m], { config, homeId: '100', alert: async () => ({ ok: true, posted: 1 }) });
const classic = calls.find((c) => !/with_components/.test(c.url) && c.init.body);
const emb = JSON.parse(classic?.init.body ?? '{}').embeds?.[0];
t('if Discord refuses the panel, the classic embed still goes out', !!emb);
t('the embed colour is a Phoenix palette colour', Object.values(ACCENT).includes(emb?.color));
console.warn = warn; globalThis.fetch = realFetch; process.chdir(cwd);

const r = spawnSync(process.execPath, ['tools/bot-studio/studio.mjs', 'check', '--strict'], { encoding: 'utf8' });
t('studio check --strict: 0 to fix, 0 warnings', r.status === 0 && /0 to fix · 0 warnings/.test(r.stdout));
done();
