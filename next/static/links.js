// One link resolver for the whole site (PF-018): bell, toasts, the alerts page and the locker all call PhoenixLinks.resolve(link).
// The table comes from next/lib/linkmap.mjs (injected as window.NOREX_LINKS by the page shell); tests/linkresolve.test.mjs checks
// this file gives the same answers as resolveLink() there. Never falls back to '../' + link.
(() => {
  const L = window.NOREX_LINKS || { map: {}, prefix: {}, pages: {}, keep: [] };
  const resolve = (link) => {
    if (!link) return '';
    let s = String(link).trim();
    if (/^https?:/i.test(s)) return s;
    s = s.replace(/^\.?\/+/, '').replace(/^(\.\.\/)+/, '').replace(/^Phoenix-Fire\//, '');
    const i = s.indexOf('#'), page = i < 0 ? s : s.slice(0, i), frag = i < 0 ? '' : s.slice(i + 1);
    if (page === 'members.html') {
      const key = frag.split('?')[0];
      if (L.map[key]) return L.map[key];
      const pre = key.split('-')[0];
      if (key.includes('-') && L.map['~' + pre]) return L.map['~' + pre];
      return 'hub.html';
    }
    const t = L.pages[page];
    if (t) return L.keep.includes(page) && frag ? t.split('#')[0] + '#' + frag : t.includes('#') || !frag ? t : t + '#' + frag;
    return page + (frag ? '#' + frag : '');
  };
  window.PhoenixLinks = { resolve };
})();
