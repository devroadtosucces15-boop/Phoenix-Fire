# Handoff R23: suspense-skeleton
Status: open
From: site-enhance (R23) · To: visual-forge
Where: skeleton to content for script-mounted sections (the sections R04 waits for). The target section id must be confirmed against the built page before work starts (the home is proposed only; the owner has not assigned it).
What is wanted: A skeleton block fades to the real content when the script mounts it, without layout shift.
Job for the user: Pages that fill in late feel calm, not jumpy.
Reference (wishlist.md): react-animate-suspense, react-animate-suspense-pop-layout, react-animate-suspense-wait, vue-animate-view-skeleton (https://motion.dev/examples/react-animate-suspense, https://motion.dev/examples/react-animate-suspense-pop-layout, https://motion.dev/examples/react-animate-suspense-wait, https://motion.dev/examples/vue-animate-view-skeleton)
Constraints: Phoenix tokens only (gold #efcf7a on #3a2c0e, accent #e8651a, ink #0a0705; no new colours, nothing from NOREX); layout must not shift; vendored GSAP (next/static/vendor-gsap.min.js) or CSS, no new heavy library; Lenis must not fight the effect. Budget from .site-context/fx-budget.json: max added JS 350 KB, CLS 0.1, interaction delay 200 ms, 45 fps average at 4x CPU throttle on a 390x844 phone, max added heap 80 MB.
Reduced motion: Content appears with no fade; skeleton hidden. Applies for prefers-reduced-motion and html[data-motion=calm|off]. Keyboard and screen-reader behaviour stays as built.
Done when: the effect shows on the target section only; the fallback shows with motion off; the budget run passes; a test guards the fallback and the Phoenix colours.
