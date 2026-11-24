// ⚙️ Control Center shortcut gear (rewritten 2026-11-23): managers and the owner get one floating gear on every page (flag editGear, owner).
// It only LINKS: the staff tools nearest this page, then every other one, each opening inside Staff › Control Center. Nothing is changed from a public page any more
// (news pinning, applications, fixtures, squads and Hall of Fame removal moved into the Control Center tools; the Worker still checks every permission).
(() => {
  const d = document, API = window.NOREX_API, A = window.NorexAuth, M = window.NorexMotion, page = (window.NOREX && window.NOREX.page) || '';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // the staff rooms and the room nearest each page come from the staff manifest (next/lib/staffmanifest.mjs); this file names tools by id only
  const MAN = (window.PFStaffNav || { tools: [] }), ROOMS = MAN.tools.filter((t) => t.group && t.id !== 'home').map((t) => [t.href, t.emoji, t.label]), href = (id) => (MAN.tools.find((t) => t.id === id) || {}).href;
  // which Staff room is closest to the page you are on (shown first)
  const NEAR_TOOL = { 'fixtures.html': 'schedule', 'schedule.html': 'schedule', 'squad.html': 'artwork', 'players.html': 'artwork', 'halloffame.html': 'boardroom', 'opponents.html': 'insights', 'tactics.html': 'dugout', 'join.html': 'desk' };

  let sheet = null, dirty = false, fab = null;
  const close = () => { if (!sheet) return; const s = sheet; sheet = null; s.classList.add('out'); setTimeout(() => s.remove(), 230); fab?.focus(); };

  async function open() {
    if (sheet) return;
    const near = href(NEAR_TOOL[page]);
    const rooms = [...ROOMS].sort((a, b) => (b[0] === near) - (a[0] === near));
    sheet = d.createElement('div'); sheet.className = 'mx-sheet gr-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Open the Control Center');
    sheet.innerHTML = `<div class="mx-sheet-body"><div class="gr-h"><h3>⚙️ Control Center</h3><button type="button" class="gr-x" data-gr-close aria-label="Close">✕</button></div>
<section class="gr-sec"><h4>Open in the Control Center</h4><div class="gr-rooms">${rooms.map(([h, i, t]) => `<a class="gr-room${h === near ? ' near' : ''}" href="${h}"><span aria-hidden="true">${i}</span>${t}</a>`).join('')}</div></section></div>`;
    d.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-gr-close]')) close(); });
    sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    sheet.querySelector('[data-gr-close]').focus();
  }

  function mount() {
    fab = d.createElement('button'); fab.type = 'button'; fab.className = 'gr-fab'; fab.setAttribute('aria-label', 'Open the Control Center'); fab.title = 'Control Center'; fab.innerHTML = '<span aria-hidden="true">⚙️</span>';
    fab.onclick = open; d.body.appendChild(fab);
  }

  // who gets it: the real signed-in owner/manager with the editGear flag; in a local design build the “Preview as Owner” role
  if (API) A?.ready?.then(() => { if (A.token && (A.role === 'owner' || A.role === 'manager') && (A.features || []).includes('editGear')) mount(); });
  else if (window.NorexAs === 'owner') mount();
})();
