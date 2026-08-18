r"""Build a labeled contact sheet from the tier-ladder sweep manifest.

Tiles every rendered tier frame in ladder order with a caption strip
(tier / cup tag / slider / hyper) so monotonic growth + band separation
can be assessed in one view.
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

import sys

# usage: make_tier_montage.py [out.png] [cols] [crop] [manifest.json]
#   crop = "torso" crops each frame to the chest band for size-delta clarity
OUT = sys.argv[1] if len(sys.argv) > 1 else r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\tier_ladder_montage.png"
COLS = int(sys.argv[2]) if len(sys.argv) > 2 else 7
CROP = sys.argv[3] if len(sys.argv) > 3 else "full"
MANIFEST = sys.argv[4] if len(sys.argv) > 4 else r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\tier_ladder_manifest.json"
THUMB_W = 480          # per-cell image width
CAP_H = 56             # caption strip height
PAD = 6
BG = (24, 24, 28)
FG = (235, 235, 235)

man = json.load(open(MANIFEST, encoding="utf-8"))
frames = [f for f in man["frames"] if f.get("files")]
frames.sort(key=lambda f: f["tier"])

try:
    font = ImageFont.truetype("arialbd.ttf", 18)
    fontsm = ImageFont.truetype("arial.ttf", 15)
except Exception:
    font = ImageFont.load_default()
    fontsm = font

# load + scale thumbs
cells = []
thumb_h = 0
for f in frames:
    path = f["files"][-1]
    img = Image.open(path).convert("RGB")
    if CROP == "torso":
        w, h = img.size
        img = img.crop((0, int(h * 0.13), w, int(h * 0.60)))  # chest band
    w, h = img.size
    nh = int(h * THUMB_W / w)
    img = img.resize((THUMB_W, nh), Image.LANCZOS)
    thumb_h = max(thumb_h, nh)
    cells.append((f, img))

cell_h = thumb_h + CAP_H
rows = (len(cells) + COLS - 1) // COLS
W = COLS * THUMB_W + (COLS + 1) * PAD
H = rows * cell_h + (rows + 1) * PAD
sheet = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(sheet)

for i, (f, img) in enumerate(cells):
    r, c = divmod(i, COLS)
    x = PAD + c * (THUMB_W + PAD)
    y = PAD + r * (cell_h + PAD)
    sheet.paste(img, (x, y))
    cap_y = y + img.size[1] + 4
    line1 = "tier %d  -  %s" % (f["tier"], f["cup"])
    line2 = "slider %+.2f   hyper %.2f" % (f["slider"], f["hyper"])
    draw.text((x + 4, cap_y), line1, fill=FG, font=font)
    draw.text((x + 4, cap_y + 24), line2, fill=(170, 200, 255), font=fontsm)

sheet.save(OUT)
print("WROTE", OUT, sheet.size, "frames=", len(cells))
