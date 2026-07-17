r"""Montages for the expansion body-hold experiment.

Builds two sheets:
  expansion_hold_compare.png — 2 rows (img2img-from-base vs txt2img-control) x [base,22,30,40,50]
                               -> direct read of which method holds the body while breasts grow
  expansion_hold_dsweep.png  — base + denoise 0.4/0.5/0.6/0.7 at tier 50 (find the size/hold knee)
"""
import json

from PIL import Image, ImageDraw, ImageFont

MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\expansion_hold_manifest.json"
OUT_CMP = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\expansion_hold_compare.png"
OUT_SW = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\expansion_hold_dsweep.png"
THUMB_W = 420
CAP_H = 50
PAD = 6
BG = (24, 24, 28)

man = json.load(open(MANIFEST, encoding="utf-8"))
F = {f["label"]: f for f in man["frames"] if f.get("files")}

try:
    font = ImageFont.truetype("arialbd.ttf", 19)
    fontsm = ImageFont.truetype("arial.ttf", 15)
except Exception:
    font = ImageFont.load_default()
    fontsm = font


def load(label):
    f = F.get(label)
    if not f:
        return None, label
    img = Image.open(f["files"][-1]).convert("RGB")
    w, h = img.size
    return img.resize((THUMB_W, int(h * THUMB_W / w)), Image.LANCZOS), label


def grid(rows, out, title_for):
    nrows = len(rows)
    ncols = max(len(r) for r in rows)
    thumb_h = 0
    loaded = []
    for r in rows:
        lr = []
        for label in r:
            img, lbl = load(label)
            if img is not None:
                thumb_h = max(thumb_h, img.size[1])
            lr.append((img, lbl))
        loaded.append(lr)
    cell_h = thumb_h + CAP_H
    W = ncols * THUMB_W + (ncols + 1) * PAD
    H = nrows * cell_h + (nrows + 1) * PAD
    sheet = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(sheet)
    for ri, lr in enumerate(loaded):
        for ci, (img, lbl) in enumerate(lr):
            x = PAD + ci * (THUMB_W + PAD)
            y = PAD + ri * (cell_h + PAD)
            if img is not None:
                sheet.paste(img, (x, y))
            t1, t2 = title_for(lbl)
            draw.text((x + 4, y + thumb_h + 2), t1, fill=(255, 210, 150), font=font)
            draw.text((x + 4, y + thumb_h + 26), t2, fill=(170, 200, 255), font=fontsm)
    sheet.save(out)
    print("WROTE", out, sheet.size)


def cmp_title(lbl):
    f = F.get(lbl, {})
    if "base" in lbl:
        return "BASE t14 (large)", "the locked body"
    if "imgbase" in lbl:
        return "img2img t%d" % f.get("tier", 0), "from base  d%.2f" % f.get("denoise", 0)
    if "txt2img" in lbl:
        return "txt2img t%d" % f.get("tier", 0), "fixed seed (control)"
    return lbl, ""


def sw_title(lbl):
    f = F.get(lbl, {})
    if "base" in lbl:
        return "BASE t14", "the locked body"
    return "t50  d%.2f" % f.get("denoise", 0), "img2img from base"


# compare grid
grid(
    [["EXPHOLD_base_t14", "EXPHOLD_imgbase_t22_d50", "EXPHOLD_imgbase_t30_d50",
      "EXPHOLD_imgbase_t40_d50", "EXPHOLD_imgbase_t50_d50"],
     ["EXPHOLD_base_t14", "EXPHOLD_txt2img_t22", "EXPHOLD_txt2img_t30",
      "EXPHOLD_txt2img_t40", "EXPHOLD_txt2img_t50"]],
    OUT_CMP, cmp_title)

# denoise sweep strip
grid(
    [["EXPHOLD_base_t14", "EXPHOLD_dsweep_t50_d40", "EXPHOLD_imgbase_t50_d50",
      "EXPHOLD_dsweep_t50_d60", "EXPHOLD_dsweep_t50_d70"]],
    OUT_SW, sw_title)
