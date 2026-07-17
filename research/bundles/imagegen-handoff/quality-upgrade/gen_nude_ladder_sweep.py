r"""NUDE-path full tier-ladder sweep (extends the hyper suite to bare skin, all tiers).

Mirrors gen_tier_ladder_sweep.py but on the production NUDE (sensitive) rating path:
faithfully replicates be_prompt's bare-skin rating logic — `sensitive` rating tag +
CENSORSHIP_AFFIRM_POS, and (correctly) NO censorship-suppression block (that fires only on
`explicit`). Locked nude scene (topless / bare breasts, front cowboy shot), same seed as the
clothed ladder for direct comparability. Production preset graph + live be_prompt mapping.

Validates, on bare anatomy across tiers 0->50:
  - size monotonicity WITHOUT the garment-strain size cue
  - nipple / areola / breast-shape coherence
  - whether bare breasts come out censored without the suppression block (sensitive lacks it)
  - MATURITY GUARD at low tiers (flat t0 / small t2 nude must read clearly adult)
"""
import importlib.util
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\nude_ladder_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"

_spec = importlib.util.spec_from_file_location("be_prompt", BE_PROMPT)
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)

QP = ", ".join(be.QUALITY_TAGS)
MATURE = ", ".join(be.MATURE_ANCHOR)
AFFIRM = ", ".join(be.CENSORSHIP_AFFIRM_POS)
RATING = be.intimacy_to_rating("nude")          # -> "sensitive"
IS_EXPLICIT = RATING == "explicit"              # False for nude; keeps logic explicit
ID = "long blonde hair, blue eyes"

# locked nude scene — bare breasts, same framing/pose/bg as the clothed ladder
NUDE_SCENE = (f"1girl, solo, {ID}, topless, nude, bare breasts, nipples, areola, "
              "cowboy shot, facing viewer, standing, arms at sides, neutral expression, "
              "plain grey background, even studio lighting, (matte skin:1.2)")

# faithful production negative for the sensitive path: HEAVY_UC + identity anchor,
# NO CENSORSHIP_SUPPRESSION_UC (sensitive != explicit). Same calibration suppressors
# as the clothed sweep so the only deltas are rating + affirm + bare skin.
NEG = (", ".join(be.HEAVY_UC_BASE) + ", " + be.IDENTITY_ANCHOR_NEG +
       ", 2girls, multiple views, chibi, baby face, plastic skin, glossy specular")

CKPT = "waiIllustriousSDXL_v170.safetensors"
SEED = 111
W, H = 832, 1216
TIERS = [0, 2, 6, 10, 14, 18, 22, 26, 30, 35, 40, 45, 50]


def build(tier):
    cup = be.tier_to_cup_tag(tier)
    sl = be.tier_to_slider_weight(tier)
    hy = be.tier_to_hyper_concept_weight(tier)
    # positive ordering mirrors build_image_request: rating, quality, mature, affirm, scene, cup
    parts = [RATING, QP, MATURE, AFFIRM, NUDE_SCENE]
    if cup:
        parts.append(cup)
    pos = ", ".join(parts)
    g = {}
    g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}}
    g["clipskip"] = {"class_type": "CLIPSetLastLayer",
                     "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
    g["smooth"] = {"class_type": "LoraLoaderModelOnly",
                   "inputs": {"lora_name": "Smooth_Booster_v5.safetensors",
                              "strength_model": 0.5, "model": ["ckpt", 0]}}
    g["slider"] = {"class_type": "LoraLoaderModelOnly",
                   "inputs": {"lora_name": "Breast_Size_Slider_Illustrious_V2.safetensors",
                              "strength_model": sl, "model": ["smooth", 0]}}
    g["hyper"] = {"class_type": "LoraLoaderModelOnly",
                  "inputs": {"lora_name": "hyper_breasts_ILXL_concept.safetensors",
                             "strength_model": hy, "model": ["slider", 0]}}
    g["pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clipskip", 0], "text": pos}}
    g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clipskip", 0], "text": NEG}}
    g["lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g["ks"] = {"class_type": "KSampler",
               "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral",
                          "scheduler": "normal", "denoise": 1.0, "model": ["hyper", 0],
                          "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": ["lat", 0]}}
    g["up"] = {"class_type": "LatentUpscaleBy",
               "inputs": {"samples": ["ks", 0], "upscale_method": "nearest-exact", "scale_by": 1.5}}
    g["ksf"] = {"class_type": "KSampler",
                "inputs": {"seed": SEED, "steps": 18, "cfg": 5.0, "sampler_name": "euler_ancestral",
                           "scheduler": "normal", "denoise": 0.4, "model": ["hyper", 0],
                           "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": ["up", 0]}}
    g["vd"] = {"class_type": "VAEDecode", "inputs": {"samples": ["ksf", 0], "vae": ["ckpt", 2]}}
    g["save"] = {"class_type": "SaveImage",
                 "inputs": {"images": ["vd", 0], "filename_prefix": "NUDELAD_t%03d" % tier}}
    return g, {"tier": tier, "cup": cup, "slider": sl, "hyper": hy}


def post(p, d):
    req = urllib.request.Request(API + p, data=json.dumps(d).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


manifest = {"rating": RATING, "params": {"seed": SEED, "sampler": "euler_ancestral"}, "frames": []}
print("submitting", len(TIERS), "nude tier frames; rating =", RATING)
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
