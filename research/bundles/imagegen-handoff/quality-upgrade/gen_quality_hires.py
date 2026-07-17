r"""Quality bake-off STAGE 1 — hires-fix method (the biggest single quality lever).

Fixed scene/seed; base latent computed once (dpmpp_2m karras cfg5 28 steps), then branched through
candidate hires methods. Production currently uses plain latent nearest-exact upscale; the playbook
QUALITY preset uses 4x-AnimeSharp model-upscale. This settles which is sharpest/cleanest.
Scene stresses the hard areas: face, hand, fabric, hair, background.
"""
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\quality_hires_manifest.json"

QP = "masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres"
SUBJ = ("1girl, solo, mature female, adult, long silver hair, blue eyes, detailed face, "
        "detailed eyes, huge breasts, (fitted ribbed sweater:1.1), cleavage, hand on hip, "
        "cowboy shot, facing viewer, cozy cafe interior, warm window light, (matte skin:1.2)")
NEG = ("worst quality, low quality, lowres, bad anatomy, bad hands, missing fingers, extra digits, "
       "fused fingers, jpeg artifacts, signature, watermark, text, blurry, plastic skin, "
       "glossy specular, child, loli, chibi, 2girls")
POS = f"{QP}, {SUBJ}, huge breasts"

CKPT = "waiIllustriousSDXL_v170.safetensors"
SEED = 333
W, H = 832, 1216
SAMPLER, SCHED = "dpmpp_2m", "karras"   # held constant for the hires isolation
CFG = 5.0


def r8(x):
    return int(round(x / 8) * 8)


g = {}
saves = {}
g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}}
g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
g["smooth"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Smooth_Booster_v5.safetensors", "strength_model": 0.5, "model": ["ckpt", 0]}}
g["slider"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Breast_Size_Slider_Illustrious_V2.safetensors", "strength_model": 0.3, "model": ["smooth", 0]}}
MODEL = ["slider", 0]
g["pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": POS}}
g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEG}}
g["lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
g["ksb"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": CFG, "sampler_name": SAMPLER, "scheduler": SCHED, "denoise": 1.0, "model": MODEL, "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": ["lat", 0]}}
L0 = ["ksb", 0]
g["vdb"] = {"class_type": "VAEDecode", "inputs": {"samples": L0, "vae": ["ckpt", 2]}}
IMG0 = ["vdb", 0]
g["save_h0"] = {"class_type": "SaveImage", "inputs": {"images": IMG0, "filename_prefix": "QHIRES_H0_nohires"}}
saves["save_h0"] = {"id": "H0_nohires", "note": "base 832x1216, no hires"}


def hires_latent(pref, method, scale, denoise, note):
    g[pref + "_up"] = {"class_type": "LatentUpscaleBy", "inputs": {"samples": L0, "upscale_method": method, "scale_by": scale}}
    g[pref + "_ks"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 18, "cfg": CFG, "sampler_name": SAMPLER, "scheduler": SCHED, "denoise": denoise, "model": MODEL, "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": [pref + "_up", 0]}}
    g[pref + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": [pref + "_ks", 0], "vae": ["ckpt", 2]}}
    g[pref + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [pref + "_vd", 0], "filename_prefix": "QHIRES_" + pref}}
    saves[pref + "_save"] = {"id": pref, "note": note}


def hires_model(pref, model_name, scale, denoise, note):
    tw, th = r8(W * scale), r8(H * scale)
    g[pref + "_um"] = {"class_type": "UpscaleModelLoader", "inputs": {"model_name": model_name}}
    g[pref + "_iuw"] = {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": [pref + "_um", 0], "image": IMG0}}
    g[pref + "_is"] = {"class_type": "ImageScale", "inputs": {"image": [pref + "_iuw", 0], "upscale_method": "lanczos", "width": tw, "height": th, "crop": "disabled"}}
    g[pref + "_ve"] = {"class_type": "VAEEncode", "inputs": {"pixels": [pref + "_is", 0], "vae": ["ckpt", 2]}}
    g[pref + "_ks"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 18, "cfg": CFG, "sampler_name": SAMPLER, "scheduler": SCHED, "denoise": denoise, "model": MODEL, "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": [pref + "_ve", 0]}}
    g[pref + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": [pref + "_ks", 0], "vae": ["ckpt", 2]}}
    g[pref + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [pref + "_vd", 0], "filename_prefix": "QHIRES_" + pref}}
    saves[pref + "_save"] = {"id": pref, "note": note}


hires_latent("H1_latent_nearest", "nearest-exact", 1.5, 0.4, "latent nearest-exact 1.5x d0.4 (CURRENT prod)")
hires_latent("H2_latent_bislerp", "bislerp", 1.5, 0.4, "latent bislerp 1.5x d0.4")
hires_model("H3_anisharp15", "4x-AnimeSharp.pth", 1.5, 0.4, "4x-AnimeSharp 1.5x d0.4 (playbook)")
hires_model("H4_ultrasharp15", "4x-UltraSharp.pth", 1.5, 0.4, "4x-UltraSharp 1.5x d0.4")
hires_model("H5_yandere15", "4x_NMKD-YandereNeoXL_200k.pth", 1.5, 0.4, "4x-NMKD-YandereNeoXL 1.5x d0.4")
hires_model("H6_anisharp2x", "4x-AnimeSharp.pth", 2.0, 0.4, "4x-AnimeSharp 2.0x d0.4")
hires_model("H7_anisharp15_d05", "4x-AnimeSharp.pth", 1.5, 0.5, "4x-AnimeSharp 1.5x d0.5")


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


print("submitting hires bake-off:", len(saves), "outputs")
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

manifest = {"scene": SUBJ, "seed": SEED, "sampler": SAMPLER, "frames": []}
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
