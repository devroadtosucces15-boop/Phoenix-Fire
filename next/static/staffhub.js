// Staff hub: shows the owner-only groups to the owner (managers see the shared groups), and lets a Boardroom page open one tab on its own
// (<meta name="pf-br-tab">) so each owner control is a page of its own instead of a tab on one long page.
(() => {
  const d = document, H = d.documentElement, A = window.NorexAuth || {};
  const owner = A.role === 'owner' && (A.as === undefined || A.as === 'owner');
  H.classList.toggle('is-owner', !!owner);
  const label = d.querySelector('[data-staff-role]');
  if (label && A.role) label.textContent = owner ? 'owner · every tool, grouped, one tap each' : 'managers · your tools, grouped, one tap each';
  const tab = d.querySelector('meta[name="pf-br-tab"]')?.content;
  if (!tab) return;
  let n = 0;
  (function open() {
    const b = d.querySelector(`.dk-tabs [data-tab="${tab}"]`);
    if (b && !b.classList.contains('on')) b.click();
    else if (!b && n++ < 40) setTimeout(open, 250);
  })();
})();
