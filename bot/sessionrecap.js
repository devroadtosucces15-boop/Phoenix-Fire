// The session recap: one post per playing session, once the session has ended (no new match for the configured idle gap).
// scripts/session-recap.mjs (GitHub Actions) finds ended sessions and sends the numbers; this Worker side decides everything about Discord:
//   - the channel comes from the Organization config purpose `session_recaps` (falls back to match_results; none = "no channel set", never a guess)
//   - one recap per session: the session key is CLAIMED in the meta table before anything is posted (atomic insert), a repeat call posts nothing,
//     and a claim whose post reached no channel is released so the next run can try again
//   POST /api/org/session-recap  (X-Phoenix-Key)  { recap }   → { posted, claimed, reason? }
import { message, header, text, facts, footer, label, sep, tagBlock, picture } from './ui.js';
import { it } from './icons.js';
import { orgName, channelsFor } from './orgconfig.js';
import { sharedKey } from './sharedkey.js';
import { settingsKey } from './settings.js';

const n = (v) => +v || 0;
const s = (v, max = 60) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const MODES = new Set(['League', 'Playoff', 'Friendly', 'Match']);

// The recap model comes over the wire: keep only plain, bounded values, so nothing it carries can mention anyone or break the panel.
export function cleanRecap(r) {
  if (!r || typeof r !== 'object' || !/^session-recap:\d+:\d+$/.test(String(r.key))) return null;
  const list = (a, max, f) => (Array.isArray(a) ? a.slice(0, max).map(f) : []);
  const count = Math.min(20, Math.max(0, Math.floor(n(r.count))));
  if (!count) return null;
  const standout = r.standout && typeof r.standout === 'object'
    ? { matches: n(r.standout.matches), of: n(r.standout.of), positioning: r.standout.positioning == null ? null : n(r.standout.positioning), lines: list(r.standout.lines, 4, (x) => ({ k: s(x.k, 40), n: s(x.n, 40), v: n(x.v), u: x.u === '%' ? '%' : '' })) }
    : null;
  return {
    key: String(r.key), club: String(r.key).split(':')[1], tag: r.tag?.label ? { label: s(r.tag.label, 40).toUpperCase(), important: !!r.tag.important } : null,
    start: n(r.start), end: n(r.end), count, w: n(r.w), d: n(r.d), l: n(r.l), gf: n(r.gf), ga: n(r.ga), cs: n(r.cs),
    modes: list(r.modes, 3, (m) => (MODES.has(m) ? m : 'Match')),
    matches: list(r.matches, 20, (m) => ({ id: s(m.id, 20), opp: s(m.opp, 40), gf: n(m.gf), ga: n(m.ga), res: ['W', 'D', 'L'].includes(m.res) ? m.res : 'D', mode: MODES.has(m.mode) ? m.mode : 'Match' })),
    scorers: list(r.scorers, 5, (p) => ({ n: s(p.n, 40), g: n(p.g), a: n(p.a) })),
    best: list(r.best, 3, (p) => ({ n: s(p.n, 40), avg: n(p.avg), apps: n(p.apps) })),
    motms: list(r.motms, 5, (p) => ({ n: s(p.n, 40), c: n(p.c) })),
    standout, work: list(r.work, 3, (x) => s(x, 160)),
  };
}

const RES = { W: 'win', D: 'draw', L: 'loss' };
export function recapMessage(env, r) {
  const name = orgName(env), diff = r.gf - r.ga;
  const title = r.w === r.count ? `${r.count} from ${r.count}` : r.l === r.count ? `${r.count} defeats` : `${r.w} won, ${r.d} drawn, ${r.l} lost`;
  const lines = r.matches.map((m) => `${it(RES[m.res])} **${m.gf}–${m.ga}** ${m.opp} · ${m.mode}`).join('\n');
  const perf = [
    ...r.scorers.map((p) => `${it('goal')} **${p.n}** ${[p.g && `${p.g} goal${p.g > 1 ? 's' : ''}`, p.a && `${p.a} assist${p.a > 1 ? 's' : ''}`].filter(Boolean).join(', ')}`),
  ].join('\n');
  const best = r.best.map((p) => `**${p.n}** ${p.avg.toFixed(1)} average over ${p.apps}`).join(' · ');
  const motm = r.motms.map((p) => `${it('motm')} **${p.n}**${p.c > 1 ? ` ×${p.c}` : ''}`).join(' · ');
  const stand = r.standout
    ? [r.standout.lines.map((x) => `**${x.k}** ${x.n} (${x.v}${x.u})`).join('\n'), r.standout.positioning != null ? `Team in position ${r.standout.positioning}% of the time.` : null, `-# From EA's event counters, ${r.standout.matches} of ${r.standout.of} matches.`].filter(Boolean).join('\n')
    : "No event counters in this session. EA keeps them only for recent matches and serves just the last 10 per type, so earlier games cannot be filled in.";
  return message({
    accent: r.w > r.l ? 'win' : r.w === r.l ? 'gold' : 'red',
    blocks: [
      tagBlock(r.tag, r.modes.join(' + ')),
      picture(env, 'recap'),
      header({ eyebrow: `${name} · Session recap`, title, sub: `<t:${r.start}:f> to <t:${r.end}:t> · ${r.count} match${r.count === 1 ? '' : 'es'}` }),
      facts([['Record', `${r.w}W ${r.d}D ${r.l}L`], ['Goals', `${r.gf}–${r.ga} (${diff >= 0 ? '+' : '−'}${Math.abs(diff)})`], ['Clean sheets', String(r.cs)]]),
      sep(), label('Matches'), text(lines),
      r.scorers.length || r.best.length || r.motms.length ? sep() : null,
      r.scorers.length ? label('Goals and assists') : null, text(perf),
      r.best.length ? label('Best average rating') : null, text(best),
      r.motms.length ? label('Man of the match') : null, text(motm),
      sep(), label('Standout stats'), text(stand),
      sep(), label('What to work on'), text(r.work.map((x) => `• ${x}`).join('\n')),
      footer('One recap per session · written from the match numbers'),
    ],
  });
}

// Claim first, post second. Returns { posted, claimed, reason }.
export async function postSessionRecap(env, recap) {
  const r = cleanRecap(recap);
  if (!r) return { posted: 0, claimed: false, reason: 'Not a session recap.' };
  const channels = await channelsFor(env, 'session_recaps', { clubId: r.club }).catch(() => []);
  if (!channels.length) return { posted: 0, claimed: false, reason: 'No session_recaps channel (or match_results fallback) is set in the Organization config.' };
  if (!env.DISCORD_BOT_TOKEN) return { posted: 0, claimed: false, reason: 'No bot token.' };
  const claim = await env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING').bind(r.key, String(Date.now())).run();
  if (!claim.meta?.changes) return { posted: 0, claimed: false, reason: 'This session was already recapped.' };
  const body = JSON.stringify(recapMessage(env, r));
  let posted = 0;
  for (const ch of channels) {
    const res = await fetch(`https://discord.com/api/v10/channels/${ch}/messages`, { method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body }).catch(() => null);
    if (res?.ok) posted++;
  }
  if (!posted) { await env.DB.prepare('DELETE FROM meta WHERE key = ?').bind(r.key).run().catch(() => {}); return { posted: 0, claimed: false, reason: 'Discord refused the post (the bot needs View Channel, Send Messages and Embed Links there).' }; }
  return { posted, claimed: true };
}

export async function sessionRecapRoute(request, env) {
  const reply = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405);
  if (!env.DISCORD_CLIENT_SECRET || sharedKey(request) !== await settingsKey(env.DISCORD_CLIENT_SECRET)) return reply({ error: 'Forbidden' }, 403);
  const b = await request.json().catch(() => ({}));
  return reply(await postSessionRecap(env, b.recap));
}
