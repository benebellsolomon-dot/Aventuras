r"""New-tools bake-off (post-restart): 2x-AnimeSharpV4 vs 4x-AnimeSharp, hires denoise 0.4 vs 0.3,
Detail Daemon, FreeU V2, and a combined max variant. Same fixed quality scene/seed as the prior
quality bake-off (dpmpp_2m/karras, cfg5). Tells us which of the just-installed tools to adopt."""
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\quality_newtools_manifest.json"

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
SAMP, SCHED, CFG = "dpmpp_2m", "karras", 5.0
ANISHARP = "4x-AnimeSharp.pth"
V4 = "2x-AnimeSharpV4_RCAN.safetensors"

g = {}
saves = {}
g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}}
g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
g["sm"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Smooth_Booster_v5.safetensors", "strength_model": 0.5, "model": ["ckpt", 0]}}
g["sl"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Breast_Size_Slider_Illustrious_V2.safetensors", "strength_model": 0.3, "model": ["sm", 0]}}
MSTD = ["sl", 0]
g["fu"] = {"class_type": "FreeU_V2", "inputs": {"model": MSTD, "b1": 1.3, "b2": 1.4, "s1": 0.9, "s2": 0.2}}
MFU = ["fu", 0]
g["pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": POS}}
g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEG}}
g["umA"] = {"class_type": "UpscaleModelLoader", "inputs": {"model_name": ANISHARP}}
g["umV"] = {"class_type": "UpscaleModelLoader", "inputs": {"model_name": V4}}


def base(pfx, model):
    g[pfx + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g[pfx + "_ks"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": CFG, "sampler_name": SAMP, "scheduler": SCHED, "denoise": 1.0, "model": model, "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": [pfx + "_lat", 0]}}
    g[pfx + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": [pfx + "_ks", 0], "vae": ["ckpt", 2]}}
    return [pfx + "_vd", 0]


def upscale_latent(pfx, img, um, scale_by):
    g[pfx + "_iuw"] = {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": [um, 0], "image": img}}
    g[pfx + "_is"] = {"class_type": "ImageScaleBy", "inputs": {"image": [pfx + "_iuw", 0], "upscale_method": "lanczos", "scale_by": scale_by}}
    g[pfx + "_ve"] = {"class_type": "VAEEncode", "inputs": {"pixels": [pfx + "_is", 0], "vae": ["ckpt", 2]}}
    return [pfx + "_ve", 0]


def plain_hires(pfx, model, latent, denoise, label, note):
    g[pfx + "_ksf"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 18, "cfg": CFG, "sampler_name": SAMP, "scheduler": SCHED, "denoise": denoise, "model": model, "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": latent}}
    g[pfx + "_vdf"] = {"class_type": "VAEDecode", "inputs": {"samples": [pfx + "_ksf", 0], "vae": ["ckpt", 2]}}
    g[pfx + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [pfx + "_vdf", 0], "filename_prefix": "QNT_" + label}}
    saves[pfx + "_save"] = {"id": label, "note": note}


def dd_hires(pfx, model, latent, denoise, detail_amount, label, note):
    g[pfx + "_kss"] = {"class_type": "KSamplerSelect", "inputs": {"sampler_name": SAMP}}
    g[pfx + "_dd"] = {"class_type": "DetailDaemonSamplerNode", "inputs": {"sampler": [pfx + "_kss", 0], "detail_amount": detail_amount, "start": 0.2, "end": 0.8, "bias": 0.5, "exponent": 1.0, "start_offset": 0.0, "end_offset": 0.0, "fade": 0.0, "smooth": True, "cfg_scale_override": 0.0}}
    g[pfx + "_sch"] = {"class_type": "BasicScheduler", "inputs": {"model": model, "scheduler": SCHED, "steps": 18, "denoise": denoise}}
    g[pfx + "_noise"] = {"class_type": "RandomNoise", "inputs": {"noise_seed": SEED}}
    g[pfx + "_guider"] = {"class_type": "CFGGuider", "inputs": {"model": model, "positive": ["pos", 0], "negative": ["neg", 0], "cfg": CFG}}
    g[pfx + "_sca"] = {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": [pfx + "_noise", 0], "guider": [pfx + "_guider", 0], "sampler": [pfx + "_dd", 0], "sigmas": [pfx + "_sch", 0], "latent_image": latent}}
    g[pfx + "_vdf"] = {"class_type": "VAEDecode", "inputs": {"samples": [pfx + "_sca", 0], "vae": ["ckpt", 2]}}
    g[pfx + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [pfx + "_vdf", 0], "filename_prefix": "QNT_" + label}}
    saves[pfx + "_save"] = {"id": label, "note": note}


IMG0 = base("A", MSTD)          # standard-model base
IMG0F = base("B", MFU)          # FreeU-model base

# upscaler + denoise (standard model)
plain_hires("v1", MSTD, upscale_latent("u1", IMG0, "umA", 0.375), 0.4, "base_4x_d04", "4x-AnimeSharp d0.4 (current)")
plain_hires("v2", MSTD, upscale_latent("u2", IMG0, "umV", 0.75), 0.4, "v4_d04", "2x-AnimeSharpV4 d0.4")
plain_hires("v3", MSTD, upscale_latent("u3", IMG0, "umV", 0.75), 0.3, "v4_d03", "2x-AnimeSharpV4 d0.3")
plain_hires("v4", MSTD, upscale_latent("u4", IMG0, "umA", 0.375), 0.3, "4x_d03", "4x-AnimeSharp d0.3")
# Detail Daemon (standard model, 4x d0.4)
dd_hires("v5", MSTD, upscale_latent("u5", IMG0, "umA", 0.375), 0.4, 0.2, "4x_d04_DD", "4x d0.4 + DetailDaemon 0.2")
# FreeU (FreeU model, 4x d0.4)
plain_hires("v6", MFU, upscale_latent("u6", IMG0F, "umA", 0.375), 0.4, "4x_d04_FreeU", "4x d0.4 + FreeU_V2")
# combo max (FreeU model, V4 d0.3, Detail Daemon)
dd_hires("v7", MFU, upscale_latent("u7", IMG0F, "umV", 0.75), 0.3, 0.15, "combo_v4_DD_FreeU", "V4 d0.3 + DD0.15 + FreeU (max)")


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


print("submitting new-tools bake-off:", len(saves), "variants")
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
st = e.get("status", {}).get("status_str")
print("status", st)
if st == "error":
    for m in e.get("status", {}).get("messages", []):
        if m[0] == "execution_error":
            print("ERR", m[1].get("exception_type"), str(m[1].get("exception_message"))[:300])
for node_id, meta in saves.items():
    imgs = outs.get(node_id, {}).get("images", [])
    mm = dict(meta)
    mm["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"]) for im in imgs]
    manifest["frames"].append(mm)
open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "frames:", sum(1 for f in manifest["frames"] if f.get("files")))
