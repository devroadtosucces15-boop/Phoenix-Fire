// PF-041: chips and tabs new look (next/static/chips.js + chips.css). Dark amber selected state, sliding highlight on single-row bars only.
import fs from 'node:fs';
import vm from 'node:vm';
import { t, done } from './lib.mjs';

const rd = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = rd('next/static/chips.js'), css = rd('next/static/chips.css'), ui = rd('next/lib/ui.mjs'), rov = rd('next/static/roving.js');
t('chips.js and chips.css are linked on every page head', ui.includes('src="chips.js"') && ui.includes('href="chips.css"'));
t('no NOREX name, colour or crest in the chips files', !/norex|c8352c|080b11/i.test(src + css));
t('selected state is dark amber with the Phoenix accent', css.includes('--pc-edge:#e8651a') && css.includes('--pc-amber:#3a1c08'));
t('selected state covers chips, segmented buttons, tabs and pills', ['.chip.on', '.cx-chip.on', '.nx-pill.on', '.seg button.on', '[role=tab][aria-selected=true]'].every((s) => css.includes(s)));
t('the highlight is a pseudo-element behind the items, never over them', /\.ph-slide::before\{[^}]*z-index:-1/.test(css) && css.includes('isolation:isolate') && /pointer-events:none/.test(css));
t('motion is off with the owner switch and reduced motion', css.includes('html[data-motion=off] .ph-slide.ph-anim::before{transition:none}') && css.includes('prefers-reduced-motion:reduce'));
t('emoji and icons are not touched (no content or font changes on items)', !/font-family|::after|content:"[^"]/.test(css));
t('roving.js is unchanged in its groups so keyboard keeps working', rov.includes("GROUPS = '[role=\"tablist\"],.chips,.chipset,.seg,.cc-chips,.cx-chips,.nx-pills'"));

const ctx = { document: { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [], body: {}, fonts: null }, window: { addEventListener() {} }, MutationObserver: class { observe() {} }, setTimeout, getComputedStyle: () => ({}) };
ctx.window.document = ctx.document; vm.runInNewContext(src, ctx);
const C = ctx.window.PhoenixChips;
const row = [{ t: 4, h: 32 }, { t: 4, h: 32 }, { t: 4, h: 32 }];
t('a single row with one selected item slides', C.canSlide(1, row) === true);
t('a wrapped row never slides (a wrapped chip highlights only itself)', C.canSlide(1, [{ t: 0, h: 32 }, { t: 0, h: 32 }, { t: 40, h: 32 }]) === false);
t('items of different height on one row still count as one row', C.oneRow([{ t: 0, h: 34 }, { t: 2, h: 30 }]) === true);
t('multi-select and nothing selected do not slide', C.canSlide(2, row) === false && C.canSlide(0, row) === false);
t('a lone item does not slide', C.canSlide(1, [{ t: 0, h: 32 }]) === false);
done();
