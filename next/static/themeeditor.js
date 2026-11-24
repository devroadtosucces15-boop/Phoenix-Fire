// Theme Studio editor (owner only): a floating button with its own logo, on every page. It opens a bottom sheet where the owner edits the
// site's look live and saves it for everyone. Colours, fonts and sizes, three looks per component, aspects to switch off, any number of
// motions, and the core effects (moved here from the Control Center). Every page and every sub-menu can have its own look: pick the
// scope at the top (Everywhere, This page, This sub-menu), change things, press Save. Visitors get it on their next load.
// A live demo sits at the top of the sheet: a small copy of the site's own parts (themedemo.html, drawn by the real stylesheets) that shows every
// change first, on its own, before anything touches the page behind. Each component shows its three looks as pictures to tap, not words.
// The saved look is one document: POST /api/controlcenter/settings/theme { scopes }, read back from GET /api/site/theme (themestudio.js).
(() => {
  const d = document, w = window;
  const T = w.PFTheme, A = w.NorexAuth, API = w.NOREX_API;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const LABEL = { accent: 'Accent', accent2: 'Accent (light)', glow: 'Glow', bg: 'Page background', surface: 'Panels', surface2: 'Fields and chips', text: 'Text', muted: 'Muted text', line: 'Borders', btnfill: 'Button fill', btntext: 'Button text', badgefill: 'Notification badge', badgetext: 'Badge text', good: 'Good / win', bad: 'Bad / loss' };
  const SITEVAR = { accent: '--red', accent2: '--red2', bg: '--ink', surface: '--p1', surface2: '--p2', line: '--line', muted: '--soft' };
  const NUM = { radius: ['Corner roundness', 'px', 1], blur: ['Glass blur', 'px', 1], border: ['Border width', 'px', 0.5], glowSize: ['Glow size', 'px', 1], shadow: ['Shadow strength', '%', 1], space: ['Spacing', '%', 1], text: ['Text size', '%', 1] };
  const COMP = {
    button: ['Buttons', ['Solid', 'Outline', 'Soft pill']], card: ['Cards and panels', ['Standard', 'Glass', 'Flat outline']], badge: ['Notification badges', ['Filled', 'Outline', 'Dot']],
    chip: ['Chips and filters', ['Standard', 'Tinted', 'Square outline']], nav: ['Navigation tabs', ['Standard', 'Underline', 'Filled pill']], dock: ['The dock', ['Standard', 'Glass', 'Minimal bar']],
    input: ['Fields', ['Standard', 'Underline', 'Soft pill']], heading: ['Headings', ['Condensed caps', 'Clean sans', 'Serif']], table: ['Tables', ['Standard', 'Lined', 'Striped']],
    icon: ['Icons', ['Colour', 'Mono', 'Accent tint']], divider: ['Section titles', ['Ribbon', 'Label and rule', 'Underline']], toggle: ['Switches', ['Round', 'Square', 'Small']],
    playercard: ['Player cards (lab upgrade)', ['Standard', 'Upgrade: foil, glow, drag', 'Upgrade, quiet']], buttonfx: ['Button feel (lab upgrade)', ['Standard', 'Upgrade: squeeze, light, ripple', 'Upgrade, quiet']],
    tilefx: ['Tiles, switches, chips (lab upgrade)', ['Standard', 'Upgrade: lift, squeeze, stretchy knob', 'Upgrade, quiet']], statusfx: ['Bell, counters, taps (lab upgrade)', ['Standard', 'Upgrade: ring, roll, ripple', 'Upgrade, quiet']],
    dockfx: ['Dock and tab bar (lab upgrade)', ['Standard', 'Upgrade: gliding pill, hop, springy ring', 'Upgrade, quiet']], overlayfx: ['Dialogs, sheets, toasts (lab upgrade)', ['Standard', 'Upgrade: grows from button, springy, flick away', 'Upgrade, quiet']], vizfx: ['Charts and numbers (lab upgrade)', ['Standard', 'Upgrade: smooth bars, orb cascade, drawing dot', 'Upgrade, quiet']],
    hubfx: ['Hub entrance (lab upgrade)', ['Standard', 'Upgrade: steel doors, crest strike, flies to header', 'Upgrade, quiet']], scrollfx: ['Scrolling (lab upgrade)', ['Standard', 'Upgrade: rows lean, header shrinks, progress line', 'Upgrade, quiet']],
    tapfx: ['Tap reactions (lab upgrade)', ['Standard', 'Upgrade: highlight glides, bars slide, dot springs', 'Upgrade, quiet']], menufx: ['Menus (lab upgrade)', ['Standard', 'Upgrade: grows from button, items drop in, scrim', 'Upgrade, quiet']],
    pagefx: ['Page transitions (lab upgrade)', ['Standard', 'Upgrade: direction slide, ember line', 'Upgrade, quiet']],
  };
  const OFF = { glow: 'Glow and halos', shine: 'Shine sweeps', shadows: 'Shadows', gradients: 'Gradients', blur: 'Glass blur', textglow: 'Text glow', embers: 'Floating embers', badgepulse: 'Badge pulse', hoverlift: 'Hover lift', borders: 'Borders' };
  const MOT = { Page: ['page-fade', 'page-slide', 'page-zoom', 'page-blur', 'page-wipe'], Entrance: ['enter-rise', 'enter-fade', 'enter-scale', 'enter-blur', 'enter-stagger', 'enter-flip'], Hover: ['hover-lift', 'hover-scale', 'hover-glow', 'hover-underline', 'hover-tilt'], Press: ['press-squish', 'press-sink', 'press-ripple'], Idle: ['idle-float', 'idle-breathe', 'idle-shimmer', 'idle-ping', 'idle-sway'] };
  const nice = (id) => id.split('-')[1].replace(/^./, (c) => c.toUpperCase());
  const FX = [['reveals', 'Reveals and transitions'], ['glow', 'Glow and shine'], ['tilt', 'Card tilt'], ['parallax', 'Parallax'], ['bursts', 'Celebration bursts'], ['dockbob', 'Dock bob'], ['gyro', 'Phone tilt'], ['haptics', 'Haptics'], ['insights', 'Insights notes'], ['spring', 'Springs'], ['ripple', 'Ripples'], ['spotlight', 'Spotlight'], ['ping', 'Pings'], ['popin', 'Pop-in']];
  // pure helpers (exported for the tests)
  const readable = (hex) => { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || ''); if (!m) return '#ffffff'; const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16)); return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#101010' : '#ffffff'; };
  const toHex = (c) => { const m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c || ''); return m ? '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('') : /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : ''; };
  const scopeName = (key) => (key === '*' ? 'Everywhere' : key.startsWith('page:') ? key.slice(5).replace('#', ' › ') : key);
  w.PFThemeEditor = { readable, toHex, scopeName, COMP, OFF, MOT, FX };
  if (!T || !A || !API || !A.token || A.role !== 'owner' || A.viewAs || d.querySelector('.tse')) return;

  (A.ready || Promise.resolve()).then(() => {
    const root = d.createElement('div'); root.className = 'tse';
    root.innerHTML = `<button type="button" class="tse-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="tsePanel" aria-label="Theme Studio: change how the site looks"><svg viewBox="0 0 48 48" aria-hidden="true"><path class="f" d="M24 4c3 5 9 9 9 17 0 4-2 7-4 9 1-3 0-6-2-8-1 3-3 5-6 6 2-5-1-8-3-12-4 4-7 8-7 14 0 3 1 6 3 8C10 36 7 31 7 26c0-9 8-12 11-21 2 2 3 4 4 6 1-3 1-5 2-7z"/><circle cx="17" cy="35" r="3.4" fill="#ff7a5c"/><circle cx="24.5" cy="38" r="3.4" fill="#ffd24d"/><circle cx="32" cy="35" r="3.4" fill="#5ed6a0"/></svg></button>
<section class="tse-panel" id="tsePanel" role="dialog" aria-label="Theme Studio" hidden></section>`;
    d.body.appendChild(root);
    const btn = root.querySelector('.tse-btn'), panel = root.querySelector('.tse-panel');
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const S = { open: false, tab: 'colors', draft: clone(T.config), scope: '*', dirty: false, busy: false, msg: '', fx: null, fxDraft: null, fxDirty: false, comp: 'button', onpage: false, stageOn: true };
    const pageKey = () => 'page:' + T.slug(), subKey = () => (T.sub() ? pageKey() + '#' + T.sub() : '');
    const cur = () => (S.draft.scopes[S.scope] ||= { tokens: {}, variants: {}, off: [], motion: [] });
    const clean = () => { for (const [k, s] of Object.entries(S.draft.scopes)) if (!Object.keys(s.tokens || {}).length && !Object.keys(s.variants || {}).length && !(s.off || []).length && !(s.motion || []).length) delete S.draft.scopes[k]; };
    const live = () => { clean(); site(); demo(); S.dirty = true; foot(); };
    // ---- the live demo: the merged look for the scope being edited, shown in the stage and, per look, in the picture tiles ----
    const keysFor = () => { const k = ['*']; if (S.scope !== '*') { k.push(S.scope.split('#')[0]); if (S.scope.includes('#')) k.push(S.scope); } return k; };
    const lookFor = (over) => { const m = T.merge(S.draft, keysFor()); if (over) m.variants = { ...m.variants, ...over }; return m; };
    const focusFor = () => (S.tab === 'parts' ? S.comp : 'all');
    const send = (fr, look, focus) => { try { fr.contentWindow.PFDemo.set(look, focus); } catch {} };
    const stage = () => panel.querySelector('.tse-stage iframe');
    const fit = (fr) => setTimeout(() => { try { const h = fr.contentDocument.documentElement.scrollHeight; fr.style.height = Math.min(Math.max(h, 96), Math.round(innerHeight * 0.3)) + 'px'; } catch {} }, 140);
    const demo = () => { const fr = stage(); if (fr) { send(fr, lookFor(), focusFor()); fit(fr); } tiles(); };
    const tiles = () => panel.querySelectorAll('.tse-tile iframe').forEach((fr) => { const [k, x] = fr.dataset.look.split(':'); send(fr, lookFor({ [k]: x }), k); });
    const site = () => { if (S.onpage) T.preview(S.draft); };   // the page behind changes only when asked (or on Save)
    const replay = () => { try { stage().contentWindow.PFDemo.replay(); } catch {} };
    const siteColor = (k) => { const v = SITEVAR[k]; if (!v) return ''; const c = getComputedStyle(d.documentElement).getPropertyValue(v).trim(); return toHex(c) || (/^#[0-9a-f]{6}$/i.test(c) ? c : ''); };

    const tabs = [['colors', 'Colours'], ['type', 'Type and size'], ['parts', 'Components'], ['effects', 'Effects'], ['motion', 'Motion']];
    const scopes = () => [['*', 'Everywhere'], [pageKey(), 'This page'], ...(subKey() ? [[subKey(), 'This sub-menu']] : [])];
    const head = () => `<div class="tse-h"><div class="tse-t"><b>Theme Studio</b><small>${esc(scopeName(S.scope))} · ${Object.keys(S.draft.scopes).filter((k) => k !== '*').length} page look(s) saved</small></div><button type="button" class="tse-x" data-x aria-label="Close">×</button></div>
<div class="tse-seg" role="radiogroup" aria-label="Where this applies">${scopes().map(([k, l]) => `<button type="button" role="radio" aria-checked="${S.scope === k}" data-scope="${esc(k)}">${l}</button>`).join('')}</div>
<div class="tse-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" data-tab="${k}">${l}</button>`).join('')}</div>`;
    const colors = () => `<div class="tse-grid">${T.CAT.COLOR_TOKENS.map((k) => { const v = cur().tokens[k], auto = siteColor(k); return `<label class="tse-f"><span>${LABEL[k]}</span><span class="tse-c"><input type="color" data-color="${k}" value="${v || auto || '#808080'}" aria-label="${LABEL[k]}"><code>${v || 'auto'}</code>${v ? `<button type="button" class="tse-r" data-unset="${k}" aria-label="Back to automatic: ${LABEL[k]}">↺</button>` : ''}</span></label>`; }).join('')}</div>
<button type="button" class="tse-link" data-pair>Pick button text colour for me</button>`;
    const type = () => `<div class="tse-grid">${T.CAT.FONT_TOKENS.map((k) => `<label class="tse-f"><span>${k === 'fontDisplay' ? 'Headline font' : 'Body font'}</span><select data-font="${k}">${T.CAT.FONTS.map((f) => `<option value="${esc(f)}"${(cur().tokens[k] || 'inherit') === f ? ' selected' : ''}>${f === 'inherit' ? 'Standard' : esc(f)}</option>`).join('')}</select></label>`).join('')}
${Object.entries(NUM).map(([k, [l, u, st]]) => { const [lo, hi] = T.CAT.NUM_TOKENS[k], v = cur().tokens[k]; return `<label class="tse-f"><span>${l} <em>${v == null ? 'standard' : v + u}</em></span><span class="tse-n"><input type="range" min="${lo}" max="${hi}" step="${st}" value="${v ?? (k === 'space' || k === 'text' ? 100 : Math.round((lo + hi) / 4))}" data-num="${k}">${v == null ? '' : `<button type="button" class="tse-r" data-unset="${k}" aria-label="Back to standard: ${l}">↺</button>`}</span></label>`; }).join('')}</div>`;
    const ix = (v) => ['a', 'b', 'c'].indexOf(v);
    const parts = () => `<p class="tse-hint">Tap a part, then tap the picture of the look you want. The demo above shows the one selected.</p><div class="tse-parts">${Object.entries(COMP).map(([k, [l, names]]) => { const v = cur().variants[k] || 'a', open = S.comp === k; return `<div class="tse-pc${open ? ' open' : ''}"><button type="button" class="tse-ph" data-comp="${k}" aria-expanded="${open}"><span>${l}</span><em>${names[ix(v)]}</em></button>${open ? `<div class="tse-tiles" data-k="${k}" role="radiogroup" aria-label="${l}">${['a', 'b', 'c'].map((x, i) => `<div class="tse-tile${v === x ? ' sel' : ''}"><iframe src="themedemo.html?nostudio&solo&focus=${k}" data-look="${k}:${x}" tabindex="-1" aria-hidden="true" title="" loading="lazy"></iframe><button type="button" class="tse-pick" role="radio" aria-checked="${v === x}" data-var="${k}:${x}"><span>${names[i]}</span></button></div>`).join('')}</div>` : ''}</div>`; }).join('')}</div>`;
    const effects = () => `<p class="tse-hint">Switch off any part of the look, here or on this page only. Switched off here means off wherever this look applies.</p><div class="tse-chips">${Object.entries(OFF).map(([k, l]) => `<label class="tse-chip"><input type="checkbox" data-off="${k}"${cur().off.includes(k) ? ' checked' : ''}><span>No ${l.toLowerCase()}</span></label>`).join('')}</div>${fxBlock()}`;
    const fxBlock = () => { const f = S.fxDraft; if (!f) return `<p class="tse-hint">${S.fxFail ? 'The core effects could not be loaded. Close and open the Studio to try again.' : 'Loading the core effects…'}</p>`; return `<h4>Core effects <small>everyone sees the same</small></h4><label class="tse-f"><span>How many may run at once <em>${f.budget}</em></span><input type="number" min="5" step="1" value="${f.budget}" data-fxbudget></label><div class="tse-fx">${FX.map(([k, l]) => `<div class="tse-fxr"><span>${l}</span><div class="tse-seg" role="radiogroup" aria-label="${l}">${['full', 'balanced', 'off'].map((v) => `<button type="button" role="radio" aria-checked="${(f.levels[k] || 'full') === v}" data-fx="${k}:${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div></div>`).join('')}</div>`; };
    const motion = () => `<p class="tse-hint">Choose as many as you like. They stack. Pick none to keep the site's own motion.</p>${Object.entries(MOT).map(([g, ids]) => `<h4>${g} <button type="button" class="tse-link" data-all="${g}">all</button> <button type="button" class="tse-link" data-none="${g}">none</button></h4><div class="tse-chips">${ids.map((id) => `<label class="tse-chip"><input type="checkbox" data-mot="${id}"${cur().motion.includes(id) ? ' checked' : ''}><span>${nice(id)}</span></label>`).join('')}</div>`).join('')}`;
    const body = () => ({ colors, type, parts, effects, motion })[S.tab]();
    const foot = () => { const f = panel.querySelector('.tse-ft'); if (f) f.innerHTML = footHtml(); };
    const footHtml = () => `<div class="tse-foot"><span class="tse-s" role="status">${esc(S.msg) || (S.dirty || S.fxDirty ? 'Unsaved changes' : 'Saved')}</span><button type="button" class="tse-b" data-resetscope>Reset ${esc(scopeName(S.scope))}</button><button type="button" class="tse-b pri" data-save${S.busy ? ' disabled' : ''}${S.dirty || S.fxDirty ? '' : ' disabled'}>${S.busy ? 'Saving…' : 'Save for everyone'}</button></div>`;
    const stageHtml = () => `<div class="tse-stage"${S.stageOn ? '' : ' data-off'}><iframe src="themedemo.html?nostudio" title="Live demo of the parts you are editing" loading="eager"></iframe><div class="tse-sb"><span>Live demo: touch it, it reacts</span><button type="button" class="tse-link" data-replay>Replay</button><label class="tse-chip sm"><input type="checkbox" data-onpage${S.onpage ? ' checked' : ''}><span>Also on the page</span></label><button type="button" class="tse-link" data-stage>${S.stageOn ? 'Hide' : 'Show demo'}</button></div></div>`;
    const build = () => { panel.innerHTML = '<div class="tse-hd"></div>' + stageHtml() + '<div class="tse-body"></div><div class="tse-ft"></div>'; stage().addEventListener('load', demo); };
    const paint = () => { if (!panel.querySelector('.tse-stage')) build(); const bd = panel.querySelector('.tse-body'), y = bd.scrollTop; panel.querySelector('.tse-hd').innerHTML = head(); bd.innerHTML = body(); panel.querySelector('.tse-ft').innerHTML = footHtml(); bd.scrollTop = y; if (S.pin) { S.pin = false; const o = bd.querySelector('.tse-pc.open'); if (o) bd.scrollTop += o.getBoundingClientRect().top - bd.getBoundingClientRect().top - 6; } panel.querySelector('.tse-stage').toggleAttribute('data-off', !S.stageOn); panel.querySelectorAll('.tse-tile iframe').forEach((fr) => fr.addEventListener('load', () => { const [k, x] = fr.dataset.look.split(':'); send(fr, lookFor({ [k]: x }), k); })); demo(); };
    const loadFx = () => { if (S.fx) return; A.call('/api/controlcenter/settings').then((r) => { const v = r?.areas?.effects?.value; if (v) { S.fx = clone(v); S.fxDraft = clone(v); if (S.open && S.tab === 'effects') paint(); } }).catch(() => { S.fxFail = true; if (S.open && S.tab === 'effects') paint(); }); };
    const setOpen = (on) => { if (!on && S.open && S.onpage) T.preview(T.config); S.open = on; panel.hidden = !on; btn.setAttribute('aria-expanded', String(on)); root.classList.toggle('on', on); if (on) { S.draft = clone(T.config); S.dirty = false; S.msg = ''; paint(); loadFx(); } };
    btn.addEventListener('click', () => setOpen(!S.open));
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.open) { setOpen(false); btn.focus(); } });
    addEventListener('hashchange', () => { if (S.open && S.scope !== '*' && !scopes().some(([k]) => k === S.scope)) S.scope = '*'; if (S.open) paint(); });

    panel.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return; const ds = t.dataset;
      if ('x' in ds) return setOpen(false);
      if (ds.scope) { S.scope = ds.scope; return paint(); }
      if (ds.tab) { S.tab = ds.tab; if (ds.tab === 'effects') loadFx(); return paint(); }
      if (ds.unset) { const k = ds.unset; delete cur().tokens[k]; live(); return paint(); }
      if (ds.comp) { S.comp = ds.comp; S.pin = true; return paint(); }
      if ('replay' in ds) return replay();
      if ('stage' in ds) { S.stageOn = !S.stageOn; return paint(); }
      if (ds.var) { const [k, v] = ds.var.split(':'); S.comp = k; if (v === 'a') delete cur().variants[k]; else cur().variants[k] = v; live(); return paint(); }
      if (ds.fx) { const [k, v] = ds.fx.split(':'); S.fxDraft.levels[k] = v; S.fxDirty = true; return paint(); }
      if (ds.all || ds.none) { const g = ds.all || ds.none, m = cur(); for (const id of MOT[g]) { m.motion = m.motion.filter((x) => x !== id); if (ds.all) m.motion.push(id); } live(); return paint(); }
      if ('pair' in ds) { const b = cur().tokens.btnfill || siteColor('accent'); if (b) { cur().tokens.btntext = readable(b); live(); paint(); } return; }
      if ('resetscope' in ds) { if (S.scope === '*' && !confirm('Reset the look for the whole site to the standard one? You still have to save.')) return; delete S.draft.scopes[S.scope]; live(); return paint(); }
      if ('save' in ds) return save();
    });
    panel.addEventListener('input', (e) => {
      const t = e.target, ds = t.dataset;
      if (ds.color) { cur().tokens[ds.color] = t.value.toLowerCase(); const c = t.closest('.tse-c')?.querySelector('code'); if (c) c.textContent = t.value.toLowerCase(); site(); demo(); S.dirty = true; foot(); }
      else if (ds.num) { cur().tokens[ds.num] = +t.value; const em = t.closest('.tse-f')?.querySelector('em'); if (em) em.textContent = t.value + NUM[ds.num][1]; site(); demo(); S.dirty = true; foot(); }
    });
    panel.addEventListener('change', (e) => {
      const t = e.target, ds = t.dataset;
      if (ds.color || ds.num) return paint();
      if ('onpage' in ds) { S.onpage = t.checked; T.preview(S.onpage ? S.draft : T.config); return; }
      if (ds.font) { if (t.value === 'inherit') delete cur().tokens[ds.font]; else cur().tokens[ds.font] = t.value; live(); }
      else if (ds.off) { const m = cur(); m.off = m.off.filter((x) => x !== ds.off); if (t.checked) m.off.push(ds.off); live(); }
      else if (ds.mot) { const m = cur(); m.motion = m.motion.filter((x) => x !== ds.mot); if (t.checked) m.motion.push(ds.mot); live(); setTimeout(replay, 60); }
      else if ('fxbudget' in ds) { S.fxDraft.budget = Math.max(5, Math.floor(+t.value) || 5); S.fxDirty = true; paint(); }
    });
    const save = async () => {
      if (S.busy) return; S.busy = true; S.msg = ''; foot();
      try {
        clean();
        if (S.dirty) { await A.call('/api/controlcenter/settings/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopes: S.draft.scopes }) }); T.set(S.draft, { save: true }); S.dirty = false; }
        if (S.fxDirty) { await A.call('/api/controlcenter/settings/effects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S.fxDraft) }); S.fx = clone(S.fxDraft); S.fxDirty = false; w.PhoenixFx?.set?.(S.fx); try { localStorage.setItem('phoenix.fxcfg', JSON.stringify(S.fx)); } catch {} }
        S.msg = 'Saved. Everyone sees it on their next load.';
      } catch (er) { S.msg = 'Not saved: ' + (er?.message || 'try again'); }
      S.busy = false; paint(); setTimeout(() => { if (S.msg.startsWith('Saved')) { S.msg = ''; foot(); } }, 4000);
    };
  });
})();
