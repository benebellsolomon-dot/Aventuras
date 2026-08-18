r"""Face-identity compare across tiers: OpenPose-only vs OpenPose+IPAdapter-FACE (petite clothed).

Crops the face region from each tier frame and tiles two rows so cross-tier identity drift
(openpose-only) vs identity-lock (openpose+IPA) is directly visible.
"""
import json

from PIL import Image, ImageDraw, ImageFont

SUITE = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_suite_manifest.json"
IPA = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_ipa_manifest.json"
IPA2 = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_ipa_v2_manifest.json"
OUT = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\face_identity_compare.png"
THUMB = 220
CAP = 26
ROWLAB = 150
PAD = 4
BG = (24, 24, 28)

suite = json.load(open(SUITE, encoding="utf-8"))
ipa = json.load(open(IPA, encoding="utf-8"))
tiers = ipa["tiers"]

ops = {f["tier"]: f for f in suite["frames"]
       if f.get("files") and f["body"] == "petite" and f["clothing"] == "clothed"}
opipa = {f["tier"]: f for f in ipa["frames"] if f.get("files") and f.get("kind") == "ipa"}
ROWS = [("openpose only", ops), ("IPA full-body ref", opipa)]
try:
    ipa2 = json.load(open(IPA2, encoding="utf-8"))
    opipa2 = {f["tier"]: f for f in ipa2["frames"] if f.get("files") and f.get("kind") == "ipa"}
    ROWS.append(("IPA face-crop ref", opipa2))
except Exception:
    pass

try:
    font = ImageFont.truetype("arial.ttf", 14)
    rowfont = ImageFont.truetype("arialbd.ttf", 17)
except Exception:
    font = rowfont = ImageFont.load_default()


def facecrop(im):
    w, h = im.size
    return im.crop((int(w * 0.26), int(h * 0.02), int(w * 0.74), int(h * 0.30)))


cache = {}
th = 0
for name, d in ROWS:
    for t in tiers:
        f = d.get(t)
        if not f:
            continue
        im = facecrop(Image.open(f["files"][-1]).convert("RGB"))
        w, h = im.size
        im = im.resize((THUMB, int(h * THUMB / w)), Image.LANCZOS)
        th = max(th, im.size[1])
        cache[(name, t)] = im

cell_h = th + CAP
W = ROWLAB + len(tiers) * THUMB + (len(tiers) + 1) * PAD
H = len(ROWS) * cell_h + (len(ROWS) + 1) * PAD
sheet = Image.new("RGB", (W, H), BG)
dr = ImageDraw.Draw(sheet)
for ri, (name, d) in enumerate(ROWS):
    y = PAD + ri * (cell_h + PAD)
    dr.text((6, y + th // 2 - 8), name, fill=(255, 210, 150), font=rowfont)
    for ci, t in enumerate(tiers):
        x = ROWLAB + PAD + ci * (THUMB + PAD)
        im = cache.get((name, t))
        if im is not None:
            sheet.paste(im, (x, y))
        dr.text((x + 3, y + th + 1), "t%d" % t, fill=(235, 235, 235), font=font)
sheet.save(OUT)
print("WROTE", OUT, sheet.size)
