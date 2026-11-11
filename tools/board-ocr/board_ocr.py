#!/usr/bin/env python3
"""Read a photo or screenshot of the EA FC "Rush" leaderboard into structured rows, off the Worker.

    python board_ocr.py photo.jpg [--roster clubs.txt] [--pretty]

Prints the JSON that bot/scanocr.js `cleanBoard()` already takes:
    {"season_label": null, "highlighted_rank": 2|null,
     "rows": [{"rank","club","vp","gp","m","bfg","avg_vp","flags":[...]}], "meta": {...}}

How it reads (no vision model, no grid lines needed):
  1. normalise the photo to 1600 px wide (down OR up: tiny photos fail, huge ones are slow)
  2. one OCR pass finds the header words and every club name / number, with their positions
  3. rows are matched by name, following the tilt and sideways drift of a photographed screen
  4. VP and GP print touching ("12,5397,464"): split where VP ÷ M equals AVG VP for a whole M
  5. M is worked out as VP ÷ AVG VP (OCR misses most M digits; the screen's own checksum recovers it)
  6. the thin single-digit cells (rank, BFG) are cropped, thresholded and read in batches
  7. optional roster: snaps OCR names to known club names (restores spaces, accents, 1/l)
Every uncertain value is listed in the row's `flags`; `meta.needs_review` is true when any row has one.
"""
import argparse, difflib, io, json, re, sys, time, unicodedata
import numpy as np
from PIL import Image, ImageOps

WORK_W = 1600
ONE = set("1l|I7i!")          # a bare "1" in the game font is read as 7 / l / I at low confidence
AVG_RE = re.compile(r"^\d{1,3}\.\d{2}$")
NUM_RE = re.compile(r"^[\d,.\s]+$")


class BoardError(Exception):
    pass


_engine = None


def engine():
    global _engine
    if _engine is None:
        try:
            import onnxruntime
            onnxruntime.disable_telemetry_events()
        except Exception:
            pass
        from rapidocr_onnxruntime import RapidOCR
        _engine = RapidOCR()
    return _engine


def fold(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def otsu(g):
    h, _ = np.histogram(g, bins=256, range=(0, 256))
    tot, total_sum = g.size, (np.arange(256) * h).sum()
    wb = sb = 0
    best = (0.0, 128)
    for t in range(256):
        wb += h[t]
        if wb == 0 or wb == tot:
            continue
        sb += t * h[t]
        v = wb * (tot - wb) * (sb / wb - (total_sum - sb) / (tot - wb)) ** 2
        if v > best[0]:
            best = (v, t)
    return best[1]


def read_cells(im, centers, hw, hh, one_map=False, n=3, chunk=5):
    """Read many small single-glyph cells. Each is cropped, thresholded to black-on-white and tiled `n` times
    (the detector ignores a lone glyph but finds a line of them); cells are stacked into sheets so one OCR call reads
    several. Returns one string per centre ('' when nothing readable)."""
    gap = 30
    slot_h, slot_w = 2 * hh + 2 * gap, n * 2 * hw + (n + 1) * gap
    out = [""] * len(centers)
    for start in range(0, len(centers), chunk):
        part = centers[start:start + chunk]
        sheet = Image.new("L", (slot_w, slot_h * len(part)), 255)
        for i, (cx, cy) in enumerate(part):
            g = np.array(im.crop((int(cx - hw), int(cy - hh), int(cx + hw), int(cy + hh))).convert("L"))
            b = np.where(g > otsu(g), 0, 255).astype("uint8")
            if b.mean() < 128:                      # the glyph must be the minority ink
                b = 255 - b
            cell = Image.fromarray(b)
            for k in range(n):
                sheet.paste(cell, (gap + k * (2 * hw + gap), i * slot_h + gap))
        sheet = sheet.resize((sheet.width * 3, sheet.height * 3), Image.LANCZOS).convert("RGB")
        res, _ = engine()(np.array(sheet), box_thresh=0.2, unclip_ratio=2.2, text_score=0.2)
        votes = [{} for _ in part]
        for pts, t, conf in res or []:
            i = min(len(part) - 1, int((sum(p[1] for p in pts) / len(pts) / 3) // slot_h))
            t = "".join(("1" if (one_map and ch in ONE) else ch) for ch in t if ch.isalnum() or ch in "|!")
            if len(t) >= n and len(t) % n == 0 and t == t[:len(t) // n] * n:
                t = t[:len(t) // n]                 # "222" read as one line -> the cell was "2"
            if t:
                votes[i][t] = votes[i].get(t, 0) + float(conf)
        for i, v in enumerate(votes):
            out[start + i] = max(v, key=v.get) if v else ""
    return out


def split_vpgp(digits, avg):
    """VP and GP with the commas lost: every split where VP ÷ M == AVG for a whole M (M 1..99)."""
    found = []
    for k in range(3, len(digits) - 2):
        vp, gp = int(digits[:k]), int(digits[k:])
        for m in range(1, 100):
            if abs(vp / m - avg) <= 0.0051:
                found.append((vp, gp, m))
    return found


def merge_name_boxes(boxes):
    """A name OCR split into several boxes on one line becomes one name (spaces come back for free)."""
    boxes = sorted(boxes, key=lambda b: (b["y"], b["x0"]))
    rows = []
    for b in boxes:
        last = rows[-1] if rows else None
        if last and abs(b["y"] - last["y"]) < 20 and 0 <= b["x0"] - last["x1"] < 90:
            last["t"] += " " + b["t"]
            last["x1"] = b["x1"]
        else:
            rows.append(dict(b))
    return rows


def snap(name, roster):
    if not roster:
        return name, False
    f = fold(name)
    by = {fold(r): r for r in roster}
    if f in by:
        return by[f], by[f] != name
    best = difflib.get_close_matches(f, list(by), n=1, cutoff=0.82)
    return (by[best[0]], True) if best else (name, False)


def read_board(img, roster=None):
    t0 = time.time()
    img = ImageOps.exif_transpose(img).convert("RGB")
    im = img.resize((WORK_W, max(1, round(img.height * WORK_W / img.width))), Image.LANCZOS)
    # RapidOCR keeps per-call thresholds on the shared engine, so the cell reads (lowered) would leak into the next
    # photo's full pass: pin the library defaults on every full pass.
    res, _ = engine()(np.array(im), box_thresh=0.5, unclip_ratio=1.6, text_score=0.5)
    if not res:
        raise BoardError("No text found in that image.")
    B = []
    for pts, txt, conf in res:
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        B.append(dict(t=txt.strip(), x0=min(xs), x1=max(xs), y=(min(ys) + max(ys)) / 2, c=float(conf)))

    head = {}
    for b in B:
        f = fold(b["t"])
        for key, test in (("rank", f.endswith("rank")), ("club", f == "clubname"), ("vp", f in ("vp", "vpgp", "vpgpm")), ("gp", f == "gp"),   # recompressed JPEGs merge VP+GP into one box
                          ("bfg", f == "bfg"), ("avg", f in ("avgvp", "avg"))):
            if test and key not in head:
                head[key] = b
    for need in ("vp", "bfg", "avg"):
        if need not in head:
            raise BoardError(f"Could not find the {need.upper()} column header. Retake the photo with the whole table in frame.")
    top = max(b["y"] for b in head.values()) + 25
    left = head["rank"]["x1"] - 10 if "rank" in head else 0
    right = head["vp"]["x0"] - 20

    names = merge_name_boxes([b for b in B if b["y"] > top and left <= b["x0"] and b["x1"] < right and re.search(r"[^\W\d_]", b["t"])])
    if not names:
        raise BoardError("No club rows found under the header.")
    avgs = [b for b in B if b["y"] > top and AVG_RE.match(b["t"])]
    avgs.sort(key=lambda b: b["y"])

    # tilt (y change per x) and drift (x change per y) of the photographed screen
    # The tilt is ambiguous from the rows alone (half a row pitch looks like "one row off"), so the header row's own
    # slope is the prior that picks which name belongs to which AVG box.
    slope = 0.0
    hx = [(h["x0"] + h["x1"]) / 2 for h in head.values()]
    hy = [h["y"] for h in head.values()]
    prior = float(np.polyfit(hx, hy, 1)[0]) if len(hx) >= 3 and max(hx) - min(hx) > 300 else 0.0
    if len(avgs) >= 3:
        best = None
        for off in (-1, 0, 1):
            pairs = list(zip(names[max(0, off):], avgs[max(0, -off):]))
            sl = [(a["y"] - nm["y"]) / (a["x0"] - nm["x0"]) for nm, a in pairs if a["x0"] - nm["x0"] > 200]
            if len(sl) >= 3:
                med = float(np.median(sl))
                if abs(med) < 0.1 and (best is None or abs(med - prior) < abs(best - prior)):
                    best = med
        slope = best if best is not None else prior
    drift = float(np.polyfit([a["y"] for a in avgs], [a["x0"] for a in avgs], 1)[0]) if len(avgs) >= 3 else 0.0
    drift = drift if abs(drift) < 0.2 else 0.0

    rows = []
    for nm in names:
        yat = lambda x, nm=nm: nm["y"] + slope * (x - nm["x0"])
        near = lambda b, nm=nm, yat=yat: abs(b["y"] - yat(b["x0"])) < 26
        a = min((b for b in avgs if near(b)), key=lambda b: abs(b["y"] - yat(b["x0"])), default=None)
        nums = sorted((b for b in B if b["y"] > top and near(b) and NUM_RE.match(b["t"]) and not AVG_RE.match(b["t"])
                       and head["vp"]["x0"] - 90 < b["x0"] < head["bfg"]["x0"] - 40
                       and (sum(ch.isdigit() for ch in b["t"]) >= 5 or "," in b["t"])), key=lambda b: b["x0"])
        r = dict(club=nm["t"], avg_vp=float(a["t"]) if a else None, vp=None, gp=None, m=None, flags=[], _yat=yat)
        txt = "".join(b["t"].replace(" ", "") for b in nums)
        if txt:
            # intact commas: "12,5397,464", optionally with the M cell glued on the end ("3,1502,65836")
            lead = re.match(r"^(\d{1,3},\d{3})(\d{1,3},\d{3})(\d{0,3})$", txt)
            if lead:
                r["vp"], r["gp"] = int(lead.group(1).replace(",", "")), int(lead.group(2).replace(",", ""))
            elif r["avg_vp"]:
                cands = split_vpgp(re.sub(r"\D", "", txt), r["avg_vp"])
                if cands:
                    r["vp"], r["gp"], _ = cands[0]
                    if len(cands) > 1:
                        r["flags"].append("ambiguous VP/GP split")
                else:
                    r["flags"].append("VP/GP not splittable")
            else:
                r["flags"].append("VP/GP merged and no average to split by")
        else:
            r["flags"].append("VP/GP not read")
        if r["vp"] and r["avg_vp"]:
            m = round(r["vp"] / r["avg_vp"])
            if m > 0 and abs(r["vp"] / m - r["avg_vp"]) <= 0.0051:
                r["m"] = m
            else:
                r["flags"].append("checksum: VP ÷ M does not match AVG VP")
        elif r["vp"]:
            r["flags"].append("average not read")
        if r["vp"] and r["gp"] and not 0.2 <= r["gp"] / r["vp"] <= 2.5:      # GP has no checksum; this catches a glued-on digit
            r["flags"].append("GP looks implausible next to VP")
        rows.append(r)

    # single-digit cells: BFG always, rank when the header gives its column
    bx = (head["bfg"]["x0"] + head["bfg"]["x1"]) / 2
    bfg_c = [(bx + drift * (r["_yat"](bx) - head["bfg"]["y"]), r["_yat"](bx)) for r in rows]
    bfg = read_cells(im, bfg_c, 30, 24, one_map=True)
    if "rank" in head:
        rw = head["rank"]["x1"] - head["rank"]["x0"]
        rx = head["rank"]["x0"] + 0.6 * rw
        rank = read_cells(im, [(rx, r["_yat"](rx)) for r in rows], max(24, int(0.22 * rw)), 24)
        lum = []
        for r in rows:
            cx, cy = rx, r["_yat"](rx)
            lum.append(float(np.array(im.crop((int(cx - 40), int(cy - 20), int(cx + 40), int(cy + 20))).convert("L")).mean()))
    else:
        rank, lum = [""] * len(rows), [0.0] * len(rows)
    for i, r in enumerate(rows):
        if bfg[i].isdigit():
            r["bfg"] = int(bfg[i])
        else:
            r["bfg"] = 1
            r["flags"].append("bfg inferred (thin glyph not read)")
        r["rank"] = int(rank[i]) if rank[i].isdigit() else None

    # blank ranks (the light highlight row) come from the neighbours
    for i, r in enumerate(rows):
        if r["rank"] is None:
            nxt = next((q["rank"] for q in rows[i + 1:] if q["rank"] is not None), None)
            prev = rows[i - 1]["rank"] if i else 0
            r["rank"] = (nxt - 1) if nxt else (prev or 0) + 1
            r["flags"].append("rank inferred")
    # ranks run 1,2,3…: a read that breaks the run while the next row confirms the gap is a misread digit
    for i in range(1, len(rows)):
        p, r = rows[i - 1]["rank"], rows[i]["rank"]
        n = rows[i + 1]["rank"] if i + 1 < len(rows) else None
        if r == p + 1:
            continue
        if i == len(rows) - 1 and r in {q["rank"] for q in rows[:i]}:
            continue                                # the game pins our own row again at the very bottom
        if 1 < r - p <= 3 and (n is None or n == r + 1):
            rows[i]["flags"].append("rank gap: a row may have been missed")
            continue
        rows[i]["rank"] = p + 1
        rows[i]["flags"].append(f"rank repaired (read {r})")
    med = float(np.median(lum)) if lum else 0
    hl = next((r["rank"] for r, l in zip(rows, lum) if l > med + 35), None)

    out, seen = [], set()
    for r in rows:
        if r["rank"] in seen:                       # the game repeats our own row at the very bottom
            continue
        seen.add(r["rank"])
        r["club"], snapped = snap(r["club"], roster)
        if snapped:
            r["flags"].append("name matched to roster")
        r.pop("_yat")
        out.append({k: r[k] for k in ("rank", "club", "vp", "gp", "m", "bfg", "avg_vp", "flags")})
    review = [r["rank"] for r in out if any(not f.startswith("name matched") for f in r["flags"])]
    return {"season_label": None, "highlighted_rank": hl, "rows": out,
            "meta": {"engine": "rapidocr-onnx", "width": WORK_W, "seconds": round(time.time() - t0, 1),
                     "needs_review": bool(review), "review_ranks": review, "tilt": round(slope, 4), "drift": round(drift, 4)}}


def read_bytes(data, roster=None):
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        raise BoardError("That is not an image I can open (JPEG, PNG or WebP).")
    return read_board(img, roster)


def load_roster(path):
    if not path:
        return None
    return [ln.strip() for ln in open(path, encoding="utf-8") if ln.strip()]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("image")
    ap.add_argument("--roster", help="text file, one known club name per line")
    ap.add_argument("--pretty", action="store_true")
    a = ap.parse_args(argv)
    try:
        res = read_bytes(open(a.image, "rb").read(), load_roster(a.roster))
        code = 0
    except (BoardError, OSError) as e:
        res, code = {"error": str(e)}, 2
    print(json.dumps(res, ensure_ascii=False, indent=2 if a.pretty else None))
    return code


if __name__ == "__main__":
    sys.exit(main())
