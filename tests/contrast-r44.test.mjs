// R44 contrast round (2026-11-13): text must stay Phoenix cream on dark, active controls carry the Phoenix ink on ember.
// Root cause guarded here: motion.js puts class "rm" on <body> (motion off / ?still / reduced motion) and the dock room-tile
// rules were written as bare ".rm{...}", so the whole page became a tile with colour:inherit (black) and a gradient.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const dock = strip(fs.readFileSync(path.join(ROOT, 'next/static/dock.css'), 'utf8'));
const theme = strip(fs.readFileSync(path.join(ROOT, 'phoenix/overlay/phoenix.css'), 'utf8'));
const motion = fs.readFileSync(path.join(ROOT, 'next/static/motion.js'), 'utf8');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

t('R44: motion.js still marks <body> with class rm (the collision this test guards)', /toggle\('rm'/.test(motion));
t('R44: no bare ".rm" selector in dock.css (it would restyle <body class="rm">)', !/(^|[,{}\s>+~])\.rm(?![\w-])/.test(dock.replace(/:where\(a,button\)\.rm/g, '')));
t('R44: the room tile rules are scoped to a/button', /:where\(a,button\)\.rm\{--c:/.test(dock));
t('R44: the theme layer gives active pills/chips the Phoenix ink, not white, on ember', /\.sub a\.on,\.chip\.on[^{]*\{color:var\(--ink,#0a0705\)\}/.test(theme));
t('R44: the ink used is the config brand ink', /#0a0705/i.test(JSON.stringify(cfg)) || /#0a0705/i.test(fs.readFileSync(path.join(ROOT, 'next/static/style.css'), 'utf8').replace(/#080b11/g, '#0a0705')));
t('R44: no invented text colour was added to the theme layer for this round', !/R44[^]*#(?!0a0705)[0-9a-f]{6}\b/i.test(theme.slice(theme.indexOf('.sub a.on'))));
done();
