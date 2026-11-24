// "Show my match" picture: one player's night in one match, all of it – rating, goals, assists, shots, passes, tackles and every decoded
// event counter – as tiles, rings and bars. 1200 px wide, as tall as it needs to be.
import { page, esc, r1, crest, band, BAND, RESULT, when, POSLABEL } from './templates.mjs';

const pc = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
const CSS = `
.wrap{padding:38px 44px 70px}
.head{display:flex;align-items:center;justify-content:space-between;gap:24px}
.head h1{font:700 64px/1.02 Oswald;text-transform:uppercase;letter-spacing:.02em;max-width:800px}
.sub{margin-top:10px;display:flex;align-items:center;gap:14px;font:600 24px Inter;color:var(--soft)}
.tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-top:26px}
.t{background:linear-gradient(180deg,#0f1a15,#080e0b);border:1px solid var(--line);border-radius:16px;padding:16px 16px 14px 22px;position:relative;overflow:hidden}
.t:before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--red)}
.t b{display:block;font:700 58px/1 Oswald;font-variant-numeric:tabular-nums}.t span{display:block;margin-top:6px;font:700 16px Inter;letter-spacing:.2em;text-transform:uppercase;color:var(--soft)}
.t i{display:block;margin-top:4px;font:600 17px Inter;font-style:normal;color:var(--mute)}
.sec{margin-top:30px;background:linear-gradient(180deg,#0e1814,#08100c);border:1px solid var(--line);border-radius:20px;padding:22px 26px 24px}
.sec h2{font:700 19px Inter;letter-spacing:.26em;text-transform:uppercase;color:#7be3bd;margin-bottom:14px}
.row{display:flex;gap:26px;align-items:center}
.col{flex:1;min-width:0}
.bar{display:grid;grid-template-columns:150px 1fr 44px;align-items:center;gap:12px;margin:9px 0;font:600 20px Inter;color:var(--soft)}
.bar .tr{height:16px;border-radius:9px;background:rgba(255,255,255,.07);overflow:hidden}.bar .tr i{display:block;height:100%;border-radius:9px}
.bar em{font:700 24px Oswald;font-style:normal;color:var(--text);text-align:right;font-variant-numeric:tabular-nums}
.pair{display:grid;grid-template-columns:120px 1fr 1fr;gap:14px;align-items:center;margin:11px 0}
.pair .l{font:600 20px Inter;color:var(--soft)}
.pb{display:flex;align-items:center;gap:10px;font:700 22px Oswald}.pb .tr{flex:1;height:18px;border-radius:9px;background:rgba(255,255,255,.07);overflow:hidden}.pb .tr i{display:block;height:100%;border-radius:9px}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}.chips div{background:var(--p3);border:1px solid var(--line2);border-radius:12px;padding:6px 14px;font:600 19px Inter;color:var(--soft)}.chips b{font:700 24px Oswald;color:var(--text);margin-left:6px}
.ring{position:relative;display:grid;place-items:center}.ring b{position:absolute;font:700 40px Oswald}.ring span{position:absolute;bottom:-26px;font:700 15px Inter;letter-spacing:.2em;color:var(--soft);text-transform:uppercase;white-space:nowrap}
.note{margin-top:30px;text-align:center;font:600 22px Inter;color:var(--mute)}`;

const ring = (frac, color, label, size = 118, caption = '') => {
  const r = 44, c = 2 * Math.PI * r, f = Math.max(0.02, Math.min(1, frac ?? 0));
  return `<div class="ring" style="width:${size}px;height:${size}px;margin-bottom:${caption ? 30 : 0}px"><svg viewBox="0 0 100 100" width="${size}" height="${size}"><circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="9"/>
<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/></svg><b>${esc(label)}</b>${caption ? `<span>${esc(caption)}</span>` : ''}</div>`;
};
const bar = (label, v, max, color = 'var(--red)') => `<div class="bar"><span>${esc(label)}</span><div class="tr"><i style="width:${max > 0 ? Math.max(v ? 4 : 0, Math.round((v / max) * 100)) : 0}%;background:${color}"></i></div><em>${v}</em></div>`;
const pair = (label, won, lost, max) => `<div class="pair"><div class="l">${esc(label)}</div>
<div class="pb"><div class="tr"><i style="width:${max ? Math.round((won / max) * 100) : 0}%;background:#3ddc84"></i></div>${won}</div>
<div class="pb"><div class="tr"><i style="width:${max ? Math.round((lost / max) * 100) : 0}%;background:#ff7d72"></i></div>${lost}</div></div>`;
const vsAvg = (v, avg, dec = 1) => (avg == null ? '' : `<i>avg ${(+avg).toFixed(dec)}</i>`);

export function personalCard(d, club) {
  const e = d.ev, passPct = pc(d.passes.made, d.passes.att), tackPct = pc(d.tackles.made, d.tackles.att), tone = BAND[band(d.rating, d.mom)];
  const tiles = [
    ['Goals', d.goals, vsAvg(d.goals, d.avg?.g, 2)], ['Assists', d.assists, vsAvg(d.assists, d.avg?.a, 2)],
    ['Shots', d.shots, d.shots ? `<i>${pc(d.goals, d.shots)}% scored</i>` : ''],
    ['Passes', `${d.passes.made}/${d.passes.att}`, passPct != null ? `<i>${passPct}%${d.avg?.pass != null ? ` · avg ${d.avg.pass}%` : ''}</i>` : ''],
    d.saves ? ['Saves', d.saves, ''] : ['Tackles', `${d.tackles.made}/${d.tackles.att}`, tackPct != null ? `<i>${tackPct}%${d.avg?.tackle != null ? ` · avg ${d.avg.tackle}%` : ''}</i>` : ''],
  ];
  const mx = (...v) => Math.max(1, ...v);
  let body = '';
  if (e) {
    const p = e.pass, passTot = p.done + p.failed, dirMax = mx(p.fwd, p.back, p.side), lenMax = mx(p.short, p.med, p.long, p.cross);
    body += `<div class="sec"><h2>Passing</h2><div class="row"><div>${ring(pc(p.done, passTot) != null ? p.done / passTot : 0, '#4ee0ad', pc(p.done, passTot) != null ? `${pc(p.done, passTot)}%` : '–', 150, 'completed')}</div>
<div class="col">${bar('Forward', p.fwd, dirMax)}${bar('Sideways', p.side, dirMax)}${bar('Backward', p.back, dirMax)}</div>
<div class="col">${bar('Short', p.short, lenMax, '#efcf7a')}${bar('Medium', p.med, lenMax, '#efcf7a')}${bar('Long', p.long, lenMax, '#efcf7a')}${bar('Crosses', p.cross, lenMax, '#efcf7a')}</div></div>
<div class="chips"><div>Through balls<b>${p.through}</b></div><div>First-time<b>${p.first}</b></div><div>Switches<b>${p.switches}</b></div><div>Completed<b>${p.done}</b></div><div>Failed<b>${p.failed}</b></div></div></div>`;
    const s = e.shoot, sh = s.on + s.off;
    body += `<div class="sec"><h2>Shooting &amp; dribbling</h2><div class="row"><div>${ring(sh ? s.on / sh : 0, '#efcf7a', sh ? `${pc(s.on, sh)}%` : '–', 150, 'on target')}</div>
<div class="col">${bar('On target', s.on, mx(s.on, s.off), '#3ddc84')}${bar('Off target', s.off, mx(s.on, s.off), '#ff7d72')}${bar('Inside box', s.inBox, mx(s.inBox, s.outBox), '#efcf7a')}${bar('Outside box', s.outBox, mx(s.inBox, s.outBox), '#efcf7a')}</div>
<div class="col">${bar('Dribbles', e.drib.done, mx(e.drib.done, e.drib.carried, e.drib.skill), '#4ee0ad')}${bar('Carries', e.drib.carried, mx(e.drib.done, e.drib.carried, e.drib.skill), '#4ee0ad')}${bar('Skill moves', e.drib.skill, mx(e.drib.done, e.drib.carried, e.drib.skill), '#4ee0ad')}</div></div></div>`;
    const f = e.def, defMax = mx(f.ints, f.won, f.lost, f.aer, f.disp, f.clean);
    body += `<div class="sec"><h2>Defending</h2><div class="row"><div class="col">${bar('Interceptions', f.ints, defMax, '#6aa8ff')}${bar('Tackles won', f.won, defMax, '#6aa8ff')}${bar('Tackles lost', f.lost, defMax, '#ff7d72')}</div>
<div class="col">${bar('Aerials won', f.aer, defMax, '#6aa8ff')}${bar('Dispossessed', f.disp, defMax, '#6aa8ff')}${bar('Clean tackles', f.clean, defMax, '#6aa8ff')}</div></div>
<div class="chips"><div>Standing<b>${f.stand}</b></div><div>Sliding<b>${f.slide}</b></div><div>Crosses blocked<b>${f.blocks}</b></div><div>Fouls won<b>${e.misc.foulsWon}</b></div><div>Fouls conceded<b>${e.misc.fouls}</b></div>${e.misc.yellow ? `<div>Yellows<b>${e.misc.yellow}</b></div>` : ''}</div></div>`;
    const q = e.poss, qm = mx(q.wonD, q.wonM, q.wonA, q.lostD, q.lostM, q.lostA);
    body += `<div class="sec"><h2>Possession · <span style="color:#3ddc84">won</span> vs <span style="color:#ff7d72">lost</span></h2><div class="row"><div class="col">
${pair('Own third', q.wonD, q.lostD, qm)}${pair('Mid third', q.wonM, q.lostM, qm)}${pair('Attack third', q.wonA, q.lostA, qm)}</div>
<div>${ring(e.pos.pct != null ? e.pos.pct / 100 : 0, e.pos.pct >= 85 ? '#3ddc84' : e.pos.pct >= 70 ? '#efcf7a' : '#ff7d72', e.pos.pct != null ? `${e.pos.pct}%` : '–', 150, 'in position')}</div></div></div>`;
  } else body += `<div class="note">No event data for this match, only EA’s basic stats.</div>`;
  return page(CSS, `<div class="wrap">
<div class="head"><div><div class="eyebrow">${esc(club.name)} · Player match</div><h1>${esc(d.name)} ${d.pos ? `<span class="chip">${esc(POSLABEL[d.pos] ?? d.pos)}</span>` : ''}</h1>
<div class="sub"><span class="pill ${esc(d.m.res)}">${esc(RESULT[d.m.res] ?? d.m.res)}</span><span>${d.m.gf}–${d.m.ga} vs ${esc(d.m.opp)} · ${esc(when(d.m.ts))}</span></div></div>
<div style="text-align:center">${ring(Math.min(1, d.rating / 10), tone, r1(d.rating), 150, d.mom ? '★ motm' : 'rating')}</div></div>
<div class="tiles">${tiles.map(([k, v, extra]) => `<div class="t"><b>${esc(v)}</b><span>${k}</span>${extra}</div>`).join('')}</div>
${body}</div><div class="brand">${esc(club.name)}</div>`);
}
