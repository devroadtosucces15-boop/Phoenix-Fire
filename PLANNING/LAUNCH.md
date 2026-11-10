# B8: Go-live checklist

Status (2026-11-10): the site is **closed**. Every page carries `noindex,nofollow` and `robots.txt` says `Disallow: /`.
Opening it is one config change plus the items below. The owner says when.

## The switch

`config.json`:
```json
"launch": { "public": false }
```
`phoenix/build.mjs` reads it on every build (the nightly `update.yml` run builds with `--live --out site`).

| | `public: false` (today) | `public: true` |
|---|---|---|
| Page meta | `noindex,nofollow` on every built page (unchanged from before the switch existed) | Dropped on public pages. **Kept** on `hub*`, `staff*`, `lookbook*`, `canvas*`, `playstyle*`, `offline`, `404`, and added to `squad.html` (member portal) and `members.html` (player-claim page) |
| `robots.txt` | `User-agent: *` / `Disallow: /` | `Allow: /`, `Disallow: /hub`, `Disallow: /staff`, `Sitemap: <siteUrl>sitemap.xml` |
| `sitemap.xml` | none | every page that is indexable and not noindex, with `lastmod` = build date, URLs from `config.json` `siteUrl` |

Open it by committing `"public": true`, pushing, and letting the site update run (or triggering it by hand). Close it again by
setting `false`; the next build restores the hidden state. Already-indexed pages drop out only after search engines recrawl, so do
not open it "to test".

`node phoenix/build.mjs --launch` forces open mode for a one-off build without touching the config (this is how `tests/launch.test.mjs`
checks both modes). Verified 2026-11-10: with the flag false the built output is byte-for-byte the same as before the change, apart
from the build timestamps that already differed between any two builds (`api/rankings.json`, `api/burners.json`, `squad.html`).

## Before flipping it (owner decisions marked **owner**)

| # | Check | State 2026-11-10 | Who |
|---|---|---|---|
| 1 | **Founded date (B2).** `config.json` `brand.founded` is blank on purpose. Never guess it. | **Fixed 2026-11-10:** the mock seed no longer sets `founded`; `tests/sharemeta.test.mjs` fails if "Est." shows while `brand.founded` is blank. Was: **Problem found:** the built `squad.html` currently shows "Est. 2019" because `phoenix/gen-data.mjs` seeds the mock config with `founded: '2019'`, and the legacy member portal reads it. That is an invented fact on a public-facing page. Fix before launch: remove `founded` from the mock in `phoenix/gen-data.mjs` (or use the real date once known) and add a test. Not changed now because it would alter the built output while closed. | **owner** gives the date; Claude fixes the mock |
| 2 | **OG / share image.** Link previews (Discord, X, WhatsApp) need `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`. | **Built 2026-11-10** (owner still approves the image `phoenix/overlay/share.png`; link-preview check pending): every indexable page gets description, canonical, `og:*`, `twitter:*` from `siteUrl`; test in `tests/sharemeta.test.mjs`. Was: **Missing.** The built pages carry no Open Graph or description meta; only the legacy `squad.html` has some. Needed: a 1200x630 Phoenix share image (crest on `#0a0705`, ember accent; `crest-lg.png` exists as source art), per-page title and description, plus `canonical`. Check afterwards with a link-preview tool and by pasting the home page in a Discord test channel. Branding rule: no NOREX name, colour or crest; add a test on the built head. | Claude builds, **owner** approves the image |
| 3 | **Worker host (B1).** The site calls `phoenix-bot.norexunited.workers.dev`. Fine functionally; decide first so the host is not changed right after launch. | Open. See `PLANNING/WORKER-HOST.md`. | **owner** |
| 4 | **Club docs release (B6).** Migration 0053 seed is on hold: nothing pinned or posted. | On hold. Decide whether members see the docs at launch and post the announcement. | **owner** |
| 5 | **Discord apps.** Matchday and Rush apps (B3) created and switched on, or knowingly left off. | **Done 2026-11-10** (`3134c06`); both endpoints answer. Owner may still want a member announcement. | **owner** |
| 6 | **Clean pages.** Every page reachable from the nav has real or honest-empty content (A5): no "undefined", no NaN, no placeholder text, no mock data labels ("Mock invite", `example.invalid` links). Note the staged mock config uses `siteUrl: https://example.invalid/phoenix-fire/`; the sitemap and robots take the real URL from the repo `config.json`, but any other use of the staged value would leak. Grep the built `site/` for `example.invalid` after a live build. | **Checked 2026-11-10:** a `--live` build has no `example.invalid`, "Mock invite", "undefined" or NaN in visible text (matches left are script code). The non-live mock build still has `example.invalid` in `404.html` and `squad.html`; it is never published. | Claude |
| 7 | **Branding leak check.** `phoenix/leakcheck.mjs` runs at the end of every build; also run `node tests/run.mjs`. | Passes | Claude |
| 8 | **Crest, favicon, manifest.** `site/` uses Phoenix crest, `manifest.webmanifest` name "PHOENIX FIRE", icons 192/512/maskable. | Present | Claude |
| 9 | **Recruitment and links.** `discord.applyLink` (`https://discord.gg/aN2J2Vktxu`) valid and not expiring; Twitch link correct; `recruitment.open` is what the owner wants public. | Confirm | **owner** |
| 10 | **Privacy of member pages.** `hub*`, `staff*` and the portal stay noindex and, where flagged members/owner, still gated in `config.json` `features`. Review the `features` map for anything that is `public` by accident. | Review | Claude and **owner** |

## Readiness walk, 2026-11-10 evening (`launch.public` is still `false`)

| # | Item | Verdict |
|---|---|---|
| 1 | Founded date | **Owner only.** Nothing shows "Est." while `brand.founded` is blank (tested). |
| 2 | Share image and meta | **Built; owner approves** `phoenix/overlay/share.png`, then paste the home URL in a private Discord channel. |
| 3 | Worker host (B1) | **Owner only.** |
| 4 | Club docs release (B6) | **Owner only.** |
| 5 | Discord apps | **Done** (Matchday and Rush live since `3134c06`; the old apps point to them until 2026-11-24). |
| 6 | Clean pages | **Done** (live build checked). Re-run `grep -c example.invalid site/*.html` after the next live build. |
| 7 | Branding leak check | **Done and extended**: `tests/brand.test.mjs` now also covers every app label, the stripe colours, the LFG and queue messages and the Phoenix-only bot modules. |
| 8 | Crest, favicon, manifest | **Done** (manifest `background_color` and `theme_color` are `#0a0705`). |
| 9 | Recruitment and apply link | **Owner confirms** `discord.applyLink` still works and `recruitment.open` is what should be public. |
| 10 | Privacy of member pages | **Reviewed, owner confirms.** Public today: `gameRules`, `liveBanner`, `trials`, `hallOfFame`, `builder`, `requests`, `proBuilds`, `events`, `awards`, `scoutReport`. Everything else is members, managers or owner. `rushQueue`, `rushLfg` stay `owner`. |

Claude has nothing left on this table. The go-live switch is B8 (owner).

## Search Console (after the flip)

1. Add the property in Google Search Console. The site lives on `devroadtosucces15-boop.github.io/Phoenix-Fire/`, a **path** on a
   shared GitHub Pages domain, so use a **URL-prefix** property (`https://devroadtosucces15-boop.github.io/Phoenix-Fire/`), not a
   Domain property. Verify with the HTML-file or meta-tag method (the meta tag would need adding to the build head: a small change to
   do at launch). A Domain property is only possible if the site later moves to a custom domain.
2. Submit `https://devroadtosucces15-boop.github.io/Phoenix-Fire/sitemap.xml`.
3. Note: `robots.txt` is only read at the **domain root** (`https://devroadtosucces15-boop.github.io/robots.txt`). A project site under a path cannot
   control it, so crawlers will not see this site's `robots.txt` at all; the **per-page meta tags are what actually work** on GitHub Pages.
   (The sitemap line is still useful because Search Console accepts it by submission.) A custom domain removes this limit.
4. Use URL Inspection on the home page, `results.html` and one match page; request indexing. Expect days, not hours.
5. Bing: import the property from Search Console in Bing Webmaster Tools.
6. Re-check after a week: Pages indexed, any "Excluded by noindex" on a page that should be public, mobile usability, the share preview.

## Rollback

Set `"public": false`, push, let the site build. Meta tags and `robots.txt` return to the closed state on the next deploy. To pull pages
out of Google faster, use the Removals tool in Search Console (temporary) while the noindex propagates.

## Launch day order

1. Items 1 to 6 done and a live build checked with `grep -c noindex site/*.html` (only the hidden set should match after the flip).
2. Flip the flag, push, wait for the site update to finish.
3. Open the live site logged out in a private window: view source on `index.html` (no `noindex`), open `/sitemap.xml`.
4. Paste the home URL into a private Discord channel to check the share card.
5. Search Console steps above; announce to members (B6) when the owner chooses.
