r"""OpenPose growth montages.

1) openpose_growth_strip.png  — base + pose + all CN tiers (full frame): pose/body lock + growth
2) openpose_vs_ladder.png     — torso-crop compare: txt2img ladder vs OpenPose growth at common tiers
"""
import json

from PIL import Image, ImageDraw, ImageFont

OPG = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_growth_manifest.json"
LAD = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\tier_ladder_manifest.json"
OUT_STRIP = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_growth_strip.png"
OUT_CMP = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_vs_ladder.png"
PAD = 5
BG = (24, 24, 28)

opg = json.load(open(OPG, encoding="utf-8"))
lad = json.load(open(LAD, encoding="utf-8"))

try:
    font = ImageFont.truetype("arialbd.ttf", 17)
    fontsm = ImageFont.truetype("arial.ttf", 14)
except Exception:
    font = fontsm = ImageFont.load_default()


def strip(frames, out, thumb_w, crop=None, captioner=None, cols=None):
    cells = []
    th = 0
    for f in frames:
        im = Image.open(f["files"][-1]).convert("RGB")
        if crop == "torso":
            w, h = im.size
            im = im.crop((0, int(h * 0.10), w, int(h * 0.60)))
        w, h = im.size
        im = im.resize((thumb_w, int(h * thumb_w / w)), Image.LANCZOS)
        th = max(th, im.size[1])
        cells.append((f, im))
    n = len(cells)
    ncols = cols or n
    nrows = (n + ncols - 1) // ncols
    cap = 46
    W = ncols * thumb_w + (ncols + 1) * PAD
    H = nrows * (th + cap) + (nrows + 1) * PAD
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    for i, (f, im) in enumerate(cells):
        r, c = divmod(i, ncols)
        x = PAD + c * (thumb_w + PAD)
        y = PAD + r * (th + cap + PAD)
        sheet.paste(im, (x, y))
        t1, t2 = captioner(f)
        d.text((x + 3, y + th + 1), t1, fill=(255, 210, 150), font=font)
        d.text((x + 3, y + th + 22), t2, fill=(170, 200, 255), font=fontsm)
    sheet.save(out)
    print("WROTE", out, sheet.size)


# 1) strip of base + pose + cn tiers
order = []
base = [f for f in opg["frames"] if f.get("files") and f.get("kind") == "base_nocn"]
pose = [f for f in opg["frames"] if f.get("files") and f.get("kind") == "pose"]
cn = sorted([f for f in opg["frames"] if f.get("files") and f.get("kind") == "cn"], key=lambda f: f["tier"])
order = base + pose + cn


def cap_strip(f):
    if f.get("kind") == "base_nocn":
        return "BASE t%d" % f["tier"], "no CN (pose src)"
    if f.get("kind") == "pose":
        return "POSE skeleton", "DWPose"
    return "t%d %s" % (f["tier"], (f.get("cup") or "")), "sl%.2f hy%.2f" % (f.get("slider", 0), f.get("hyper", 0))


strip(order, OUT_STRIP, 300, crop=None, captioner=cap_strip, cols=6)

# 2) torso compare vs ladder at common tiers
COMMON = [0, 14, 26, 40, 50]
ladmap = {f["tier"]: f for f in lad["frames"] if f.get("files")}
cnmap = {f["tier"]: f for f in cn}
rows = []
for t in COMMON:
    if t in ladmap:
        rows.append(("L", t, ladmap[t]))
for t in COMMON:
    if t in cnmap:
        rows.append(("O", t, cnmap[t]))


def cap_cmp(f):
    return "", ""


# build a 2-row grid manually
THUMB_W = 460
cap = 30
items = [("txt2img ladder", [ladmap.get(t) for t in COMMON]),
         ("openpose petite", [cnmap.get(t) for t in COMMON])]
th = 0
loaded = []
for name, fs in items:
    lr = []
    for f in fs:
        if not f:
            lr.append(None)
            continue
        im = Image.open(f["files"][-1]).convert("RGB")
        w, h = im.size
        im = im.crop((0, int(h * 0.10), w, int(h * 0.60)))
        w, h = im.size
        im = im.resize((THUMB_W, int(h * THUMB_W / w)), Image.LANCZOS)
        th = max(th, im.size[1])
        lr.append(im)
    loaded.append((name, lr))
ROWLAB = 130
W = ROWLAB + len(COMMON) * THUMB_W + (len(COMMON) + 1) * PAD
H = 2 * (th + cap) + 3 * PAD
sheet = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(sheet)
for ri, (name, lr) in enumerate(loaded):
    y = PAD + ri * (th + cap + PAD)
    d.text((6, y + th // 2 - 10), name, fill=(255, 210, 150), font=font)
    for ci, im in enumerate(lr):
        x = ROWLAB + PAD + ci * (THUMB_W + PAD)
        if im is not None:
            sheet.paste(im, (x, y))
        d.text((x + 3, y + th + 1), "t%d" % COMMON[ci], fill=(235, 235, 235), font=fontsm)
sheet.save(OUT_CMP)
print("WROTE", OUT_CMP, sheet.size)
