# board-ocr: the offline Rush leaderboard reader

Reads a photo or screenshot of the EA FC **Rush leaderboard** into rows, with OCR instead of a vision model. It runs on a machine
you control, **not** in the Cloudflare Worker (OCR needs a real Python runtime). The Worker can call it over HTTP; with the
hook switched off, nothing changes.

Output is the JSON that `cleanBoard()` in `bot/scanocr.js` already takes, so the existing checks, review step and Discord post
are untouched:

```json
{"season_label": null, "highlighted_rank": 1,
 "rows": [{"rank": 2, "club": "Phoenix Fire", "vp": 8110, "gp": 5017, "m": 48, "bfg": 1, "avg_vp": 168.96, "flags": []}],
 "meta": {"needs_review": true, "review_ranks": [1, 14], "seconds": 11.4}}
```

## Setup (one time)

```bash
python3 -m venv tools/board-ocr/.venv
tools/board-ocr/.venv/bin/pip install -r tools/board-ocr/requirements.txt
```

About 100 MB, CPU only, roughly 500 MB RAM while reading and 10 s per photo on an old desktop CPU. No GPU, no Ollama.

## Use

```bash
tools/board-ocr/.venv/bin/python tools/board-ocr/board_ocr.py photo.jpg --roster clubs.txt --pretty
```

`--roster` is optional: a text file with one known club name per line. OCR drops spaces and accents and confuses `1` and `l`
(`Fc S1lence`, `Türkiyem`); the roster snaps each name back. Export it from the stored boards (`rush_boards`).

For the Worker, run the small server and point the Worker at it:

```bash
BOARD_OCR_KEY=<random 16+ chars> tools/board-ocr/.venv/bin/python tools/board-ocr/serve.py --roster clubs.txt
# Worker (wrangler secrets): BOARD_OCR_URL=<where the server is reachable>  BOARD_OCR_KEY=<same key>
```

It listens on `127.0.0.1:8788` only. Making it reachable from Cloudflare (a tunnel, or a host you run) is your decision and is
not set up here. Without both secrets the Worker keeps using the vision model, exactly as before. With them, `scanBoard()` tries
the offline reader first and **falls back to the vision model** when the reader is down, slow, or `cleanBoard()` rejects its read.

## How it reads, and what it flags

1. The photo is normalised to 1600 px wide (down or up).
2. One OCR pass finds the header words and every name and number. Rows are matched by name, following the tilt and sideways
   drift of a photographed screen (the header row's own slope picks the right row for each number).
3. VP and GP print touching (`12,5397,464`): split where **VP ÷ M = AVG VP** for a whole M. M itself is worked out as VP ÷ AVG VP,
   because OCR misses most M digits.
4. The thin single-digit cells (rank, BFG) are cropped, thresholded and tiled so the detector sees them, then read in batches.
5. Anything uncertain goes in the row's `flags`, and `meta.review_ranks` lists those rows. The Worker turns that into a warning
   for the manager's review step. The things it flags: BFG not read (assumed 1), rank inferred or repaired, VP ÷ M not matching,
   an implausible GP, a possibly missed row, a name matched to the roster.

Tested on one real photo (`sample/`): all 15 rows exact at every size from 640 to 3200 px and every JPEG quality tried; at 480 px
row 1 is wrong but flagged. `tests/boardocr.test.mjs` runs the real reader on it when the venv exists (`BOARD_OCR_PY` overrides
the interpreter) and always checks the Worker hook with a fake reader.

## Known limits

- One photo, one layout. More real screenshots (other lighting, consoles, cropped boards) should be added to `sample/`.
- The light highlighted row (usually rank 1) is the weakest: its rank and BFG are inferred and always listed for review.
- GP has no checksum; only a plausibility check.
- A club with no letters in its name (all digits) is not picked up as a row.
- RapidOCR keeps per-call thresholds on its shared engine: `board_ocr.py` pins them on every full pass. Keep that if you edit it.
