r"""Hyper-band seam study — measure the gigantic->hyper dip and test a corrected curve.

Same locked scene / seed / production graph as gen_tier_ladder_sweep.py, but drives
(cup tag, slider weight, hyper weight) explicitly so we can probe the seam and
candidate fixes side by side. CUR = current production ladder values; FIX = candidates.
"""
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\hyper_band_manifest.json"

QP = ("masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, "
      "highres, official art")
MATURE = "mature female, adult"
FIXED = ("1girl, solo, long blonde hair, blue eyes, (fitted ribbed tank top:1.1), "
         "form-fitting clothes, cowboy shot, facing viewer, standing, arms at sides, "
         "neutral expression, plain grey background, even studio lighting, (matte skin:1.2)")
NEG = ("embedding:Illust_Neg-neg, embedding:BadDigitalHandsNeg, lowres, worst quality, "
       "bad quality, jpeg artifacts, bad anatomy, bad hands, signature, watermark, username, "
       "child, loli, kid, shota, young, underage, "
       "(different character, different hair color, different eye color:1.1), "
       "2girls, multiple views, chibi, baby face, plastic skin, glossy specular, "
       "fused breasts, uniboob")

CKPT = "waiIllustriousSDXL_v170.safetensors"
SMOOTH = "Smooth_Booster_v5.safetensors"
SLIDER = "Breast_Size_Slider_Illustrious_V2.safetensors"
HYPER = "hyper_breasts_ILXL_concept.safetensors"
SMOOTH_W = 0.5
SAMPLER, SCHED = "euler_ancestral", "normal"
STEPS, STEPS_HIRES = 28, 18
CFG = 5.0
W, H = 832, 1216
HIRES_DENOISE = 0.4
SEED = 111

# (label, cup_tag, slider, hyper)
ROWS = [
    ("a_t35_gigantic_CUR", "gigantic breasts", 0.57, 0.00),
    ("b_t39_gigantic_CUR", "gigantic breasts", 0.70, 0.00),   # gigantic peak = bar to clear
    ("c_t40_hyper_CUR",    "hyper breasts",    0.30, 0.30),   # current onset (the dip)
    ("d_t40_hyper_FIX",    "hyper breasts",    0.50, 0.50),   # candidate onset
    ("e_t45_hyper_CUR",    "hyper breasts",    0.41, 0.40),
    ("f_t45_hyper_FIX",    "hyper breasts",    0.55, 0.65),
    ("g_t50_hyper_CUR",    "hyper breasts",    0.50, 0.50),   # current max
    ("h_t50_hyper_FIX",    "hyper breasts",    0.60, 0.85),   # candidate max
    ("i_t50_hyper_FIX2",   "hyper breasts",    0.70, 1.00),   # coherence stress test
]


def build(label, cup, sl, hy):
    pos = f"{QP}, {MATURE}, {FIXED}, {cup}"
    g = {}
    g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}}
    g["clipskip"] = {"class_type": "CLIPSetLastLayer",
                     "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
    g["smooth"] = {"class_type": "LoraLoaderModelOnly",
                   "inputs": {"lora_name": SMOOTH, "strength_model": SMOOTH_W, "model": ["ckpt", 0]}}
    g["slider"] = {"class_type": "LoraLoaderModelOnly",
                   "inputs": {"lora_name": SLIDER, "strength_model": sl, "model": ["smooth", 0]}}
    g["hyper"] = {"class_type": "LoraLoaderModelOnly",
                  "inputs": {"lora_name": HYPER, "strength_model": hy, "model": ["slider", 0]}}
    g["pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clipskip", 0], "text": pos}}
    g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clipskip", 0], "text": NEG}}
    g["lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g["ks"] = {"class_type": "KSampler",
               "inputs": {"seed": SEED, "steps": STEPS, "cfg": CFG, "sampler_name": SAMPLER,
                          "scheduler": SCHED, "denoise": 1.0, "model": ["hyper", 0],
                          "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": ["lat", 0]}}
    g["up"] = {"class_type": "LatentUpscaleBy",
               "inputs": {"samples": ["ks", 0], "upscale_method": "nearest-exact", "scale_by": 1.5}}
    g["ksf"] = {"class_type": "KSampler",
                "inputs": {"seed": SEED, "steps": STEPS_HIRES, "cfg": CFG, "sampler_name": SAMPLER,
                           "scheduler": SCHED, "denoise": HIRES_DENOISE, "model": ["hyper", 0],
                           "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": ["up", 0]}}
    g["vd"] = {"class_type": "VAEDecode", "inputs": {"samples": ["ksf", 0], "vae": ["ckpt", 2]}}
    g["save"] = {"class_type": "SaveImage",
                 "inputs": {"images": ["vd", 0], "filename_prefix": "HYPERBAND_%s" % label}}
    return g


def post(p, d):
    req = urllib.request.Request(API + p, data=json.dumps(d).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


manifest = {"frames": []}
print("submitting", len(ROWS), "hyper-band frames")
for label, cup, sl, hy in ROWS:
    meta = {"label": label, "cup": cup, "slider": sl, "hyper": hy}
    try:
        r = post("/prompt", {"prompt": build(label, cup, sl, hy)})
        meta["prompt_id"] = r["prompt_id"]
        print("  queued %-20s slider=%.2f hyper=%.2f" % (label, sl, hy))
    except Exception as e:
        meta["error"] = repr(e)
        print("  FAIL", label, repr(e))
    manifest["frames"].append(meta)

print("waiting...")
t0 = time.time()
while time.time() - t0 < 2500:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(5)
print("drained", int(time.time() - t0), "s")

for fr in manifest["frames"]:
    pid = fr.get("prompt_id")
    if not pid:
        continue
    try:
        h = get(f"/history/{pid}")
        e = h.get(pid, {})
        outs = e.get("outputs", {})
        fr["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"])
                       for nid, o in outs.items() for im in o.get("images", [])]
        fr["status"] = e.get("status", {}).get("status_str")
    except Exception as e:
        fr["collect_error"] = repr(e)

open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "DONE")
