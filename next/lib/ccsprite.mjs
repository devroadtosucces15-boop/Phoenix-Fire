// The Control Center's one SVG icon sprite (PF-022 step 7). Every icon in the shell is <svg><use href="#i-name"/></svg> from this sheet; no emoji, no second set.
// 24x24 grid, 1.7 stroke, currentColor. The manifest (staffmanifest.mjs) names each tool's icon by its symbol id.
const P = {
  'i-grid': '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  'i-cal': '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  'i-pitch': '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.6"/>',
  'i-people': '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16.5 14.7c2.4.1 4 1.6 4.4 4.3"/>',
  'i-wrench': '<path d="M14.5 6.5a4 4 0 0 0 4.9 4.9l-9 9a2.1 2.1 0 0 1-3-3l9-9a4 4 0 0 0-1.9-1.9z"/>',
  'i-doc': '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 16h6"/>',
  'i-image': '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="M4 18l5-5 4 4 3-3 4.5 4.5"/>',
  'i-bot': '<rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 8V4.5M9 13v1.5M15 13v1.5"/><circle cx="12" cy="4" r="1"/>',
  'i-button': '<rect x="3.5" y="8" width="17" height="8" rx="4"/><path d="M8 12h8"/>',
  'i-post': '<path d="M4 6.5h16v9.5H11l-4.5 3.5V16H4z"/>',
  'i-clock': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  'i-bell': '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  'i-music': '<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  'i-lock': '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  'i-chart': '<path d="M4 20V4M4 20h16"/><path d="M8 15l3.5-4 3 2.5L19 7"/>',
  'i-org': '<rect x="9" y="3.5" width="6" height="5" rx="1"/><rect x="3" y="15.5" width="6" height="5" rx="1"/><rect x="15" y="15.5" width="6" height="5" rx="1"/><path d="M12 8.5v3.5M6 15.5V12h12v3.5"/>',
  'i-shield': '<path d="M12 3.5l7 2.8v5.4c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6.3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  'i-crown': '<path d="M4 17.5L3 7.5l5 4 4-6 4 6 5-4-1 10z"/><path d="M4 20.5h16"/>',
  'i-search': '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  'i-menu': '<path d="M4 7h16M4 12h16M4 17h16"/>',
  'i-copy': '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  'i-download': '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M4.5 20h15"/>',
  'i-x': '<path d="M6 6l12 12M18 6L6 18"/>',
  'i-star': '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>',
  'i-refresh': '<path d="M19.5 8A8 8 0 0 0 5 9.5M4.5 4.5v5h5M4.5 16A8 8 0 0 0 19 14.5M19.5 19.5v-5h-5"/>',
  'i-alert': '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  'i-check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'i-link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  'i-back': '<path d="M14.5 6l-6 6 6 6"/>',
  'i-ext': '<path d="M8 16L16.5 7.5M9.5 7.5h7v7"/>',
  'i-sort': '<path d="M8 4v16M4.5 16.5L8 20l3.5-3.5M16 20V4M12.5 7.5L16 4l3.5 3.5"/>',
};
export const ICON_IDS = Object.keys(P);
/** the sprite, written once at the top of the Control Center page (hidden, referenced with <use href="#i-…">) */
export const sprite = () => `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${Object.entries(P).map(([id, d]) => `<symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`).join('')}</defs></svg>`;
export const icon = (id, cls = '') => `<svg class="cx-i${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
