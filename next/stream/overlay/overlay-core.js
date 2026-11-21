/* Stream overlay core: pure logic for the on-stream alert box, goal bars and clip reactions.
   No DOM and no network in here, so tests/overlay.test.mjs can run it as-is. overlay.js draws it, overlay-studio.js edits it.
   Brand text and colours come from window.PF_BRAND (overlay-brand.js, written from config.json at build time); nothing here names a club. */
(function (root) {
  'use strict';
  var BRAND = root.PF_BRAND || {};
  var TYPES = ['follow', 'sub', 'resub', 'giftsub', 'giftbomb', 'bits', 'raid', 'goal', 'clip'];
  var TIER = { Prime: 'with Prime', '1000': 'Tier 1', '2000': 'Tier 2', '3000': 'Tier 3' };
  var SUB_POINTS = { Prime: 1, '1000': 1, '2000': 2, '3000': 6 }; // Twitch's own sub-point weights
  var PRIORITY = { goal: 5, giftbomb: 4, raid: 4, clip: 3, resub: 2, sub: 2, giftsub: 2, bits: 1, follow: 0 };

  /* ---------- defaults ---------- */
  function alertType(o) { return Object.assign({ on: true, icon: '🔥', title: '', text: '', dur: 6500, sound: 'chime', style: 'ember', min: 0 }, o); }
  function defaults() {
    return {
      v: 1,
      brand: { name: BRAND.name || '', motto: BRAND.motto || '' },
      source: { irc: true, channel: '', feed: false, feedUrl: '', feedKey: '', feedTypes: ['follow'], poll: 4000 },
      alerts: {
        on: true, pos: 'bc', gap: 900, volume: 0.6, calm: false, cap: 30, mergeFollows: 3,
        types: {
          follow: alertType({ icon: '🔥', title: 'NEW FOLLOWER', text: '{name} joined the flames', dur: 5500, sound: 'chime' }),
          sub: alertType({ icon: '⭐', title: 'NEW SUB', text: '{name} subscribed {tier}', dur: 8000, sound: 'horn', style: 'gold' }),
          resub: alertType({ icon: '🔁', title: 'RESUB', text: '{name} is back for {months} months', dur: 8000, sound: 'horn', style: 'gold' }),
          giftsub: alertType({ icon: '🎁', title: 'GIFT SUB', text: '{name} gifted a sub to {recipient}', dur: 7000, sound: 'horn', style: 'gold' }),
          giftbomb: alertType({ icon: '💥', title: 'GIFT BOMB', text: '{name} dropped {count} gift subs', dur: 10000, sound: 'fire', style: 'ember' }),
          bits: alertType({ icon: '💎', title: 'BITS', text: '{name} cheered {amount} bits', dur: 6500, sound: 'chime', style: 'silver', min: 1 }),
          raid: alertType({ icon: '🚀', title: 'RAID', text: '{name} raided with {viewers} viewers', dur: 10000, sound: 'fire', style: 'ember' }),
          goal: alertType({ icon: '🎯', title: 'GOAL MET', text: '{label} reached {target}', dur: 9000, sound: 'fire', style: 'gold' })
        }
      },
      goals: {
        on: true, pos: 'tl', weights: { Prime: 1, '1000': 1, '2000': 2, '3000': 6 },
        list: [
          { id: 'followers', kind: 'follow', label: 'Follower goal', current: 0, target: 100, steps: [], metText: 'GOAL MET', unit: 'followers' },
          { id: 'subs', kind: 'sub', label: 'Sub goal', current: 0, target: 25, steps: [], metText: 'GOAL MET', unit: 'subs' }
        ]
      },
      clips: {
        on: true, pos: 'c', allow: ['broadcaster', 'moderator', 'vip'], needCmd: false, cmd: '!clip', maxSec: 20, muted: false,
        label: 'CLIP', reactions: { on: true, words: ['🔥', 'W', 'GG', 'LUL', 'POG', 'CLIP', 'LETS GO'], max: 14 }
      }
    };
  }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function merge(base, patch) { // deep merge, arrays replaced, unknown keys kept so the studio can grow without breaking old links
    if (!isObj(patch)) return base;
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(patch).forEach(function (k) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
      out[k] = isObj(base && base[k]) && isObj(patch[k]) ? merge(base[k], patch[k]) : patch[k];
    });
    return out;
  }
  function clean(cfg) { // clamp everything an owner (or a pasted link) can type
    var c = cfg, n = function (v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    var t = function (v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max); };
    c.source.channel = t(c.source.channel, 25).toLowerCase().replace(/[^a-z0-9_]/g, '');
    c.source.poll = n(c.source.poll, 2000, 60000, 4000);
    c.source.feedUrl = /^https:\/\//.test(c.source.feedUrl) ? t(c.source.feedUrl, 300) : '';
    c.source.feedKey = t(c.source.feedKey, 120);
    c.alerts.gap = n(c.alerts.gap, 0, 10000, 900); c.alerts.volume = n(c.alerts.volume, 0, 1, 0.6); c.alerts.cap = n(c.alerts.cap, 5, 100, 30);
    c.alerts.mergeFollows = n(c.alerts.mergeFollows, 2, 20, 3);
    TYPES.forEach(function (k) {
      var a = c.alerts.types[k]; if (!a) return;
      a.dur = n(a.dur, 2000, 30000, 6500); a.min = n(a.min, 0, 1e7, 0); a.title = t(a.title, 40); a.text = t(a.text, 140); a.icon = t(a.icon, 8);
      a.style = ['ember', 'gold', 'silver'].indexOf(a.style) > -1 ? a.style : 'ember';
      a.sound = ['chime', 'horn', 'fire', 'none'].indexOf(a.sound) > -1 ? a.sound : 'none';
    });
    c.goals.list = (c.goals.list || []).slice(0, 6).map(function (g, i) {
      return { id: t(g.id || 'goal' + i, 24).replace(/[^\w-]/g, ''), kind: ['follow', 'sub', 'bits'].indexOf(g.kind) > -1 ? g.kind : 'follow', label: t(g.label, 40), unit: t(g.unit, 16),
        current: n(g.current, 0, 1e9, 0), target: Math.max(1, n(g.target, 1, 1e9, 100)), metText: t(g.metText || 'GOAL MET', 24),
        steps: (Array.isArray(g.steps) ? g.steps : []).map(Number).filter(function (x) { return isFinite(x) && x > 0; }).sort(function (a, b) { return a - b; }).slice(0, 12) };
    });
    c.clips.maxSec = n(c.clips.maxSec, 5, 60, 20); c.clips.cmd = t(c.clips.cmd, 20) || '!clip';
    c.clips.allow = (c.clips.allow || []).filter(function (r) { return ['viewer', 'subscriber', 'vip', 'moderator', 'broadcaster'].indexOf(r) > -1; });
    c.clips.reactions.max = n(c.clips.reactions.max, 0, 40, 14);
    c.clips.reactions.words = (c.clips.reactions.words || []).map(function (w) { return t(w, 16); }).filter(Boolean).slice(0, 20);
    ['alerts', 'goals', 'clips'].forEach(function (k) { if (['tl', 'tc', 'tr', 'cl', 'c', 'cr', 'bl', 'bc', 'br'].indexOf(c[k].pos) < 0) c[k].pos = defaults()[k].pos; });
    return c;
  }
  function build(patch) { return clean(merge(defaults(), patch || {})); }

  /* ---------- config <-> url (base64url JSON, so an OBS source needs no backend) ---------- */
  function b64e(s) { var b = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'); return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64d(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'); }
  function encode(cfg) { var d = diff(defaults(), cfg); return d === undefined ? '' : b64e(JSON.stringify(d)); }
  function decode(s) { try { return build(JSON.parse(b64d(String(s || '')))); } catch (e) { return build(); } }
  function canon(x) { return Array.isArray(x) ? '[' + x.map(canon).join(',') + ']' : isObj(x) ? '{' + Object.keys(x).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(x[k]); }).join(',') + '}' : JSON.stringify(x); }
  function diff(base, cur) { // only what differs from the defaults: short links
    if (Array.isArray(cur)) return canon(cur) === canon(base) ? undefined : cur;
    if (!isObj(cur)) return cur === base ? undefined : cur;
    var out = {}, any = false;
    Object.keys(cur).forEach(function (k) { var d = diff(base ? base[k] : undefined, cur[k]); if (d !== undefined) { out[k] = d; any = true; } });
    return any ? out : undefined;
  }

  /* ---------- text ---------- */
  function fill(tpl, vars) { // plain substitution; the DOM layer sets textContent, so a name can never become markup
    return String(tpl || '').replace(/\{(\w+)\}/g, function (_, k) { var v = vars[k]; return v == null ? '' : String(v); }).replace(/\s+/g, ' ').replace(/\s+([!?.,])/g, '$1').trim();
  }
  function vars(ev) {
    return { name: ev.name || 'Someone', tier: TIER[ev.plan] || '', months: ev.months || 1, streak: ev.streak || 0, recipient: ev.recipient || 'a viewer', count: ev.count || 1,
      amount: ev.amount || 0, viewers: ev.viewers || 0, label: ev.label || '', target: ev.target || '', message: ev.message || '' };
  }
  function line(cfg, ev) { var a = cfg.alerts.types[ev.type]; return a ? { title: fill(a.title, vars(ev)), text: fill(a.text, vars(ev)) } : null; }

  /* ---------- IRC (Twitch chat as an anonymous reader: subs, gifts, raids, bits, clip links; no login, no token) ---------- */
  function unesc(v) { return String(v).replace(/\\(.)/g, function (_, c) { return c === 's' ? ' ' : c === ':' ? ';' : c === 'r' ? '\r' : c === 'n' ? '\n' : c; }); }
  function parseIrc(raw) {
    var s = String(raw).replace(/\r?\n$/, ''), tags = {}, prefix = '', i = 0;
    if (s[0] === '@') { i = s.indexOf(' '); s.slice(1, i).split(';').forEach(function (p) { var e = p.indexOf('='); tags[e < 0 ? p : p.slice(0, e)] = e < 0 ? '' : unesc(p.slice(e + 1)); }); s = s.slice(i + 1); }
    if (s[0] === ':') { i = s.indexOf(' '); prefix = s.slice(1, i); s = s.slice(i + 1); }
    var trail = '', j = s.indexOf(' :'); if (j > -1) { trail = s.slice(j + 2); s = s.slice(0, j); }
    var parts = s.split(' ').filter(Boolean);
    return { tags: tags, prefix: prefix, cmd: parts[0] || '', params: parts.slice(1), text: trail, nick: prefix.split('!')[0] };
  }
  var CLIP_RE = /(?:https?:\/\/)?(?:clips\.twitch\.tv\/(?:embed\?clip=)?|(?:www\.|m\.)?twitch\.tv\/[A-Za-z0-9_]{2,25}\/clip\/)([A-Za-z0-9_-]{8,80})/i;
  function clipSlug(text) { var m = CLIP_RE.exec(String(text || '')); return m ? m[1] : ''; }
  function roles(tags) {
    var out = ['viewer'], b = String(tags.badges || '');
    if (/(^|,)broadcaster\//.test(b)) out.push('broadcaster');
    if (/(^|,)moderator\//.test(b) || tags.mod === '1') out.push('moderator');
    if (/(^|,)vip\//.test(b)) out.push('vip');
    if (/(^|,)(subscriber|founder)\//.test(b) || tags.subscriber === '1') out.push('subscriber');
    return out;
  }
  function who(m) { return String(m.tags['display-name'] || m.tags.login || m.nick || '').replace(/[^\w]/g, '').slice(0, 25); }
  function gift(m) { return { id: m.tags.id || '', t: Date.now() }; }

  function Irc() { this.bombs = {}; }
  Irc.prototype.event = function (raw, cfg) { // one raw line -> an event or null
    var m = typeof raw === 'string' ? parseIrc(raw) : raw, g = m.tags, now = Date.now(), k;
    for (k in this.bombs) if (now - this.bombs[k].t > 120000) delete this.bombs[k];
    if (m.cmd === 'USERNOTICE') {
      var id = g['msg-id'], base = { id: g.id || '', at: now, name: who(m), source: 'irc', message: m.text.slice(0, 200) };
      var plan = g['msg-param-sub-plan'] || '1000', w = (cfg.goals.weights || SUB_POINTS)[plan] || 1;
      if (id === 'sub') return Object.assign(base, { type: 'sub', plan: plan, points: { sub: w } });
      if (id === 'resub') return Object.assign(base, { type: 'resub', plan: plan, months: +g['msg-param-cumulative-months'] || 1, streak: +g['msg-param-streak-months'] || 0, points: { sub: w } });
      if (id === 'subgift' || id === 'anonsubgift') {
        var cid = g['msg-param-community-gift-id'], bomb = cid && this.bombs[cid];
        return Object.assign(base, { type: 'giftsub', plan: plan, name: id === 'anonsubgift' ? 'Anonymous' : base.name, recipient: String(g['msg-param-recipient-display-name'] || '').replace(/[^\w]/g, '').slice(0, 25),
          silent: !!bomb, points: { sub: w } }); // inside a gift bomb: counted for the goal, not announced again
      }
      if (id === 'submysterygift' || id === 'anonsubmysterygift') {
        var n = +g['msg-param-mass-gift-count'] || 1, cg = g['msg-param-community-gift-id'] || g.id; if (cg) this.bombs[cg] = { t: now, n: n };
        return Object.assign(base, { type: 'giftbomb', name: id === 'anonsubmysterygift' ? 'Anonymous' : base.name, count: n, plan: plan, points: {} });
      }
      if (id === 'raid') return Object.assign(base, { type: 'raid', name: String(g['msg-param-displayName'] || base.name).replace(/[^\w]/g, '').slice(0, 25), viewers: +g['msg-param-viewerCount'] || 0, points: {} });
      return null;
    }
    if (m.cmd === 'PRIVMSG') {
      var bits = +g.bits || 0, ev = null, text = m.text;
      if (bits > 0) ev = { type: 'bits', id: g.id || '', at: now, name: who(m), amount: bits, message: text.slice(0, 200), source: 'irc', points: { bits: bits } };
      var slug = clipSlug(text), rs = roles(g);
      if (!bits && slug && cfg.clips.on && rs.some(function (r) { return cfg.clips.allow.indexOf(r) > -1; }) && (!cfg.clips.needCmd || text.toLowerCase().indexOf(cfg.clips.cmd.toLowerCase()) > -1)) {
        return { type: 'clip', id: g.id || '', at: now, name: who(m), slug: slug, source: 'irc', points: {} };
      }
      return ev;
    }
    return null;
  };

  /* ---------- feed (the Worker's /api/stream/events: follows from Twitch EventSub, or anything pushed with the club key) ---------- */
  function fromFeed(e) {
    if (!e || TYPES.indexOf(e.type) < 0 || e.type === 'clip' && !/^[\w-]{8,80}$/.test(e.slug || '')) return null;
    var nm = function (v) { return String(v == null ? '' : v).replace(/[^\w]/g, '').slice(0, 25); }, num = function (v) { return Math.max(0, Math.min(1e9, Math.floor(+v || 0))); };
    var o = { type: e.type, id: String(e.id || '').slice(0, 80), at: Date.now(), name: nm(e.name), source: 'feed', plan: String(e.plan || '').replace(/[^\w]/g, '').slice(0, 8), recipient: nm(e.recipient),
      months: num(e.months), count: num(e.count), amount: num(e.amount), viewers: num(e.viewers), slug: e.slug || '', message: String(e.message || '').slice(0, 200), points: {} };
    if (e.type === 'follow') o.points.follow = 1;
    if (['sub', 'resub', 'giftsub'].indexOf(e.type) > -1) o.points.sub = SUB_POINTS[o.plan] || 1;
    if (e.type === 'giftbomb') o.points.sub = Math.max(1, o.count);
    if (e.type === 'bits') o.points.bits = o.amount;
    return o;
  }

  /* ---------- dedupe + queue ---------- */
  function Dedupe(ttl) { this.ttl = ttl || 45000; this.seen = {}; }
  Dedupe.prototype.fresh = function (ev, now) {
    now = now == null ? Date.now() : now; var k = ev.id ? ev.type + '#' + ev.id : [ev.type, ev.name, ev.recipient, ev.count, ev.amount, ev.slug].join('|'), x;
    for (x in this.seen) if (now - this.seen[x] > this.ttl) delete this.seen[x];
    if (this.seen[k] !== undefined) return false; this.seen[k] = now; return true;
  };
  function Queue(cfg) { this.cfg = cfg; this.items = []; }
  function followCard(names, source) { return { type: 'follow', merged: true, at: Date.now(), source: source, names: names, count: names.length, name: names.slice(0, 3).join(', ') + (names.length > 3 ? ' +' + (names.length - 3) : ''), points: {} }; }
  Queue.prototype.push = function (ev) {
    var a = this.cfg.alerts.types[ev.type]; if (!a || !a.on) return false;
    if (ev.type === 'bits' && ev.amount < a.min) return false;
    var card = ev.type === 'follow' ? this.items.filter(function (x) { return x.merged; })[0] : null;
    if (card) { // a burst is already waiting as one card: later follows join it
      var names = card.names.concat(ev.name), i = this.items.indexOf(card); this.items[i] = followCard(names, card.source); return true;
    }
    this.items.push(ev);
    var fl = this.items.filter(function (x) { return x.type === 'follow' && !x.merged; });
    if (ev.type === 'follow' && fl.length >= this.cfg.alerts.mergeFollows) { // enough waiting: they become one card
      var first = this.items.indexOf(fl[0]);
      this.items = this.items.filter(function (x) { return fl.indexOf(x) < 0; });
      this.items.splice(first, 0, followCard(fl.map(function (x) { return x.name; }), fl[0].source));
    }
    while (this.items.length > this.cfg.alerts.cap) { var lo = 0; this.items.forEach(function (x, i) { if ((PRIORITY[x.type] || 0) < (PRIORITY[this.items[lo].type] || 0)) lo = i; }, this); this.items.splice(lo, 1); }
    return true;
  };
  Queue.prototype.next = function () { // highest priority first, oldest first inside a priority
    if (!this.items.length) return null; var best = 0;
    this.items.forEach(function (x, i) { if ((PRIORITY[x.type] || 0) > (PRIORITY[this.items[best].type] || 0)) best = i; }, this);
    return this.items.splice(best, 1)[0];
  };
  Queue.prototype.size = function () { return this.items.length; };

  /* ---------- goals ---------- */
  function goalView(g) {
    var steps = g.steps && g.steps.length ? g.steps : [g.target], cur = Math.max(0, g.current), idx = 0;
    while (idx < steps.length - 1 && cur >= steps[idx]) idx++;
    var target = steps[idx], met = cur >= target;
    var prev = idx > 0 ? steps[idx - 1] : 0, span = Math.max(1, target - prev);
    return { id: g.id, label: g.label, unit: g.unit, current: cur, target: target, left: Math.max(0, target - cur), pct: Math.min(100, Math.round(((cur - prev) / span) * 100)), met: met, step: idx + 1, steps: steps.length };
  }
  function applyEvent(cfg, ev) { // returns the goals that this event pushed over their line
    var met = [], p = ev.points || {};
    cfg.goals.list.forEach(function (g) {
      var add = p[g.kind]; if (!add) return;
      var before = goalView(g); g.current += add; var after = goalView(g);
      if ((!before.met && after.met) || (before.step < after.step)) met.push(Object.assign({}, after, { metText: g.metText, justMet: before.target }));
    });
    return met;
  }
  function metEvent(v) { return { type: 'goal', id: 'goal-' + v.id + '-' + (v.justMet || v.target), at: Date.now(), label: v.label, target: v.justMet || v.target, name: '', source: 'goal', points: {} }; }

  /* ---------- clip reactions: chat words counted while a clip plays ---------- */
  function reaction(text, cfg) { // words match as whole words (so "W" is not every message with a w in it); emoji match anywhere
    if (!cfg.clips.reactions.on) return '';
    var t = String(text || '').toUpperCase();
    for (var i = 0; i < cfg.clips.reactions.words.length; i++) {
      var w = cfg.clips.reactions.words[i]; if (!w) continue; var u = w.toUpperCase();
      if (/^[A-Z0-9 ]+$/.test(u) ? new RegExp('(^|[^A-Z0-9])' + u.replace(/ +/g, ' +') + '($|[^A-Z0-9])').test(t) : t.indexOf(u) > -1) return w;
    }
    return '';
  }

  root.PFOverlay = { TYPES: TYPES, TIER: TIER, PRIORITY: PRIORITY, defaults: defaults, build: build, merge: merge, clean: clean, encode: encode, decode: decode, fill: fill, line: line, vars: vars, parseIrc: parseIrc,
    Irc: Irc, clipSlug: clipSlug, roles: roles, fromFeed: fromFeed, Dedupe: Dedupe, Queue: Queue, goalView: goalView, applyEvent: applyEvent, metEvent: metEvent, reaction: reaction, brand: BRAND };
})(typeof globalThis !== 'undefined' ? globalThis : this);
