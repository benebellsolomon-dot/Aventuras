r"""Labeled torso montage for the hyper-band study (CUR vs FIX side by side)."""
import json

from PIL import Image, ImageDraw, ImageFont

MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\hyper_band_manifest.json"
OUT = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\hyper_band_montage.png"
COLS = 5
THUMB_W = 460
CAP_H = 64
PAD = 6
BG = (24, 24, 28)
FG = (235, 235, 235)

man = json.load(open(MANIFEST, encoding="utf-8"))
frames = [f for f in man["frames"] if f.get("files")]
frames.sort(key=lambda f: f["label"])

try:
    font = ImageFont.truetype("arialbd.ttf", 19)
    fontsm = ImageFont.truetype("arial.ttf", 16)
except Exception:
    font = ImageFont.load_default()
    fontsm = font

cells = []
thumb_h = 0
for f in frames:
    img = Image.open(f["files"][-1]).convert("RGB")
    w, h = img.size
    img = img.crop((0, int(h * 0.10), w, int(h * 0.62)))
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
    lbl = f["label"]
    color = (255, 200, 140) if "FIX" in lbl else (160, 220, 255)
    draw.text((x + 4, cy), lbl, fill=color, font=font)
    draw.text((x + 4, cy + 26), "%s  s%.2f h%.2f" % (f["cup"], f["slider"], f["hyper"]),
              fill=FG, font=fontsm)

sheet.save(OUT)
print("WROTE", OUT, sheet.size, "frames=", len(cells))
