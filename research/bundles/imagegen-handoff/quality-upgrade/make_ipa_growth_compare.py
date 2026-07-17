r"""Growth compare (torso): openpose-only vs IPA full-body ref (v1) vs IPA face-crop ref (v2).

Confirms the face-crop reference (v2) restores full tier growth (matches openpose-only), while the
full-body reference (v1) mildly suppressed the top end.
"""
import json

from PIL import Image, ImageDraw, ImageFont

SUITE = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_suite_manifest.json"
V1 = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_ipa_manifest.json"
V2 = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_ipa_v2_manifest.json"
OUT = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\ipa_growth_compare.png"
COLS = [14, 26, 40, 50]
THUMB = 360
CAP = 26
ROWLAB = 170
PAD = 5
BG = (24, 24, 28)

suite = json.load(open(SUITE, encoding="utf-8"))
v1 = json.load(open(V1, encoding="utf-8"))
v2 = json.load(open(V2, encoding="utf-8"))
ops = {f["tier"]: f for f in suite["frames"] if f.get("files") and f["body"] == "petite" and f["clothing"] == "clothed"}
m1 = {f["tier"]: f for f in v1["frames"] if f.get("files") and f.get("kind") == "ipa"}
m2 = {f["tier"]: f for f in v2["frames"] if f.get("files") and f.get("kind") == "ipa"}
ROWS = [("openpose only", ops), ("IPA full-body ref", m1), ("IPA face-crop ref", m2)]

try:
    font = ImageFont.truetype("arial.ttf", 15)
    rowfont = ImageFont.truetype("arialbd.ttf", 17)
except Exception:
    font = rowfont = ImageFont.load_default()


def torso(im):
    w, h = im.size
    return im.crop((0, int(h * 0.12), w, int(h * 0.60)))


cache = {}
th = 0
for name, d in ROWS:
    for t in COLS:
        f = d.get(t)
        if not f:
            continue
        im = torso(Image.open(f["files"][-1]).convert("RGB"))
        w, h = im.size
        im = im.resize((THUMB, int(h * THUMB / w)), Image.LANCZOS)
        th = max(th, im.size[1])
        cache[(name, t)] = im

cell_h = th + CAP
W = ROWLAB + len(COLS) * THUMB + (len(COLS) + 1) * PAD
H = len(ROWS) * cell_h + (len(ROWS) + 1) * PAD
sheet = Image.new("RGB", (W, H), BG)
dr = ImageDraw.Draw(sheet)
for ri, (name, d) in enumerate(ROWS):
    y = PAD + ri * (cell_h + PAD)
    dr.text((6, y + th // 2 - 8), name, fill=(255, 210, 150), font=rowfont)
    for ci, t in enumerate(COLS):
        x = ROWLAB + PAD + ci * (THUMB + PAD)
        im = cache.get((name, t))
        if im is not None:
            sheet.paste(im, (x, y))
        dr.text((x + 3, y + th + 1), "t%d" % t, fill=(235, 235, 235), font=font)
sheet.save(OUT)
print("WROTE", OUT, sheet.size)
