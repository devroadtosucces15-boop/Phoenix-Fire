// The club icon set from the bot design system: small glyphs in the site's palette that replace generic emoji in every message.
// [svg (24×24 box), unicode fallback]. Drawn with strokes only, so no font is needed to turn them into PNGs.
// bot/ensure-emojis.mjs uploads them once as the bot's own (application) emoji; bot/icons.js looks them up at runtime.
const WIN = '#4be08a', DRAW = '#efcf7a', LOSS = '#ff7d72', L = '#e4ebf7', RED = '#f58a3d', GOLD = '#efcf7a';
const st = (c, w = 2.4) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const tile = (bg, edge) => `<rect x="1" y="1" width="22" height="22" rx="6" fill="${bg}" stroke="${edge}" stroke-width="1.2"/>`;
const medal = (a, b) => `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="url(#g)"/>`;
export const GLYPHS = {
  win: [`${tile('#12331f', '#1d6b3d')}<path d="M5.5 7l2.6 10 3.9-7 3.9 7 2.6-10" ${st(WIN, 2.2)}/>`, '🟩'],
  draw: [`${tile('#332b12', '#6d5a1f')}<path d="M8 6.5h4a5.5 5.5 0 0 1 0 11H8z" ${st(DRAW, 2.2)}/>`, '🟨'],
  loss: [`${tile('#3a1613', '#7a2a24')}<path d="M9 6v11h7" ${st(LOSS, 2.4)}/>`, '🟥'],
  first: [`${medal('#fff1c2', '#c9993a')}<path d="M9.5 9l3-2.5V17.5" ${st('#2d1f06', 2.4)}/>`, '🥇'],
  second: [`${tile('#2a3446', '#6c7890')}<path d="M8.6 9.2a3.4 3.4 0 0 1 6.4 1.4c0 2-2 3.2-6.6 6.9h6.8" ${st('#e4ebf7', 2.2)}/>`, '🥈'],
  third: [`${tile('#e8651a', '#f58a3d')}<path d="M8.5 8a3.3 3.3 0 0 1 6.2 1.2c0 1.6-1.3 2.4-3 2.6 1.8 0 3.2.9 3.2 2.6A3.6 3.6 0 0 1 8.4 16" ${st('#fff', 2.1)}/>`, '🥉'],
  motm: [`${medal('#fff1c2', '#c9993a')}<path d="M12 5l2 4.4 4.8.5-3.6 3.2 1 4.7-4.2-2.4L7.8 17.8l1-4.7L5.2 9.9 10 9.4z" fill="#2d1f06"/>`, '⭐'],
  goal: [`${tile('#e8651a', '#f58a3d')}<circle cx="12" cy="12" r="6.2" ${st('#fff', 1.8)}/><path d="M12 8.3l2.6 1.9-1 3.1h-3.2l-1-3.1z" fill="#fff"/>`, '⚽'],
  assist: [`${tile('#2a3446', '#6c7890')}<path d="M5 16c3.5-6 7.5-7.5 13-7.5M14 5l4 3.5-3.5 4" ${st(L, 2)}/>`, '🎯'],
  live: [`${tile('#3a1613', '#7a2a24')}<circle cx="12" cy="12" r="4.2" fill="#ff5a4e"/><circle cx="12" cy="12" r="7.2" ${st('#ff5a4e', 1.5)} opacity=".55"/>`, '🔴'],
  music: [`${tile('#2a3446', '#6c7890')}<path d="M10 16.5V6.5l8-1.5v9.5" ${st(L, 1.9)}/><circle cx="8" cy="16.8" r="2.3" fill="${L}"/><circle cx="16" cy="14.8" r="2.3" fill="${L}"/>`, '🎵'],
  // Pro Telemetry position category icons (matchday pitch + private position picker buttons)
  pos_att: [`${tile('#3b1212', '#ef4444')}<path d="M12 5.5L18.2 17.5H5.8Z" fill="#f87171"/>`, '🔺'],
  pos_cam: [`${tile('#3b2809', '#f59e0b')}<path d="M12 4.8L14.2 9.8L19.2 12L14.2 14.2L12 19.2L9.8 14.2L4.8 12L9.8 9.8Z" fill="#fbbf24"/>`, '✦'],
  pos_wide: [`${tile('#0b2c36', '#06b6d4')}<path d="M7 12h10M13 7.5l4.5 4.5-4.5 4.5" ${st('#22d3ee', 2.3)}/>`, '⚡'],
  pos_cdm: [`${tile('#281340', '#a855f7')}<path d="M12 5.5L18.5 12L12 18.5L5.5 12Z" fill="#c084fc"/>`, '◆'],
  pos_def: [`${tile('#0f2e1b', '#22c55e')}<path d="M12 5L18 7.5V12.2C18 15.6 15.4 18 12 19.2C8.6 18 6 15.6 6 12.2V7.5Z" fill="#4ade80"/>`, '🛡️'],
  pos_gk: [`${tile('#10234a', '#3b82f6')}<circle cx="12" cy="12" r="6" ${st('#60a5fa', 2.1)}/><circle cx="12" cy="12" r="2.6" fill="#93c5fd"/>`, '🧤'],
  // Pro Telemetry Matchday action button icons
  btn_in: [`${tile('#12331f', '#22c55e')}<path d="M6.8 12.4l3.4 3.4 7-7.4" ${st('#4ade80', 2.4)}/>`, '✅'],
  btn_maybe: [`${tile('#33260c', '#f59e0b')}<path d="M9.5 9.2a2.6 2.6 0 1 1 3.9 2.2c-.9.5-1.4 1.1-1.4 2.1" ${st('#fbbf24', 2.2)}/><circle cx="12" cy="17.2" r="1.3" fill="#fbbf24"/>`, '❔'],
  btn_out: [`${tile('#3a1613', '#ef4444')}<path d="M8 8l8 8M16 8l-8 8" ${st('#f87171', 2.4)}/>`, '✖️'],
  btn_xi: [`${tile('#3b2809', '#fbbf24')}<path d="M12 4.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" fill="#fde68a"/>`, '✦'],
  btn_roster: [`${tile('#232732', '#64748b')}<path d="M7 8h10M7 12h10M7 16h7" ${st('#e2e8f0', 2.2)}/>`, '📋'],
  btn_lineup: [`${tile('#3b2809', '#f59e0b')}<rect x="7" y="11" width="10" height="7" rx="2" ${st('#fbbf24', 2)}/><path d="M9 11V8.5a3 3 0 0 1 6 0V11" ${st('#fbbf24', 2)}/>`, '🔒'],
  btn_override: [`${tile('#232732', '#f59e0b')}<path d="M7 9h10M14 6l3 3-3 3M17 15H7M10 12l-3 3 3 3" ${st('#fcd34d', 2)}/>`, '🔁'],
  btn_resched: [`${tile('#232732', '#64748b')}<circle cx="12" cy="12" r="6.5" ${st('#e2e8f0', 1.9)}/><path d="M12 8.5V12l2.5 1.8" ${st('#fbbf24', 2)}/>`, '🕒'],
  btn_cancel: [`${tile('#3a1613', '#ef4444')}<circle cx="12" cy="12" r="6.5" ${st('#f87171', 2)}/><path d="M8.5 8.5l7 7" ${st('#f87171', 2)}/>`, '🚫'],
};
export const NAMES = Object.keys(GLYPHS);
export const svgOf = (name) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${GLYPHS[name][0]}</svg>`;
