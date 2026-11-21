# Favorited resources (ranked by category)

Last researched 2026-11-21. Phoenix is vanilla JS/CSS on Cloudflare Workers (strict CSP, no build framework for the site), so React/Vue examples
are for the technique only.

## How to use this file (sessions: read this first, do not re-research)

1. Find the category in the index below. Do not search the web for a tool that has a category here.
2. Take the lowest rank number that fits the job (#1 first). If #1 cannot do it, go down the list in order. Only look outside this file when
   every item in the category fails, then add what you found here.
3. "Native" entries (plain CSS, WAAPI, View Transitions) are ranked first for simple effects: zero bytes, no CSP risk. Check caniuse before use.
4. Each line shows how to connect Claude to it. Prefer a connector that is already on (`[HAVE]`) over researching docs by hand.
5. Rank basis: fit with Phoenix (vanilla, Workers, CSP), then adoption (npm weekly downloads and GitHub stars read 2026-11-21), maintenance
   (last push), cost, and how well Claude can connect to it. Ranks are judgment, not a leaderboard; numbers are in the line when they mattered.

Line format (the Brain References tab reads the URL before the first space): `- URL | #rank Name [tags] what it is. Connect: how`.
Cost tags: **[free] [freemium] [paid] [OSS]**. Connection tags: **[HAVE]** already connected here, **[HOSTED]** remote MCP with sign-in,
**[KEY]** needs an API key or paid account, **[NPM]** npm package, **[CLI]** command line tool, **[SKILL]** official agent skill,
**[LLMS]** the docs publish `/llms.txt` (point Claude at it), **[NONE]** no official connection found, use the docs or Firecrawl/Chrome.

## Category index

| # | Category | Covers | #1 |
|---|---|---|---|
| 1 | Animation engines | tweens, timelines, springs, list motion, text splitting | GSAP |
| 2 | Scroll and page transitions | smooth scroll, scroll-linked effects, page changes | Lenis |
| 3 | Vector and Lottie animation | interactive vector, icon and loader animation | dotLottie |
| 4 | 3D, WebGL and shaders | 3D scenes, shaders, models, learning | Three.js |
| 5 | Component behavior and accessibility patterns | how widgets must work (keyboard, ARIA) | WAI-ARIA APG |
| 6 | Component looks and CSS systems | styled components, tokens, effects | Open Props |
| 7 | Icons | icon sets and search | Lucide |
| 8 | Type, color and tokens | fonts, palettes, fluid scales | Fontsource |
| 9 | Design inspiration | galleries and real flows | Awwwards |
| 10 | Design tools and our design libraries | Figma, Penpot, installed design skills | Figma |
| 11 | Web platform reference | HTML/CSS/JS docs, compat, modern guidance | MDN |
| 12 | Accessibility testing | audits and contrast | Chrome DevTools a11y |
| 13 | Performance and testing | speed, bundle size, browser tests | Lighthouse |
| 14 | Backend, cloud and data | Workers, D1, KV, R2, APIs, validation | Cloudflare docs |
| 15 | Discord | bot, interactions, components | Discord docs |
| 16 | Security | web and API security | OWASP |
| 17 | DevOps and monitoring | CI, repo, errors | GitHub (gh) |
| 18 | Architecture and diagrams | system design, diagrams | Mermaid |
| 19 | AI image, video and audio generation | generating media | Higgsfield |
| 20 | Image and video editing, code video | editing, rendering | FFmpeg |
| 21 | Stock assets and data APIs | photos, models, icons API | Poly Haven |
| 22 | Site builders (reference) | Framer, Webflow | Framer |
| 23 | Agent tooling, MCP and CLIs | docs bridges, registries, Claude docs | Context7 |

## Connection cheat sheet

Already on in this setup: `chrome-devtools`, `playwright`, `blender` (plus Blender installed locally), `motion` (+ `motion-plus` needs a Motion+
sign-in), `rea`, `figma` plugin, Cloudflare Developer Platform, Firecrawl, Hugging Face, Mobbin, AppDeploy, `parallel-search`, `desktop-commander`,
`pdf-viewer`, `gh` CLI, `wrangler`, `ffmpeg`, ImageMagick `convert`, `uv`, `pnpm`. Higgsfield skills are installed.
Not on this machine yet: `lighthouse`, `svgo`, `mmdc`, `hf` CLIs. Install on your side (nothing was installed for this file):

```bash
npm i -g lighthouse svgo @mermaid-js/mermaid-cli     # perf audit, SVG optimize, Mermaid to image
npx skills add https://github.com/greensock/gsap-skills        # official GSAP skills (or /plugin marketplace add greensock/gsap-skills)
claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp   # live library docs for any package
claude mcp add --transport http mdn https://mcp.mdn.mozilla.net/      # MDN docs + compat data (experimental, may be withdrawn)
claude mcp add --transport http fal https://mcp.fal.ai/mcp-relay      # 1000+ image/video/audio models, OAuth, server is free, runs are paid
claude mcp add --transport http excalidraw https://mcp.excalidraw.com # diagrams in chat
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp     # only if you create a Sentry account
```

Skip: Rive MCP (desktop editor on Windows/macOS only, not Linux), community Lenis MCP (0 stars), Midjourney proxies (unofficial, may breach
Midjourney terms), any Discord MCP given the production bot token. Hosted MCPs all answered on 2026-11-21 (the 401/405 replies are the
normal "sign in / POST only" responses).

## 1. Animation engines

- https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API | #1 Native CSS transitions and WAAPI [free] zero-dependency motion for hovers, reveals, dock, toasts. Connect: MDN MCP above.
- https://gsap.com | #2 GSAP [free] (all plugins free since Webflow, confirmed on gsap.com) 8.5M npm/wk, the standard for timelines. Connect: [NPM] `gsap`, [SKILL] gsap-skills, [LLMS] gsap.com/llms.txt.
- https://gsap.com/docs/v3/ | #2a GSAP docs. Connect: [LLMS].
- https://gsap.com/docs/v3/Plugins/ScrollTrigger/ | #2b ScrollTrigger scroll-linked animation and pinning. Connect: part of `gsap`.
- https://gsap.com/docs/v3/Plugins/SplitText/ | #2c SplitText per-letter/word/line text effects. Connect: part of `gsap`.
- https://gsap.com/resources/ | #2d GSAP cheat sheet, showcase, learning hub.
- https://github.com/greensock/gsap-skills | #2e Official GSAP agent skills (18.8k stars). Connect: [SKILL] `npx skills add https://github.com/greensock/gsap-skills`.
- https://motion.dev | #3 Motion (ex Framer Motion) [free, OSS] 38.5M npm/wk, 35k stars, works in vanilla JS. Connect: [HAVE] `motion` MCP, [SKILL] `motion`, [NPM] `motion`, [LLMS] motion.dev/llms.txt.
- https://motion.dev/docs | #3a Motion docs.
- https://motion.dev/plus | #3b Motion+ [paid] extra components and 450+ example sources. Connect: `motion-plus` MCP needs a Motion+ sign-in.
- https://github.com/motiondivision/ai-kit | #3c Motion AI Kit, official skills and free hosted MCP. Connect: `npx motion-ai` (already set up).
- https://animejs.com | #4 Anime.js [free, OSS] 75k stars, 1.1M npm/wk, small timeline/SVG/stagger engine. Connect: [NPM] `animejs`.
- https://auto-animate.formkit.com | #5 AutoAnimate [free, OSS] 2.5M npm/wk, one-line add/remove/move animation for lists. Connect: [NPM] `@formkit/auto-animate`.
- https://www.theatrejs.com | #6 Theatre.js [free, OSS] visual timeline editor; npm 40k/wk, last push 2024-08 so slow. Connect: [NPM] `@theatre/core`.
- https://animate.style | #7 Animate.css [free, OSS] drop-in CSS classes; 83k stars but no release since 2024-07. Connect: [NPM] `animate.css`.
- https://www.kirilv.com/canvas-confetti/ | #8 canvas-confetti [free, OSS] 9.7M npm/wk, celebration burst. Connect: [NPM] `canvas-confetti`.
- https://particles.js.org | #9 tsParticles [free, OSS] particle backgrounds. Connect: [NPM] `tsparticles`.
- https://easings.net | Easing cheat sheet. https://linear-easing-generator.netlify.app | Generate native CSS `linear()` easings. https://cubic-bezier.com | Bezier tester.

## 2. Scroll and page transitions

Smooth scroll
- https://lenis.dev | #1 Lenis [free, OSS] 17k stars, 2.7M npm/wk, vanilla-friendly, pairs with ScrollTrigger. Connect: [NPM] `lenis`, [LLMS] lenis.dev/llms.txt.
- https://github.com/darkroomengineering/lenis | #1a Lenis source and options.
- https://gsap.com/docs/v3/Plugins/ScrollSmoother/ | #2 GSAP ScrollSmoother [free] when GSAP is already loaded. Connect: part of `gsap`.
- https://locomotive.ca | #3 Locomotive Scroll v5 [free, OSS] built on Lenis, 25k npm/wk. Connect: [NPM] `locomotive-scroll`.

Scroll-linked effects
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations | #1 Native CSS scroll-driven animations [free] no JS; verify browser support first. Connect: MDN MCP, caniuse.
- https://gsap.com/docs/v3/Plugins/ScrollTrigger/ | #2 ScrollTrigger (see section 1).
- https://motion.dev/docs | #3 Motion `scroll()` and `inView()`.

Page and view transitions
- https://developer.chrome.com/docs/web-platform/view-transitions | #1 View Transitions API [free] native, same-document and cross-document. Connect: MDN MCP, chrome-devtools to inspect.
- https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API | #1a View Transitions on MDN.
- https://swup.js.org | #2 Swup [free, OSS] 47k npm/wk, maintained 2026-11. Connect: [NPM] `swup`.
- https://barba.js.org | #3 Barba.js [free, OSS] 13k stars, last push 2024-12. Connect: [NPM] `@barba/core`.

Text splitting
- https://gsap.com/docs/v3/Plugins/SplitText/ | #1 SplitText (free now). https://github.com/lukePeavey/SplitType | #2 SplitType [OSS] 69k npm/wk. Connect: [NPM] `split-type`.

## 3. Vector and Lottie animation

- https://dotlottie.io | #1 dotLottie [free] compact modern Lottie format and player, 2.6M npm/wk. Connect: [NPM] `@lottiefiles/dotlottie-web`.
- https://lottiefiles.com | #2 LottieFiles [freemium] asset marketplace and Creator. Connect: [HOSTED] `claude mcp add --transport http lottiefiles https://mcp.lottiefiles.com/mcp` (workspace) and `creator` at https://creator.mcp.lottiefiles.com/mcp (makes animations, exports Lottie/MP4/GIF).
- https://github.com/airbnb/lottie-web | #3 lottie-web [OSS] 10.7M npm/wk, broadest compatibility, heavier. Connect: [NPM] `lottie-web`.
- https://rive.app | #4 Rive [freemium] best for interactive state machines; 1.65M npm/wk. Connect: [NPM] `@rive-app/canvas`, [LLMS] rive.app/llms.txt; MCP exists but only in the desktop editor on Windows/macOS, so not usable on this Linux box.

## 4. 3D, WebGL and shaders

- https://threejs.org | #1 Three.js [free, OSS] 119k stars, 38M npm/wk, the standard. Connect: [NPM] `three`, [LLMS] threejs.org/llms.txt.
- https://threejs.org/docs/ | #1a Three.js docs. https://threejs.org/examples/ | #1b official examples.
- https://github.com/oframe/ogl | #2 OGL [OSS] 1.2M npm/wk, tiny WebGL for shader-only effects. Connect: [NPM] `ogl`.
- https://www.blender.org | #3 Blender [free, OSS] author models and animation. Connect: [HAVE] installed at `~/.local/bin/blender` and the `blender` MCP is connected (execute code, scene info, asset search, 3D generation).
- https://spline.design | #4 Spline [freemium] visual 3D with web embeds. Connect: [HOSTED] `claude mcp add --transport http --scope user spline https://mcp.spline.design/mcp`; [LLMS] docs.spline.design/llms.txt.
- https://www.unicorn.studio | #5 Unicorn Studio [freemium] no-code shader effects with embed. Connect: [NONE].
- https://pixijs.com | #6 PixiJS [free, OSS] 2D WebGL, 48k stars, 2.0M npm/wk. Connect: [NPM] `pixi.js`, [LLMS].
- https://r3f.docs.pmnd.rs | #7 React Three Fiber [free, OSS] React only, technique reference (9.4M npm/wk). Connect: [LLMS]. https://drei.docs.pmnd.rs | drei helpers.
- https://www.babylonjs.com | #8 Babylon.js [free, OSS] full engine, heavy for this site. Connect: [NPM] `@babylonjs/core`, [LLMS] doc.babylonjs.com/llms.txt.
- https://gltf-transform.dev | Tool: compress and optimize glTF models. Connect: [CLI] `@gltf-transform/cli`. https://github.khronos.org/glTF-Tutorials/ | glTF tutorials.
- https://www.mixamo.com | Free rigged characters and animations (Adobe account). https://polyhaven.com | CC0 models, HDRIs, textures (API in section 21). https://cobe.vercel.app | COBE tiny WebGL globe.
- https://www.shadertoy.com | Shader examples. https://thebookofshaders.com | Learn GLSL. https://threejs-journey.com | Three.js Journey by Bruno Simon [paid], the best course.

## 5. Component behavior and accessibility patterns

- https://www.w3.org/WAI/ARIA/apg/ | #1 WAI-ARIA Authoring Practices [free] the correct keyboard/ARIA behavior for tabs, menus, dialogs, comboboxes. Use when fixing broken buttons and components.
- https://www.radix-ui.com | #2 Radix Primitives [free, OSS] 102M npm/wk, 19.5k stars, behavior reference. Connect: [NPM] `@radix-ui/react-*`; docs via Context7.
- https://react-aria.adobe.com/ | #3 React Aria [free, OSS] 16k stars, strongest accessibility edge-case handling. Connect: [LLMS] react-aria.adobe.com/llms.txt.
- https://base-ui.com | #4 Base UI [free, OSS] 32M npm/wk, from the MUI/Radix creators. Connect: [NPM] `@base-ui/react`.
- https://headlessui.com | #5 Headless UI [free, OSS] 28.8k stars, last push 2026-04. Connect: [NPM] `@headlessui/react`.
- https://inclusive-components.design | #6 Inclusive Components [free] pattern write-ups.

## 6. Component looks and CSS systems

For vanilla Phoenix (CSS or copy-friendly)
- https://open-props.style | #1 Open Props [free, OSS] CSS variables for easing, shadows, gradients, sizes. Connect: [NPM] `open-props`.
- https://uiverse.io | #2 Uiverse [free, OSS] community buttons, loaders, toggles, cards in plain CSS, copy straight in. Connect: [NONE] use Firecrawl/Chrome.
- https://daisyui.com | #3 daisyUI [free, OSS] 43k stars, 1.5M npm/wk, class-based, Tailwind plugin. Connect: [NPM] `daisyui`, [LLMS] daisyui.com/llms.txt.
- https://webawesome.com | #4 Web Awesome (ex Shoelace) [freemium] web components, framework-free. Connect: [NPM] `@awesome.me/webawesome`.
- https://picocss.com | #5 Pico CSS [free, OSS] 16.8k stars, semantic minimal CSS. Connect: [NPM] `@picocss/pico`.
- https://tympanus.net/codrops/ | #6 Codrops [free] advanced CSS/WebGL/scroll demos with source, best for fancy effects. Connect: [NONE].
- https://css-tricks.com | #7 CSS-Tricks [free] guides and almanac. https://codepen.io | #8 CodePen [freemium] live pens; search by tag. Connect: [NONE].

React-origin libraries (technique reference only)
- https://ui.shadcn.com | #1 shadcn/ui [free, OSS] 129k stars, 19M npm/wk. Connect: [NPM]/[CLI] `shadcn`, [LLMS] ui.shadcn.com/llms.txt, official MCP: `npx shadcn@latest mcp init --client claude` (needs a React project with `components.json`).
- https://reactbits.dev | #2 React Bits [free, OSS] 52k stars, animated backgrounds and text effects, installable through the shadcn CLI. Connect: [CLI] shadcn registry.
- https://magicui.design | #3 Magic UI [freemium] 23k stars, animated landing components. Connect: official MCP repo https://github.com/magicuidesign/mcp (supports Claude), [CLI] `magicui-cli`.
- https://ui.aceternity.com | #4 Aceternity UI [freemium] effect components. Connect: [NONE].
- https://21st.dev | #5 21st.dev [freemium] community component registry. Connect: [KEY] `@21st-dev/magic` MCP (6.6k stars, needs a 21st.dev key).
- https://tailwindcss.com | #6 Tailwind CSS v4 [free, OSS] 190M npm/wk. Connect: [NPM] `tailwindcss`; docs via Context7. https://tailwindcss.com/plus | Tailwind Plus [paid] official blocks and templates.

## 7. Icons

- https://lucide.dev | #1 Lucide [free, OSS] 26k stars, 2.8M npm/wk, consistent line style. Connect: [NPM] `lucide`, [LLMS] lucide.dev/llms.txt.
- https://tabler.io/icons | #2 Tabler [free, OSS] 5000+ icons, 6.5M npm/wk. Connect: [NPM] `@tabler/icons`.
- https://phosphoricons.com | #3 Phosphor [free, OSS] 6 weights, 3.2M npm/wk. Connect: [NPM] `@phosphor-icons/core`.
- https://iconify.design | #4 Iconify [free, OSS] search every open set. Connect: public API with no key `https://api.iconify.design/search?query=arrow` (tested 200).

## 8. Type, color and tokens

- https://fontsource.org | #1 Fontsource [free, OSS] self-host fonts (fits the strict CSP), 7.8M npm/wk. Connect: [NPM] `@fontsource/<name>`, [LLMS].
- https://www.fontshare.com | #2 Fontshare [free] quality free fonts. https://fonts.google.com | #3 Google Fonts [free]. https://v-fonts.com | variable fonts directory.
- https://www.typewolf.com | Pairing ideas from real sites. https://utopia.fyi | Fluid type and spacing scales.
- https://oklch.com | #1 OKLCH picker [free]. https://www.radix-ui.com/colors | #2 Radix Colors 12-step scales. https://www.realtimecolors.com | #3 preview a palette on a live page. https://coolors.co | #4 palette generator [freemium]. https://haikei.app | #5 SVG backgrounds and waves [freemium].

## 9. Design inspiration

Ranked for a sports/esports club site with stats. Connect for all: Firecrawl or Chrome/Playwright to read and screenshot; no official APIs.
- https://www.awwwards.com | #1 Awwwards [freemium] site of the day, the reference gallery. Connect: community `INSANE0777/Awwwards-mcp` (894 stars, unofficial, check before trusting).
- https://mobbin.com | #2 Mobbin [paid] real app and web flows. Connect: [HAVE] Mobbin connector.
- https://godly.website | #3 Godly (now redirects to recent.design) [free]. https://land-book.com | #4 Land-book [freemium].
- https://www.siteinspire.com | #5 Siteinspire [free]. https://dribbble.com | #6 Dribbble [freemium], search "esports", "dashboard", "sports stats".
- https://refero.design | #7 Refero [freemium] searchable screens. https://www.cssdesignawards.com | #8 CSS Design Awards. https://thefwa.com | #9 The FWA. https://www.lapa.ninja | #10 Lapa Ninja. https://www.behance.net | #11 Behance. https://savee.com | #12 Savee boards. https://pageflows.com | #13 Page Flows [paid].

## 10. Design tools and our design libraries

- https://www.figma.com | #1 Figma [freemium]. Connect: [HAVE] figma plugin, official guide https://github.com/figma/mcp-server-guide, [LLMS] developers.figma.com/llms.txt; community Framelink https://github.com/GLips/Figma-Context-MCP (16k stars).
- https://penpot.app | #2 Penpot [free, OSS] 62k stars. Connect: official MCP https://github.com/penpot/penpot-mcp (run its two local servers plus the Penpot plugin; Node 22).
- https://www.photopea.com | #3 Photopea [freemium] Photoshop-style in the browser. Connect: [NONE].
- Our installed design libraries (local copies in `~/tools/`, skills in `~/.claude/skills/`; guide: `~/tools/Installed-Tools-Guide.pdf`), in the order to try them:
- https://github.com/GoogleChrome/modern-web-guidance | #1 Modern Web Guidance [free, OSS] platform best practices. Skill `modern-web-guidance`.
- https://github.com/ItsssssJack/power-design | #2 Power Design Web explainer (tokens, OKLCH, 8-pt grid, motion). Local `~/tools/power-design-web/index.html`.
- https://github.com/VoltAgent/awesome-design-md | #3 awesome-design-md, brand DESIGN.md files to hand an agent. Local `~/tools/awesome-design-md`.
- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | #4 UI/UX Pro Max skill. Local `~/tools/ui-ux-pro-max-skill`.
- https://github.com/Motionsites-AI/claude-skill | #5 MotionSites Web Builder (sponsored, adds an upgrade ad). Skill `motionsites-web-builder`. https://motionsites.ai | paid library behind it.
- https://github.com/ItsssssJack/design-loop | #6 Design Loop (token heavy, hero pieces only). Skill `design-loop`. https://github.com/mshumer/Claude-of-Duty | the Gauntlet Loop origin.
- https://github.com/meta/astryx | #7 Astryx design system and CLI (do not adopt in Phoenix without a decision). Skill `astryx`, CLI installed.
- https://github.com/ItsssssJack/Gorgeous-websites.- | #8 Gorgeous Websites demo, effects only (its Supabase SQL is unsafe). Local `~/tools/gorgeous-websites`.
- https://github.com/pbakaus/impeccable | #9 Impeccable [free, OSS] design vocabulary, critique/audit and a 62-rule slop detector; plugin `impeccable@impeccable`, hooks on for Phoenix (details: `~/tools/Installed-Tools-Guide.pdf`). Connect: [SKILL] `/impeccable`.
- https://github.com/emilkowalski/skills | #10 Emil Kowalski's 21 design-engineering skills (animate, review-animations, choreograph, gestures, mobile-native, break-ui, learn-taste). Connect: [SKILL] installed; `npx skills@latest add emilkowalski/skills`. https://emilkowal.ski/ui/agents-with-taste | his write-up of why agents need these.
- https://github.com/Leonxlnx/taste-skill | #11 Taste Skill anti-slop frontend skill, plugin `taste-skill@taste-skill`; heavy, tuned to build whole sites, use for review and single sections. Site https://tasteskill.dev.
- https://github.com/benjitaylor/skills | #12 Stageshow faux product UI and cursor demos (React), skill `stageshow`; for marketing stills and videos, not site components.
- https://github.com/ItsssssJack/SlopMonster | Copy editor for site text. Skill `slopmonster`. https://github.com/lemomo-ai/lemo-opuscar | films in styles, skill `lemo-opuscar`. https://github.com/aykutucesai/motionforge | code video, skills `mf-*`. https://github.com/Donchitos/Claude-Code-Game-Studios | game template, copy to a new folder only.

## 11. Web platform reference

- https://developer.mozilla.org | #1 MDN [free]. Connect: [HOSTED] `claude mcp add --transport http mdn https://mcp.mdn.mozilla.net/` (official, experimental, repo https://github.com/mdn/mcp), [NPM] `@mdn/browser-compat-data`.
- https://web.dev | #2 web.dev [free] Chrome team guides. https://web.dev/baseline | #2a Baseline status. Connect: [NPM] `web-features`.
- https://developer.chrome.com/docs | #3 Chrome for Developers [free]. https://developer.chrome.com/docs/modern-web-guidance | Modern Web Guidance docs.
- https://caniuse.com | #4 Can I use [free]. Connect: [NPM] `caniuse-lite`; community MCPs exist (under 10 stars, skip); use MDN compat data instead.
- https://webkit.org/blog/ | #5 WebKit blog, Safari/iOS behavior. https://moderncss.dev | #6 Modern CSS solutions. https://www.joshwcomeau.com | #7 Josh Comeau (CSS course [paid]). https://www.kevinpowell.co | #8. https://nerdy.dev | #9 Adam Argyle. https://piccalil.li | #10. https://every-layout.dev | #11 [freemium]. Connect for all: [NONE], Firecrawl.

## 12. Accessibility testing

- https://developer.chrome.com/docs/devtools/accessibility/reference | #1 Chrome DevTools accessibility. Connect: [HAVE] `chrome-devtools` MCP with skill `a11y-debugging`.
- https://www.w3.org/WAI/WCAG22/quickref/ | #2 WCAG 2.2 quick reference. https://webaim.org/resources/contrastchecker/ | #3 contrast checker.
- https://www.deque.com/axe/ | #4 axe-core [free, OSS] 4.14. Connect: [NPM] `axe-core` run through Playwright; Deque Axe MCP Server https://www.deque.com/axe/mcp-server (free plan with sign-up, official; Claude plugin `axe-accessibility`); community https://github.com/priyankark/a11y-mcp (53 stars).
- https://www.a11yproject.com | #5 A11y Project checklist.

## 13. Performance and testing

- https://developer.chrome.com/docs/lighthouse | #1 Lighthouse [free, OSS] 13.6. Connect: [CLI] `npm i -g lighthouse` (not installed), [HAVE] chrome-devtools traces; community MCP https://github.com/danielsogl/lighthouse-mcp-server (75 stars).
- https://pagespeed.web.dev | #2 PageSpeed Insights [free]. Connect: API `googleapis.com/pagespeedonline/v5/runPagespeed` needs a free Google key (anonymous call returned 429 on 2026-11-21).
- https://www.webpagetest.org | #3 WebPageTest [freemium]. Connect: [CLI] `webpagetest` (3.3k stars, last push 2025-09), API key.
- https://playwright.dev | #1 browser testing [free, OSS] 100k stars. Connect: [HAVE] `playwright` MCP + [CLI]. https://vitest.dev | #2 Vitest [LLMS] vitest.dev/llms.txt. https://storybook.js.org | #3 Storybook [LLMS], official MCP `npx storybook add @storybook/addon-mcp` (only if the project adopts Storybook).
- https://bundlephobia.com | #4 package cost. https://squoosh.app | #5 image compression. https://jakearchibald.github.io/svgomg/ | #6 SVGOMG. Connect: [CLI] `svgo` 4.1 (not installed).

## 14. Backend, cloud and data

- https://developers.cloudflare.com/workers/ | #1 Workers docs [free]. Connect: [HAVE] Cloudflare Developer Platform connector (D1, KV, R2, Workers), [LLMS] developers.cloudflare.com/llms.txt, docs MCP https://docs.mcp.cloudflare.com/mcp, API MCP https://mcp.cloudflare.com/mcp (plugin, needs sign-in).
- https://developers.cloudflare.com/workers/wrangler/ | #1a Wrangler [CLI] [HAVE] installed. https://developers.cloudflare.com/d1/ | D1. https://developers.cloudflare.com/kv/ | KV. https://developers.cloudflare.com/r2/ | R2. https://developers.cloudflare.com/pages/ | Pages. https://developers.cloudflare.com/durable-objects/ | Durable Objects. https://developers.cloudflare.com/queues/ | Queues.
- https://hono.dev | #2 Hono [free, OSS] 33k stars, built for Workers. Connect: [NPM] `hono`, [LLMS] hono.dev/llms.txt.
- https://www.sqlite.org/docs.html | #3 SQLite (D1 dialect). https://orm.drizzle.team | #4 Drizzle ORM [OSS] 36k stars. Connect: [NPM], [LLMS]. https://zod.dev | #5 Zod validation [OSS] 44k stars. Connect: [NPM], [LLMS].
- https://www.openapis.org | #6 OpenAPI spec. https://www.usebruno.com | #7 Bruno [freemium] API client, [CLI] `bru` (48k stars). https://github.com/postmanlabs/postman-mcp-server | #8 Postman official MCP [KEY]; docs [LLMS] learning.postman.com/llms.txt.

## 15. Discord

- https://docs.discord.com/developers/intro | #1 Discord developer docs [free]. Connect: [LLMS] docs.discord.com/llms.txt (the old discord.com/developers URLs redirect here). Types: [NPM] `discord-api-types`.
- https://docs.discord.com/developers/interactions/overview | #2 Interactions. https://docs.discord.com/developers/components/overview | #3 Components V2.
- https://discordjs.guide | #4 discord.js guide [OSS] 27k stars (concepts apply without the library). https://discohook.app | #5 preview embeds and components.
- Connect note: no official Discord MCP exists. Community https://github.com/SaseQ/discord-mcp (612 stars) acts with a bot token, so never give it Phoenix's production token.

## 16. Security

- https://owasp.org/www-project-top-ten/ | #1 OWASP Top 10. https://cheatsheetseries.owasp.org | #2 Cheat Sheet Series (CSP, sessions, input). https://portswigger.net/web-security | #3 Web Security Academy. https://developer.mozilla.org/en-US/observatory | #4 header scan. Connect: [NONE]; Cloudflare security-audit skill exists at https://github.com/cloudflare/security-audit-skill (local `~/tools/security-audit-skill`).

## 17. DevOps and monitoring

- https://docs.github.com/actions | #1 GitHub Actions. https://cli.github.com | #2 `gh` [HAVE] logged in. Connect: official https://github.com/github/github-mcp-server (34k stars, plugin `github` enabled, needs sign-in).
- https://sentry.io | #3 Sentry [freemium]. Connect: [HOSTED] official MCP, `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp`; [LLMS] docs.sentry.io/llms.txt; [CLI] `sentry-cli`.

## 18. Architecture and diagrams

- https://mermaid.js.org | #1 Mermaid [free, OSS] 91k stars. Connect: [CLI] `@mermaid-js/mermaid-cli` (`mmdc`, not installed); community MCP https://github.com/peng-shawn/mermaid-mcp-server (234 stars).
- https://excalidraw.com | #2 Excalidraw [free, OSS] 136k stars. Connect: [HOSTED] official MCP `https://mcp.excalidraw.com` (https://github.com/excalidraw/excalidraw-mcp).
- https://c4model.com | #3 C4 model. https://adr.github.io | #4 ADRs. https://12factor.net | #5 Twelve-Factor. https://martinfowler.com | #6 patterns. Connect: [NONE].

## 19. AI image, video and audio generation

- https://higgsfield.ai | #1 Higgsfield [paid] 35+ models. Connect: [HOSTED] `https://mcp.higgsfield.ai/mcp` (no API key), [CLI] `npm i -g @higgsfield/cli`, [SKILL] `npx skills add higgsfield-ai/skills` (its skills are already installed), [LLMS].
- https://fal.ai | #2 fal.ai [paid per run] 1000+ models. Connect: [HOSTED] official `https://mcp.fal.ai/mcp-relay` OAuth, server free; docs MCP `https://fal.ai/docs/mcp`; [LLMS].
- https://replicate.com | #3 Replicate [paid per run]. Connect: official MCP `replicate-mcp` (`npx -y replicate-mcp` with `REPLICATE_API_TOKEN`, or the hosted remote server), agent skills at replicate.com/docs/reference/skills, [LLMS].
- https://huggingface.co | #4 Hugging Face [freemium]. Connect: [HAVE] connector; `claude mcp add hf-mcp-server -t http https://huggingface.co/mcp?login`; [CLI] `hf` (not installed).
- https://www.comfy.org | #5 ComfyUI [free, OSS] 148k stars, self-hosted. Connect: [LLMS] docs.comfy.org/llms.txt; community MCPs only.
- https://runway.com | #6 Runway [paid] (old runwayml.com redirects). Connect: official https://github.com/runwayml/runway-api-mcp-server [KEY] API key and billing.
- https://lumalabs.ai | #7 Luma [freemium]. Connect: API at https://platform.lumalabs.ai [KEY]; docs https://docs.agents.lumalabs.ai; no official Claude MCP found.
- https://www.krea.ai | #8 Krea [freemium]. Connect: [NONE]. https://www.midjourney.com | #9 Midjourney [paid]. Connect: [NONE] no official API found; unofficial proxies exist, avoid.
- https://elevenlabs.io | Voice and audio [freemium]. Connect: official https://github.com/elevenlabs/elevenlabs-mcp [KEY], [LLMS] elevenlabs.io/docs/llms.txt.

## 20. Image and video editing, code video

- https://ffmpeg.org | #1 FFmpeg [free, OSS]. Connect: [HAVE] `/usr/bin/ffmpeg`; community skill https://github.com/kajisho5/ffmpeg-skill (8.9k stars, unreviewed).
- https://github.com/heygen-com/hyperframes | #2 HyperFrames (HTML to video, 87k stars). Connect: [OSS] repo; plugin `hyperframes` is installed.
- https://www.remotion.dev | #3 Remotion [freemium] React video; company licence above 3 employees. Connect: [SKILL] official `npx remotion skills add` or `npx skills add remotion-dev/skills`, [LLMS].
- https://www.blackmagicdesign.com/products/davinciresolve | #4 DaVinci Resolve [freemium] manual editing, no agent connection.
- https://www.photopea.com | #5 Photopea. ImageMagick `convert` [HAVE] for batch image jobs.

## 21. Stock assets and data APIs

- https://polyhaven.com | #1 Poly Haven [free, CC0]. Connect: public API `https://api.polyhaven.com/assets?t=hdris` no key (tested 200); also via the `blender` MCP asset search.
- https://api.iconify.design | #2 Iconify API, no key (tested 200). https://unsplash.com/developers | #3 Unsplash API [KEY]. https://www.pexels.com/api/ | #4 Pexels API [KEY]. Community MCPs: https://github.com/hellokaton/unsplash-mcp-server (239 stars).

## 22. Site builders (reference only)

- https://www.framer.com | #1 Framer [freemium] strong motion reference. https://webflow.com | #2 Webflow [freemium] owns GSAP now. Connect: [NONE].

## 23. Agent tooling, MCP and CLIs

- https://github.com/upstash/context7 | #1 Context7 [free, OSS] 65k stars, pulls current docs for any package into chat. Connect: [NPM] `@upstash/context7-mcp` (bin `context7-mcp`), hosted `https://mcp.context7.com/mcp`.
- https://modelcontextprotocol.io | #2 MCP spec [LLMS]. https://registry.modelcontextprotocol.io | #3 official MCP registry (search is noisy, filter by vendor name).
- https://code.claude.com/docs | #4 Claude Code docs. https://platform.claude.com/docs/en/home | #5 Claude API docs [LLMS] docs.claude.com/llms.txt.
- https://github.com/vercel-labs/skills | #6 `skills` CLI (`npx skills add <repo>`), installs skills for 40+ agents. https://github.com/anthropics/skills | #7 Anthropic example skills. https://github.com/anthropics/claude-code | #8 Claude Code repo and issues.
- https://smithery.ai | #9 Smithery MCP directory. https://glama.ai/mcp/servers | #10 Glama MCP directory. https://cli.github.com | `gh`. https://developers.cloudflare.com/workers/wrangler/commands/ | Wrangler commands.

## Motion examples saved from motion.dev (2026-11-10)

Source: [motion.dev/examples](https://motion.dev/examples). Technique reference for dock, cards and scroll.

### Vanilla JS / WebGL (closest fit for Phoenix)
- https://motion.dev/examples/js-lenis-smooth-scroll
- https://motion.dev/examples/js-three-tsl
- https://motion.dev/examples/js-three-sequence
- https://motion.dev/examples/js-three-uniforms
- https://motion.dev/examples/js-tap-double
- https://motion.dev/examples/js-stagger-random
- https://motion.dev/examples/js-stagger-from-edges

### React: galleries & scroll
- https://motion.dev/examples/react-gallery-coverflow
- https://motion.dev/examples/react-gallery-cards
- https://motion.dev/examples/react-gallery-archive
- https://motion.dev/examples/react-gallery-showcase
- https://motion.dev/examples/react-scroll-zoom-hero

### React: interaction & effects
- https://motion.dev/examples/react-ios-pointer
- https://motion.dev/examples/react-press-repeat
- https://motion.dev/examples/react-particle-orb
- https://motion.dev/examples/react-base-context-menu
- https://motion.dev/examples/react-base-tabs

### React: Suspense animation
- https://motion.dev/examples/react-animate-suspense
- https://motion.dev/examples/react-animate-suspense-pop-layout
- https://motion.dev/examples/react-animate-suspense-wait

### Svelte
- https://motion.dev/examples/svelte-animate
- https://motion.dev/examples/svelte-hover
- https://motion.dev/examples/svelte-press

### Vue
- https://motion.dev/examples/vue-animate-view-skeleton
- https://motion.dev/examples/vue-context-menu
- https://motion.dev/examples/vue-confetti
- https://motion.dev/examples/vue-command-palette
- https://motion.dev/examples/vue-number-trend
- https://motion.dev/examples/vue-mega-menu
- https://motion.dev/examples/vue-ticker-rtl
- https://motion.dev/examples/vue-pokopia-modal
