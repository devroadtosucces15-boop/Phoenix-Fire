// Stream overlay core (next/stream/overlay/overlay-core.js): alert text, config links, Twitch chat events, goals, queue, clip reactions.
// Also guards the branding rule: the overlay files carry no club name or red of their own (values come from config at build time).
import fs from 'node:fs'; import vm from 'node:vm';
import { ROOT } from './mock.mjs';
import { t, tt, done } from './lib.mjs';

const ctx = { btoa, atob, escape, unescape, encodeURIComponent, decodeURIComponent, Date, JSON, Math, Number, String, Object, Array, RegExp, console };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + 'next/stream/overlay/overlay-core.js', 'utf8'), ctx);
const O = ctx.PFOverlay;
const cfg = () => O.build({ source: { channel: 'PhoenixFireFC' } });

// ---------- config ----------
t('default config produces an empty link (short URLs)', O.encode(O.build()) === '');
t('config round-trips through the link', O.decode(O.encode(cfg())).source.channel === 'phoenixfirefc');
t('channel is lower-cased and stripped to chat-safe characters', O.build({ source: { channel: ' Bad Name<script>' } }).source.channel === 'badnamescript');
t('junk in the link falls back to defaults', O.decode('%%%not-base64').alerts.on === true && O.decode('').goals.list.length === 2);
t('numbers are clamped (duration, gap, target)', (() => { const c = O.build({ alerts: { gap: 1e9, types: { follow: { dur: 1 } } }, goals: { list: [{ target: -5, current: -3 }] } }); return c.alerts.gap === 10000 && c.alerts.types.follow.dur === 2000 && c.goals.list[0].target === 1 && c.goals.list[0].current === 0; })());
t('a pasted prototype key cannot poison the config', (() => { O.build(JSON.parse('{"__proto__":{"polluted":1}}')); return ({}).polluted === undefined; })());
t('a feed address must be https', O.build({ source: { feedUrl: 'http://x.test/a' } }).source.feedUrl === '' && O.build({ source: { feedUrl: 'https://x.test/a' } }).source.feedUrl === 'https://x.test/a');
t('unknown sound and style values fall back', (() => { const a = O.build({ alerts: { types: { sub: { sound: 'evil', style: 'neon' } } } }).alerts.types.sub; return a.sound === 'none' && a.style === 'ember'; })());

// ---------- text ----------
t('template fills the viewer and tier', O.fill('{name} subscribed {tier}', O.vars({ name: 'Ash', plan: '2000' })) === 'Ash subscribed Tier 2');
t('empty variables leave no stray spaces or space before punctuation', O.fill('{name} gifted {tier} !', O.vars({ name: 'Ash' })) === 'Ash gifted!');
t('line() uses the type’s own templates', O.line(cfg(), { type: 'raid', name: 'Club', viewers: 87 }).text === 'Club raided with 87 viewers');

// ---------- IRC parsing ----------
const m = O.parseIrc('@badges=moderator/1,subscriber/12;display-name=A\\sB;msg-id=resub :tmi.twitch.tv USERNOTICE #phoenixfirefc :hello there');
t('IRC: tags, escapes, command and trailing text', m.cmd === 'USERNOTICE' && m.tags['display-name'] === 'A B' && m.text === 'hello there' && m.params[0] === '#phoenixfirefc');
t('IRC: roles come from badges', JSON.stringify(O.roles({ badges: 'broadcaster/1,subscriber/0' })) === '["viewer","broadcaster","subscriber"]' && O.roles({ mod: '1', badges: '' }).includes('moderator'));

const un = (tags, text = '') => `@${Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(';')} :tmi.twitch.tv USERNOTICE #c :${text}`;
const pm = (tags, text) => `@${Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(';')} :u!u@u.tmi.twitch.tv PRIVMSG #c :${text}`;
{
  const c = cfg(), irc = new O.Irc();
  const sub = irc.event(un({ 'msg-id': 'sub', 'display-name': 'Ash', 'msg-param-sub-plan': '3000', id: 's1' }), c);
  t('chat: new sub (tier 3 is worth 6 sub points)', sub.type === 'sub' && sub.name === 'Ash' && sub.points.sub === 6);
  const re = irc.event(un({ 'msg-id': 'resub', 'display-name': 'Bo', 'msg-param-cumulative-months': '9', 'msg-param-sub-plan': '1000', id: 's2' }, 'still here'), c);
  t('chat: resub keeps months and the message', re.type === 'resub' && re.months === 9 && re.message === 'still here');
  const bomb = irc.event(un({ 'msg-id': 'submysterygift', 'display-name': 'Whale', 'msg-param-mass-gift-count': '5', 'msg-param-community-gift-id': 'G1', id: 'b1' }), c);
  const g1 = irc.event(un({ 'msg-id': 'subgift', 'display-name': 'Whale', 'msg-param-recipient-display-name': 'Lucky', 'msg-param-community-gift-id': 'G1', 'msg-param-sub-plan': '1000', id: 'g1' }), c);
  const g2 = irc.event(un({ 'msg-id': 'subgift', 'display-name': 'Solo', 'msg-param-recipient-display-name': 'Pal', 'msg-param-sub-plan': '1000', id: 'g2' }), c);
  t('chat: gift bomb is one alert and counts no points itself', bomb.type === 'giftbomb' && bomb.count === 5 && Object.keys(bomb.points).length === 0);
  t('chat: gifts inside a bomb are silent but still count for the sub goal', g1.silent === true && g1.points.sub === 1);
  t('chat: a lone gift sub is announced', g2.type === 'giftsub' && !g2.silent && g2.recipient === 'Pal');
  const raid = irc.event(un({ 'msg-id': 'raid', 'msg-param-displayName': 'Friends', 'msg-param-viewerCount': '120', id: 'r1' }), c);
  t('chat: raid carries the viewer count', raid.type === 'raid' && raid.name === 'Friends' && raid.viewers === 120);
  const bits = irc.event(pm({ bits: '250', 'display-name': 'Cheer', id: 'p1' }, 'Cheer250 nice'), c);
  t('chat: bits become an event worth that many bits', bits.type === 'bits' && bits.amount === 250 && bits.points.bits === 250);
  t('chat: a plain message is not an event', irc.event(pm({ 'display-name': 'Chat', id: 'p2' }, 'hello'), c) === null);
  t('chat: unknown notices are ignored', irc.event(un({ 'msg-id': 'ritual', 'display-name': 'X' }), c) === null);
}

// ---------- clips ----------
t('clip slug: clips.twitch.tv, channel/clip and embed links', O.clipSlug('look https://clips.twitch.tv/FunnyAbc-123_xyz now') === 'FunnyAbc-123_xyz'
  && O.clipSlug('https://www.twitch.tv/someone/clip/SlugSlug_99?filter=x') === 'SlugSlug_99' && O.clipSlug('https://clips.twitch.tv/embed?clip=AbcDefGh12') === 'AbcDefGh12');
t('clip slug: other sites and short junk are refused', O.clipSlug('https://evil.example/clip/AbcDefGh12') === '' && O.clipSlug('https://clips.twitch.tv/ab') === '' && O.clipSlug('no link') === '');
{
  const c = cfg(), irc = new O.Irc(), link = 'https://clips.twitch.tv/GoodClipSlug1';
  t('clip: a moderator’s link plays', irc.event(pm({ badges: 'moderator/1', 'display-name': 'Mod', id: 'c1' }, link), c)?.slug === 'GoodClipSlug1');
  t('clip: a plain viewer’s link does not (default is trusted roles only)', irc.event(pm({ badges: '', 'display-name': 'Rando', id: 'c2' }, link), c) === null);
  const open = O.build({ clips: { allow: ['viewer'] } });
  t('clip: allowing viewers lets anyone play one', irc.event(pm({ badges: '', 'display-name': 'Rando', id: 'c3' }, link), open)?.type === 'clip');
  const cmd = O.build({ clips: { needCmd: true, cmd: '!clip', allow: ['broadcaster'] } });
  t('clip: with the command required, a bare link is ignored and "!clip link" plays', irc.event(pm({ badges: 'broadcaster/1', id: 'c4' }, link), cmd) === null && irc.event(pm({ badges: 'broadcaster/1', id: 'c5' }, '!clip ' + link), cmd)?.type === 'clip');
  t('clip: switched off means no clip events', irc.event(pm({ badges: 'moderator/1', id: 'c6' }, link), O.build({ clips: { on: false } })) === null);
  t('reactions: chat words are matched, other chat is not', O.reaction('LETS GO 🔥', c) !== '' && O.reaction('what time is it', c) === '' && O.reaction('🔥', O.build({ clips: { reactions: { on: false } } })) === '');
}

// ---------- goals ----------
{
  const c = O.build({ goals: { list: [{ id: 'f', kind: 'follow', label: 'Followers', current: 98, target: 100 }, { id: 's', kind: 'sub', label: 'Subs', current: 0, target: 3, steps: [1, 3] }] } });
  const g = c.goals.list;
  let met = O.applyEvent(c, { points: { follow: 1 } });
  t('goal: below the line nothing is met', met.length === 0 && O.goalView(g[0]).left === 1 && O.goalView(g[0]).pct === 99);
  met = O.applyEvent(c, { points: { follow: 1 } });
  t('goal: crossing the line reports it once', met.length === 1 && met[0].id === 'f' && O.goalView(g[0]).met === true);
  t('goal: a follow does not move a sub goal', g[1].current === 0);
  met = O.applyEvent(c, { points: { sub: 1 } });
  t('goal: a step is celebrated and the bar moves to the next target', met.length === 1 && met[0].justMet === 1 && O.goalView(g[1]).target === 3 && O.goalView(g[1]).step === 2);
  met = O.applyEvent(c, { points: { sub: 2 } });
  t('goal: the last step is met at its target', met.length === 1 && O.goalView(g[1]).met === true && O.goalView(g[1]).pct === 100);
  const ev = O.metEvent(met[0]);
  t('goal: the met alert is a goal event with a stable id', ev.type === 'goal' && ev.id === 'goal-s-3' && O.line(c, { ...ev, label: 'Subs', target: 3 }).text === 'Subs reached 3');
}

// ---------- queue ----------
{
  const q = new O.Queue(cfg()); const f = (n) => ({ type: 'follow', name: n, points: {} });
  q.push(f('A')); q.push({ type: 'raid', name: 'R', viewers: 5, points: {} });
  t('queue: a raid jumps ahead of a follow', q.next().type === 'raid' && q.next().type === 'follow');
  const q2 = new O.Queue(cfg()); ['A', 'B', 'C', 'D'].forEach((n) => q2.push(f(n)));
  const first = q2.next();
  t('queue: a burst of follows becomes one card naming them', first.merged === true && first.count === 4 && /A, B, C \+1/.test(first.name) && q2.size() === 0);
  t('queue: switched-off types and small bits are dropped', (() => { const q3 = new O.Queue(O.build({ alerts: { types: { follow: { on: false }, bits: { min: 100 } } } })); return q3.push(f('x')) === false && q3.push({ type: 'bits', amount: 50, points: {} }) === false && q3.push({ type: 'bits', amount: 150, points: {} }) === true; })());
  const q4 = new O.Queue(O.build({ alerts: { cap: 5, mergeFollows: 20 } })); for (let i = 0; i < 9; i++) q4.push(f('n' + i)); q4.push({ type: 'raid', name: 'R', points: {} });
  t('queue: over the cap the cheap alerts are dropped, a raid survives', q4.size() === 5 && q4.items.some((x) => x.type === 'raid'));
}

// ---------- dedupe + feed ----------
{
  const d = new O.Dedupe(1000);
  t('dedupe: the same id is shown once, a new one passes, and it forgets after the window', d.fresh({ type: 'follow', id: 'a' }, 0) && !d.fresh({ type: 'follow', id: 'a' }, 10) && d.fresh({ type: 'follow', id: 'b' }, 10) && d.fresh({ type: 'follow', id: 'a' }, 5000));
  t('dedupe: events without an id match on who and what', d.fresh({ type: 'bits', name: 'X', amount: 5 }, 0) && !d.fresh({ type: 'bits', name: 'X', amount: 5 }, 5) && d.fresh({ type: 'bits', name: 'X', amount: 6 }, 5));
  const f = O.fromFeed({ type: 'follow', name: 'New<b>Fan', id: 'f1' });
  t('feed: names are stripped to safe characters and follows count 1', f.name === 'NewbFan' && f.points.follow === 1 && f.source === 'feed');
  t('feed: unknown types and bad clip slugs are refused', O.fromFeed({ type: 'hack' }) === null && O.fromFeed({ type: 'clip', slug: '<img>' }) === null && O.fromFeed(null) === null);
  t('feed: a gift bomb counts every gift as sub points', O.fromFeed({ type: 'giftbomb', name: 'W', count: 10 }).points.sub === 10);
}

// ---------- branding: the files carry no club name or red ----------
for (const f of ['index.html', 'studio.html', 'overlay.css', 'overlay.js', 'overlay-core.js', 'overlay-studio.css', 'overlay-studio.js', 'overlay-brand.js']) {
  const s = fs.readFileSync(ROOT + 'next/stream/overlay/' + f, 'utf8');
  t(`${f}: no NOREX name, red or blue-black`, !/norex|#c8352c|#080b11/i.test(s));
}
{ const c2 = { }; c2.window = c2; vm.createContext(c2); vm.runInContext(fs.readFileSync(ROOT + 'next/stream/overlay/overlay-brand.js', 'utf8'), c2);
  t('brand fallback file names no club (phoenix/build.mjs fills it from config.json)', c2.PF_BRAND.name === '' && c2.PF_BRAND.motto === ''); }
// ---------- built output (after phoenix/build.mjs): Phoenix values, Phoenix crest, no other club ----------
{
  const out = ROOT + 'site/phoenix/', cfgJson = JSON.parse(fs.readFileSync(ROOT + 'config.json', 'utf8'));
  t('build step writes overlay-brand.js from config.json (no hardcoded brand in the build either)', /overlay\/overlay-brand\.js/.test(fs.readFileSync(ROOT + 'phoenix/build.mjs', 'utf8')) && /b\.motto/.test(fs.readFileSync(ROOT + 'phoenix/build.mjs', 'utf8')));
  if (fs.existsSync(out + 'overlay/overlay-brand.js')) {
    const c3 = { }; c3.window = c3; vm.createContext(c3); vm.runInContext(fs.readFileSync(out + 'overlay/overlay-brand.js', 'utf8'), c3);
    t('built: brand values are the config’s (accent, ink, motto)', c3.PF_BRAND.accent === cfgJson.brand.red && c3.PF_BRAND.ink === cfgJson.brand.ink && c3.PF_BRAND.motto === cfgJson.brand.motto && c3.PF_BRAND.name === 'PHOENIX FIRE');
    t('built: no NOREX name, red or blue-black in any overlay file', fs.readdirSync(out + 'overlay').every((f) => !/norex|#c8352c|#080b11/i.test(fs.readFileSync(out + 'overlay/' + f, 'utf8'))));
    t('built: the alert badge crest is the Phoenix crest', fs.readFileSync(out + 'crest-sm.png').equals(fs.readFileSync(ROOT + 'phoenix/overlay/crest-sm.png')) && fs.readFileSync(out + 'activity/crest-sm.png').equals(fs.readFileSync(ROOT + 'phoenix/overlay/crest-sm.png')));
    t('built: robots keeps the overlay and Activity out of search and they are folders, not top-level pages', !fs.existsSync(out + 'overlay.html') && !fs.existsSync(out + 'activity.html') && (!fs.existsSync(out + 'robots.txt') || /Disallow: \/overlay/.test(fs.readFileSync(out + 'robots.txt', 'utf8'))));
  } else console.log('note: no site/phoenix build here; run node phoenix/build.mjs to check the built overlay');
}
done();
