r"""Compare IPA nude tone fixes (curvy nude, tiers 0/20/33/50):
  non-IPA (clean tone ref) | IPA w0.8 (washed) | start_at 0.30 | start_at 0.20 K+V
"""
import json

from PIL import Image, ImageDraw, ImageFont

SUITE = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_suite_manifest.json"          # non-IPA
IPASUITE = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_ipa_suite_manifest.json"   # w0.8
TONE = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\ipa_tonefix_manifest.json"
OUT = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\ipa_tonefix_compare.png"
COLS = [0, 20, 33, 50]
THUMB = 320
CAP = 26
ROWLAB = 150
PAD = 4
BG = (24, 24, 28)

suite = json.load(open(SUITE, encoding="utf-8"))
ipasuite = json.load(open(IPASUITE, encoding="utf-8"))
tone = json.load(open(TONE, encoding="utf-8"))

noipa = {f["tier"]: f for f in suite["frames"] if f.get("files") and f["body"] == "curvy" and f["clothing"] == "nude"}
w08 = {f["tier"]: f for f in ipasuite["frames"] if f.get("files") and f["body"] == "curvy" and f["clothing"] == "nude"}
s30 = {f["tier"]: f for f in tone["frames"] if f.get("files") and f["cfg"] == "s30"}
s20kv = {f["tier"]: f for f in tone["frames"] if f.get("files") and f["cfg"] == "s20kv"}
ROWS = [("non-IPA (ref)", noipa), ("IPA w0.8 (washed)", w08), ("start_at 0.30", s30), ("start 0.20 K+V", s20kv)]

try:
    font = ImageFont.truetype("arial.ttf", 15)
    rowfont = ImageFont.truetype("arialbd.ttf", 16)
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
    dr.text((6, y + th // 2 - 14), name, fill=(255, 210, 150), font=rowfont)
    for ci, t in enumerate(COLS):
        x = ROWLAB + PAD + ci * (THUMB + PAD)
        im = cache.get((name, t))
        if im is not None:
            sheet.paste(im, (x, y))
        dr.text((x + 3, y + th + 1), "t%d" % t, fill=(235, 235, 235), font=font)
sheet.save(OUT)
print("WROTE", OUT, sheet.size)
