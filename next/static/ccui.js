// Control Center UI kit (2026-11-23): the markup helpers and the small behaviour every Control Center panel shares, so each control looks and moves the same.
//   PFCCUI.card({ id, icon, title, sub, chips, on, sw, open, toggle, body, i }) one control card: icon, name, what it does, status chips, switch, drop-down arrow, drop-down body
//   PFCCUI.sw(attrs, on, label)  the animated switch (a real checkbox)       PFCCUI.seg(name, options, value, attrs)  a segmented control
//   PFCCUI.field(label, control, hint)  PFCCUI.bar(...)  the search + filter toolbar       PFCCUI.open  Set of the card ids that are open (kept across repaints)
// Cards with `toggle: true` open and close by themselves here (no repaint, so the animation is smooth); a panel with its own draft (the output editor) passes
// `toggle: false` and handles the click itself. Tables with class cc-tbl or cu-rows get a data-l label on every cell so the row card can name each value.
// Nothing in this file names a channel, role or club.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const I = {
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  };
  const open = new Set();
  const sw = (attrs, on, label) => `<label class="cc-sw"><input type="checkbox" ${attrs}${on ? ' checked' : ''} aria-label="${esc(label)}"><span></span></label>`;
  const pill = (t, kind = '') => `<span class="cu-pill ${kind}">${t}</span>`;
  const seg = (name, options, value, attrs = '') => `<div class="cu-seg" role="radiogroup" aria-label="${esc(name)}">${options.map(([v, l, title, extra]) => `<button type="button" role="radio" aria-checked="${String(v) === String(value)}" ${extra || ''} title="${esc(title || l)}">${esc(l)}</button>`).join('')}</div>`;
  const field = (label, control, hint = '', cls = '') => `<label class="cu-field ${cls}"><span>${esc(label)}</span>${control}${hint ? `<small class="cu-hint">${hint}</small>` : ''}</label>`;
  // one control card. `attrs` goes on the article, `sw` is the full switch html (or '' for a card without one), `body` is the drop-down content (or '' for no drop-down)
  const card = ({ id, icon = '🎛️', title, sub = '', chips = [], on = true, sw: swHtml = '', open: isOpen, toggle = true, body = '', i = 0, attrs = '', anim = false, closing = false, btnAttrs = '', plain = false }) => {
    const o = isOpen ?? open.has(id);
    return `<article class="cu-card ${plain ? 'is-plain' : on ? 'is-on' : 'is-off'}" data-cu="${esc(id)}" style="--i:${i}"${o ? ' data-open' : ''}${o && anim ? ' data-anim' : ''}${closing ? ' data-closing' : ''} ${attrs}>
<header class="cu-h"><span class="cu-ic" aria-hidden="true">${icon}</span><div class="cu-t"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${swHtml}${body ? `<button type="button" class="cu-x" ${toggle ? 'data-cu-toggle' : ''} ${btnAttrs} data-cu-id="${esc(id)}" aria-expanded="${o}" aria-label="${o ? 'Close' : 'Open'} settings: ${esc(String(title).replace(/<[^>]+>/g, ''))}">${I.chev}</button>` : ''}
${chips.length ? `<div class="cu-chips">${chips.join('')}</div>` : ''}</header>
${body ? `<div class="cu-body"><div class="cu-in">${body}</div></div>` : ''}</article>`;
  };
  const bar = ({ search = '', placeholder = 'Search…', attr = 'data-q', seg: segHtml = '', extra = '', count = '' }) => `<div class="cu-bar"><label class="cu-search">${I.search}<input type="text" inputmode="search" enterkeyhint="search" autocomplete="off" ${attr} placeholder="${esc(placeholder)}" value="${esc(search)}" aria-label="${esc(placeholder)}"></label>${segHtml}${extra}${count ? `<span class="cu-count" role="status">${count}</span>` : ''}</div>`;

  // generic open / close for cards that do not keep a draft
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cu-toggle]'); if (!b) return; const c = b.closest('.cu-card'); if (!c) return;
    const id = b.dataset.cuId, now = !c.hasAttribute('data-open');
    if (now) { open.add(id); c.setAttribute('data-open', ''); c.setAttribute('data-anim', ''); } else { open.delete(id); c.removeAttribute('data-open'); c.removeAttribute('data-anim'); }
    b.setAttribute('aria-expanded', String(now)); b.setAttribute('aria-label', b.getAttribute('aria-label').replace(/^(Open|Close)/, now ? 'Close' : 'Open'));
  });

  // table cells name themselves from the header, so a row can become a card on a phone (or everywhere with class cu-rows)
  let queued = false;
  const label = () => {
    queued = false;
    document.querySelectorAll('.cx table.cc-tbl,.cx table.cu-rows,.cx table.tbl').forEach((t) => {
      const heads = [...t.querySelectorAll('thead th')].map((h) => h.textContent.trim());
      t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, n) => { if (!td.dataset.l && heads[n]) td.dataset.l = heads[n]; }));
    });
  };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(label); } }).observe(document.documentElement, { childList: true, subtree: true });
  window.PFCCUI = { esc, I, open, sw, seg, field, card, bar, pill, label };
})();
