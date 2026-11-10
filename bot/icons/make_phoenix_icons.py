"""Makes the Phoenix Fire Discord bot avatar family from the Phoenix crest.

Usage:  python3 bot/icons/make_phoenix_icons.py

Writes bot/icons/phoenix/phoenix-<slug>.png (1024x1024), phoenix-<slug>-128.png (preview)
and phoenix/contact-sheet.png. Same crest placement, ring and backdrop on every icon; only the
corner badge glyph and the accent colour change. Everything sits inside Discord's circular crop.
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
OUT = HERE / "phoenix"
CREST = HERE.parent.parent / "phoenix" / "overlay" / "crest.png"
FONT = HERE / "Anton-Regular.ttf"
INK = (10, 7, 5)       # config.json brand.ink  #0a0705
WHITE = (255, 255, 255)
S = 1024

# slug, accent, glyph, arg
ICONS = [
    ("core",           "#e8651a", None,         None),   # brand red #e8651a, plain crest
    ("stats",          "#2f8cff", "chart",      None),
    ("toolbot",        "#20c9a6", "gear",       None),
    ("fun",            "#ffd21f", "spark",      None),
    ("dj-controller",  "#9b5cff", "headphones", None),
    ("dj-1",           "#ff3b5c", "vinyl",      "1"),
    ("dj-2",           "#3be8ff", "vinyl",      "2"),
    ("dj-3",           "#8dff3b", "vinyl",      "3"),
    ("dj-4",           "#ff6bd6", "vinyl",      "4"),
    ("dj-5-spare",     "#e9edf2", "vinyl",      "5"),
]


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def backdrop(accent):
    cx, cy, radius = S / 2, S * 0.44, S * 0.62
    glow = Image.new("RGB", (S, S), INK)
    g = ImageDraw.Draw(glow)
    steps = 60
    for i in range(steps, 0, -1):
        t = i / steps
        r = radius * t
        g.ellipse([cx - r, cy - r, cx + r, cy + r], fill=mix(mix(accent, INK, 0.45), INK, t ** 0.8))
    img = glow.convert("RGBA")
    stripes = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    s = ImageDraw.Draw(stripes)
    for x in range(-S, S * 2, S // 16):
        s.polygon([(x, S), (x + 14, S), (x + 14 + S * 0.47, 0), (x + S * 0.47, 0)], fill=(255, 255, 255, 10))
    img.alpha_composite(stripes)
    return img


def shadowed(canvas, layer, xy, blur=18, offset=(0, 14), alpha=170):
    sh = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    sh.paste((0, 0, 0, alpha), (0, 0), layer)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(sh, (xy[0] + offset[0], xy[1] + offset[1]))
    canvas.alpha_composite(layer, xy)


# ---- glyphs: drawn on a 4x supersampled square (side = 4*size), unit box centred ----
def glyph_layer(kind, arg, accent, size):
    k = 4
    N = size * k
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = N / 2
    u = N / 100  # 1 unit
    w = WHITE

    if kind == "chart":
        # three rising bars + baseline
        for i, h in enumerate((26, 44, 64)):
            x0 = c + (i - 1.5) * 26 * u / 1.0 * 0.62 - 6 * u + 8 * u * 0
            x0 = c + (i - 1) * 22 * u - 8 * u
            d.rounded_rectangle([x0, c + 22 * u - h * u, x0 + 16 * u, c + 22 * u], radius=3 * u,
                                fill=accent if i == 2 else w)
        d.rounded_rectangle([c - 36 * u, c + 25 * u, c + 36 * u, c + 30 * u], radius=2.5 * u, fill=w)
    elif kind == "gear":
        teeth, ro, ri = 8, 40, 30
        pts = []
        for t in range(teeth):
            a0 = t * 2 * math.pi / teeth
            for da, r in ((-0.20, ri), (-0.13, ro), (0.13, ro), (0.20, ri)):
                a = a0 + da * 2 * math.pi / teeth * 1.9
                pts.append((c + math.cos(a) * r * u, c + math.sin(a) * r * u))
        d.polygon(pts, fill=w)
        d.ellipse([c - 28 * u, c - 28 * u, c + 28 * u, c + 28 * u], fill=w)
        d.ellipse([c - 13 * u, c - 13 * u, c + 13 * u, c + 13 * u], fill=(0, 0, 0, 0))
        # punch the hole to transparent
        hole = Image.new("L", (N, N), 0)
        ImageDraw.Draw(hole).ellipse([c - 14 * u, c - 14 * u, c + 14 * u, c + 14 * u], fill=255)
        a = im.getchannel("A")
        a.paste(0, (0, 0), hole)
        im.putalpha(a)
        d = ImageDraw.Draw(im)
        d.ellipse([c - 6 * u, c - 6 * u, c + 6 * u, c + 6 * u], fill=accent)
    elif kind == "spark":
        def star4(cx, cy, r, inner=0.28, fill=w):
            pts = []
            for i in range(8):
                a = -math.pi / 2 + i * math.pi / 4
                rr = r if i % 2 == 0 else r * inner
                pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
            d.polygon(pts, fill=fill)
        star4(c - 6 * u, c + 4 * u, 38 * u, fill=w)
        star4(c + 26 * u, c - 26 * u, 15 * u, fill=accent)
        star4(c + 28 * u, c + 26 * u, 10 * u, fill=accent)
    elif kind == "headphones":
        lw = 9 * u
        # band
        d.arc([c - 32 * u, c - 38 * u, c + 32 * u, c + 26 * u], 180, 360, fill=w, width=round(lw))
        d.line([(c - 32 * u, c - 6 * u), (c - 32 * u, c + 6 * u)], fill=w, width=round(lw))
        d.line([(c + 32 * u, c - 6 * u), (c + 32 * u, c + 6 * u)], fill=w, width=round(lw))
        # cups
        for sgn in (-1, 1):
            x = c + sgn * 32 * u
            d.rounded_rectangle([x - 12 * u, c + 2 * u, x + 12 * u, c + 36 * u], radius=7 * u, fill=accent,
                                outline=w, width=round(4 * u))
    elif kind == "vinyl":
        r = 42 * u
        d.ellipse([c - r, c - r, c + r, c + r], fill=(24, 22, 26), outline=w, width=round(3.5 * u))
        for gr in (37,):
            d.ellipse([c - gr * u, c - gr * u, c + gr * u, c + gr * u], outline=(255, 255, 255, 90), width=round(1.6 * u))
        lr = 31 * u
        d.ellipse([c - lr, c - lr, c + lr, c + lr], fill=accent)
        f = ImageFont.truetype(str(FONT), round(58 * u))
        pass
        # sheen
        d.arc([c - 40 * u, c - 40 * u, c + 40 * u, c + 40 * u], 205, 250, fill=(255, 255, 255, 200), width=round(3 * u))
    return im.resize((size, size), Image.LANCZOS)


def make(slug, accent_hex, kind, arg):
    accent = hex_rgb(accent_hex)
    img = backdrop(accent)
    d = ImageDraw.Draw(img)
    # accent ring + faint inner keyline, just inside Discord's circle
    m = 14
    d.ellipse([m, m, S - m, S - m], outline=accent, width=16)
    d.ellipse([m + 26, m + 26, S - m - 26, S - m - 26], outline=(255, 255, 255, 60), width=3)
    # scope glyph: large, centred, behind the crest
    if kind:
        gs = 1150
        g = glyph_layer(kind, arg, accent, gs)
        o = (gs - S) // 2
        g = g.crop((o, o, o + S, o + S))
        tint = Image.new("RGB", g.size, mix(accent, WHITE, 0.35))
        from PIL import ImageChops
        a = g.getchannel("A")
        g = Image.merge("RGBA", (*ImageChops.multiply(g.convert("RGB"), tint).split(), a))
        g.putalpha(a.point(lambda v: round(v * 0.62)))
        img.alpha_composite(g, (0, 0))
    # crest: identical placement on every icon, dead centre
    crest = Image.open(CREST).convert("RGBA")
    ch = 600
    crest = crest.resize((round(crest.width * ch / crest.height), ch), Image.LANCZOS)
    shadowed(img, crest, ((S - crest.width) // 2, (S - ch) // 2))
    if kind == "vinyl":  # DJ number sits in the open space under the crest
        d = ImageDraw.Draw(img)
        f = ImageFont.truetype(str(FONT), 150)
        d.text((S / 2, 906), arg, font=f, fill=WHITE, anchor="mm", stroke_width=6, stroke_fill=INK)
    img = img.convert("RGB")
    img.save(OUT / f"phoenix-{slug}.png", optimize=True)
    img.resize((128, 128), Image.LANCZOS).save(OUT / f"phoenix-{slug}-128.png", optimize=True)
    return img


def contact_sheet(imgs):
    cols, cell, gap = 5, 256, 28
    rows = math.ceil(len(imgs) / cols)
    row_h = cell + 64 + 80
    W = gap + cols * (cell + gap)
    H = gap + rows * row_h
    sheet = Image.new("RGB", (W, H), (22, 16, 12))
    f = ImageFont.truetype(str(FONT), 26)
    d = ImageDraw.Draw(sheet)
    for i, (slug, im) in enumerate(imgs):
        r, cc = divmod(i, cols)
        x = gap + cc * (cell + gap)
        y = gap + r * row_h
        big = im.resize((cell, cell), Image.LANCZOS).convert("RGBA")
        mask = Image.new("L", (cell * 4, cell * 4), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, cell * 4 - 1, cell * 4 - 1], fill=255)
        mask = mask.resize((cell, cell), Image.LANCZOS)
        sheet.paste(big, (x, y), mask)  # Discord round crop
        small = im.resize((64, 64), Image.LANCZOS).convert("RGBA")
        m64 = Image.new("L", (256, 256), 0)
        ImageDraw.Draw(m64).ellipse([0, 0, 255, 255], fill=255)
        m64 = m64.resize((64, 64), Image.LANCZOS)
        sheet.paste(small, (x, y + cell + 12), m64)  # 64px
        sheet.paste(small.resize((32, 32), Image.LANCZOS), (x + 80, y + cell + 28), m64.resize((32, 32)))
        d.text((x, y + cell + 84), slug.upper(), font=f, fill=(240, 230, 220))
    sheet.save(OUT / "contact-sheet.png", optimize=True)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    made = [(s, make(s, a, k, g)) for s, a, k, g in ICONS]
    contact_sheet(made)
    print(f"Wrote {len(made)} icons + previews + contact-sheet.png to {OUT}")
