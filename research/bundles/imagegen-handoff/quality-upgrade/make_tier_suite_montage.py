r"""Grid montages for the img2img tier suite.

One grid per clothing state: rows = body types (petite, curvy, full, athletic), cols = tiers.
Reading down a column shows build-lock; reading across a row shows tier bust growth.

usage: make_tier_suite_montage.py <clothed|nude>
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

# usage: make_tier_suite_montage.py <clothed|nude> [manifest.json] [out_prefix]
clothing = sys.argv[1] if len(sys.argv) > 1 else "clothed"
MANIFEST = sys.argv[2] if len(sys.argv) > 2 else r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\tier_suite_img2img_manifest.json"
OUT_PREFIX = sys.argv[3] if len(sys.argv) > 3 else r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\tier_suite"
OUT = "%s_%s.png" % (OUT_PREFIX, clothing)
THUMB_W = 300
CAP_H = 34
ROWLAB_W = 96
PAD = 4
BG = (24, 24, 28)

man = json.load(open(MANIFEST, encoding="utf-8"))
rows = man["body_order"]
tiers = man.get("tier_chain") or man.get("tiers")
F = {(f["body"], f["tier"]): f for f in man["frames"]
     if f.get("files") and f["clothing"] == clothing}

try:
    font = ImageFont.truetype("arialbd.ttf", 16)
    fontsm = ImageFont.truetype("arial.ttf", 13)
    rowfont = ImageFont.truetype("arialbd.ttf", 20)
except Exception:
    font = fontsm = rowfont = ImageFont.load_default()

# preload to get thumb height
thumb_h = 0
cache = {}
for body in rows:
    for t in tiers:
        f = F.get((body, t))
        if not f:
            continue
        im = Image.open(f["files"][-1]).convert("RGB")
        w, h = im.size
        im = im.resize((THUMB_W, int(h * THUMB_W / w)), Image.LANCZOS)
        thumb_h = max(thumb_h, im.size[1])
        cache[(body, t)] = im

cell_h = thumb_h + CAP_H
ncols = len(tiers)
W = ROWLAB_W + ncols * THUMB_W + (ncols + 1) * PAD
H = len(rows) * cell_h + (len(rows) + 1) * PAD
sheet = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(sheet)

for ri, body in enumerate(rows):
    y = PAD + ri * (cell_h + PAD)
    draw.text((6, y + thumb_h // 2 - 10), body.upper(), fill=(255, 210, 150), font=rowfont)
    for ci, t in enumerate(tiers):
        x = ROWLAB_W + PAD + ci * (THUMB_W + PAD)
        im = cache.get((body, t))
        if im is not None:
            sheet.paste(im, (x, y))
        f = F.get((body, t), {})
        cup = (f.get("cup") or "").replace(" breasts", "").replace(" chest", "")
        draw.text((x + 3, y + thumb_h + 1), "t%d %s" % (t, cup), fill=(235, 235, 235), font=font)
        draw.text((x + 3, y + thumb_h + 18), "sl%.2f hy%.2f" % (f.get("slider", 0), f.get("hyper", 0)),
                  fill=(170, 200, 255), font=fontsm)

sheet.save(OUT)
print("WROTE", OUT, sheet.size)
