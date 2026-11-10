"""Phoenix Fire Discord bot avatars + profile banners, round 2 (redone from scratch).

Usage:  python3 bot/icons/make_phoenix_icons_v2.py

Writes to bot/icons/phoenix/v2/:
  phoenix-<slug>.png          1024x1024 avatar (the crest is always dead centre, nothing covers it)
  phoenix-<slug>-128.png      128px preview
  phoenix-<slug>-banner.png   1360x480 profile banner (Discord shows 680x240, this is the 2x version)
  contact-sheet.png / banners-sheet.png

Design: dark ink field tinted with the bot's accent colour, scope shapes behind the crest (gears, bars, confetti,
sound, ...), a gold metal ring with an accent band, and a curved function banner wrapping the bottom of the ring.
The crest keeps a dark halo plus a soft accent rim so it always stands out.
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
OUT = HERE / "phoenix" / "v2"
CREST = HERE.parent.parent / "phoenix" / "overlay" / "crest.png"
FONT = HERE / "Anton-Regular.ttf"

INK = (10, 7, 5)
WHITE = (255, 255, 255)
GOLD_L, GOLD, GOLD_D = (255, 230, 156), (224, 174, 74), (126, 82, 26)
K = 2            # supersampling
S = 1024         # avatar size
BW, BH = 1360, 480

# slug, label, accent, second accent, scope, tagline (banner)
BOTS = [
    ("core",          "CORE",       "#ff5a1f", "#ffb23a", "core",  "RESULTS · ROLES · AUTOMOD"),
    ("stats",         "STATS",      "#3d8bff", "#8fd3ff", "stats", "CLUB & PLAYER RECORDS"),
    ("toolbot",       "TOOLBOT",    "#1fc8a8", "#9ff3df", "tools", "SETUP · EVENTS · TRIALS"),
    ("fun",           "FUN",        "#ffc21f", "#ff5fa2", "fun",   "JAIL · WHEEL · TRIVIA"),
    ("matchday",      "MATCHDAY",   "#1fa85a", "#8dffb8", "match", "EVENTS · LINEUPS · REMINDERS"),
    ("rush",          "RUSH",       "#ff2d2d", "#ffc15a", "rush",  "5V5 · LFG · QUEUE"),
    ("dj-controller", "DJ CONTROL", "#9b5cff", "#d6bbff", "dj",    "QUEUE · PLAY · ROOMS"),
    ("dj-1",          "DJ 1",       "#ff3b5c", "#ffa3b1", "vinyl", "VOICE ROOM 1"),
    ("dj-2",          "DJ 2",       "#2fd6ff", "#b0f1ff", "vinyl", "VOICE ROOM 2"),
    ("dj-3",          "DJ 3",       "#8dff3b", "#d6ffa6", "vinyl", "VOICE ROOM 3"),
    ("dj-4",          "DJ 4",       "#ff5fd0", "#ffb8ec", "vinyl", "VOICE ROOM 4"),
    ("dj-5-spare",    "DJ 5",       "#dfe6ee", "#ffffff", "vinyl", "SPARE VOICE ROOM"),
]


# ---------------------------------------------------------------- helpers
def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def A(c, a):
    return (*c[:3], a)


def vgrad(size, top, bot):
    g = Image.linear_gradient("L").resize(size)
    return Image.composite(Image.new("RGB", size, bot), Image.new("RGB", size, top), g)


def rgrad(size, inner, outer, power=1.0):
    g = Image.radial_gradient("L").resize(size)
    if power != 1:
        g = g.point(lambda v: round(255 * (v / 255) ** power))
    return Image.composite(Image.new("RGB", size, outer), Image.new("RGB", size, inner), g)


def over(canvas, layer, xy=(0, 0)):
    canvas.paste(layer.convert("RGB"), xy, layer.getchannel("A"))


def font(px):
    return ImageFont.truetype(str(FONT), round(px))


def cap_font(cap_px):
    """Anton sized so capital letters are cap_px tall."""
    ref = font(100).getbbox("H")
    return font(cap_px / ((ref[3] - ref[1]) / 100))


def cap_h(fnt):
    b = fnt.getbbox("H")
    return b[3] - b[1]


def load_crest(height):
    im = Image.open(CREST).convert("RGBA")
    box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(box)
    return im.resize((round(im.width * height / im.height), height), Image.LANCZOS)


def place_crest(canvas, crest, accent, center):
    """Dark halo + accent rim + crest, centred on `center`."""
    x, y = round(center[0] - crest.width / 2), round(center[1] - crest.height / 2)
    alpha = crest.getchannel("A")
    pad = 90 * K
    big = Image.new("L", (crest.width + 2 * pad, crest.height + 2 * pad), 0)
    big.paste(alpha, (pad, pad))
    rim = big.filter(ImageFilter.GaussianBlur(26 * K)).point(lambda v: min(255, round(v * 1.5)))
    canvas.paste(Image.new("RGB", big.size, mix(accent, WHITE, 0.15)), (x - pad, y - pad), rim.point(lambda v: round(v * 0.55)))
    halo = big.filter(ImageFilter.GaussianBlur(14 * K))
    canvas.paste(Image.new("RGB", big.size, INK), (x - pad, y - pad + 10 * K), halo.point(lambda v: round(v * 0.85)))
    over(canvas, crest, (x, y))


class Pen:
    """Draws in virtual units, scaled by K, on a transparent RGBA layer."""

    def __init__(self, w, h):
        self.im = Image.new("RGBA", (w * K, h * K), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def _p(self, pts):
        return [(x * K, y * K) for x, y in pts]

    def poly(self, pts, fill):
        self.d.polygon(self._p(pts), fill=fill)

    def line(self, pts, fill, w):
        self.d.line(self._p(pts), fill=fill, width=max(1, round(w * K)), joint="curve")

    def ell(self, cx, cy, rx, ry=None, fill=None, outline=None, w=1):
        ry = rx if ry is None else ry
        self.d.ellipse([(cx - rx) * K, (cy - ry) * K, (cx + rx) * K, (cy + ry) * K], fill=fill, outline=outline,
                       width=max(1, round(w * K)))

    def rrect(self, x0, y0, x1, y1, r, fill=None, outline=None, w=1):
        self.d.rounded_rectangle([x0 * K, y0 * K, x1 * K, y1 * K], radius=r * K, fill=fill, outline=outline,
                                 width=max(1, round(w * K)))

    def arc(self, bbox, a0, a1, fill, w):
        self.d.arc([v * K for v in bbox], a0, a1, fill=fill, width=max(1, round(w * K)))


def gear_pts(cx, cy, ro, ri, teeth, rot=0.0):
    pts, step = [], 2 * math.pi / teeth
    for t in range(teeth):
        base = rot + t * step
        for f, r in ((0.06, ri), (0.22, ro), (0.44, ro), (0.60, ri)):
            a = base + f * step
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def star4(p, cx, cy, r, fill, inner=0.24):
    pts = []
    for i in range(8):
        a = -math.pi / 2 + i * math.pi / 4
        rr = r if i % 2 == 0 else r * inner
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    p.poly(pts, fill)


def rect_rot(p, cx, cy, w, h, ang, fill):
    c, s = math.cos(ang), math.sin(ang)
    pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    p.poly([(cx + x * c - y * s, cy + x * s + y * c) for x, y in pts], fill)


def tri(p, cx, cy, r, ang, fill):
    p.poly([(cx + r * math.cos(ang + i * 2.0944), cy + r * math.sin(ang + i * 2.0944)) for i in range(3)], fill)


# ---------------------------------------------------------------- scope shapes: avatar (1024 box)
def shapes_icon(scope, acc, acc2, slug):
    p = Pen(S, S)
    rnd = random.Random(slug)
    if scope == "core":
        cx, cy, n = 512, 500, 30
        for i in range(n):
            a, w = i * 2 * math.pi / n, math.pi / n * 0.55
            p.poly([(cx, cy), (cx + 800 * math.cos(a - w), cy + 800 * math.sin(a - w)),
                    (cx + 800 * math.cos(a + w), cy + 800 * math.sin(a + w))], A(acc, 52 if i % 2 else 30))
        for _ in range(48):
            a, r = rnd.uniform(0, 6.283), rnd.uniform(300, 480)
            x, y = cx + r * math.cos(a), cy + r * math.sin(a)
            if y > 790:
                continue
            p.ell(x, y, rnd.uniform(2.5, 7), fill=A(mix(acc2, WHITE, 0.3), rnd.randint(140, 235)))
    elif scope == "stats":
        for y in range(190, 800, 68):
            p.line([(60, y), (964, y)], A(acc, 30), 2)
        hs = [150, 215, 180, 300, 255, 370, 330, 450, 520]
        tops = []
        for i, h in enumerate(hs):
            x = 112 + i * 100
            p.rrect(x, 800 - h, x + 62, 800, 5, fill=A(acc, 88))
            p.rrect(x, 800 - h, x + 62, 800 - h + 12, 5, fill=A(acc2, 170))
            tops.append((x + 31, 800 - h - 34))
        p.line(tops, A(acc2, 215), 7)
        for t in tops:
            p.ell(*t, 11, fill=A(WHITE, 240), outline=A(acc, 255), w=4)
    elif scope == "tools":
        for cx, cy, ro, ri, tn, hole, col, al, rot in (
                (190, 215, 215, 172, 12, 70, acc, 82, 0.1), (860, 225, 150, 120, 10, 48, acc2, 92, 0.3),
                (880, 720, 100, 80, 8, 30, acc, 80, 0.0), (130, 700, 78, 62, 8, 24, acc2, 70, 0.2)):
            p.poly(gear_pts(cx, cy, ro, ri, tn, rot), A(col, al))
            p.ell(cx, cy, hole, fill=(0, 0, 0, 0))
            p.ell(cx, cy, hole * 1.9, outline=A(col, min(255, al + 50)), w=3)
        for x, y, r in ((470, 110, 20), (560, 96, 14), (700, 120, 16)):   # bolts
            p.poly([(x + r * math.cos(i * 1.0472), y + r * math.sin(i * 1.0472)) for i in range(6)], A(acc2, 110))
    elif scope == "fun":
        cols = [acc, acc2, mix(acc, WHITE, 0.5), (80, 220, 255)]
        star4(p, 150, 205, 78, A(acc, 190))
        star4(p, 880, 255, 60, A(acc2, 200))
        star4(p, 820, 120, 28, A(WHITE, 190))
        placed = 0
        while placed < 34:
            x, y = rnd.uniform(60, 964), rnd.uniform(60, 810)
            if (x - 512) ** 2 + (y - 512) ** 2 > 470 ** 2 or (abs(x - 512) < 275 and abs(y - 505) < 290):
                continue
            c, k = rnd.choice(cols), rnd.choice(["rect", "dot", "tri", "spark", "rect"])
            al = rnd.randint(150, 235)
            if k == "rect":
                rect_rot(p, x, y, rnd.uniform(14, 26), rnd.uniform(6, 11), rnd.uniform(0, 3.14), A(c, al))
            elif k == "dot":
                p.ell(x, y, rnd.uniform(5, 11), fill=A(c, al))
            elif k == "tri":
                tri(p, x, y, rnd.uniform(10, 17), rnd.uniform(0, 6.28), A(c, al))
            else:
                star4(p, x, y, rnd.uniform(14, 28), A(c, al))
            placed += 1
    elif scope == "dj":
        p.arc([152, 170, 872, 890], 195, 345, A(acc, 125), 36)
        p.arc([172, 190, 852, 870], 195, 345, A(acc2, 150), 6)
        for x in (164, 860):
            p.rrect(x - 42, 400, x + 42, 600, 26, fill=A(acc, 140), outline=A(acc2, 220), w=6)
            p.rrect(x - 22, 440, x + 22, 560, 14, fill=A(INK, 120))
        pts = []
        for i in range(0, 121):
            x = 30 + i * 7.9
            pts.append((x, 708 + 54 * abs(math.sin(i / 7.0)) * math.sin(i * 1.9) * (0.5 + 0.5 * math.sin(i / 19.0 + 1))))
        p.line(pts, A(acc2, 175), 7)
    elif scope == "match":
        for i in range(8):
            if i % 2 == 0:
                p.poly([(60 + i * 113, 120), (60 + (i + 1) * 113, 120), (60 + (i + 1) * 113, 860), (60 + i * 113, 860)], A(acc, 26))
        L = A(mix(acc2, WHITE, 0.2), 95)
        p.rrect(70, 150, 954, 840, 6, outline=L, w=5)
        p.line([(70, 495), (954, 495)], L, 5)
        p.ell(512, 495, 150, outline=L, w=5)
        p.rrect(300, 150, 724, 290, 4, outline=L, w=5)
        p.rrect(300, 700, 724, 840, 4, outline=L, w=5)
        for cxx, cyy, a0 in ((70, 150, 0), (954, 150, 90), (954, 840, 180), (70, 840, 270)):
            p.arc([cxx - 46, cyy - 46, cxx + 46, cyy + 46], a0, a0 + 90, L, 5)
        for x, y in ((150, 250), (150, 400), (150, 590), (150, 740), (874, 250), (874, 400), (874, 590), (874, 740)):
            p.ell(x, y, 22, fill=A(acc2, 200), outline=A(WHITE, 220), w=4)
    elif scope == "rush":
        for i in range(14):
            y = 80 + i * 56
            x0 = rnd.randint(-80, 120)
            ln = rnd.randint(260, 560)
            p.poly([(x0, y), (x0 + ln, y), (x0 + ln + 36, y + 14), (x0 + 36, y + 14)], A(acc if i % 3 else acc2, 78 if i % 2 else 52))
            x1 = 1024 - x0 - ln - 40
            p.poly([(x1, y + 28), (x1 + ln, y + 28), (x1 + ln + 36, y + 42), (x1 + 36, y + 42)], A(acc if i % 3 else acc2, 62))
        for k, (x, y) in enumerate(((118, 800), (240, 880), (800, 880), (910, 800), (512, 940))):
            p.ell(x, y, 26, fill=A(acc2, 215), outline=A(WHITE, 235), w=4)
        for dx in (0, 54, 108):
            for sgn, base in ((-1, 150), (1, 874)):
                x = base + sgn * dx * 0.0
                p.poly([(x - 40 + dx * sgn, 220), (x + 6 + dx * sgn, 260), (x - 40 + dx * sgn, 300), (x - 20 + dx * sgn, 260)], A(acc2, 170 - dx))
    elif scope == "vinyl":
        for r in range(150, 500, 24):
            p.ell(512, 512, r, outline=A(WHITE, 22), w=2)
        for a0 in (205, 25):
            p.d.pieslice([(512 - 480) * K, (512 - 480) * K, (512 + 480) * K, (512 + 480) * K], a0, a0 + 26, fill=A(acc2, 30))
        for side in (-1, 1):
            for i in range(6):
                x = 76 + i * 30 if side < 0 else 1024 - 76 - i * 30 - 18
                h = rnd.randint(90, 300)
                p.rrect(x, 700 - h, x + 18, 700, 4, fill=A(acc, 130))
                p.rrect(x, 700 - h, x + 18, 700 - h + 9, 4, fill=A(acc2, 235))
    return p.im


# ---------------------------------------------------------------- scope shapes: banner (1360x480 box)
def shapes_banner(scope, acc, acc2, slug):
    p = Pen(BW, BH)
    rnd = random.Random(slug + "b")
    cx, cy = BW / 2, BH / 2
    if scope == "core":
        n = 40
        for i in range(n):
            a, w = i * 2 * math.pi / n, math.pi / n * 0.55
            p.poly([(cx, cy), (cx + 1500 * math.cos(a - w), cy + 1500 * math.sin(a - w)),
                    (cx + 1500 * math.cos(a + w), cy + 1500 * math.sin(a + w))], A(acc, 46 if i % 2 else 26))
        for _ in range(70):
            x, y = rnd.uniform(20, BW - 20), rnd.uniform(20, BH - 20)
            if abs(x - cx) < 220:
                continue
            p.ell(x, y, rnd.uniform(2.5, 7), fill=A(mix(acc2, WHITE, 0.3), rnd.randint(130, 235)))
    elif scope == "stats":
        for y in range(40, BH, 60):
            p.line([(0, y), (BW, y)], A(acc, 24), 2)
        tops = []
        for i in range(24):
            x, h = 28 + i * 56, 70 + i * 12 + rnd.randint(-30, 40)
            p.rrect(x, BH - h, x + 36, BH, 4, fill=A(acc, 82))
            p.rrect(x, BH - h, x + 36, BH - h + 9, 4, fill=A(acc2, 170))
            tops.append((x + 18, BH - h - 26))
        p.line(tops, A(acc2, 200), 5)
        for t in tops:
            p.ell(*t, 7, fill=A(WHITE, 235), outline=A(acc, 255), w=3)
    elif scope == "tools":
        for gx, gy, ro, ri, tn, hole, col, al, rot in (
                (150, 100, 150, 120, 12, 48, acc, 78, 0.1), (1230, 380, 190, 152, 14, 60, acc2, 84, 0.2),
                (360, 420, 80, 64, 9, 26, acc, 76, 0.0), (1100, 70, 72, 58, 8, 22, acc2, 80, 0.4),
                (1330, 90, 50, 40, 8, 16, acc, 70, 0.0)):
            p.poly(gear_pts(gx, gy, ro, ri, tn, rot), A(col, al))
            p.ell(gx, gy, hole, fill=(0, 0, 0, 0))
            p.ell(gx, gy, hole * 1.9, outline=A(col, min(255, al + 50)), w=3)
    elif scope == "fun":
        cols = [acc, acc2, mix(acc, WHITE, 0.5), (80, 220, 255)]
        star4(p, 130, 110, 70, A(acc, 190))
        star4(p, 1240, 360, 80, A(acc2, 200))
        star4(p, 1180, 90, 30, A(WHITE, 190))
        placed = 0
        while placed < 70:
            x, y = rnd.uniform(15, BW - 15), rnd.uniform(15, BH - 15)
            if abs(x - cx) < 215:
                continue
            c, k = rnd.choice(cols), rnd.choice(["rect", "dot", "tri", "spark", "rect"])
            al = rnd.randint(150, 235)
            if k == "rect":
                rect_rot(p, x, y, rnd.uniform(14, 26), rnd.uniform(6, 11), rnd.uniform(0, 3.14), A(c, al))
            elif k == "dot":
                p.ell(x, y, rnd.uniform(4, 10), fill=A(c, al))
            elif k == "tri":
                tri(p, x, y, rnd.uniform(9, 16), rnd.uniform(0, 6.28), A(c, al))
            else:
                star4(p, x, y, rnd.uniform(12, 26), A(c, al))
            placed += 1
    elif scope == "dj":
        for base, amp in ((78, 50), (402, 50)):
            pts = [(x, base + amp * math.sin(x / 38.0) * math.sin(x / 150.0 + 1) * math.sin(x / 9.0 + 2)) for x in range(0, BW + 1, 6)]
            p.line(pts, A(acc2, 165), 5)
        for side in (-1, 1):
            for i in range(8):
                x = 140 + i * 30 if side < 0 else BW - 140 - i * 30 - 18
                h = rnd.randint(60, 200)
                p.rrect(x, 410 - h, x + 18, 410, 4, fill=A(acc, 125))
                p.rrect(x, 410 - h, x + 18, 410 - h + 8, 4, fill=A(acc2, 230))
    elif scope == "match":
        for i in range(12):
            if i % 2 == 0:
                p.poly([(i * 113, 0), ((i + 1) * 113, 0), ((i + 1) * 113, BH), (i * 113, BH)], A(acc, 24))
        L = A(mix(acc2, WHITE, 0.2), 90)
        p.rrect(26, 26, BW - 26, BH - 26, 6, outline=L, w=5)
        p.line([(cx, 26), (cx, BH - 26)], L, 5)
        p.ell(cx, cy, 150, outline=L, w=5)
        p.rrect(26, 120, 200, 360, 4, outline=L, w=5)
        p.rrect(BW - 200, 120, BW - 26, 360, 4, outline=L, w=5)
        for x, y in ((330, 120), (330, 360), (480, 240), (1030, 120), (1030, 360), (880, 240), (250, 240), (1110, 240)):
            p.ell(x, y, 17, fill=A(acc2, 200), outline=A(WHITE, 215), w=3)
    elif scope == "rush":
        for i in range(10):
            y = 24 + i * 48
            x0 = rnd.randint(-60, 160)
            ln = rnd.randint(260, 520)
            p.poly([(x0, y), (x0 + ln, y), (x0 + ln + 30, y + 12), (x0 + 30, y + 12)], A(acc if i % 3 else acc2, 78 if i % 2 else 50))
            x1 = BW - x0 - ln - 30
            p.poly([(x1, y + 24), (x1 + ln, y + 24), (x1 + ln + 30, y + 36), (x1 + 30, y + 36)], A(acc if i % 3 else acc2, 62))
        for k in range(3):
            for base, sg in ((330, -1), (BW - 330, 1)):
                x = base + sg * k * 60
                p.poly([(x - 22, 190), (x + 14, 240), (x - 22, 290), (x - 8, 240)], A(acc2, 190 - k * 50))
    elif scope == "vinyl":
        for r in range(150, 900, 30):
            p.ell(cx, cy, r, outline=A(WHITE, 18), w=2)
        for a0 in (200, 20):
            p.d.pieslice([(cx - 880) * K, (cy - 880) * K, (cx + 880) * K, (cy + 880) * K], a0, a0 + 22, fill=A(acc2, 26))
        for side in (-1, 1):
            for i in range(11):
                x = 40 + i * 30 if side < 0 else BW - 40 - i * 30 - 18
                h = rnd.randint(70, 260)
                p.rrect(x, 440 - h, x + 18, 440, 4, fill=A(acc, 125))
                p.rrect(x, 440 - h, x + 18, 440 - h + 8, 4, fill=A(acc2, 232))
    return p.im


# ---------------------------------------------------------------- text
def pol(cx, cy, r, ang_deg):
    a = math.radians(ang_deg)
    return (cx + r * math.sin(a), cy + r * math.cos(a))


def band_mask(size, cx, cy, r1, r2, ang, notch):
    m = Image.new("L", (size, size), 0)
    pts, steps, rm = [], 140, (r1 + r2) / 2
    for i in range(steps + 1):
        pts.append(pol(cx, cy, r2, -ang + 2 * ang * i / steps))
    pts += [pol(cx, cy, rm, ang - notch), pol(cx, cy, r1, ang)]
    for i in range(steps, -1, -1):
        pts.append(pol(cx, cy, r1, -ang + 2 * ang * i / steps))
    pts.append(pol(cx, cy, rm, -ang + notch))
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m


def arc_text(canvas, text, fnt, cx, cy, rm, fill, track, dy=0):
    ws = [fnt.getlength(c) for c in text]
    total = sum(ws) + track * (len(text) - 1)
    rb = rm + cap_h(fnt) / 2
    s = -total / 2
    sz = round(fnt.size * 2.4)
    c = sz // 2
    for ch, w in zip(text, ws):
        phi = math.degrees((s + w / 2) / rm)
        s += w + track
        if ch == " ":
            continue
        lay = Image.new("RGBA", (sz, sz), (*fill[:3], 0))
        ImageDraw.Draw(lay).text((c, c), ch, font=fnt, fill=fill, anchor="ms")
        lay = lay.rotate(phi, resample=Image.BICUBIC)
        px, py = pol(cx, cy, rb, phi)
        over(canvas, lay, (round(px - c), round(py - c + dy)))


def arc_span(text, fnt, rm, track):
    total = sum(fnt.getlength(c) for c in text) + track * (len(text) - 1)
    return math.degrees(total / 2 / rm)


def flat_text(canvas, text, fnt, cx, cy, fill, track, dy=0):
    ws = [fnt.getlength(c) for c in text]
    total = sum(ws) + track * (len(text) - 1)
    x = cx - total / 2
    base = cy + cap_h(fnt) / 2 + dy
    lay = Image.new("RGBA", canvas.size, (*fill[:3], 0))
    d = ImageDraw.Draw(lay)
    for ch, w in zip(text, ws):
        d.text((x, base), ch, font=fnt, fill=fill, anchor="ls")
        x += w + track
    over(canvas, lay)


def flat_width(text, fnt, track):
    return sum(fnt.getlength(c) for c in text) + track * (len(text) - 1)


# ---------------------------------------------------------------- avatar
def make_icon(slug, label, acc_hex, acc2_hex, scope):
    N = S * K
    acc, acc2 = hexrgb(acc_hex), hexrgb(acc2_hex)
    c = N // 2
    canvas = rgrad((N, N), mix(acc, INK, 0.58), INK, 0.85)
    over(canvas, shapes_icon(scope, acc, acc2, slug))

    def annulus(ro, ri):
        m = Image.new("L", (N, N), 0)
        d = ImageDraw.Draw(m)
        d.ellipse([c - ro * K, c - ro * K, c + ro * K, c + ro * K], fill=255)
        d.ellipse([c - ri * K, c - ri * K, c + ri * K, c + ri * K], fill=0)
        return m

    canvas.paste(vgrad((N, N), GOLD_L, GOLD_D), (0, 0), annulus(507, 487))      # gold metal ring
    canvas.paste(Image.new("RGB", (N, N), INK), (0, 0), annulus(487, 478))
    canvas.paste(Image.new("RGB", (N, N), acc), (0, 0), annulus(478, 466))      # accent band
    canvas.paste(Image.new("RGB", (N, N), mix(GOLD, INK, 0.3)), (0, 0), annulus(466, 462))

    place_crest(canvas, load_crest(540 * K), acc, (c, c))                       # dead centre

    # curved function banner wrapping the bottom of the ring
    fnt = cap_font(64 * K)
    r1, r2 = 392 * K, 508 * K
    rm = (r1 + r2) / 2
    track = 7 * K
    half = min(64, max(30, arc_span(label, fnt, rm, track) + 13))
    gold_m = band_mask(N, c, c, r1, r2, half, 7)
    acc_m = band_mask(N, c, c, r1 + 8 * K, r2 - 8 * K, half - 1.4, 7.5)
    sh = ImageChops.offset(gold_m.filter(ImageFilter.GaussianBlur(14 * K)), 0, 12 * K).point(lambda v: round(v * 0.75))
    canvas.paste(Image.new("RGB", (N, N), INK), (0, 0), sh)
    canvas.paste(vgrad((N, N), GOLD_L, GOLD_D), (0, 0), gold_m)
    grad = Image.new("RGB", (N, N))
    gd = ImageDraw.Draw(grad)
    c_in, c_out = mix(acc, WHITE, 0.22), mix(acc, INK, 0.5)
    steps = 70
    for i in range(steps):
        t = i / (steps - 1)
        r = r2 - (r2 - r1) * t + 2 * K
        gd.ellipse([c - r, c - r, c + r, c + r], fill=mix(c_out, c_in, t))
    canvas.paste(grad, (0, 0), acc_m)
    txt = INK if lum(mix(acc, INK, 0.2)) > 150 else WHITE
    arc_text(canvas, label, fnt, c, c, rm, A(mix(INK, acc, 0.4) if txt == WHITE else WHITE, 120), track, dy=4 * K)
    arc_text(canvas, label, fnt, c, c, rm, A(txt, 255), track)
    # little gold studs at both ends of the lettering
    stud = Pen(S, S)
    for sgn in (-1, 1):
        x, y = pol(c / K, c / K, rm / K, sgn * (arc_span(label, fnt, rm, track) + 6.5))
        stud.ell(x, y, 7, fill=A(GOLD_L, 255), outline=A(GOLD_D, 255), w=2)
    over(canvas, stud.im)

    img = canvas.resize((S, S), Image.LANCZOS)
    img.save(OUT / f"phoenix-{slug}.png", optimize=True)
    img.resize((128, 128), Image.LANCZOS).save(OUT / f"phoenix-{slug}-128.png", optimize=True)
    return img


# ---------------------------------------------------------------- banner
def make_banner(slug, label, acc_hex, acc2_hex, scope, tagline):
    W, H = BW * K, BH * K
    acc, acc2 = hexrgb(acc_hex), hexrgb(acc2_hex)
    canvas = rgrad((W, H), mix(acc, INK, 0.55), INK, 0.8)
    st = Pen(BW, BH)
    for x in range(-BH, BW, 64):                       # faint diagonal stripes
        st.poly([(x, BH), (x + 12, BH), (x + 12 + BH * 0.47, 0), (x + BH * 0.47, 0)], A(WHITE, 8))
    over(canvas, st.im)
    over(canvas, shapes_banner(scope, acc, acc2, slug))

    y0, y1 = 182 * K, 298 * K                           # the ribbon strip behind the crest
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).rectangle([0, y0, W, y1], fill=255)
    canvas.paste(Image.new("RGB", (W, H), INK), (0, 12 * K), sh.filter(ImageFilter.GaussianBlur(14 * K)).point(lambda v: round(v * 0.7)))
    canvas.paste(vgrad((W, y1 - y0), GOLD_L, GOLD_D), (0, y0))
    canvas.paste(vgrad((W, y1 - y0 - 16 * K), mix(acc, WHITE, 0.22), mix(acc, INK, 0.5)), (0, y0 + 8 * K))

    place_crest(canvas, load_crest(414 * K), acc, (W / 2, H / 2))                # dead centre

    txt = INK if lum(mix(acc, INK, 0.2)) > 150 else WHITE
    shade = A(mix(INK, acc, 0.4), 120) if txt == WHITE else A(WHITE, 120)
    size = 64
    while True:
        fnt = cap_font(size * K)
        if flat_width(label, fnt, 6 * K) <= 410 * K:
            break
        size -= 2
    flat_text(canvas, label, fnt, 255 * K, 240 * K, shade, 6 * K, dy=4 * K)
    flat_text(canvas, label, fnt, 255 * K, 240 * K, A(txt, 255), 6 * K)
    size = 26
    while True:
        fnt = cap_font(size * K)
        if flat_width(tagline, fnt, 4 * K) <= 400 * K:
            break
        size -= 1
    flat_text(canvas, tagline, fnt, 1105 * K, 240 * K, shade, 4 * K, dy=3 * K)
    flat_text(canvas, tagline, fnt, 1105 * K, 240 * K, A(txt, 255), 4 * K)

    fr = Pen(BW, BH)                                    # thin gold keyline just inside the edge
    fr.rrect(10, 10, BW - 10, BH - 10, 14, outline=A(GOLD, 120), w=2)
    over(canvas, fr.im)
    img = canvas.resize((BW, BH), Image.LANCZOS)
    img.save(OUT / f"phoenix-{slug}-banner.png", optimize=True)
    return img


# ---------------------------------------------------------------- sheets
def round_crop(im, size):
    big = im.resize((size, size), Image.LANCZOS).convert("RGBA")
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    return big, m.resize((size, size), Image.LANCZOS)


def contact_sheet(icons):
    cols, cell, gap = 5, 256, 28
    rows = math.ceil(len(icons) / cols)
    row_h = cell + 64 + 80
    sheet = Image.new("RGB", (gap + cols * (cell + gap), gap + rows * row_h), (22, 16, 12))
    f, d = font(30), None
    d = ImageDraw.Draw(sheet)
    for i, (slug, im) in enumerate(icons):
        r, cc = divmod(i, cols)
        x, y = gap + cc * (cell + gap), gap + r * row_h
        big, m = round_crop(im, cell)
        sheet.paste(big, (x, y), m)
        s64, m64 = round_crop(im, 64)
        sheet.paste(s64, (x, y + cell + 12), m64)
        s32, m32 = round_crop(im, 32)
        sheet.paste(s32, (x + 80, y + cell + 28), m32)
        d.text((x, y + cell + 84), slug.upper(), font=f, fill=(240, 230, 220))
    sheet.save(OUT / "contact-sheet.png", optimize=True)


def banners_sheet(banners):
    gap, w = 24, 680
    h = round(w * BH / BW)
    cols = 2
    rows = math.ceil(len(banners) / cols)
    sheet = Image.new("RGB", (gap + cols * (w + gap), gap + rows * (h + 56)), (22, 16, 12))
    d, f = ImageDraw.Draw(sheet), font(26)
    for i, (slug, im) in enumerate(banners):
        r, cc = divmod(i, cols)
        x, y = gap + cc * (w + gap), gap + r * (h + 56)
        sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y))
        d.text((x, y + h + 8), slug.upper(), font=f, fill=(240, 230, 220))
    sheet.save(OUT / "banners-sheet.png", optimize=True)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    icons = [(s, make_icon(s, lb, a, a2, sc)) for s, lb, a, a2, sc, _ in BOTS]
    banners = [(s, make_banner(s, lb, a, a2, sc, tg)) for s, lb, a, a2, sc, tg in BOTS]
    contact_sheet(icons)
    banners_sheet(banners)
    print(f"Wrote {len(icons)} avatars + {len(banners)} banners + sheets to {OUT}")
