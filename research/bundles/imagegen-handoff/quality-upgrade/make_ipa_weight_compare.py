r"""Compare IPA weights on curvy nude: 0.6 / 0.7 (weight test) vs 0.8 (full suite).
Checks which weight removes the washout while keeping identity + growth."""
import json

from PIL import Image, ImageDraw, ImageFont

WT = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\ipa_weight_manifest.json"
SUITE = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_ipa_suite_manifest.json"
OUT = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\ipa_weight_compare.png"
THUMB = 300
CAP = 26
ROWLAB = 90
PAD = 4
BG = (24, 24, 28)

wt = json.load(open(WT, encoding="utf-8"))
suite = json.load(open(SUITE, encoding="utf-8"))
COLS = wt["tiers"]
w06 = {f["tier"]: f for f in wt["frames"] if f.get("files") and abs(f["weight"] - 0.6) < 0.01}
w07 = {f["tier"]: f for f in wt["frames"] if f.get("files") and abs(f["weight"] - 0.7) < 0.01}
w08 = {f["tier"]: f for f in suite["frames"] if f.get("files") and f["body"] == "curvy" and f["clothing"] == "nude"}
ROWS = [("w0.6", w06), ("w0.7", w07), ("w0.8", w08)]

try:
    font = ImageFont.truetype("arial.ttf", 15)
    rowfont = ImageFont.truetype("arialbd.ttf", 18)
except Exception:
    font = rowfont = ImageFont.load_default()

cache = {}
th = 0
for name, d in ROWS:
    for t in COLS:
        f = d.get(t)
        if not f:
            continue
        im = Image.open(f["files"][-1]).convert("RGB")
        w, h = im.size
        im = im.resize((THUMB, int(h * THUMB / w)), Image.LANCZOS)
        th = max(th, im.size[1])
        cache[(name, t)] = im

cell_h = th + CAP
Wd = ROWLAB + len(COLS) * THUMB + (len(COLS) + 1) * PAD
Hd = len(ROWS) * cell_h + (len(ROWS) + 1) * PAD
sheet = Image.new("RGB", (Wd, Hd), BG)
dr = ImageDraw.Draw(sheet)
for ri, (name, d) in enumerate(ROWS):
    y = PAD + ri * (cell_h + PAD)
    dr.text((6, y + th // 2 - 10), name, fill=(255, 210, 150), font=rowfont)
    for ci, t in enumerate(COLS):
        x = ROWLAB + PAD + ci * (THUMB + PAD)
        im = cache.get((name, t))
        if im is not None:
            sheet.paste(im, (x, y))
        dr.text((x + 3, y + th + 1), "t%d" % t, fill=(235, 235, 235), font=font)
sheet.save(OUT)
print("WROTE", OUT, sheet.size)
