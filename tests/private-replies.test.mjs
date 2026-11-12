// Section 5 (private replies): /insight, /me and /intel each carry a drawn Phoenix picture; nothing NOREX; any channel or role comes from config.
import fs from 'node:fs';
import { BANNERS, TEMPLATE_VERSION } from '../scripts/cards.mjs';
import { BANNER_V, images, plainText } from '../bot/ui.js';
import { DISCORD_INSIGHT_KEYS, discordInsightEmbed } from '../bot/statinsights.js';
import { reportMessages } from '../bot/insights.js';
import { memberCommand } from '../bot/botcmds.js';
import { t, done } from './lib.mjs';

const env = { SITE_URL: 'https://x.test/', ORG_NAME: 'Phoenix Fire' };
const KEYS = [...Object.keys(DISCORD_INSIGHT_KEYS).map((k) => `insight-${k}`), 'me-claim', 'me-hidden', 'intel'];
const has = (m, k) => images(m).some((u) => u.includes(`banner-${k}.png`));
const NOREX = /norex|c8352c|080b11/i;

t('versions bumped together', BANNER_V === TEMPLATE_VERSION && BANNER_V >= 10);
t('every private picture is drawn, Phoenix orange, Phoenix crest, no NOREX', KEYS.every((k) => { const h = BANNERS[k]?.(); return h && !NOREX.test(h) && /e8651a/i.test(h) && /<img class="wm" src="data:image\/png/.test(h); }));

// /insight: one picture per stat, text stays Phoenix
const row = { key: 'club', headline: 'Five unbeaten', body: 'The run continues.', watch: 'Rush defence', tier: 'public', at: Date.now() };
const db = { prepare: () => { const o = { bind: () => o, first: async () => row, all: async () => ({ results: [row] }), run: async () => ({}) }; return o; } };
let ok = true, clean = true;
for (const stat of Object.keys(DISCORD_INSIGHT_KEYS)) {
  const out = await discordInsightEmbed({ ...env, DB: db }, stat, 'member').catch(() => ({}));
  ok &&= !!out.embed && has(out.embed, `insight-${stat}`);
  clean &&= !!out.embed && !NOREX.test(JSON.stringify(out.embed));
}
t('/insight carries its own picture for every stat', ok);
t('/insight has no NOREX name, colour or crest', clean);

// /intel: first message has the picture, staff accent, no NOREX
const rep = { guild: 'Phoenix Fire', overall: 70, prev: null, scores: { server: 70, site: 70, admin: 70, team: 70 }, recs: [], history: [],
  server: { humans: 10, joins7: 1, joins30: 2, msgs7: 5, posters7: 2, msgs30: 9, posters30: 3, top: [], dead: [], roles: 4, unused: [], text: 3, voice: 1, active: 2 },
  site: { missing: [], new7: 0, dmOff: 0, users: 8, adoption: 80, active7: 4, active30: 6, squadClaimed: 5, squad: 8, availUsers: 3, votesAvg: 2 },
  admin: { top: [], oldest: 0, topShare: 0, resp: null, eventsUsed: 0, claims: 0, requests: 0, rush: 0, trials: 0, decided: 0, deciders: 0, trialsOpen: 0, signed: 0, upcoming: 0 },
  team: { w: 3, d: 1, l: 1, gp: 5, winPct: 60, gdpg: 1, form: ['W', 'W', 'D'], streak: 2, regulars: 6 } };
let msgs = null;
try { msgs = reportMessages(rep, "https://x.test/", env); } catch (e) { console.log("report threw", e.stack.split("\n")[1]); }
t('/intel report opens with the Club Intelligence picture', !!msgs && has(msgs[0], 'intel'));
t('/intel report is Phoenix, no NOREX', !!msgs && !NOREX.test(JSON.stringify(msgs)));

// /me: both empty states carry a picture, stay ephemeral (flags 64 set), keep Phoenix
const run = async (claim, players) => {
  const h = { load: async () => players, playerMessage: async () => ({}) };
  const e2 = { ...env, DB: { prepare: () => { const o = { bind: () => o, first: async () => claim, all: async () => ({ results: [] }), run: async () => ({}) }; return o; } } };
  const res = await memberCommand({ data: { name: 'me', options: [] }, member: { user: { id: '1' } } }, e2, { u: '1', role: 'member' }, 'https://x.test/', h).catch((e) => ({ err: e }));
  const body = res instanceof Response ? await res.json() : res;
  return body?.data ?? body;
};
const claimed = await run(null, []);
const hidden = await run({ player: 'x' }, []);
t('/me without a claim: picture, private, Phoenix', !!claimed && has(claimed, 'me-claim') && (claimed.flags & 64) === 64 && !NOREX.test(JSON.stringify(claimed)));
t('/me with a hidden player: picture, private, Phoenix', !!hidden && has(hidden, 'me-hidden') && (hidden.flags & 64) === 64 && !NOREX.test(JSON.stringify(hidden)));

// no channel or role id in code; /intel is gated by the manager role from config, not a literal
const src = ['bot/insights.js', 'bot/statinsights.js', 'bot/botcmds.js'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
t('no code holds a channel or role id', !/\b\d{17,20}\b/.test(src));
t('insight weekly post reads its channel from the Organization config', /channelFor\(env, 'announcements'\)/.test(fs.readFileSync('bot/statinsights.js', 'utf8')));
done();
