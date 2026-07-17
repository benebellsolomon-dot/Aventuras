r"""Quality bake-off STAGE 2 — sampler/scheduler, with hires LOCKED to 4x-AnimeSharp 1.5x d0.4.

Same fixed scene/seed as stage 1. Each variant runs base + hires with its sampler/scheduler on both
passes. Production default is euler_ancestral/normal; playbook is dpmpp_2m/karras. Find the best.
"""
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\quality_sampler_manifest.json"

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
CFG = 5.0

# (id, sampler, scheduler)
VARIANTS = [
    ("ea_normal", "euler_ancestral", "normal"),
    ("2m_karras", "dpmpp_2m", "karras"),
    ("2msde_karras", "dpmpp_2m_sde", "karras"),
    ("3msde_karras", "dpmpp_3m_sde", "karras"),
    ("resms_karras", "res_multistep", "karras"),
    ("2mcfgpp_karras", "dpmpp_2m_cfg_pp", "karras"),
    ("euler_normal", "euler", "normal"),
    ("2m_sgm", "dpmpp_2m", "sgm_uniform"),
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
g["pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": POS}}
g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEG}}
g["um"] = {"class_type": "UpscaleModelLoader", "inputs": {"model_name": "4x-AnimeSharp.pth"}}
TW, TH = r8(W * 1.5), r8(H * 1.5)

for vid, samp, sched in VARIANTS:
    g[vid + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g[vid + "_ksb"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": CFG, "sampler_name": samp, "scheduler": sched, "denoise": 1.0, "model": MODEL, "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": [vid + "_lat", 0]}}
    g[vid + "_vdb"] = {"class_type": "VAEDecode", "inputs": {"samples": [vid + "_ksb", 0], "vae": ["ckpt", 2]}}
    g[vid + "_iuw"] = {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["um", 0], "image": [vid + "_vdb", 0]}}
    g[vid + "_is"] = {"class_type": "ImageScale", "inputs": {"image": [vid + "_iuw", 0], "upscale_method": "lanczos", "width": TW, "height": TH, "crop": "disabled"}}
    g[vid + "_ve"] = {"class_type": "VAEEncode", "inputs": {"pixels": [vid + "_is", 0], "vae": ["ckpt", 2]}}
    g[vid + "_ksf"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 18, "cfg": CFG, "sampler_name": samp, "scheduler": sched, "denoise": 0.4, "model": MODEL, "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": [vid + "_ve", 0]}}
    g[vid + "_vdf"] = {"class_type": "VAEDecode", "inputs": {"samples": [vid + "_ksf", 0], "vae": ["ckpt", 2]}}
    g[vid + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [vid + "_vdf", 0], "filename_prefix": "QSAMP_" + vid}}
    saves[vid + "_save"] = {"id": vid, "note": "%s / %s" % (samp, sched)}


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


print("submitting sampler bake-off:", len(saves), "variants")
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

manifest = {"hires": "4x-AnimeSharp 1.5x d0.4", "seed": SEED, "frames": []}
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
