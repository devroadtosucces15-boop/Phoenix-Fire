# Rush leaderboard scanner + season cards

Two features, one engine: a photo goes in, the Worker reads the numbers with the Workers AI vision model, checks them, stores the numbers (never the photo), works out insights and posts in Discord.

| | Rush leaderboard | Season cards |
|---|---|---|
| Who uploads | managers and above | every member |
| Site page | `rushboard.html` | `seasoncards.html` |
| API | `GET /api/lb`, `POST /api/lb/{scan,save,remove,season}` | `GET /api/seasoncard`, `POST /api/seasoncard/{scan,save,remove}` |
| Flag (config.json) | `rushBoard` | `seasonCards` |
| Discord channel purpose | `rush_board` | `season_stats` |
| Bot command | `/board` (Phoenix Rush app, managers) | none, the site is the way in |
| Tables | `rush_boards` | `rush_season_cards` (migration 0058) |

Code: `bot/scanocr.js` (vision call + cleaning + quality checks), `bot/lbinsights.js` (pure maths: gaps, movement, pace, forecast, advice, rankings), `bot/rushscan.js` (routes, storage, Discord posts, `/board`), `next/static/{scanup,rushboard,seasoncards}.js`. Tests: `tests/rushscan.test.mjs`.

## Quality checks
- Leaderboard: ranks unique and in VP order, AVG = VP ÷ M, our row found by highlight or name, same-as-last-photo refused (409).
- Season card: wins ≤ matches, own VP ≤ club VP, our club, required fields present. Weak numbers become flags for managers, not errors.
- The person always gets a review step to correct what the model read before anything is saved or posted.

## Season clock
The end date is the day the season rolls over and is not counted: 22 Oct → 3 Dec is 42 days (the game shows "Day 19/42"). A new season starts a clean history.

## Switching it on (both ship dark: owner-only flags, no channel = no post)
1. Boardroom → Organization: set the channels `rush_board` and `season_stats`.
2. Boardroom → Switches: raise `rushBoard` and `seasonCards` (owner → managers/members).
3. Set the season on the Rush leaderboard page (name, start, rollover date, which season the cards are for).
4. For `/board`: register the commands once the Phoenix Rush app has its token.
5. First use of the vision model may need the one-off licence agreement; the code sends "agree" and retries by itself.

Throughput: reads are capped per person per hour (Workers AI free tier is metered).

## Optional offline leaderboard reader (dark by default)
`tools/board-ocr/` reads the leaderboard with OCR (RapidOCR/ONNX) instead of the vision model, on a machine you run, and checks VP ÷ M = AVG VP itself. `scanBoard()` in `bot/scanocr.js` calls it first only when the Worker has both `BOARD_OCR_URL` and `BOARD_OCR_KEY`; if it is down, slow, or `cleanBoard()` rejects its read, the vision model runs as before. Season cards still use the vision model. Setup, flags and limits: `tools/board-ocr/README.md`. Tests: `tests/boardocr.test.mjs`.
