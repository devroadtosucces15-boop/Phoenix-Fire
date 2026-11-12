// Section 6 (automated posts): every public post carries its own drawn Phoenix picture; nothing NOREX; channels and roles come from the Organization config.
import fs from 'node:fs';
import { BANNERS, POSTS, TEMPLATE_VERSION } from '../scripts/cards.mjs';
import { BANNER_V, images } from '../bot/ui.js';
import { BANNER_SPEC, bannerForDm } from '../bot/banners.js';
import { livePost } from '../bot/live.js';
import { livePanel } from '../bot/memberlive.js';
import { birthdayPanel } from '../bot/fun.js';
import { welcomeMessage } from '../bot/servertools.js';
import { updatePanel } from '../scripts/updates.mjs';
import { reportMessage } from '../bot/burnerstats.js';
import { t, done } from './lib.mjs';

const env = { SITE_URL: 'https://x.test/', ORG_NAME: 'Phoenix Fire' };
const NOREX = /norex|c8352c|080b11/i;
const has = (m, k) => images(m).some((u) => u.includes(`banner-${k}.png`));
const clean = (m) => !NOREX.test(JSON.stringify(m).replace(/norex:/g, '')); // custom_ids keep their old prefix on purpose
const src = (f) => fs.readFileSync(f, 'utf8');

t('versions bumped together', BANNER_V === TEMPLATE_VERSION && BANNER_V >= 11);
const KEYS = ['live', 'memberlive', 'hype', 'awards', 'hotw', 'birthday', 'welcome', 'patch', 'media', 'voice', 'burner', 'play', 'squad', 'doc'].map((k) => `post-${k}`);
t('one picture per automated post, all registered with alt text', KEYS.every((k) => POSTS[k] && BANNERS[k] && BANNER_SPEC[k]?.title));
for (const k of KEYS) {
  const h = BANNERS[k]();
  t(`${k}: Phoenix orange, Phoenix crest, no NOREX name or colour`, !NOREX.test(h) && /e8651a/i.test(h) && /<img class="wm" src="data:image\/png/.test(h));
}

// builders that can be called straight away
const row = { user_id: '1', name: 'Sam', platform: 'twitch', url: 'https://t.tv/x', title: 'Rush night' };
const live = livePost({ platform: 'twitch', url: 'https://t.tv/x', title: 'Rush night' }, 'https://x.test/', env);
t('live: picture, pings untouched (no ping parse), Phoenix', has(live, 'post-live') && live.allowed_mentions?.parse?.length === 0 && clean(live));
const ml = livePanel(row, env);
t('member live: picture, member mention kept, no mass ping, Phoenix', has(ml, 'post-memberlive') && JSON.stringify(ml).includes('<@1>') && ml.allowed_mentions?.parse?.length === 0 && clean(ml));
const bd = birthdayPanel([{ user_id: '1' }], env);
t('birthday: picture, mention kept, Phoenix', has(bd, 'post-birthday') && JSON.stringify(bd).includes('<@1>') && clean(bd));
const wl = welcomeMessage(env, {}, { user_id: '7', name: 'Sam', avatar: null });
t('welcome: picture, welcomes the new member by mention, Phoenix', has(wl, 'post-welcome') && JSON.stringify(wl).includes('<@7>') && wl.allowed_mentions?.users?.includes('7') && clean(wl));
const up = updatePanel({ title: 'FC update', slug: 'fc', url: 'https://ea.com/x', published: '2026-11-01', clubs: true, summary: 'Clubs got changes', hits: [] }, 'https://x.test/', 'Phoenix Fire');
t('patch notes: picture, Phoenix', has(up, 'post-patch') && clean(up));
const m = { res: 'W', gf: 3, ga: 1, ts: 1700000000, type: 'league', opp: { id: 9, name: 'Foes' }, players: [{ n: 'Ace', g: 1, a: 0, r: 8.1, mom: true }] };
const br = reportMessage({ id: 5, name: 'Burnerz' }, m, { w: 1, d: 0, l: 0, gf: 3, ga: 1, winPct: 100, streak: { n: 1, res: 'W' } }, 'https://x.test/');
t('burner report: picture, Phoenix', has(br, 'post-burner') && clean(br));

// builders inside crons or routes: the picture is wired in and the post still goes through its own sender
const wired = { 'bot/hype.js': 'post-hype', 'bot/awards.js': 'post-awards', 'bot/hotw.js': 'post-hotw', 'bot/voicerecap.js': 'post-voice', 'bot/plays.js': 'post-play', 'bot/squads.js': 'post-squad', 'bot/docs.js': 'post-doc' };
for (const [f, k] of Object.entries(wired)) t(`${f}: wired to ${k}`, src(f).includes(`picture(env, '${k}')`));
t('media guard DM uses its own picture (only storage notice)', bannerForDm('storage') === 'post-media' && /type: 'storage'/.test(src('bot/media.js')));
t('hype and voice keep the model picture and fall back to the drawn one', /art \? cards\('attachment:\/\/hype\.png'\) : picture\(env, 'post-hype'\)/.test(src('bot/hype.js')) && /art \? cards\('attachment:\/\/quote\.png'\) : picture\(env, 'post-voice'\)/.test(src('bot/voicerecap.js')));

// channels and roles come from the Organization config, never code
const FILES = ['bot/live.js', 'bot/memberlive.js', 'bot/hype.js', 'bot/awards.js', 'bot/hotw.js', 'bot/fun.js', 'bot/servertools.js', 'bot/voicerecap.js', 'bot/plays.js', 'bot/squads.js', 'bot/docs.js', 'bot/media.js', 'scripts/updates.mjs', 'bot/burnerstats.js'];
t('no automated-post module holds a channel or role id', FILES.every((f) => !/\b\d{17,20}\b/.test(src(f))));
t('live and member live read live_alerts from config', /channelFor\(env, 'live_alerts'\)/.test(src('bot/live.js')) && /channelFor\(env, 'live_alerts'\)/.test(src('bot/memberlive.js')));
t('awards and highlight read their channel from config', /channelFor\(env, 'awards'\)/.test(src('bot/awards.js')) && /channelFor\(env, 'awards'\)/.test(src('bot/hotw.js')));
t('birthday reads fun_posts from config', /channelFor\(env, 'fun_posts'\)/.test(src('bot/fun.js')));
t('hype and voice recap read their channel through the config', /hypeChannel|channelFor/.test(src('bot/hype.js')) && /channelFor|orgconfig/.test(src('bot/voicerecap.js')));
t('plays, squads and docs take the channel from the manager choice (route body), not code', /target\.channel/.test(src('bot/plays.js')) && /body\.channel/.test(src('bot/squads.js')) && /target\.channel/.test(src('bot/docs.js')));
done();
