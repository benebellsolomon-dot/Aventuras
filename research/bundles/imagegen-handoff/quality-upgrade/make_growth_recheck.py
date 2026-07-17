r"""Growth reality-check: chained img2img vs the known-good txt2img ladder, torso-cropped, high-res.

Row 1 = txt2img ladder (true tier growth, tier_ladder_manifest)
Row 2 = chained img2img petite CLOTHED (tier_suite_img2img_manifest)
Row 3 = chained img2img petite NUDE
Same tiers across rows -> direct read of how much bust growth the img2img chain actually delivers.
"""
import json

from PIL import Image, ImageDraw, ImageFont

LADDER = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\tier_ladder_manifest.json"
SUITE = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\tier_suite_img2img_manifest.json"
OUT = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\growth_recheck.png"
COMMON = [0, 14, 26, 40, 50]
THUMB_W = 480
CAP_H = 30
ROWLAB_W = 150
PAD = 5
BG = (24, 24, 28)

ladder = json.load(open(LADDER, encoding="utf-8"))
suite = json.load(open(SUITE, encoding="utf-8"))

lad = {f["tier"]: f for f in ladder["frames"] if f.get("files")}
pc = {f["tier"]: f for f in suite["frames"] if f.get("files") and f["body"] == "petite" and f["clothing"] == "clothed"}
pn = {f["tier"]: f for f in suite["frames"] if f.get("files") and f["body"] == "petite" and f["clothing"] == "nude"}
ROWS = [("txt2img ladder", lad), ("img2img petite clothed", pc), ("img2img petite nude", pn)]

try:
    font = ImageFont.truetype("arial.ttf", 16)
    rowfont = ImageFont.truetype("arialbd.ttf", 18)
except Exception:
    font = rowfont = ImageFont.load_default()


def torso(im):
    w, h = im.size
    return im.crop((0, int(h * 0.10), w, int(h * 0.60)))


thumb_h = 0
cache = {}
for name, d in ROWS:
    for t in COMMON:
        f = d.get(t)
        if not f:
            continue
        im = torso(Image.open(f["files"][-1]).convert("RGB"))
        w, h = im.size
        im = im.resize((THUMB_W, int(h * THUMB_W / w)), Image.LANCZOS)
        thumb_h = max(thumb_h, im.size[1])
        cache[(name, t)] = im

cell_h = thumb_h + CAP_H
W = ROWLAB_W + len(COMMON) * THUMB_W + (len(COMMON) + 1) * PAD
H = len(ROWS) * cell_h + (len(ROWS) + 1) * PAD
sheet = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(sheet)
for ri, (name, d) in enumerate(ROWS):
    y = PAD + ri * (cell_h + PAD)
    draw.text((6, y + thumb_h // 2 - 10), name, fill=(255, 210, 150), font=rowfont)
    for ci, t in enumerate(COMMON):
        x = ROWLAB_W + PAD + ci * (THUMB_W + PAD)
        im = cache.get((name, t))
        if im is not None:
            sheet.paste(im, (x, y))
        f = d.get(t, {})
        cup = (f.get("cup") or "?")
        draw.text((x + 3, y + thumb_h + 1), "t%d  %s" % (t, cup), fill=(235, 235, 235), font=font)
sheet.save(OUT)
print("WROTE", OUT, sheet.size)
