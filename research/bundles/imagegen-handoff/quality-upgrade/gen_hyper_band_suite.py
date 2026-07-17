r"""v2.2 HYPER-BAND full testing suite.

Stress-tests the recalibrated hyper band (tiers 40/45/50: slider 0.5->0.6, hyper 0.5->0.85)
across the conditions production actually generates — not just the clean calibration cowboy
shot. Drives the live be_prompt.py mapping through the production preset graph
(illustrious_image.json: clip-skip 2, smooth_booster 0.5, model-only slider+hyper,
euler_a/normal, latent-upscale x1.5 hires 0.4). No face/hand detailer — the honest
production path.

Groups:
  framing  — cowboy / full_body / portrait / two_char  (coherence + band separation)
  pose     — arms_up / supine / hand_on_breast          (coherence under hard poses)
  seed     — tier 50 cowboy across 6 fresh seeds         (failure-rate at the extreme)
  manga    — real comic-continuer prompt (build_image_request, monochrome/screentone)
  monoton  — full_body / two_char tier 45                (mid-band monotonicity off-scene)
"""
import importlib.util
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\hyper_suite_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"

_spec = importlib.util.spec_from_file_location("be_prompt", BE_PROMPT)
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)

QP = ", ".join(be.QUALITY_TAGS)
MATURE = ", ".join(be.MATURE_ANCHOR)
ID = "long blonde hair, blue eyes"

# production negative (embeddings present) minus the solo-only 2girls suppressor,
# which we add per-cell so the two_char cells aren't sabotaged.
NEG_BASE = (", ".join(be.HEAVY_UC_BASE) + ", " + be.IDENTITY_ANCHOR_NEG +
            ", chibi, baby face, plastic skin, glossy specular, fused breasts, uniboob")
NEG_SOLO = NEG_BASE + ", 2girls, multiple views, multiple girls"
NEG_TWO = NEG_BASE + ", 3girls, fused bodies, conjoined twins, extra person, clone"

SCENES = {
    "cowboy": (f"1girl, solo, {ID}, (fitted ribbed tank top:1.1), form-fitting clothes, "
               "cowboy shot, facing viewer, standing, arms at sides, neutral expression, "
               "plain grey background, even studio lighting, (matte skin:1.2)"),
    "full_body": (f"1girl, solo, {ID}, (fitted ribbed tank top:1.1), denim shorts, full body, "
                  "head to toe, feet visible, standing, facing viewer, neutral expression, "
                  "plain background, even lighting, (matte skin:1.2)"),
    "portrait": (f"1girl, solo, {ID}, (fitted ribbed tank top:1.1), upper body, close-up, "
                 "facing viewer, neutral expression, plain grey background, soft lighting, "
                 "(matte skin:1.2)"),
    "two_char": (f"2girls, one with {ID}, one with short brown hair green eyes, "
                 "(fitted tank tops:1.1), standing side by side, cowboy shot, facing viewer, "
                 "plain grey background, even lighting, (matte skin:1.2)"),
    "arms_up": (f"1girl, solo, {ID}, (fitted ribbed tank top:1.1), cowboy shot, facing viewer, "
                "standing, (arms up:1.1), hands behind head, both breasts visible, "
                "hanging breasts, heavy breasts, neutral expression, plain grey background, "
                "(matte skin:1.2)"),
    "supine": (f"1girl, solo, {ID}, (fitted ribbed tank top:1.1), lying on back, supine, "
               "from above, breasts spreading to sides, breasts falling outward, "
               "flattened at apex, relaxed expression, plain background, (matte skin:1.2)"),
    "hand_on_breast": (f"1girl, solo, {ID}, (fitted ribbed tank top:1.1), cowboy shot, "
                       "(hand on own breast:1.1), fingers sinking into breast, "
                       "soft tissue bulging between fingers, breast deformation, "
                       "facing viewer, parted lips, plain grey background, (matte skin:1.2)"),
}
SCENE_NEG = {"two_char": NEG_TWO}  # default NEG_SOLO otherwise


def _manga_panel(framing, tier):
    comp = "full body shot, head to toe, feet visible" if framing == "full_body" else "cowboy shot"
    return {
        "composition": comp,
        "setting": "plain background, even lighting",
        "characters": [f"{ID}, fitted tank top"],
        "action": "standing, facing viewer, neutral expression",
        "tier_index": tier,
        "intimacy": "suggestive",
    }


# ── cell list ────────────────────────────────────────────────────────────────
def cells():
    out = []
    # A) framing × {40,50}
    for fr in ("cowboy", "full_body", "portrait", "two_char"):
        for tier in (40, 50):
            out.append({"group": "framing", "scene_key": fr, "tier": tier, "seed": 111})
    # B) pose × {40,50}
    for ps in ("arms_up", "supine", "hand_on_breast"):
        for tier in (40, 50):
            out.append({"group": "pose", "scene_key": ps, "tier": tier, "seed": 111})
    # C) seed robustness — tier 50 cowboy, fresh seeds
    for sd in (222, 333, 444, 555, 666, 777):
        out.append({"group": "seed", "scene_key": "cowboy", "tier": 50, "seed": sd})
    # D) manga register — real production prompt
    for fr in ("cowboy", "full_body"):
        for tier in (40, 50):
            out.append({"group": "manga", "scene_key": fr, "tier": tier, "seed": 111,
                        "register": "manga"})
    # E) mid-band monotonicity off-scene (45 to bracket with A's 40/50)
    out.append({"group": "monoton", "scene_key": "full_body", "tier": 45, "seed": 111})
    out.append({"group": "monoton", "scene_key": "two_char", "tier": 45, "seed": 111})
    return out


def _r8(x):
    return int(round(x / 8) * 8)


def build(cell):
    tier = cell["tier"]
    seed = cell["seed"]
    register = cell.get("register", "color")
    fr = cell["scene_key"]
    wide = fr == "two_char"
    W, H = (1216, 832) if wide else (832, 1216)

    if register == "manga":
        req = be.build_image_request(_manga_panel(fr, tier), seed=seed)
        pos = req["prompt"]
        neg = req["negative_prompt"]
        sl = req["lora_strengths"]["slider"]
        hy = req["lora_strengths"]["hyper_concept"]
    else:
        cup = be.tier_to_cup_tag(tier)
        pos = f"{QP}, {MATURE}, {SCENES[fr]}, {cup}"
        neg = SCENE_NEG.get(fr, NEG_SOLO)
        sl = be.tier_to_slider_weight(tier)
        hy = be.tier_to_hyper_concept_weight(tier)

    label = f"{cell['group']}_{fr}_t{tier}_s{seed}"
    g = {}
    g["ckpt"] = {"class_type": "CheckpointLoaderSimple",
                 "inputs": {"ckpt_name": "waiIllustriousSDXL_v170.safetensors"}}
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
    g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clipskip", 0], "text": neg}}
    g["lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g["ks"] = {"class_type": "KSampler",
               "inputs": {"seed": seed, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral",
                          "scheduler": "normal", "denoise": 1.0, "model": ["hyper", 0],
                          "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": ["lat", 0]}}
    g["up"] = {"class_type": "LatentUpscaleBy",
               "inputs": {"samples": ["ks", 0], "upscale_method": "nearest-exact", "scale_by": 1.5}}
    g["ksf"] = {"class_type": "KSampler",
                "inputs": {"seed": seed, "steps": 18, "cfg": 5.0, "sampler_name": "euler_ancestral",
                           "scheduler": "normal", "denoise": 0.4, "model": ["hyper", 0],
                           "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": ["up", 0]}}
    g["vd"] = {"class_type": "VAEDecode", "inputs": {"samples": ["ksf", 0], "vae": ["ckpt", 2]}}
    g["save"] = {"class_type": "SaveImage",
                 "inputs": {"images": ["vd", 0], "filename_prefix": "HSUITE_%s" % label}}
    meta = {"group": cell["group"], "scene_key": fr, "tier": tier, "seed": seed,
            "register": register, "slider": sl, "hyper": hy, "label": label,
            "width": W, "height": H}
    return g, meta


def post(p, d):
    req = urllib.request.Request(API + p, data=json.dumps(d).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


CELLS = cells()
manifest = {"frames": []}
print("submitting", len(CELLS), "suite frames")
for cell in CELLS:
    g, meta = build(cell)
    try:
        r = post("/prompt", {"prompt": g})
        meta["prompt_id"] = r["prompt_id"]
        print("  queued %-32s slider=%.2f hyper=%.2f" % (meta["label"], meta["slider"], meta["hyper"]))
    except Exception as e:
        meta["error"] = repr(e)
        print("  FAIL", meta["label"], repr(e))
    manifest["frames"].append(meta)

print("waiting...")
t0 = time.time()
while time.time() - t0 < 4000:
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
