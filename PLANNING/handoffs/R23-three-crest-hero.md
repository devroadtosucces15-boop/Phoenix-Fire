# Handoff R23: three-crest-hero
Status: open
From: site-enhance (R23) · To: visual-forge
Where: about.html 3D crest panel (.c3) and index.html hero stage. The target section id must be confirmed against the built page before work starts (the home is proposed only; the owner has not assigned it).
What is wanted: Phoenix crest in 3D with a slow light sweep driven by uniforms, a short intro sequence on first view.
Job for the user: See the crest as a living object, not a flat image.
Reference (wishlist.md): js-three-tsl, js-three-sequence, js-three-uniforms (https://motion.dev/examples/js-three-tsl, https://motion.dev/examples/js-three-sequence, https://motion.dev/examples/js-three-uniforms)
Constraints: Phoenix tokens only (gold #efcf7a on #3a2c0e, accent #e8651a, ink #0a0705; no new colours, nothing from NOREX); layout must not shift; vendored GSAP (next/static/vendor-gsap.min.js) or CSS, no new heavy library; Lenis must not fight the effect. Budget from .site-context/fx-budget.json: max added JS 350 KB, CLS 0.1, interaction delay 200 ms, 45 fps average at 4x CPU throttle on a 390x844 phone, max added heap 80 MB.
Reduced motion: A static crest image (crest.png) when motion is off or WebGL is unavailable. Applies for prefers-reduced-motion and html[data-motion=calm|off]. Keyboard and screen-reader behaviour stays as built.
Done when: the effect shows on the target section only; the fallback shows with motion off; the budget run passes; a test guards the fallback and the Phoenix colours.
