#!/usr/bin/env python3
"""Sample the top-row sky colour of every forest frame.

The frames are 301x250. Stretched over a portrait phone that is roughly a 3x
upscale, which is why the waiting screen looks soft and cropped. Rather than
scaling the art up, we pin it to the bottom of the screen at its own aspect
ratio and fill the space above with a gradient that matches that frame's sky.

Two samples per frame: the very top row (zenith) and a band just above the
treeline (horizon). A two-stop gradient between them reads as continuous sky
because the source art is already a vertical ramp up there.
"""
import glob
import json
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("pillow missing: pip install --break-system-packages pillow")


def avg(im, y0, y1):
    w, _ = im.size
    px = [im.getpixel((x, y)) for y in range(y0, y1) for x in range(0, w, 3)]
    n = len(px)
    return tuple(round(sum(p[i] for p in px) / n) for i in range(3))


def hexof(rgb):
    return "#%02x%02x%02x" % rgb


out = []
files = sorted(glob.glob("public/forest/forest-*.webp"))
if not files:
    sys.exit("no frames found — run this from the repo root")

for f in files:
    im = Image.open(f).convert("RGB")
    w, h = im.size
    zenith = avg(im, 0, max(2, h // 25))
    horizon = avg(im, h // 5, h // 5 + max(2, h // 25))
    out.append([hexof(zenith), hexof(horizon)])
    print(f"{f.split('/')[-1]}  zenith {hexof(zenith)}   horizon {hexof(horizon)}")

print()
print("SKY = " + json.dumps(out) + " as const")
