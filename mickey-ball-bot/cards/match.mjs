// The three pictures of a match post, drawn the way the club bots this one is modelled on draw them, in the neutral Mickey Ball Bot look:
//   boardCard   scoreboard with both crests, goals and assists, man of the match, the stats as paired rings, deeper event stats
//   pitchCard   rating by line, the pitch with every player's rating and goal/assist badges, every rating
//   reviewCard  how we lined up, what went well, what to work on, next-match targets, event data, squad recommendations
// All three are 1200 px wide. Accent is green, gold is kept for the man of the match; nothing here is tied to a club's colors.
import { page, esc, r1, crest, band, BAND, RESULT, when, POSLABEL } from './templates.mjs';

const POST_H = 1700;
const POST_CSS = `body{min-height:${POST_H}px;display:flex;flex-direction:column;border-top:8px solid var(--red)}body>*{flex:none}body>.fill{flex:1 1 auto}
.ph{padding:26px 40px 0}.ph .eyebrow{font-size:20px;display:block}
.lab{font:700 18px Inter;letter-spacing:.22em;text-transform:uppercase;color:var(--soft)}`;
const postPage = (css, body) => page(POST_CSS + css, body);
const TONE = { good: '#4be08a', even: '#efcf7a', bad: '#ff7d72' };
const SLATE = '#6b7da0';

// ---- icons ----
const RV = (d) => (c = '#fff', s = 26) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}">${d.replaceAll('$', c)}</svg>`;
export const ICON = {
  team: RV('<circle cx="8" cy="8" r="3.2" fill="$"/><circle cx="17" cy="9" r="2.6" fill="$" opacity=".7"/><path d="M2 20c0-4 3-6 6-6s6 2 6 6zM14 20c0-3 2-5 4.5-5S23 17 23 20z" fill="$"/>'),
  glove: RV('<path d="M7 21v-6.5L4.6 11a1.6 1.6 0 0 1 2.5-2L9 11V4.6a1.4 1.4 0 0 1 2.8 0V10h.4V3.6a1.4 1.4 0 0 1 2.8 0V10h.4V4.8a1.4 1.4 0 0 1 2.8 0V15c0 3-2 6-5 6z" fill="none" stroke="$" stroke-width="1.8" stroke-linejoin="round"/>'),
  shield: RV('<path d="M12 2.5l8 2.8v6.2c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V5.3z" fill="none" stroke="$" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="$" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  flow: RV('<path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4" fill="none" stroke="$" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  goal: RV('<circle cx="12" cy="12" r="10" fill="none" stroke="$" stroke-width="2"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z" fill="$"/>'),
  assist: RV('<circle cx="12" cy="12" r="9" fill="none" stroke="$" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="$" stroke-width="2"/><circle cx="12" cy="12" r="1.5" fill="$"/>'),
  chip: RV('<rect x="6" y="6" width="12" height="12" rx="2.5" fill="none" stroke="$" stroke-width="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" stroke="$" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="2" fill="$"/>'),
  check: RV('<path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="$" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  swap: RV('<path d="M4 9h14M14 5l4 4-4 4M20 16H6M10 12l-4 4 4 4" fill="none" stroke="$" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  me: RV('<circle cx="12" cy="8" r="4" fill="$"/><path d="M4 21c0-5 4-8 8-8s8 3 8 8z" fill="$"/>'),
};
const icon = (k, c, s) => (ICON[k] ?? ICON.team)(c, s);
const MEDAL = (c = '#efcf7a', s = 40) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}"><path d="M6.5 1.5h4l2 6.5-3 .6zM17.5 1.5h-4l-2 6.5 3 .6z" fill="${c}" opacity=".6"/><circle cx="12" cy="15.2" r="7" fill="${c}"/><circle cx="12" cy="15.2" r="4.6" fill="none" stroke="#0b0f16" stroke-opacity=".45" stroke-width="1.4"/><path d="M12 11.8l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z" fill="#0b0f16" fill-opacity=".5"/></svg>`;
const GENERIC_BUST = (h = 200) => `<svg viewBox="0 0 200 232" width="${Math.round(h * 0.86)}" height="${h}" style="display:block"><defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a9a8c"/><stop offset="1" stop-color="#46605a"/></linearGradient></defs><path d="M4 232c0-46 38-70 96-70s96 24 96 70z" fill="url(#gb)"/><ellipse cx="100" cy="86" rx="42" ry="50" fill="url(#gb)"/><rect x="82" y="124" width="36" height="44" rx="14" fill="url(#gb)"/></svg>`;
const initials = (name) => String(name ?? '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?';
const avatar = (p, size, ring = null, ringW = 0) => {
  const shadow = ring ? `box-shadow:0 0 0 ${ringW}px ${ring},0 10px 24px rgba(0,0,0,.55)` : 'box-shadow:0 8px 20px rgba(0,0,0,.5)';
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex:none;${shadow};background:linear-gradient(160deg,#2f4a40,#0d1814)"><span style="display:grid;place-items:center;width:100%;height:100%;font:700 ${Math.round(size * 0.4)}px Oswald;letter-spacing:.04em;color:#cfe0d6;text-transform:uppercase">${esc(initials(p.n))}</span></span>`;
};
// ring: a donut with the number inside
const donut = (frac, color, label, size = 64) => {
  const r = 27, c = 2 * Math.PI * r, f = Math.max(0.03, Math.min(1, frac)), t = String(label);
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}"><circle cx="32" cy="32" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="6"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/><text x="32" y="${t.length > 3 ? 37 : 39}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${t.length > 3 ? 17 : t.length > 2 ? 20 : 24}" fill="#fff">${esc(t)}</text></svg>`;
};

// ---- pitch (shared by the pitch picture and the review's "how we lined up") ----
const GR = [['goalkeeper', 7], ['defender', 27], ['midfielder', 52], ['forward', 79]];
const LATS = { 1: [.5], 2: [.3, .7], 3: [.18, .5, .82], 4: [.1, .37, .63, .9], 5: [.08, .29, .5, .71, .92] };
const slotsOf = (players) => {
  const out = [];
  for (const [pos, bx] of GR) {
    const g = players.filter((p) => p.pos === pos).sort((a, b) => b.r - a.r);
    const lat = LATS[g.length] ?? g.map((_, j) => .08 + .84 * j / Math.max(1, g.length - 1));
    g.forEach((p, j) => out.push({ p, x: g.length >= 4 ? bx + (j % 2 ? 6.5 : -6.5) : bx, y: 14 + 50 * lat[j] }));
  }
  return out;
};
const PITCH_SVG = `<svg viewBox="0 0 105 68" style="position:absolute;inset:0;width:100%;height:100%"><defs><radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient></defs>
<rect width="105" height="68" fill="#14502e"/>${Array.from({ length: 7 }, (_, k) => `<rect x="${7.5 + 15 * k}" width="7.5" height="68" fill="#17603a"/>`).join('')}<g fill="none" stroke="#ffffffb0" stroke-width=".3"><rect x="1" y="1" width="103" height="66"/><line x1="52.5" y1="1" x2="52.5" y2="67"/><circle cx="52.5" cy="34" r="9.15"/><rect x="1" y="13.84" width="16.5" height="40.32"/><rect x="1" y="24.84" width="5.5" height="18.32"/><rect x="87.5" y="13.84" width="16.5" height="40.32"/><rect x="98.5" y="24.84" width="5.5" height="18.32"/></g><rect width="105" height="68" fill="url(#vig)"/></svg>`;
const markers = (players, scale = 1) => slotsOf(players).map(({ p, x, y }) => {
  const b = band(p.r, p.mom), c = BAND[b], big = b === 'gold', sz = Math.round((big ? 92 : 76) * scale);
  const ev = (p.g ? `<span class="ev">${icon('goal', '#0b0f16', 22)}${p.g > 1 ? `<small>×${p.g}</small>` : ''}</span>` : '') + (p.a ? `<span class="ev as">${icon('assist', '#0b0f16', 22)}</span>` : '');
  const nm = String(p.n).length > 13 ? `${String(p.n).slice(0, 12)}…` : p.n;
  return `<div class="pl" style="left:${(x / 105) * 100}%;top:${(y / 68) * 100}%"><div class="fw">${avatar(p, sz, c, big ? 7 : 5)}<span class="rt ${big ? 'g' : ''}" style="${big ? '' : `border-color:${c};color:${c}`}">${r1(p.r)}</span>${ev ? `<span class="evs">${ev}</span>` : ''}${big ? `<span class="crown">${MEDAL('#2d1f06', 30)}</span>` : ''}</div><div class="nm ${big ? 'g' : ''}">${esc(nm)}</div></div>`;
}).join('');
const PITCH_CSS = `.pl{position:absolute;transform:translate(-50%,-44%);display:grid;justify-items:center}
.fw{position:relative}.rt{position:absolute;left:50%;bottom:-18px;transform:translateX(-50%);font:700 28px/1 Oswald;background:#0b130f;border:3px solid;border-radius:999px;padding:3px 12px 2px;white-space:nowrap}
.rt.g{background:var(--gold);color:#2d1f06;border-color:#fff1c2;font-size:34px}
.nm{margin-top:24px;font:700 25px Inter;color:#fff;text-shadow:0 0 6px #0b130f,0 0 3px #0b130f,0 2px 6px #0b130f;white-space:nowrap}.nm.g{color:#fff1c2;font-size:27px}
.evs{position:absolute;left:-14px;top:-8px;display:flex;flex-direction:column;gap:4px}
.ev{display:flex;align-items:center;background:#fff;border-radius:999px;padding:4px 7px;box-shadow:0 3px 10px rgba(0,0,0,.5);font:700 18px Oswald;gap:2px}.ev small{font-size:18px;color:#0b130f}.ev.as{background:#efcf7a}
.crown{position:absolute;right:-12px;top:-14px;width:46px;height:46px;border-radius:50%;background:var(--gold);display:grid;place-items:center;box-shadow:0 4px 14px rgba(0,0,0,.55)}`;

// ======================================== 1. the board ========================================
export function boardCard(mp, club) {
  const rowOf = (r) => {
    const none = r.b == null;
    const d = none ? 0 : r.a - r.b, tol = r.tol ?? 0, good = r.lower ? d < 0 : d > 0;
    const tone = none || Math.abs(d) <= tol ? 'even' : good ? 'good' : 'bad';
    const frac = (v) => (r.kind === 'pct' ? v / 100 : r.kind === 'rate' ? v / 10 : v / ((r.a + (r.b ?? 0)) || 1));
    const lab = (v) => (v == null ? '–' : r.kind === 'pct' ? `${v}%` : r.kind === 'rate' ? (+v).toFixed(1) : `${v}`);
    const sign = d > 0 ? '+' : d < 0 ? '−' : '';
    const delta = r.kind === 'pct' ? `${sign}${Math.abs(d)} pts` : r.kind === 'rate' ? `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}` : `${sign}${Math.abs(d)}`;
    return `<div class="sr"><div class="dc">${donut(frac(r.a), TONE[tone], lab(r.a))}</div><div class="sm"><span>${esc(r.k)}</span>${none ? '' : `<b class="chipd ${tone}">${tone === 'even' ? 'Level' : delta}</b>`}</div><div class="dc">${none ? donut(0, SLATE, '–') : donut(frac(r.b), SLATE, lab(r.b))}</div></div>`;
  };
  const crow = (p) => `<div class="cr"><b class="osw">${esc(String(p.n).length > 14 ? `${String(p.n).slice(0, 13)}…` : p.n)}</b><span class="ic">${icon('goal', '#4ee0ad', 32).repeat(p.g)}${icon('assist', '#efcf7a', 32).repeat(p.a)}</span></div>`;
  const motm = mp.motm, name = String(club?.name ?? ''), opp = String(mp.opp), shortName = name.replace(/\s+FC$/i, '');
  const motmCell = motm ? `<div class="mo"><div class="glow"></div><div class="bw">${GENERIC_BUST(200)}<span class="mb">${MEDAL('#efcf7a', 46)}</span></div><div class="ml"><div class="lab gold">${MEDAL('#efcf7a', 26)}<span>Man of<br>the match</span></div><div class="mt"><b class="osw" style="font-size:${Math.max(22, Math.min(34, Math.floor(165 / (String(motm.n).length * 0.47))))}px">${esc(motm.n)}</b><em class="osw gold">${r1(motm.r)}</em></div></div></div>` : '';
  const d = mp.deeper;
  const deeperHtml = d ? `<div class="dh"><span class="lab" style="font-size:26px;color:#e1e8f5;letter-spacing:.3em">Deeper stats</span><span class="cov">EA event counters · ${d.cover.us} of ${d.cover.of} of ours${d.cover.them ? `, ${d.cover.them} of ${d.cover.ofThem} of theirs` : ''}</span></div>${d.rows.map(rowOf).join('')}` : '';
  return postPage(`
.sb{text-align:center}.srow{display:grid;grid-template-columns:1fr 420px 1fr;align-items:center;margin-top:14px}
.team{display:grid;justify-items:center;gap:6px}.team b{font:600 40px/1.1 Oswald;letter-spacing:.06em;text-transform:uppercase;max-width:330px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mid b{display:block;font:700 176px/1 Oswald;text-shadow:0 10px 50px rgba(25,201,140,.5)}.mid .pill{margin-top:-6px}
.gm{display:grid;grid-template-columns:1fr 400px;margin:20px 40px 0;border-top:2px solid rgba(255,255,255,.1);padding-top:20px;min-height:214px;align-items:stretch}
.gl{padding-right:30px;display:grid;align-content:center}.legend{display:flex;gap:24px;font:600 22px Inter;color:#b9cfc4;margin-bottom:6px}.legend span{display:inline-flex;align-items:center;gap:8px}
.cr{display:flex;justify-content:space-between;align-items:center;height:52px;border-bottom:1px solid rgba(255,255,255,.07)}.cr b{font:600 28px/1 Oswald;letter-spacing:.04em}.ic{display:inline-flex;gap:8px}
.mo{position:relative;contain:size;border-left:2px solid rgba(239,207,122,.4);padding-left:32px;display:grid;align-items:center}
.ml{display:grid;gap:14px;max-width:196px;z-index:2}.ml .lab{display:flex;align-items:center;gap:10px;font-size:19px;line-height:1.25;letter-spacing:.13em;white-space:nowrap}.ml .lab svg{flex:none}
.mt{display:grid;text-align:left}.mt b{font:600 34px/1.05 Oswald;letter-spacing:.04em;white-space:nowrap}.mt em{font:700 60px/1.05 Oswald;font-style:normal}
.bw{position:absolute;right:30px;top:50%;height:70%;max-height:168px;aspect-ratio:200/232;line-height:0;z-index:1;transform:translateY(-50%)}.bw svg{width:100%;height:100%}
.mb{position:absolute;left:-14px;bottom:6px;line-height:0;filter:drop-shadow(0 4px 10px rgba(0,0,0,.55))}
.glow{position:absolute;right:-30px;top:-10px;bottom:-30px;aspect-ratio:1;background:radial-gradient(closest-side,rgba(239,207,122,.13),rgba(239,207,122,.05) 55%,rgba(239,207,122,0));z-index:0}
.st{margin:18px 40px 0;border-top:2px solid rgba(255,255,255,.1)}
.sr,.sh{display:grid;grid-template-columns:340px 1fr 340px;align-items:center}.sr{height:132px;border-bottom:1px solid rgba(255,255,255,.07)}
.dc{display:flex;flex-direction:row;align-items:center;justify-content:center;gap:14px}.sh{height:84px}.sh .lab{font-size:26px;color:#e1e8f5}
.sm{text-align:center;display:grid;justify-items:center;gap:10px}.sm span{font:700 25px Inter;letter-spacing:.14em;text-transform:uppercase;color:#e1e8f5}
.chipd{font:700 26px/1 Oswald;letter-spacing:.06em;padding:6px 16px 4px;border-radius:999px;border:2px solid}
.chipd.good{color:#4be08a;background:rgba(75,224,138,.12);border-color:rgba(75,224,138,.45)}.chipd.even{color:#efcf7a;background:rgba(239,207,122,.12);border-color:rgba(239,207,122,.45)}.chipd.bad{color:#ff7d72;background:rgba(255,125,114,.12);border-color:rgba(255,125,114,.45)}
.dh{display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid rgba(255,255,255,.1);margin-top:6px;padding:20px 0 4px}.cov{font:500 21px Inter;color:var(--mute)}
.key{display:flex;gap:30px;justify-content:center;padding:14px 0 28px;font:600 22px Inter;color:#b9cfc4}.key i{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:9px}`,
  `<div class="sb ph"><div class="eyebrow">${esc(name)} · ${esc(mp.mode)} · ${esc(when(mp.ts))}</div>
  <div class="srow"><div class="team">${crest(club?.crest, name, 150, true)}<b class="osw">${esc(shortName)}</b></div>
  <div class="mid"><b class="osw">${mp.gf}–${mp.ga}</b><span class="pill ${mp.res}">${RESULT[mp.res] ?? ''}</span></div>
  <div class="team">${crest(mp.oppCrest, opp, 150, false)}<b class="osw">${esc(opp)}</b></div></div></div>
<div class="gm"><div class="gl"><div class="legend"><span>${icon('goal', '#4ee0ad', 30)}Goal</span><span>${icon('assist', '#efcf7a', 30)}Assist</span></div>${mp.contrib.slice(0, 6).length ? mp.contrib.slice(0, 6).map(crow).join('') : '<div class="cr"><b class="osw">No goals for us</b></div>'}</div>${motmCell}</div>
<div class="st"><div class="sh"><div class="dc">${crest(club?.crest, name, 54, true)}<span class="lab">${esc(shortName.length > 12 ? `${shortName.slice(0, 11)}…` : shortName)}</span></div><div class="sm"></div><div class="dc">${crest(mp.oppCrest, opp, 54, false)}<span class="lab">${esc(opp.length > 12 ? `${opp.slice(0, 11)}…` : opp)}</span></div></div>
${mp.rows.map(rowOf).join('')}${deeperHtml}
<div class="key"><span><i style="background:#4be08a"></i>Ahead</span><span><i style="background:#efcf7a"></i>Level</span><span><i style="background:#ff7d72"></i>Behind</span></div></div><div class="fill"></div><div class="brand">${esc(name)}</div>`);
}

// ======================================== 2. the pitch ========================================
export function pitchCard(mp, club) {
  const name = String(club?.name ?? ''), opp = String(mp.opp);
  const rank = [...mp.players].sort((a, b) => b.r - a.r || String(a.n).localeCompare(String(b.n)));
  const lines = mp.lines.map((l) => { const c = BAND[band(l.r)]; return `<div class="ln"><b class="osw" style="color:${c}">${r1(l.r)}</b><div class="lb"><i style="height:${Math.max(20, Math.min(100, Math.round(((l.r - 6) / 2) * 100)))}%;background:${c}"></i></div><span class="lab">${l.t}</span></div>`; }).join('');
  const ring = `<div class="tr">${donut(mp.avg / 10, '#efcf7a', r1(mp.avg), 78)}</div>`;
  return postPage(`${PITCH_CSS}
.ph.pt .big{font:700 52px/1.05 Oswald;letter-spacing:.03em;text-transform:uppercase;margin-top:4px;display:block}
.ln4{display:grid;grid-template-columns:repeat(${Math.max(1, mp.lines.length)},1fr);gap:20px;margin:10px 40px 0;padding:16px 0 50px;border-top:2px solid rgba(255,255,255,.1);position:relative}
.ln{display:grid;justify-items:center;gap:6px;grid-template-rows:auto 48px auto}.ln b{font:700 32px/1 Oswald}.lb{display:flex;align-items:flex-end;width:52px;height:48px;border-radius:10px;background:rgba(255,255,255,.06)}.lb i{display:block;width:100%;border-radius:10px}.ln .lab{font-size:21px;color:#e1e8f5}
.cap{position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:19px}
.fv{padding:0 40px}.pitch{position:relative;width:1120px;height:725px;border-radius:24px;overflow:hidden;box-shadow:0 0 0 2px rgba(255,255,255,.08)}
.hud{position:absolute}.hud.l{left:26px;top:22px}.hud.r{right:26px;top:16px;display:flex;flex-direction:column;align-items:center;gap:2px}
.eb{font:800 21px Inter;letter-spacing:.3em;text-transform:uppercase;color:#ffffffb8;text-shadow:0 2px 6px #0b130f}
.fkey{display:flex;gap:28px;justify-content:center;flex-wrap:wrap;padding:18px 0 34px;font:600 22px Inter;color:#b9cfc4}.fkey i{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:9px}
.rl{display:grid;grid-template-columns:1fr 1fr;gap:0 36px;margin:6px 40px 0;padding-bottom:30px}.rr{display:grid;grid-template-columns:70px 1fr 64px 76px;align-items:center;gap:10px;height:58px;border-bottom:1px solid rgba(255,255,255,.07)}
.rr b{font:700 30px/1 Oswald}.rr .nm2{font:700 25px Inter;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rr .ps{font:700 18px Inter;letter-spacing:.18em;color:var(--soft)}.rr .ge{font:700 22px Oswald;color:#efcf7a;text-align:right}`,
  `<div class="ph pt"><div class="eyebrow">${esc(name)} · Field view · vs ${esc(opp)}</div><div class="big">${mp.gf}–${mp.ga} · ${RESULT[mp.res] ?? ''}</div></div>
<div class="ln4">${lines}<span class="lab cap">Rating by line</span></div>
<div class="fv"><div class="pitch">${PITCH_SVG}<div class="hud l"><span class="eb">Field view</span></div><div class="hud r">${ring}<span class="eb">Team rating</span></div>${markers(mp.players)}</div>
<div class="fkey"><span><i style="background:#efcf7a"></i>Man of the match</span><span><i style="background:#4be08a"></i>7 and up</span><span><i style="background:#ff9f43"></i>6 to 6.9</span><span><i style="background:#ff7d72"></i>Under 6</span></div></div>
<div style="margin:6px 40px 0"><div class="lab" style="border-bottom:2px solid var(--line);padding-bottom:8px">Every rating</div></div>
<div class="rl">${rank.map((p) => { const c = BAND[band(p.r, p.mom)]; return `<div class="rr"><b style="color:${c}">${r1(p.r)}</b><span class="nm2">${esc(p.n)}</span><span class="ps">${esc(POSLABEL[p.pos] ?? '')}</span><span class="ge">${p.g ? `${p.g}G ` : ''}${p.a ? `${p.a}A` : ''}</span></div>`; }).join('')}</div>
<div class="fill"></div><div class="brand">${esc(name)}</div>`);
}

// ======================================== 3. the review ========================================
export function reviewCard(model, club) {
  const name = String(club?.name ?? '');
  const head = (ic, t) => `<div class="sh2"><span class="si">${icon(ic, '#04130d', 26)}</span><b class="osw">${esc(t)}</b></div>`;
  const row = (r, label) => `<div class="rw"><span class="ri">${icon(r.icon, '#fff', 26)}</span><div><b>${esc(r.lead ?? r.t)}</b><p>${label ? `<i>${label}</i>` : ''}${esc(r.text ?? r.tr)}</p>${r.why ? `<p class="wy">${esc(r.why)}</p>` : ''}</div></div>`;
  const empty = '<div class="rw dim"><span class="ri"></span><div><b>Nothing more to flag</b></div></div>';
  const fillTo = (arr, k, f) => [...arr.slice(0, k).map(f), ...Array.from({ length: Math.max(0, Math.min(k, Math.max(arr.length, 2)) - arr.length) }, () => empty)].join('');
  const nextHtml = model.next.map((t) => { const frac = t.lower ? Math.min(1, t.b / Math.max(1, t.a)) : Math.min(1, t.a / Math.max(1, t.b)); return `<div class="nx">${donut(frac, '#efcf7a', `${t.a}${t.u}`, 84)}<span>${esc(t.k)}</span><b class="osw">${t.lower ? 'Under' : 'Target'} ${t.b}${t.u}</b></div>`; }).join('');
  const ev = model.ev;
  const evv = (v, u) => (v == null ? '–' : `${v}${u ?? ''}`);
  const evHtml = ev ? `<div class="sec">${head('flow', 'From the event data')}<span class="evc">EA event counters for ${ev.apps} of ${ev.of} of our players · us first, then ${esc(model.opp)}</span><div class="evg">${ev.rows.map((r) => {
    const mx = Math.max(+r.a || 0, +r.b || 0, r.u === '%' ? 100 : 1);
    return `<div class="evt"><span>${esc(r.k)}</span><div class="evr">${donut((+r.a || 0) / mx, '#4be08a', evv(r.a, r.u), 66)}<em>vs</em>${r.b == null ? donut(0, SLATE, '–', 66) : donut((+r.b || 0) / mx, SLATE, evv(r.b, r.u), 66)}</div></div>`; }).join('')}</div></div>`
    : `<div class="sec">${head('flow', 'Event data')}<p class="evn">No event counters for this match. EA keeps them only for recent matches, so earlier games cannot be filled in.</p></div>`;
  const sh = model.shape;
  const lineRings = ['GK', 'DEF', 'MID', 'FWD'].map((g) => { const ps = sh.players.filter((p) => p.g === g); const r = ps.length ? ps.reduce((t, p) => t + p.r, 0) / ps.length : null; return `<div class="lr">${r == null ? donut(0, SLATE, '–', 78) : donut(r / 10, BAND[band(r)], r1(r), 78)}<span>${g}</span></div>`; }).join('');
  return postPage(`${PITCH_CSS}
.big{font:700 70px/1.05 Oswald;letter-spacing:.03em;margin-top:4px;display:block;text-transform:uppercase}.sub{font:600 25px/1.3 Inter;color:var(--soft);margin-top:2px}
.sec{margin:22px 40px 0}.two{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin:0 40px}.two .sec{margin:22px 0 0}
.sh2{display:flex;align-items:center;gap:12px;border-bottom:2px solid var(--line);padding-bottom:9px;margin-bottom:4px}.sh2 b{font:600 31px/1 Oswald;letter-spacing:.08em}.si{display:inline-flex;width:40px;height:40px;border-radius:11px;background:var(--red);align-items:center;justify-content:center}
.lu{display:grid;grid-template-columns:600px 1fr;gap:28px;align-items:center;margin-top:12px}.mini{position:relative;width:600px;height:388px;border-radius:14px;overflow:hidden;box-shadow:0 0 0 2px rgba(255,255,255,.08)}.mini .scale{position:absolute;left:0;top:0;width:1120px;height:725px;transform:scale(.5357);transform-origin:0 0}
.lf{display:grid;gap:4px}.lf b{font:700 76px/1 Oswald;letter-spacing:.04em}.lf>span{font:700 26px/1.2 Inter;color:#e1ece6}.lf em{font:500 21px/1.3 Inter;color:var(--mute);font-style:normal;margin-top:6px}
.lrs{display:flex;gap:18px;margin:10px 0 6px}.lr{display:grid;justify-items:center;gap:2px}.lr span{font:700 18px Inter;letter-spacing:.2em;color:var(--soft)}
.rw{display:grid;grid-template-columns:46px 1fr;gap:14px;padding:9px 0;border-bottom:1px solid var(--line);align-items:start;min-height:104px}.rw:last-child{border-bottom:0}
.ri{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid var(--line);display:grid;place-items:center}.rw.dim{opacity:.35}.rw.dim b{color:var(--soft)}
.rw b{font:800 25px/1.2 Inter;color:#fff;display:block}.rw p{font:500 22px/1.3 Inter;color:#cfe0d6;margin-top:3px}.rw p.wy{font-size:20px;color:var(--mute)}.rw i{font:800 17px Inter;letter-spacing:.16em;text-transform:uppercase;font-style:normal;color:#7be3bd;margin-right:10px}
.nxh{margin-top:18px}.nxs{display:grid;grid-template-columns:repeat(3,1fr);margin-top:10px}.nx{display:grid;justify-items:center;gap:2px;text-align:center}.nx span{font:700 20px Inter;color:#cfe0d6;margin-top:6px}.nx b{font:600 24px/1 Oswald;letter-spacing:.04em}
.evc{display:block;font:500 20px Inter;color:var(--mute);margin-top:6px}.evg{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 24px;margin-top:10px}.evt{display:grid;justify-items:center;gap:6px;padding:8px 0}.evt>span{font:700 18px Inter;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);text-align:center}.evr{display:flex;align-items:center;gap:10px}.evr em{font:600 18px Inter;font-style:normal;color:var(--mute)}.evn{font:500 20px/1.35 Inter;color:var(--mute);margin-top:10px}
.last{padding-bottom:34px}.rg{display:grid;grid-template-columns:1fr 1fr;gap:0 36px}.rg .rw{min-height:0}`,
  `<div class="ph"><div class="eyebrow">${esc(name)} · Match review · vs ${esc(model.opp)}</div><div class="big">${esc(model.title)}</div><div class="sub">${esc(model.sub)}</div></div>
<div class="sec">${head('me', 'How we lined up')}<div class="lu"><div class="mini"><div class="scale">${PITCH_SVG}${markers(sh.players.map((p) => ({ n: p.n, pos: p.pos, r: p.r, g: p.goals, a: p.assists, mom: p.mom })), 0.9)}</div></div><div class="lf"><b class="osw">${esc(sh.label)}</b><span>${sh.humans} player${sh.humans === 1 ? '' : 's'}${sh.ai ? ` and ${sh.ai} AI slot${sh.ai === 1 ? '' : 's'}` : ''}</span><div class="lrs">${lineRings}</div><em>Shape from where the players lined up; the rings are the rating of each line. EA does not record which slot the AI took.</em></div></div></div>
<div class="two"><div class="sec">${head('check', 'What went well')}${fillTo(model.good, 4, (g) => row(g))}</div>
<div class="sec">${head('assist', 'What to work on')}${fillTo(model.work, Math.max(2, Math.min(4, model.good.length)), (g) => row(g))}${nextHtml ? `<div class="nxh">${head('goal', 'Next match')}<div class="nxs">${nextHtml}</div></div>` : ''}</div></div>
${evHtml}
${model.recs.length ? `<div class="sec last">${head('swap', 'Recommendations for the squad')}<div class="rg">${model.recs.map((r) => row(r, 'Try')).join('')}</div></div>` : '<div style="height:34px"></div>'}
<div class="fill"></div><div class="brand">${esc(name)}</div>`);
}

// ======================================== 4. the session recap's matches card ========================================
export function recapCard(r, club) {
  const name = String(club?.name ?? ''), cnt = r.count;
  const title = r.w === cnt ? `${cnt} WON, 0 DRAWN, 0 LOST` : `${r.w} WON, ${r.d} DRAWN, ${r.l} LOST`;
  const row = (m) => `<div class="mr"><span class="pill ${m.res}">${RESULT[m.res].toUpperCase()}</span>${crest(club?.crest, name, 58, true)}<b class="sc osw">${m.gf}–${m.ga}</b>${crest(m.oppCrest, m.opp, 58, false)}
<span class="op"><b>${esc(m.opp)}</b><small>${m.scorers.length ? m.scorers.map((s) => `${esc(s.n)}${s.g > 1 ? ` ×${s.g}` : ''}`).join(', ') : 'no scorers'}</small></span><span class="rt2"><small>${esc(m.mode.toUpperCase())}</small>${m.motm ? `<em>★ ${esc(m.motm)}</em>` : ''}</span></div>`;
  return page(`.wrap{padding:36px 44px 64px}.eb2{font:800 20px Inter;letter-spacing:.3em;text-transform:uppercase;color:#7be3bd}h1{font:700 60px/1.05 Oswald;text-transform:uppercase;margin:8px 0 22px}
.mr{display:grid;grid-template-columns:96px 58px 118px 58px minmax(0,1fr) 250px;align-items:center;column-gap:16px;height:104px;border-top:1px solid rgba(255,255,255,.08)}
.sc{font-size:54px;text-align:center}.op b{display:block;font:700 34px Inter;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.op small{display:block;font:500 22px Inter;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.rt2{text-align:right}.rt2 small{display:block;font:700 18px Inter;letter-spacing:.2em;color:var(--soft)}.rt2 em{display:block;font:600 24px Inter;font-style:normal;color:var(--g2);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pill{font-size:21px;padding:5px 0;text-align:center}`,
  `<div class="wrap"><div class="eb2">${esc(name)} · Session recap</div><h1>${title}</h1>${r.matches.map(row).join('')}</div><div class="brand">${esc(name)}</div>`);
}
