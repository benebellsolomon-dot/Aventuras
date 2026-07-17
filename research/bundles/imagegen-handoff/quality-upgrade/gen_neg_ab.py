r"""A/B: old heavy negative vs new lightened negative (polish), same scene/seed, hands-visible scene
(stresses anatomy/hands). Confirms the lighter UC doesn't regress quality now that the embeddings +
detailers carry the load. Base + 4x-AnimeSharp hires, dpmpp_2m/karras."""
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\neg_ab_manifest.json"

POS = ("masterpiece, best quality, very aesthetic, newest, absurdres, highres, official art, "
       "1girl, solo, mature female, adult, long black hair, blue eyes, (hands clasped near chest:1.1), "
       "detailed fingers, fitted blouse, huge breasts, cowboy shot, indoor, soft light, (matte skin:1.2)")
OLD = ("embedding:Illust_Neg-neg, embedding:BadDigitalHandsNeg, lowres, worst quality, bad quality, "
       "jpeg artifacts, bad anatomy, bad hands, signature, watermark, username, "
       "child, loli, kid, shota, young, underage")
NEW = ("embedding:Illust_Neg-neg, embedding:BadDigitalHandsNeg, bad anatomy, bad hands, "
       "signature, watermark, username, old, early, child, loli, kid, shota, young, underage")
CKPT = "waiIllustriousSDXL_v170.safetensors"
SEED = 808
W, H = 832, 1216


def r8(x):
    return int(round(x / 8) * 8)


g = {}
saves = {}
g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}}
g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
g["sm"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Smooth_Booster_v5.safetensors", "strength_model": 0.5, "model": ["ckpt", 0]}}
g["sl"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Breast_Size_Slider_Illustrious_V2.safetensors", "strength_model": 0.3, "model": ["sm", 0]}}
MODEL = ["sl", 0]
g["pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": POS}}
g["um"] = {"class_type": "UpscaleModelLoader", "inputs": {"model_name": "4x-AnimeSharp.pth"}}
TW, TH = r8(W * 1.5), r8(H * 1.5)

for vid, neg in [("old_heavy", OLD), ("new_light", NEW)]:
    g[vid + "_neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": neg}}
    g[vid + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g[vid + "_ksb"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0, "model": MODEL, "positive": ["pos", 0], "negative": [vid + "_neg", 0], "latent_image": [vid + "_lat", 0]}}
    g[vid + "_vdb"] = {"class_type": "VAEDecode", "inputs": {"samples": [vid + "_ksb", 0], "vae": ["ckpt", 2]}}
    g[vid + "_iuw"] = {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["um", 0], "image": [vid + "_vdb", 0]}}
    g[vid + "_is"] = {"class_type": "ImageScale", "inputs": {"image": [vid + "_iuw", 0], "upscale_method": "lanczos", "width": TW, "height": TH, "crop": "disabled"}}
    g[vid + "_ve"] = {"class_type": "VAEEncode", "inputs": {"pixels": [vid + "_is", 0], "vae": ["ckpt", 2]}}
    g[vid + "_ksf"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 18, "cfg": 5.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 0.4, "model": MODEL, "positive": ["pos", 0], "negative": [vid + "_neg", 0], "latent_image": [vid + "_ve", 0]}}
    g[vid + "_vdf"] = {"class_type": "VAEDecode", "inputs": {"samples": [vid + "_ksf", 0], "vae": ["ckpt", 2]}}
    g[vid + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [vid + "_vdf", 0], "filename_prefix": "QNEG_" + vid}}
    saves[vid + "_save"] = {"id": vid}


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


pid = post("/prompt", {"prompt": g})["prompt_id"]
print("prompt_id", pid)
t0 = time.time()
while time.time() - t0 < 1200:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(4)
print("drained", int(time.time() - t0), "s")
manifest = {"frames": []}
h = get(f"/history/{pid}").get(pid, {})
print("status", h.get("status", {}).get("status_str"))
outs = h.get("outputs", {})
for node_id, meta in saves.items():
    imgs = outs.get(node_id, {}).get("images", [])
    m = dict(meta)
    m["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"]) for im in imgs]
    manifest["frames"].append(m)
open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "frames:", sum(1 for f in manifest["frames"] if f.get("files")))
