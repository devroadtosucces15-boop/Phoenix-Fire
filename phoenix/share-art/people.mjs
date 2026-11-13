// The community: chest-up flat cartoon players in one shared Phoenix shirt, different people each (age, sex, skin, hair, extras).
// Same look as the card studio spec (bot/cardstudio.js): flat cel shading, bold black outlines, chest up, big number on the chest.
const INK = '#0a0705', SHIRT = '#e8651a', TRIM = '#fff4e0', GOLD = '#f5b82e';
const O = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;
const PEOPLE = [
  { skin: '#7a4a2b', shade: '#63391f', hair: 'afro', hc: '#14100d', n: '7', mood: 'grin', note: 'woman, afro' },
  { skin: '#f1c9a5', shade: '#d9a982', hair: 'short', hc: '#b5541d', beard: '#b5541d', cap: true, n: '10', mood: 'smile', note: 'man, ginger beard, cap' },
  { skin: '#c98e5d', shade: '#a9733f', hair: 'hijab', hc: '#14100d', n: '9', mood: 'grin', note: 'woman, hijab' },
  { skin: '#8a5a38', shade: '#6f4528', hair: 'bald', hc: '#cfcfcf', stache: '#cfcfcf', glasses: true, wrinkle: true, n: '4', mood: 'smile', note: 'older man, glasses' },
  { skin: '#f6d9bd', shade: '#dcb996', hair: 'bob', hc: '#14100d', n: '11', mood: 'smile', note: 'woman, bob' },
  { skin: '#5b3a24', shade: '#47291a', hair: 'fade', hc: '#0d0a08', phones: true, n: '23', mood: 'grin', young: true, note: 'teen, headphones' },
  { skin: '#f3cfb0', shade: '#dcae88', hair: 'bun', hc: '#d6d6d6', freckles: true, wrinkle: true, n: '5', mood: 'smile', note: 'older woman, bun' },
];
const face = (p) => {
  const mouth = p.mood === 'grin'
    ? `<path d="M-11 12Q0 26 11 12Z" fill="#fff" ${O} stroke-width="3"/>`
    : `<path d="M-9 14Q0 22 9 14" fill="none" ${O} stroke-width="3"/>`;
  return `<ellipse cx="-10" cy="-2" rx="4.4" ry="5.2" fill="#fff"/><ellipse cx="10" cy="-2" rx="4.4" ry="5.2" fill="#fff"/>
<circle cx="-9" cy="-1.5" r="2.8" fill="${INK}"/><circle cx="11" cy="-1.5" r="2.8" fill="${INK}"/>
<path d="M-17 -12Q-10 -17 -3 -12M3 -12Q10 -17 17 -12" fill="none" stroke="${p.hair === 'hijab' || p.hair === 'bald' ? p.hc : p.hc}" stroke-width="4" stroke-linecap="round"/>
<path d="M0 3Q-4 9 1 10" fill="none" stroke="${p.shade}" stroke-width="3" stroke-linecap="round"/>${mouth}
${p.freckles ? `<g fill="${p.shade}"><circle cx="-14" cy="7" r="1.4"/><circle cx="-9" cy="9" r="1.4"/><circle cx="14" cy="7" r="1.4"/><circle cx="9" cy="9" r="1.4"/></g>` : ''}
${p.wrinkle ? `<path d="M-20 -17Q0 -24 20 -17M-14 20Q-10 24 -6 22M14 20Q10 24 6 22" fill="none" stroke="${p.shade}" stroke-width="2"/>` : ''}
${p.stache ? `<path d="M-13 9Q0 3 13 9Q8 15 0 11Q-8 15 -13 9Z" fill="${p.stache}" ${O} stroke-width="2.5"/>` : ''}
${p.glasses ? `<g fill="none" ${O} stroke-width="3"><circle cx="-10" cy="-2" r="8"/><circle cx="10" cy="-2" r="8"/><path d="M-2 -2H2"/></g>` : ''}`;
};
const hairBack = (p) => ({
  afro: `<g fill="${p.hc}" ${O}><circle cx="-26" cy="-96" r="17"/><circle cx="26" cy="-96" r="17"/><circle cx="0" cy="-110" r="22"/><circle cx="-18" cy="-108" r="16"/><circle cx="18" cy="-108" r="16"/></g>`,
  bob: `<path d="M-30 -80C-34 -116 34 -116 30 -80L32 -52H-32Z" fill="${p.hc}" ${O}/>`,
  hijab: `<path d="M-33 -82C-33 -122 33 -122 33 -82L38 -40C20 -30 -20 -30 -38 -40Z" fill="#fff4e0" ${O}/>`,
  bun: `<circle cx="0" cy="-118" r="12" fill="${p.hc}" ${O}/>`,
}[p.hair] || '');
const hairFront = (p) => ({
  short: `<path d="M-26 -88C-26 -116 26 -116 26 -88C18 -98 6 -102 -4 -100C-14 -98 -22 -94 -26 -88Z" fill="${p.hc}" ${O}/>`,
  fade: `<path d="M-25 -90C-24 -112 24 -112 25 -90C14 -98 -14 -98 -25 -90Z" fill="${p.hc}" ${O}/>`,
  bob: `<path d="M-27 -86C-26 -114 26 -114 27 -86C16 -96 -4 -90 -27 -86Z" fill="${p.hc}" ${O}/>`,
  bun: `<path d="M-26 -88C-26 -114 26 -114 26 -88C14 -100 -14 -100 -26 -88Z" fill="${p.hc}" ${O}/>`,
  afro: '',
  hijab: `<path d="M-26 -84C-26 -110 26 -110 26 -84C20 -92 -20 -92 -26 -84Z" fill="#fff4e0" ${O}/>`,
  bald: `<path d="M-26 -84C-30 -92 -28 -98 -22 -100M26 -84C30 -92 28 -98 22 -100" fill="none" stroke="${p.hc}" stroke-width="6" stroke-linecap="round"/>`,
}[p.hair] || '');
const one = (p, i, x) => `<g transform="translate(${x} 596) scale(${p.young ? 1.0 : 1.12})"><g class="crowd" style="animation-delay:${-(i * 0.37).toFixed(2)}s">
${hairBack(p)}
<rect x="-10" y="-62" width="20" height="18" fill="${p.shade}" ${O}/>
<path d="M-60 44L-60 0C-60 -34 -44 -46 -18 -52L18 -52C44 -46 60 -34 60 0L60 44Z" fill="${SHIRT}" ${O}/>
<path d="M-60 0C-60 -22 -54 -34 -46 -40L-38 -12L-38 0Z" fill="${INK}" opacity=".28"/>
<path d="M-20 -52L0 -34L20 -52" fill="${TRIM}" ${O}/>
<circle cx="-30" cy="-30" r="6" fill="${GOLD}" ${O} stroke-width="2.5"/>
<text x="8" y="-8" text-anchor="middle" font-family="Oswald,Impact,'Arial Black',sans-serif" font-weight="900" font-size="30" fill="${TRIM}" stroke="${INK}" stroke-width="5" paint-order="stroke">${p.n}</text>
${p.phones ? `<path d="M-30 -48Q-34 -60 -20 -58M30 -48Q34 -60 20 -58" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M-30 -48Q-34 -60 -20 -58M30 -48Q34 -60 20 -58" fill="none" stroke="#ffd27a" stroke-width="4" stroke-linecap="round"/>` : ''}
<ellipse cx="0" cy="-80" rx="26" ry="30" fill="${p.skin}" ${O}/>
<ellipse cx="-26" cy="-78" rx="5" ry="8" fill="${p.skin}" ${O} stroke-width="3"/><ellipse cx="26" cy="-78" rx="5" ry="8" fill="${p.skin}" ${O} stroke-width="3"/>
${p.beard ? `<path d="M-24 -76C-24 -52 24 -52 24 -76C22 -64 12 -62 0 -62C-12 -62 -22 -64 -24 -76Z" fill="${p.beard}" ${O} stroke-width="3"/>` : ''}
<g transform="translate(0 -78)">${face(p)}</g>
${hairFront(p)}
${p.cap ? `<path d="M-27 -92C-26 -122 26 -122 27 -92Z" fill="${INK}" ${O}/><path d="M-27 -92H-6" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><circle cx="0" cy="-106" r="5" fill="${SHIRT}"/>` : ''}
</g></g>`;
export const people = () => `<g id="community">${PEOPLE.map((p, i) => one(p, i, 215 + i * 128)).join('\n')}</g>`;
