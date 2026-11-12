// Section 7 (slash replies): /lineup /host /matchday /lfg /trial /feedback /suggest /share /discoveries /wheel /tag /remind /setup /announce
// each carry a drawn Phoenix picture on the reply, its follow-ups and its error and empty states; nothing NOREX; replies that are private stay
// private; every channel or role comes from the Organization config (bot/orgconfig.js), never from code.
import fs from 'node:fs';
import { env, sqlite } from './mock.mjs';
import { BANNERS, SLASH, TEMPLATE_VERSION } from '../scripts/cards.mjs';
import { BANNER_V, images, plainText } from '../bot/ui.js';
import { BANNER_SPEC } from '../bot/banners.js';
import { memberCommand } from '../bot/botcmds.js';
import { lfgCommand, lfgMessage } from '../bot/lfg.js';
import { discoveryCommand } from '../bot/discoveries.js';
import { funCommand } from '../bot/fun.js';
import { serverCommand } from '../bot/servertools.js';
import { t, done } from './lib.mjs';

const NOREX = /norex|c8352c|080b11/i;
const E = { ...env, SITE_URL: 'https://x.test/', ORG_NAME: 'Phoenix Fire' };
const flags = (o) => { E.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), ...o }); };
const has = (m, k) => images(m).some((u) => u.includes(`banner-${k}.png`));
const priv = (m) => (m.flags & 64) === 64;
const data = (r) => r?.data ?? r;
// Visible text, picture URLs and the stripe colour (custom_ids such as norex:dc:ok:1 are kept on purpose, so the whole JSON is not scanned).
const leaks = (m) => NOREX.test(plainText(m)) || NOREX.test(images(m).join(' ')) || /"accent_color":13121836/.test(JSON.stringify(m));

// ---------- the pictures ----------
const KEYS = Object.keys(SLASH);
t('versions bumped together', BANNER_V === TEMPLATE_VERSION && BANNER_V >= 12);
t('every slash picture is drawn: Phoenix orange, Phoenix crest, no NOREX', KEYS.every((k) => { const h = BANNERS[k]?.(); return h && !NOREX.test(h) && /e8651a/i.test(h) && /<img class="wm" src="data:image\/png/.test(h); }));
t('every slash picture has alt text in BANNER_SPEC, no NOREX', KEYS.every((k) => BANNER_SPEC[k]?.title && !NOREX.test(JSON.stringify(BANNER_SPEC[k]))));
t('the table covers every command in this section', ['lineup', 'host-', 'matchday', 'lfg', 'trial', 'feedback', 'suggest', 'share', 'discoveries', 'wheel', 'tag', 'remind', 'setup', 'announce'].every((c) => KEYS.some((k) => k.includes(c))));

const mc = (name, who, options = [], db = {}) => memberCommand({ data: { name, options }, member: { user: { id: who.u } }, channel_id: '700' }, E, who, 'https://x.test/', { load: async () => [], playerMessage: async () => ({}) }).then(data);
const member = { u: '801', n: 'Ann', role: 'member' }, boss = { u: '111', n: 'Boss', role: 'owner' };
sqlite.exec(`INSERT INTO users (id, name, avatar, first_at, last_at) VALUES ('801', 'Ann', null, 1, 1), ('111', 'Boss', null, 1, 1) ON CONFLICT DO NOTHING`);

// ---------- /lineup ----------
const none = await mc('lineup', member);
t('/lineup with nothing scheduled: its own empty-state picture, public like before', has(none, 'cmd-lineup-none') && !priv(none));
sqlite.exec(`INSERT INTO events (type, title, start, duration, status, lineup, formation, lineup_at, at) VALUES ('league', 'League night', ${Date.now() + 864e5}, 90, 'scheduled', '{}', '4-3-3', null, 1)`);
const unpub = await mc('lineup', member);
t('/lineup before it is published: the same picture', has(unpub, 'cmd-lineup-none') && /No lineup published/.test(plainText(unpub)));
sqlite.exec(`UPDATE events SET lineup = '{"801":"ST"}', lineup_at = 5`);
const pub = await mc('lineup', member);
t('/lineup published: a drawn picture (the formation pitch) and the button', images(pub).length >= 1 && /members\.html#schedule-/.test(JSON.stringify(pub)) && !leaks(pub));

// ---------- /host and /matchday ----------
const hostLocked = await mc('host', member);
t('/host for a member: locked picture, private', has(hostLocked, 'cmd-locked') && priv(hostLocked));
const hostAsk = await mc('host', boss, [{ name: 'mode', value: 'league' }, { name: 'kind', value: 'session' }, { name: 'when', value: 'tonight 9pm' }]);
t('/host without a time zone asks with the "one thing to fix" picture, private', has(hostAsk, 'cmd-host-ask') && priv(hostAsk));
const hostBad = await mc('host', boss, [{ name: 'when', value: 'whenever' }, { name: 'timezone', value: 'Europe/London' }]);
t('/host with a time it cannot read: same picture', has(hostBad, 'cmd-host-ask') && /read that time/.test(plainText(hostBad)));
const mdNone = await mc('matchday', member, [{ name: 'status', type: 1, options: [] }]);
sqlite.exec('DELETE FROM events');
const mdEmpty = await mc('matchday', member, [{ name: 'status', type: 1, options: [] }]);
t('/matchday status with no match day: picture', has(mdEmpty, 'cmd-matchday-none') && priv(mdEmpty));
const mdCheck = await mc('matchday', member, [{ name: 'checkin', type: 1, options: [] }]);
t('/matchday checkin with no match day: picture', has(mdCheck, 'cmd-matchday-none'));
const mdLocked = await mc('matchday', member, [{ name: 'create', type: 1, options: [] }]);
t('/matchday create for a member: locked picture', has(mdLocked, 'cmd-locked'));
sqlite.exec(`INSERT INTO events (type, title, start, duration, status, at) VALUES ('league', 'Cup night', ${Date.now() + 36e5}, 90, 'scheduled', 1)`);
const mdIn = await mc('matchday', member, [{ name: 'checkin', type: 1, options: [] }]);
t('/matchday checkin success: the "you are on" picture (or the problem picture if the hub refuses), never bare', has(mdIn, 'cmd-matchday-in') || has(mdIn, 'cmd-problem'));
t('/host and /matchday replies are Phoenix', ![hostLocked, hostAsk, hostBad, mdNone, mdEmpty, mdCheck, mdLocked, mdIn].some(leaks));

// ---------- /lfg ----------
flags({ rushLfg: 'members' });
sqlite.exec(`INSERT INTO meta (key, value) VALUES ('server_tools', '{"pingRoles":{"match":"7001","rush":"7002"}}') ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
const lfg = (sub, o = {}, me = member, at = Date.now()) => lfgCommand({ channel_id: '700', data: {} }, E, me, me, sub, o, at).then(data);
const l0 = await lfg('list');
t('/lfg list with nobody free: empty picture', has(l0, 'cmd-empty') && priv(l0));
const l1 = await lfg('now', { note: 'Need a keeper' });
t('/lfg now: the post carries the Rush picture, stays public, pings only the Rush role from config', has(l1, 'cmd-lfg-post') && !priv(l1) && JSON.stringify(l1.allowed_mentions) === '{"parse":[],"roles":["7002"]}');
const l2 = await lfg('now', {}, member, Date.now() + 1000);
t('/lfg now twice: the cooldown reply has a picture, private', has(l2, 'cmd-problem') && priv(l2));
const l3 = await lfg('list');
t('/lfg list: the "who is free" picture', has(l3, 'cmd-lfg-list'));
const l4 = await lfg('cancel');
t('/lfg cancel: the taken-down picture', has(l4, 'cmd-lfg-off') && /Taken down/.test(plainText(l4)));
const l5 = await lfg('cancel');
t('/lfg cancel with nothing open: empty picture', has(l5, 'cmd-empty'));
flags({ rushLfg: 'owner' });
t('/lfg switched off: locked picture', has(await lfg('now'), 'cmd-locked'));
const post = lfgMessage({ id: 1, name: 'Ann', status: 'open', expires: Date.now() + 36e5 }, [], { env: E });
t('the LFG post is Phoenix and keeps its buttons', has(post, 'cmd-lfg-post') && /pf:lfg:1:in/.test(JSON.stringify(post)) && !leaks(post));
t('the LFG post without SITE_URL still sends (no picture)', images(lfgMessage({ id: 1, name: 'Ann', status: 'open', expires: Date.now() + 36e5 }, [])).length === 0);

// ---------- /trial, /feedback, /suggest, /announce ----------
flags({});
const trialLocked = await mc('trial', member);
t('/trial for a member: locked picture', has(trialLocked, 'cmd-locked') && priv(trialLocked));
const trialNone = await mc('trial', boss);
t('/trial with no cards: empty picture, private', has(trialNone, 'cmd-empty') && priv(trialNone));
const trialOpts = [{ name: 'gamertag', value: 'zzz' }];
t('/trial with a filter and no match: empty picture', has(await mc('trial', boss, trialOpts), 'cmd-empty'));
flags({ feedback: 'owner', suggestions: 'owner', docs: 'owner' });
t('/feedback switched off for a member: locked picture', has(await mc('feedback', member, [{ name: 'to', value: '111' }, { name: 'kind', value: 'praise' }, { name: 'text', value: 'good' }]), 'cmd-locked'));
t('/suggest switched off for a member: locked picture', has(await mc('suggest', member, [{ name: 'title', value: 'x' }]), 'cmd-locked'));
flags({});
const sg = await mc('suggest', member, [{ name: 'title', value: 'Pizza night' }, { name: 'body', value: 'Order pizza after the match every week.' }]);
t('/suggest: success or a clear problem, always with a picture, private', (has(sg, 'cmd-suggest-sent') || has(sg, 'cmd-problem')) && priv(sg));
const fb = await mc('feedback', member, [{ name: 'to', value: '111' }, { name: 'kind', value: 'praise' }, { name: 'text', value: 'Great captain this week, keep going.' }]);
t('/feedback: success or a clear problem, always with a picture, private', (has(fb, 'cmd-feedback-sent') || has(fb, 'cmd-problem')) && priv(fb));
t('/announce for a member: locked picture', has(await mc('announce', member, [{ name: 'title', value: 'a' }, { name: 'text', value: 'b' }]), 'cmd-locked'));
const an = await mc('announce', boss, [{ name: 'title', value: 'Training' }, { name: 'text', value: 'Tonight at nine.' }]);
t('/announce: success or a clear problem, always with a picture, private', (has(an, 'cmd-announce-sent') || has(an, 'cmd-problem')) && priv(an));
t('quick commands are Phoenix', ![trialLocked, trialNone, sg, fb, an].some(leaks));

// ---------- /share and /discoveries ----------
flags({ discoveries: 'members' });
const dc = (name, who, options = []) => discoveryCommand({ member: { user: { id: who.u, username: who.n }, nick: who.n }, data: { name, options } }, E, {}, who).then(data);
const shortTip = await dc('share', member, [{ name: 'title', value: 'x' }, { name: 'tip', value: 'y' }]);
t('/share with too little: problem picture, private', has(shortTip, 'cmd-problem') && priv(shortTip));
const badLink = await dc('share', member, [{ name: 'title', value: 'Great tip' }, { name: 'tip', value: 'A long enough tip for sure.' }, { name: 'link', value: 'nope' }]);
t('/share with a bad link: problem picture', has(badLink, 'cmd-problem'));
const shared = await dc('share', member, [{ name: 'title', value: 'Great tip' }, { name: 'tip', value: 'A long enough tip for sure.' }]);
t('/share: the "sent to the managers" picture, private', has(shared, 'cmd-share-sent') && priv(shared));
const qLocked = await dc('discoveries', member);
t('/discoveries for a member: locked picture', has(qLocked, 'cmd-locked'));
const q = await dc('discoveries', boss);
t('/discoveries with one waiting: staff picture, Approve/Reject ids unchanged', has(q, 'cmd-discoveries') && /norex:dc:ok:\d+/.test(JSON.stringify(q)) && /norex:dc:no:\d+/.test(JSON.stringify(q)) && priv(q));
sqlite.exec("UPDATE discoveries SET status = 'rejected'");
const qEmpty = await dc('discoveries', boss);
t('/discoveries with nothing waiting: empty picture, private', has(qEmpty, 'cmd-empty') && priv(qEmpty));
flags({ discoveries: 'owner' });
t('/share switched off: locked picture', has(await dc('share', member), 'cmd-locked'));
t('/share and /discoveries are Phoenix', ![shortTip, badLink, shared, qLocked, q, qEmpty].some(leaks));

// ---------- /wheel ----------
flags({ fun: 'members' });
const wh = (options, who = member) => funCommand({ member: { user: { id: who.u } }, data: { name: 'wheel', options } }, E, {}, who).then(data);
const w1 = await wh([{ name: 'options', value: 'only one' }]);
t('/wheel with one option: its own picture, private', has(w1, 'cmd-wheel-error') && priv(w1));
const w2 = await wh([{ name: 'options', value: 'Jez, Kruger, Davey' }, { name: 'question', value: 'Who is in goal?' }]);
t('/wheel result keeps its wheel picture and Spin buttons, public', has(w2, 'wheel') && /norex:fun:spin:\d+/.test(JSON.stringify(w2)) && !priv(w2));
flags({ fun: 'owner' });
t('/wheel switched off: locked picture', has(await wh([{ name: 'options', value: 'a, b' }]), 'cmd-locked'));
t('/wheel is Phoenix', ![w1, w2].some(leaks));

// ---------- /tag, /remind, /setup ----------
flags({ serverTools: 'members' });
sqlite.exec(`INSERT INTO tags (name, body, by_id, uses, at) VALUES ('rules', 'Be kind.', '111', 0, 1) ON CONFLICT DO NOTHING`);
const sv = (name, who, options = [], extra = {}) => serverCommand({ member: { user: { id: who.u } }, channel_id: '700', guild_id: '9', token: 't', data: { name, options }, ...extra }, E, { waitUntil: () => {} }, who).then(data);
const tagPost = await sv('tag', member, [{ name: 'name', value: 'rules' }]);
t('/tag posts the saved answer with its picture, public', has(tagPost, 'cmd-tag-post') && !priv(tagPost) && /Be kind/.test(plainText(tagPost)));
t('/tag with an unknown name: problem picture', has(await sv('tag', member, [{ name: 'name', value: 'nope' }]), 'cmd-problem'));
const tagList = await sv('tags', member, [{ name: 'list', type: 1, options: [] }]);
t('/tags list: its picture, private', has(tagList, 'cmd-tag-list') && priv(tagList));
t('/tags set for a member: locked picture', has(await sv('tags', member, [{ name: 'set', type: 1, options: [{ name: 'name', value: 'x' }, { name: 'text', value: 'y' }] }]), 'cmd-locked'));
t('/tags set for a manager: saved picture', has(await sv('tags', boss, [{ name: 'set', type: 1, options: [{ name: 'name', value: 'faq' }, { name: 'text', value: 'Read the pins.' }] }]), 'cmd-tag-saved'));
t('/remind with a time it cannot read: problem picture', has(await sv('remind', member, [{ name: 'in', value: 'soon' }, { name: 'text', value: 'x' }]), 'cmd-problem'));
t('/reminders with none: empty picture', has(await sv('reminders', member), 'cmd-empty'));
const rem = await sv('remind', member, [{ name: 'in', value: '10m' }, { name: 'text', value: 'Check the lineup' }]);
t('/remind set: its picture, private', has(rem, 'cmd-remind-set') && priv(rem));
const remList = await sv('reminders', member);
t('/reminders list: its picture, Cancel button ids unchanged', has(remList, 'cmd-remind-list') && /norex:rm:x:\d+/.test(JSON.stringify(remList)));
t('/remind with a channel for a member: locked picture', has(await sv('remind', member, [{ name: 'in', value: '10m' }, { name: 'text', value: 'x' }, { name: 'channel', value: '555' }]), 'cmd-locked'));
t('/setup for a member: locked picture', has(await sv('setup', member, [{ name: 'off', type: 1, options: [{ name: 'feature', value: 'welcome' }] }]), 'cmd-locked'));
const setOff = await sv('setup', boss, [{ name: 'off', type: 1, options: [{ name: 'feature', value: 'welcome' }] }]);
t('/setup off: setup picture, private', has(setOff, 'cmd-setup-done') && priv(setOff));
flags({ serverTools: 'owner' });
t('/tag switched off: locked picture', has(await sv('tag', member, [{ name: 'name', value: 'rules' }]), 'cmd-locked'));
t('/tag /remind /setup replies are Phoenix', ![tagPost, tagList, rem, remList, setOff].some(leaks));

// ---------- channels and roles come from config, never code ----------
const files = ['botcmds', 'host', 'matchday', 'lfg', 'discoveries', 'fun', 'servertools'].map((f) => [f, fs.readFileSync(`bot/${f}.js`, 'utf8')]);
t('no code holds a channel or role id', files.every(([, src]) => !/\b\d{17,20}\b/.test(src)));
t('a discovery is announced in the channel the Organization config names', /channelFor\(env, 'announcements'\)/.test(files.find(([f]) => f === 'discoveries')[1]));
t('the Rush ping role comes from the server tools settings, not from code', /getToolSettings\(env\)\)\.pingRoles\?\.rush/.test(files.find(([f]) => f === 'lfg')[1]) && /getToolSettings\(env\)\)\.pingRoles \?\? \{\}/.test(fs.readFileSync('bot/host.js', 'utf8')));
t('setup writes channel and role purposes through orgconfig (the same rows as the site)', /setupMapping/.test(files.find(([f]) => f === 'servertools')[1]));
t('/announce reads its audience through the notify route, not a literal channel', !/discord\.com\/api\/v10\/channels\/\d/.test(files.find(([f]) => f === 'botcmds')[1]));
done();
