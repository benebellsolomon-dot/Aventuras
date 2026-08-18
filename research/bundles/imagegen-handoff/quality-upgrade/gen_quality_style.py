r"""Art-style bake-off — which anime style yields the highest quality with the LOCKED recipe.
Locked: dpmpp_2m karras + 4x-AnimeSharp 1.5x d0.4 hires + cfg5 + 28/18 steps + smooth0.5.
Same subject/seed; only the STYLE block varies."""
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\quality_style_manifest.json"

QP = "masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres"
SUBJ = ("1girl, solo, mature female, adult, long silver hair, blue eyes, detailed face, "
        "huge breasts, (fitted ribbed sweater:1.1), cleavage, hand on hip, cowboy shot, "
        "facing viewer, cozy cafe interior, warm window light, (matte skin:1.2)")
NEG = ("worst quality, low quality, lowres, bad anatomy, bad hands, missing fingers, extra digits, "
       "fused fingers, jpeg artifacts, signature, watermark, text, blurry, plastic skin, "
       "glossy specular, child, loli, chibi, 2girls")
CKPT = "waiIllustriousSDXL_v170.safetensors"
SEED = 333
W, H = 832, 1216
SAMP, SCHED, CFG = "dpmpp_2m", "karras", 5.0

# (id, style_block)
STYLES = [
    ("S0_baseline", ""),
    ("S1_detailed", "(highly detailed:1.2), intricate details, sharp focus"),
    ("S2_cel", "(cel shading:1.2), flat colors, bold clean lineart, anime screencap"),
    ("S3_painterly", "(painterly:1.2), digital painting, soft brushwork, soft shading"),
    ("S4_semireal", "(semi-realistic:1.15), realistic skin texture, detailed rendering, volumetric lighting"),
    ("S5_cinematic", "(cinematic lighting:1.15), dramatic lighting, depth of field, atmospheric"),
    ("S6_vibrant", "(vibrant saturated colors:1.15), glossy, clean modern anime"),
    ("S7_pastel", "(soft pastel colors:1.1), gentle shading, dreamy, delicate linework"),
    ("S8_retro", "(retro 1990s anime:1.15), cel animation, vintage anime style"),
    ("S9_ultra", "(ultra-detailed:1.3), 8k, extremely intricate, ornate detail"),
]


def r8(x):
    return int(round(x / 8) * 8)


g = {}
saves = {}
g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}}
g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
g["smooth"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Smooth_Booster_v5.safetensors", "strength_model": 0.5, "model": ["ckpt", 0]}}
g["slider"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Breast_Size_Slider_Illustrious_V2.safetensors", "strength_model": 0.3, "model": ["smooth", 0]}}
MODEL = ["slider", 0]
g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEG}}
g["um"] = {"class_type": "UpscaleModelLoader", "inputs": {"model_name": "4x-AnimeSharp.pth"}}
TW, TH = r8(W * 1.5), r8(H * 1.5)

for sid, block in STYLES:
    pos = f"{QP}, {block + ', ' if block else ''}{SUBJ}, huge breasts"
    g[sid + "_pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": pos}}
    g[sid + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g[sid + "_ksb"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": CFG, "sampler_name": SAMP, "scheduler": SCHED, "denoise": 1.0, "model": MODEL, "positive": [sid + "_pos", 0], "negative": ["neg", 0], "latent_image": [sid + "_lat", 0]}}
    g[sid + "_vdb"] = {"class_type": "VAEDecode", "inputs": {"samples": [sid + "_ksb", 0], "vae": ["ckpt", 2]}}
    g[sid + "_iuw"] = {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["um", 0], "image": [sid + "_vdb", 0]}}
    g[sid + "_is"] = {"class_type": "ImageScale", "inputs": {"image": [sid + "_iuw", 0], "upscale_method": "lanczos", "width": TW, "height": TH, "crop": "disabled"}}
    g[sid + "_ve"] = {"class_type": "VAEEncode", "inputs": {"pixels": [sid + "_is", 0], "vae": ["ckpt", 2]}}
    g[sid + "_ksf"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 18, "cfg": CFG, "sampler_name": SAMP, "scheduler": SCHED, "denoise": 0.4, "model": MODEL, "positive": [sid + "_pos", 0], "negative": ["neg", 0], "latent_image": [sid + "_ve", 0]}}
    g[sid + "_vdf"] = {"class_type": "VAEDecode", "inputs": {"samples": [sid + "_ksf", 0], "vae": ["ckpt", 2]}}
    g[sid + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [sid + "_vdf", 0], "filename_prefix": "QSTYLE_" + sid}}
    saves[sid + "_save"] = {"id": sid, "note": block[:54]}


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


print("submitting style bake-off:", len(saves))
r = post("/prompt", {"prompt": g})
pid = r["prompt_id"]
print("prompt_id", pid)
t0 = time.time()
while time.time() - t0 < 3500:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(5)
print("drained", int(time.time() - t0), "s")

manifest = {"recipe": "dpmpp_2m/karras + AnimeSharp 1.5x d0.4 + cfg5", "seed": SEED, "frames": []}
h = get(f"/history/{pid}")
e = h.get(pid, {})
outs = e.get("outputs", {})
print("status", e.get("status", {}).get("status_str"))
for node_id, meta in saves.items():
    imgs = outs.get(node_id, {}).get("images", [])
    m = dict(meta)
    m["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"]) for im in imgs]
    manifest["frames"].append(m)
open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "frames:", sum(1 for f in manifest["frames"] if f.get("files")))
