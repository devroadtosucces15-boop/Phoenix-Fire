# Generates the Phoenix-themed 1024x1024 card backgrounds (centre left empty for the player). Run: python3 phoenix/card-looks/make.py
import math, random
from PIL import Image, ImageDraw, ImageFilter
S = 1024
OUT = __file__.rsplit('/', 1)[0]

def base(top, bottom):
    im = Image.new('RGB', (S, S)); px = im.load()
    for y in range(S):
        t = y / (S - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(S): px[x, y] = c
    return im

def glow(im, cx, cy, r, col, alpha=200):
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(r / 2.2))
    im.paste(layer, (0, 0), layer)

def embers(im, n, seed, cols):
    rnd = random.Random(seed); layer = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    for _ in range(n):
        x = rnd.random() * S; y = S - (rnd.random() ** 1.6) * S; r = rnd.uniform(1.5, 5)
        if abs(x - S / 2) < 230 and 200 < y < 900 and rnd.random() < .8: continue  # keep the middle clear
        d.ellipse((x - r, y - r, x + r, y + r), fill=rnd.choice(cols) + (rnd.randint(120, 255),))
    layer = layer.filter(ImageFilter.GaussianBlur(1.2)); im.paste(layer, (0, 0), layer)

def vignette(im):
    v = Image.new('L', (S, S), 0); d = ImageDraw.Draw(v); d.ellipse((-160, -160, S + 160, S + 160), fill=255)
    v = v.filter(ImageFilter.GaussianBlur(160)); dark = Image.new('RGB', (S, S), (4, 2, 1)); im.paste(dark, (0, 0), Image.eval(v, lambda a: 255 - a))

def floor(im, col):
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    d.ellipse((190, 820, 834, 960), fill=col + (150,)); layer = layer.filter(ImageFilter.GaussianBlur(30)); im.paste(layer, (0, 0), layer)

# 1. Ember Night: near-black, warm glow behind the player, rising sparks
a = base((16, 9, 5), (8, 4, 2)); glow(a, 512, 520, 430, (232, 116, 26), 150); glow(a, 512, 560, 250, (255, 154, 46), 120); floor(a, (255, 154, 46)); embers(a, 140, 1, [(255, 210, 122), (255, 154, 46), (232, 84, 26)]); vignette(a); a.save(f'{OUT}/ember-night.png')

# 2. Gold Crest: dark with a gold sunburst and fine rays
b = base((20, 13, 6), (6, 3, 1)); layer = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
for i in range(36):
    ang = i * math.pi / 18; w = .045
    d.polygon([(512, 540), (512 + 1500 * math.cos(ang - w), 540 + 1500 * math.sin(ang - w)), (512 + 1500 * math.cos(ang + w), 540 + 1500 * math.sin(ang + w))], fill=(243, 201, 92, 46 if i % 2 else 22))
layer = layer.filter(ImageFilter.GaussianBlur(3)); b.paste(layer, (0, 0), layer); glow(b, 512, 540, 360, (243, 201, 92), 120); floor(b, (243, 201, 92)); embers(b, 70, 2, [(255, 243, 207), (243, 201, 92)]); vignette(b); b.save(f'{OUT}/gold-crest.png')

# 3. Phoenix Rise: deep red-orange gradient, flame tongues along the bottom, bright core
c = base((26, 8, 4), (150, 52, 12)); glow(c, 512, 470, 380, (255, 190, 90), 120)
layer = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer); rnd = random.Random(3)
for i in range(26):
    x = i * S / 25 + rnd.uniform(-20, 20); h = rnd.uniform(160, 380) * (1.25 if abs(x - 512) > 300 else .55); w = rnd.uniform(40, 80)
    d.polygon([(x - w, S), (x, S - h), (x + w, S)], fill=(255, rnd.randint(110, 190), 40, rnd.randint(70, 130)))
layer = layer.filter(ImageFilter.GaussianBlur(14)); c.paste(layer, (0, 0), layer); embers(c, 120, 4, [(255, 230, 160), (255, 154, 46)]); vignette(c); c.save(f'{OUT}/phoenix-rise.png')
print('ok')
