<!-- Kept 2026-11-15: the PF-020 owner decision (Item 4d). PF-020 is PAUSED in LIBRARY/roadmap.json until the owner answers. -->
Model: opus (claude-opus-5-5)   Item: PF-020 remainder (Item 4d owner decisions), then PF-021

STOP: do not start a build session from this file until the owner answers the Item 4d questions below. PF-020 stays NEXT at 85% waiting on them in `LIBRARY/roadmap.json`; PF-021 depends on PF-020.

## What landed (PR for branch claude/pf-020)
4a hardening (kit text from config, kit and number in the cinematic prompt, wrong-size model output scaled), 4b no pre-approval preview, 4c male and female kits (migration 0064, selectors, staff do/don't guide), 4d queue position and wait plus an hourly per-member submit throttle, 4e `/avatarcard` as a private panel (`bot/cardpanel.js`, `pf:card:` ids), 4f before/after screenshots (390, 820, 1440) in the side-session notes folder `pf020-shots/`.

## Owner decisions (not made here)
1. Workers Paid plan: same model, lifts the free 10,000 neurons/day pool shared by every AI feature; costs money.
2. Composite cinematic from the portrait cutout: halves AI calls; the cinematic looks less natural.
3. Fallback image provider: member face photos would leave Cloudflare (privacy and consent).
4. How far to widen the one-request-per-month limit (needs a table rebuild of `UNIQUE(user_id, month)`; raises AI use). Also the 1-minute cron and higher per-run limit, which change AI spend.

## Owner-side steps after merge
Apply migration 0064; deploy the Worker (panel, kit variants, new `/avatarcard` shape, bot link fixes); re-register slash commands; upload the male and female kit reference images in Staff Artwork. Optionally set `CARD_KIT_TEXT`, `CARD_KIT_TEXT_MALE`, `CARD_KIT_TEXT_FEMALE`.

## Then
When the owner has answered 4d, build the chosen option, mark PF-020 DONE, set PF-021 NEXT. Follow-ups noticed: abandoned attachment photos from `/avatarcard` stay in R2 under `cardphoto/` if never sent (add a cleanup); staff kit example image not made.
