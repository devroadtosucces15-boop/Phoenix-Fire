# Handoff R23: context-menu-squad
Status: open
From: site-enhance (R23) · To: visual-forge
Where: squad card actions (new component; the dock radial list is in R48). The target section id must be confirmed against the built page before work starts (the home is proposed only; the owner has not assigned it).
What is wanted: Long press or right click a squad card to open a small action menu (view, compare, watch, share).
Job for the user: Quick actions on a player without opening the page.
Reference (wishlist.md): react-base-context-menu, vue-context-menu (https://motion.dev/examples/react-base-context-menu, https://motion.dev/examples/vue-context-menu)
Constraints: Phoenix tokens only (gold #efcf7a on #3a2c0e, accent #e8651a, ink #0a0705; no new colours, nothing from NOREX); layout must not shift; vendored GSAP (next/static/vendor-gsap.min.js) or CSS, no new heavy library; Lenis must not fight the effect. Budget from .site-context/fx-budget.json: max added JS 350 KB, CLS 0.1, interaction delay 200 ms, 45 fps average at 4x CPU throttle on a 390x844 phone, max added heap 80 MB.
Reduced motion: The same actions as visible links on the card page; menu is pointer-only enhancement. Applies for prefers-reduced-motion and html[data-motion=calm|off]. Keyboard and screen-reader behaviour stays as built.
Done when: the effect shows on the target section only; the fallback shows with motion off; the budget run passes; a test guards the fallback and the Phoenix colours.
