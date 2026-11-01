"""Trim the Grab tile icons: crop each original to its artwork, pad ~3% on a
square transparent canvas, resize to 512x512. Reads public/grab/icons/original/,
writes public/grab/icons/icon-NN.png (so it is safe to re-run).

Run from BINGO/:  python scripts/trim-grab-icons.py
"""
from pathlib import Path
from PIL import Image

ICONS = Path(__file__).resolve().parent.parent / "public" / "grab" / "icons"
PAD = 0.03
OUT = 512

for src in sorted((ICONS / "original").glob("icon-*.png")):
    im = Image.open(src).convert("RGBA")
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if box is None:
        print("skip (empty)", src.name)
        continue
    art = im.crop(box)
    side = round(max(art.size) * (1 + 2 * PAD))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
    canvas.resize((OUT, OUT), Image.LANCZOS).save(ICONS / src.name, optimize=True)
    print(src.name, box, "->", OUT)
