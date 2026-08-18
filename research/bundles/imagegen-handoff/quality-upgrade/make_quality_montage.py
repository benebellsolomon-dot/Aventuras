r"""Quality bake-off montage — detail crop (face/upper) at high res so sharpness/detail differences
are visible, plus optional full thumb. Reusable across quality stages.

usage: make_quality_montage.py <manifest.json> <out.png> [cols] [crop=face|full] [label_field]
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

MAN = sys.argv[1]
OUT = sys.argv[2]
COLS = int(sys.argv[3]) if len(sys.argv) > 3 else 3
CROP = sys.argv[4] if len(sys.argv) > 4 else "face"
LABELF = sys.argv[5] if len(sys.argv) > 5 else "id"
THUMB_W = 460
CAP_H = 40
PAD = 5
BG = (24, 24, 28)

man = json.load(open(MAN, encoding="utf-8"))
frames = [f for f in man["frames"] if f.get("files")]
frames.sort(key=lambda f: str(f.get(LABELF, "")))

try:
    font = ImageFont.truetype("arialbd.ttf", 17)
    fontsm = ImageFont.truetype("arial.ttf", 13)
except Exception:
    font = fontsm = ImageFont.load_default()


def crop(im):
    w, h = im.size
    if CROP == "face":
        return im.crop((int(w * 0.18), int(h * 0.04), int(w * 0.82), int(h * 0.50)))
    if CROP == "torso":
        return im.crop((0, int(h * 0.10), w, int(h * 0.62)))
    return im


cells = []
th = 0
for f in frames:
    im = crop(Image.open(f["files"][-1]).convert("RGB"))
    w, h = im.size
    im = im.resize((THUMB_W, int(h * THUMB_W / w)), Image.LANCZOS)
    th = max(th, im.size[1])
    cells.append((f, im))

cell_h = th + CAP_H
rows = (len(cells) + COLS - 1) // COLS
Wd = COLS * THUMB_W + (COLS + 1) * PAD
Hd = rows * cell_h + (rows + 1) * PAD
sheet = Image.new("RGB", (Wd, Hd), BG)
dr = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(cells):
    r, c = divmod(i, COLS)
    x = PAD + c * (THUMB_W + PAD)
    y = PAD + r * (cell_h + PAD)
    sheet.paste(im, (x, y))
    dr.text((x + 3, y + th + 1), str(f.get(LABELF, "")), fill=(255, 210, 150), font=font)
    note = str(f.get("note", ""))[:60]
    dr.text((x + 3, y + th + 21), note, fill=(170, 200, 255), font=fontsm)
sheet.save(OUT)
print("WROTE", OUT, sheet.size, "frames", len(cells))
