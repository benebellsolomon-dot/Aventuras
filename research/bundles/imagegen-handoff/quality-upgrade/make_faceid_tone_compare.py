r"""Nude tone 3-way (curvy nude): non-IPA vs IPA plus-face (washed) vs FaceID.
Verifies FaceID removes the plus-face nude skin-tone washout while keeping identity."""
import json

from PIL import Image, ImageDraw, ImageFont

NOIPA = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_suite_manifest.json"
PLUS = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_ipa_suite_manifest.json"
FID = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\faceid_suite_manifest.json"
OUT = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\faceid_tone_compare.png"
BODY = "curvy"
COLS = [0, 20, 33, 50]
THUMB = 320
CAP = 26
ROWLAB = 150
PAD = 4
BG = (24, 24, 28)


def pick(path, body, clothing):
    m = json.load(open(path, encoding="utf-8"))
    return {f["tier"]: f for f in m["frames"] if f.get("files") and f["body"] == body and f["clothing"] == clothing}


noipa = pick(NOIPA, BODY, "nude")
plus = pick(PLUS, BODY, "nude")
fid = pick(FID, BODY, "nude")
ROWS = [("non-IPA", noipa), ("IPA plus-face", plus), ("FaceID", fid)]

try:
    font = ImageFont.truetype("arial.ttf", 15)
    rowfont = ImageFont.truetype("arialbd.ttf", 17)
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
