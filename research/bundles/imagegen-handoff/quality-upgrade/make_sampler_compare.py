r"""Compare chained-img2img samplers on the petite-nude chain.

Row 1: euler_ancestral baseline (from tier_suite_img2img_manifest, petite/nude)
Row 2: dpmpp_2m/karras  (from chain_sampler_manifest)
Row 3: euler/normal      (from chain_sampler_manifest)
cols = tiers. Shows whether non-ancestral samplers remove the cumulative graininess.
"""
import json

from PIL import Image, ImageDraw, ImageFont

SUITE = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\tier_suite_img2img_manifest.json"
SAMP = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\chain_sampler_manifest.json"
OUT = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\chain_sampler_compare.png"
THUMB_W = 300
CAP_H = 30
ROWLAB_W = 120
PAD = 4
BG = (24, 24, 28)

suite = json.load(open(SUITE, encoding="utf-8"))
samp = json.load(open(SAMP, encoding="utf-8"))
tiers = samp["tier_chain"]

base = {f["tier"]: f for f in suite["frames"]
        if f.get("files") and f["body"] == "petite" and f["clothing"] == "nude"}
dpm = {f["tier"]: f for f in samp["frames"] if f.get("files") and f["sampler"] == "dpmpp2m"}
eul = {f["tier"]: f for f in samp["frames"] if f.get("files") and f["sampler"] == "euler"}
ROWS = [("euler_a (base)", base), ("dpmpp_2m", dpm), ("euler", eul)]

try:
    font = ImageFont.truetype("arial.ttf", 15)
    rowfont = ImageFont.truetype("arialbd.ttf", 18)
except Exception:
    font = rowfont = ImageFont.load_default()

thumb_h = 0
cache = {}
for name, d in ROWS:
    for t in tiers:
        f = d.get(t)
        if not f:
            continue
        im = Image.open(f["files"][-1]).convert("RGB")
        w, h = im.size
        im = im.resize((THUMB_W, int(h * THUMB_W / w)), Image.LANCZOS)
        thumb_h = max(thumb_h, im.size[1])
        cache[(name, t)] = im

cell_h = thumb_h + CAP_H
W = ROWLAB_W + len(tiers) * THUMB_W + (len(tiers) + 1) * PAD
H = len(ROWS) * cell_h + (len(ROWS) + 1) * PAD
sheet = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(sheet)
for ri, (name, d) in enumerate(ROWS):
    y = PAD + ri * (cell_h + PAD)
    draw.text((6, y + thumb_h // 2 - 10), name, fill=(255, 210, 150), font=rowfont)
    for ci, t in enumerate(tiers):
        x = ROWLAB_W + PAD + ci * (THUMB_W + PAD)
        im = cache.get((name, t))
        if im is not None:
            sheet.paste(im, (x, y))
        draw.text((x + 3, y + thumb_h + 1), "t%d" % t, fill=(235, 235, 235), font=font)
sheet.save(OUT)
print("WROTE", OUT, sheet.size)
