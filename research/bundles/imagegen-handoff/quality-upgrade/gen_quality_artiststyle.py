r"""Style + artist-blend bake-off (general capability test, not project-specific).
Validates the Danbooru-verified artist house-blends + style blocks on our recipe (WAI v17,
dpmpp_2m/karras + 4x-AnimeSharp hires). Fixed subject/seed; only the artist/style block varies.
Artist tags placed after identity (per ARTIST-TAGS-REPORT.md)."""
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\quality_artiststyle_manifest.json"

QP = "masterpiece, best quality, very aesthetic, newest, absurdres, highres, official art"
ID = "1girl, solo, mature female, adult, blonde hair, blue eyes"
REST = "large breasts, off-shoulder dress, cowboy shot, garden background, soft lighting"
NEG = ("worst quality, low quality, lowres, bad anatomy, bad hands, missing fingers, extra digits, "
       "fused fingers, jpeg artifacts, signature, watermark, text, blurry, plastic skin, "
       "glossy specular, child, loli, chibi, 2girls")
CKPT = "waiIllustriousSDXL_v170.safetensors"
SEED = 555
W, H = 832, 1216
SAMP, SCHED, CFG = "dpmpp_2m", "karras", 5.0

# (id, artist_block, style_block)
VARIANTS = [
    ("A0_baseline", "", ""),
    ("A1_style_detailed", "", "(highly detailed:1.2), intricate details, sharp focus"),
    ("A2_style_semireal", "", "(semi-realistic:1.15), realistic skin texture, volumetric lighting"),
    ("A3_artist_clean", "(as109:0.9), (rella:0.8), (ciloranko:0.7)", ""),
    ("A4_artist_painterly", "(ciloranko:0.85), (wlop:0.6), (ningen mame:0.7)", ""),
    ("A5_artist_glossy", "(as109:0.9), (todoroki masaru:0.7), (ciloranko:0.6)", ""),
    ("A6_clean_plus_detailed", "(as109:0.9), (rella:0.8), (ciloranko:0.7)", "(highly detailed:1.2), intricate details, sharp focus"),
    ("A7_clean_plus_semireal", "(as109:0.9), (rella:0.8), (ciloranko:0.7)", "(semi-realistic:1.15), realistic skin texture, volumetric lighting"),
]


def r8(x):
    return int(round(x / 8) * 8)


g = {}
saves = {}
g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}}
g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
g["sm"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Smooth_Booster_v5.safetensors", "strength_model": 0.5, "model": ["ckpt", 0]}}
g["sl"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Breast_Size_Slider_Illustrious_V2.safetensors", "strength_model": 0.3, "model": ["sm", 0]}}
MODEL = ["sl", 0]
g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEG}}
g["um"] = {"class_type": "UpscaleModelLoader", "inputs": {"model_name": "4x-AnimeSharp.pth"}}
TW, TH = r8(W * 1.5), r8(H * 1.5)

for vid, artist, style in VARIANTS:
    parts = [QP, ID]
    if artist:
        parts.append(artist)
    parts.append(REST)
    if style:
        parts.append(style)
    parts.append("large breasts")
    pos = ", ".join(parts)
    g[vid + "_pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": pos}}
    g[vid + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g[vid + "_ksb"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": CFG, "sampler_name": SAMP, "scheduler": SCHED, "denoise": 1.0, "model": MODEL, "positive": [vid + "_pos", 0], "negative": ["neg", 0], "latent_image": [vid + "_lat", 0]}}
    g[vid + "_vdb"] = {"class_type": "VAEDecode", "inputs": {"samples": [vid + "_ksb", 0], "vae": ["ckpt", 2]}}
    g[vid + "_iuw"] = {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["um", 0], "image": [vid + "_vdb", 0]}}
    g[vid + "_is"] = {"class_type": "ImageScale", "inputs": {"image": [vid + "_iuw", 0], "upscale_method": "lanczos", "width": TW, "height": TH, "crop": "disabled"}}
    g[vid + "_ve"] = {"class_type": "VAEEncode", "inputs": {"pixels": [vid + "_is", 0], "vae": ["ckpt", 2]}}
    g[vid + "_ksf"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 18, "cfg": CFG, "sampler_name": SAMP, "scheduler": SCHED, "denoise": 0.4, "model": MODEL, "positive": [vid + "_pos", 0], "negative": ["neg", 0], "latent_image": [vid + "_ve", 0]}}
    g[vid + "_vdf"] = {"class_type": "VAEDecode", "inputs": {"samples": [vid + "_ksf", 0], "vae": ["ckpt", 2]}}
    g[vid + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [vid + "_vdf", 0], "filename_prefix": "QAS_" + vid}}
    saves[vid + "_save"] = {"id": vid, "note": (artist or "no-artist") + " | " + (style or "no-style")}


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


print("submitting artist/style bake-off:", len(saves))
r = post("/prompt", {"prompt": g})
pid = r["prompt_id"]
print("prompt_id", pid)
t0 = time.time()
while time.time() - t0 < 3000:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(5)
print("drained", int(time.time() - t0), "s")

manifest = {"frames": []}
h = get(f"/history/{pid}")
e = h.get(pid, {})
outs = e.get("outputs", {})
print("status", e.get("status", {}).get("status_str"))
for node_id, meta in saves.items():
    imgs = outs.get(node_id, {}).get("images", [])
    mm = dict(meta)
    mm["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"]) for im in imgs]
    manifest["frames"].append(mm)
open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "frames:", sum(1 for f in manifest["frames"] if f.get("files")))
