// PF-032: effects clean-up. Fails if the pointer shadow returns, if a hidden tab keeps animating, or if a
// decorative idle animation runs forever again. Live-status pulses (dgpulse, brpulse, fxpulse) may stay endless.
import fs from 'node:fs';
import { t, done } from './lib.mjs';

const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const fx = rd('next/static/fx.js'), motionJs = rd('next/static/motion.js'), motionCss = rd('next/static/motion.css');

// pointer shadow: no listener may write the cursor position (px) into --mx / --my on panels
t('fx.js has no pointer-following spotlight', !/setProperty\('--mx', e\.clientX - r\.left \+ 'px'\)/.test(fx));
const files = ['next/static/fx.js', 'next/static/motion.js', 'next/static/pages.js', 'next/static/widgets.js', 'next/static/cards.js'];
t('no script feeds the pointer position (clientX minus left, in px) into --mx', files.every((f) => !/--mx'?,\s*(e\.)?clientX\s*-\s*\w+\.left\s*\+\s*'px'/.test(rd(f))));
t('no cursor trail or follower element', !/cursor-?(glow|trail|shadow)|ptr-?shadow/i.test(fx + motionJs));

// hidden tab
t('motion.js toggles html.pf-hidden on visibilitychange', /visibilitychange[^\n]*|pf-hidden/.test(motionJs) && /classList\.toggle\('pf-hidden', d\.hidden\)/.test(motionJs) && /addEventListener\('visibilitychange', hid\)/.test(motionJs));
t('motion.css pauses every animation under html.pf-hidden', /html\.pf-hidden \*[^{]*\{animation-play-state:paused!important\}/.test(motionCss));

// decorative idle animations measured on Club, Stats and Tactics (PF-032): each must have a finite count, never "infinite".
// Live-status pulses (dgpulse, brpulse, fxpulse) are not listed and may stay endless.
const DECOR = ['lgHalo', 'lgSweep', 'lgFloat', 'pfKeyFloat', 'pfRim', 'pfHalo', 'pfGloss', 'pfKeyBounce', 'keyring', 'shn', 'rot', 'spin'];
const css = ['next/static/header.css', 'next/static/widgets.css', 'next/static/motion.css', 'phoenix/overlay/phoenix.css'].map(rd).join('\n');
const endless = [];
for (const m of css.matchAll(/animation:([^;}]*)/g)) for (const one of m[1].split(/,(?![^(]*\))/)) {
  const name = one.trim().split(/\s+/)[0];
  if (/\binfinite\b/.test(one) && DECOR.includes(name)) endless.push(name);
}
for (const f of ['next/static/style.css', 'web/style.css']) if (/\.(crestwrap \.halo|hero-crest::before)\{[^}]*animation:pulse [^;}]*infinite/.test(rd(f))) endless.push('crest pulse in ' + f);
t('no decorative animation runs forever (' + (endless.join(', ') || 'none') + ')', endless.length === 0);
t('the hub key ring ends invisible (fill-mode forwards)', /animation:keyring [^;}]*\b3 forwards/.test(motionCss));
done();
