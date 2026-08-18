r"""Grouped contact sheet for the hyper-band suite.

usage: make_suite_montage.py <group> [cols]
  group: framing | pose | seed | manga | monoton | all
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\hyper_suite_manifest.json"
group = sys.argv[1] if len(sys.argv) > 1 else "framing"
COLS = int(sys.argv[2]) if len(sys.argv) > 2 else 4
OUT = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\hyper_suite_%s.png" % group
THUMB_W = 420
CAP_H = 60
PAD = 6
BG = (24, 24, 28)
FG = (235, 235, 235)

man = json.load(open(MANIFEST, encoding="utf-8"))
frames = [f for f in man["frames"] if f.get("files")]
if group != "all":
    frames = [f for f in frames if f["group"] == group]
frames.sort(key=lambda f: f["label"])

try:
    font = ImageFont.truetype("arialbd.ttf", 18)
    fontsm = ImageFont.truetype("arial.ttf", 15)
except Exception:
    font = ImageFont.load_default()
    fontsm = font

cells = []
thumb_h = 0
for f in frames:
    img = Image.open(f["files"][-1]).convert("RGB")
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
    cy = y + img.size[1] + 4
    l1 = "%s t%d s%d" % (f["scene_key"], f["tier"], f["seed"])
    l2 = "%s  sl%.2f hy%.2f" % (f["register"], f["slider"], f["hyper"])
    draw.text((x + 4, cy), l1, fill=(255, 210, 150), font=font)
    draw.text((x + 4, cy + 24), l2, fill=(170, 200, 255), font=fontsm)

sheet.save(OUT)
print("WROTE", OUT, sheet.size, "frames=", len(cells))
