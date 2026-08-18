r"""Production TIER-LADDER sweep — validate the *production* cup-tag-primary ladder
end-to-end (NOT the standalone slider-only cup calibration).

Imports the live comic-continuer `be_prompt.py` so the tier -> (cup tag, slider weight,
hyper concept weight) mapping is bit-exact with production. Replicates the production
preset graph (si-animator-bridge/src/presets/illustrious_image.json) and production
params (euler_ancestral/normal, 28/18 steps, cfg5, clip-skip 2, smooth_booster 0.5,
latent-upscale x1.5 hires denoise 0.4).

Only the tier varies; character / outfit / pose / framing / seed are locked, with a
form-fitting top + front cowboy shot so cup size reads cleanly and comparably.
This isolates whether the production ladder is monotonic and well-separated.
"""
import importlib.util
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\tier_ladder_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"

# ── import the live production mapping ───────────────────────────────────────
_spec = importlib.util.spec_from_file_location("be_prompt", BE_PROMPT)
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)

# ── locked scene (everything except tier) ────────────────────────────────────
QP = ", ".join(be.QUALITY_TAGS)
MATURE = ", ".join(be.MATURE_ANCHOR)
FIXED = ("1girl, solo, long blonde hair, blue eyes, (fitted ribbed tank top:1.1), "
         "form-fitting clothes, cowboy shot, facing viewer, standing, arms at sides, "
         "neutral expression, plain grey background, even studio lighting, (matte skin:1.2)")
# production negative (embeddings confirmed present) + minimal calibration suppressors
NEG = (", ".join(be.HEAVY_UC_BASE) + ", " + be.IDENTITY_ANCHOR_NEG +
       ", 2girls, multiple views, chibi, baby face, plastic skin, glossy specular")

# production params
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

# representative ladder: one per band + boundary probes
TIERS = [0, 2, 6, 10, 14, 18, 22, 26, 30, 35, 40, 45, 50]


def build(tier):
    cup = be.tier_to_cup_tag(tier)
    sl = be.tier_to_slider_weight(tier)
    hy = be.tier_to_hyper_concept_weight(tier)
    pos = f"{QP}, {MATURE}, {FIXED}"
    if cup:
        pos += f", {cup}"
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
                 "inputs": {"images": ["vd", 0], "filename_prefix": "TIERLAD_t%03d" % tier}}
    return g, {"tier": tier, "cup": cup, "slider": sl, "hyper": hy}


def post(p, d):
    req = urllib.request.Request(API + p, data=json.dumps(d).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


manifest = {"params": {"sampler": SAMPLER, "scheduler": SCHED, "steps": STEPS,
                       "steps_hires": STEPS_HIRES, "cfg": CFG, "seed": SEED,
                       "smooth_booster": SMOOTH_W, "hires_denoise": HIRES_DENOISE},
            "frames": []}
print("submitting", len(TIERS), "tier frames")
for tier in TIERS:
    g, meta = build(tier)
    try:
        r = post("/prompt", {"prompt": g})
        meta["prompt_id"] = r["prompt_id"]
        manifest["frames"].append(meta)
        print("  queued tier %3d  cup=%-16s slider=%+.2f hyper=%.2f" %
              (tier, meta["cup"], meta["slider"], meta["hyper"]))
    except Exception as e:
        meta["error"] = repr(e)
        manifest["frames"].append(meta)
        print("  FAIL", tier, repr(e))

print("waiting...")
t0 = time.time()
while time.time() - t0 < 3000:
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
