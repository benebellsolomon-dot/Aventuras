r"""Strip montage for the chained-img2img expansion."""
import json

from PIL import Image, ImageDraw, ImageFont

MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\expansion_chain_manifest.json"
OUT = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\expansion_chain.png"
THUMB_W = 440
CAP_H = 48
PAD = 6
BG = (24, 24, 28)

man = json.load(open(MANIFEST, encoding="utf-8"))
frames = sorted([f for f in man["frames"] if f.get("files")], key=lambda f: f["step"])
try:
    font = ImageFont.truetype("arialbd.ttf", 19)
    fontsm = ImageFont.truetype("arial.ttf", 15)
except Exception:
    font = ImageFont.load_default()
    fontsm = font

imgs = []
th = 0
for f in frames:
    im = Image.open(f["files"][-1]).convert("RGB")
    w, h = im.size
    im = im.resize((THUMB_W, int(h * THUMB_W / w)), Image.LANCZOS)
    th = max(th, im.size[1])
    imgs.append((f, im))

W = len(imgs) * THUMB_W + (len(imgs) + 1) * PAD
H = th + CAP_H + 2 * PAD
sheet = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(imgs):
    x = PAD + i * (THUMB_W + PAD)
    sheet.paste(im, (x, PAD))
    cy = PAD + th + 2
    tag = "BASE t%d" % f["tier"] if f["step"] == 0 else "step %d  t%d" % (f["step"], f["tier"])
    sub = "d%.2f from prev" % f["denoise"] if f["step"] else "the locked body"
    draw.text((x + 4, cy), tag, fill=(255, 210, 150), font=font)
    draw.text((x + 4, cy + 24), sub, fill=(170, 200, 255), font=fontsm)
sheet.save(OUT)
print("WROTE", OUT, sheet.size)
