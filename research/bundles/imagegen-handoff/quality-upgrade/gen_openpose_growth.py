r"""OpenPose-locked tier growth — full txt2img growth with the body/pose held by an OpenPose CN.

The long-term body-hold method (replaces failed chained img2img). One graph:
  base: txt2img petite (tier 14) -> VAEDecode -> base image (the pose source)
  DWPreprocessor(base) -> OpenPose skeleton (locks pose: shoulders/arms/hips/head; NOT breasts)
  ControlNetLoader(xinsir openpose sdxl)
  per tier: ControlNetApplyAdvanced(pose) on (pos_tier, neg) -> KSampler(empty latent, denoise 1.0,
            tier slider/hyper) -> decode -> save

Because each tier is a full-denoise txt2img, breast growth is UNMUTED (matches the txt2img ladder),
while the OpenPose CN + body-pin tags hold pose/build constant. No chaining -> no degradation.
"""
import importlib.util
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_growth_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"
CN_NAME = "controlnet-openpose-sdxl-xinsir.safetensors"
CN_STRENGTH = 1.0
BODY = "petite"
CLOTHING = "clothed"

_spec = importlib.util.spec_from_file_location("be_prompt", BE_PROMPT)
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)

QP = ", ".join(be.QUALITY_TAGS)
MATURE = ", ".join(be.MATURE_ANCHOR)
AFFIRM = ", ".join(be.CENSORSHIP_AFFIRM_POS)
ID = "long blonde hair, blue eyes"
POSE = "cowboy shot, facing viewer, standing, arms away from sides"
BG = "plain grey background, even studio lighting, (matte skin:1.2)"
BUILD = "petite, slim, slender body, narrow waist, narrow hips, small frame, thin"
ANTI = "wide hips, thick thighs, plump, fat, obese, thick waist, weight gain, curvy"
NEG = (", ".join(be.HEAVY_UC_BASE) + ", " + be.IDENTITY_ANCHOR_NEG +
       ", 2girls, multiple views, chibi, baby face, plastic skin, glossy specular, " + ANTI)

SEED = 111
W, H = 832, 1216
BASE_TIER = 14
TIERS = [0, 2, 8, 14, 20, 26, 33, 40, 45, 50]


def scene(cup):
    if CLOTHING == "clothed":
        s = f"{QP}, {MATURE}, 1girl, solo, {ID}, {BUILD}, (fitted crop top:1.1), short shorts, {POSE}, {BG}"
    else:
        s = (f"sensitive, {QP}, {MATURE}, {AFFIRM}, 1girl, solo, {ID}, {BUILD}, topless, nude, "
             f"bare breasts, nipples, areola, {POSE}, {BG}")
    return s + (", " + cup if cup else "")


g = {}
saves = {}
g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "waiIllustriousSDXL_v170.safetensors"}}
g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEG}}
g["cn"] = {"class_type": "ControlNetLoader", "inputs": {"control_net_name": CN_NAME}}


def model(pfx, sl, hy):
    g[pfx + "_sm"] = {"class_type": "LoraLoaderModelOnly",
                      "inputs": {"lora_name": "Smooth_Booster_v5.safetensors", "strength_model": 0.5, "model": ["ckpt", 0]}}
    g[pfx + "_sl"] = {"class_type": "LoraLoaderModelOnly",
                      "inputs": {"lora_name": "Breast_Size_Slider_Illustrious_V2.safetensors", "strength_model": sl, "model": [pfx + "_sm", 0]}}
    last = pfx + "_sl"
    if hy > 0:
        g[pfx + "_hy"] = {"class_type": "LoraLoaderModelOnly",
                          "inputs": {"lora_name": "hyper_breasts_ILXL_concept.safetensors", "strength_model": hy, "model": [pfx + "_sl", 0]}}
        last = pfx + "_hy"
    return [last, 0]


def encode(pfx, cup):
    g[pfx + "_pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": scene(cup)}}
    return [pfx + "_pos", 0]


# base render (pose source) — tier 14, no CN
bm = model("base", be.tier_to_slider_weight(BASE_TIER), be.tier_to_hyper_concept_weight(BASE_TIER))
bp = encode("base", be.tier_to_cup_tag(BASE_TIER))
g["base_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
g["base_ks"] = {"class_type": "KSampler",
                "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral",
                           "scheduler": "normal", "denoise": 1.0, "model": bm, "positive": bp,
                           "negative": ["neg", 0], "latent_image": ["base_lat", 0]}}
g["base_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": ["base_ks", 0], "vae": ["ckpt", 2]}}
g["base_save"] = {"class_type": "SaveImage", "inputs": {"images": ["base_vd", 0], "filename_prefix": "OPGROW_base_t%d" % BASE_TIER}}
saves["base_save"] = {"body": BODY, "clothing": CLOTHING, "tier": BASE_TIER, "kind": "base_nocn", "label": "OPGROW_base_t%d" % BASE_TIER}

# pose extraction
g["pose"] = {"class_type": "DWPreprocessor",
             "inputs": {"image": ["base_vd", 0], "detect_hand": "enable", "detect_body": "enable",
                        "detect_face": "enable", "resolution": 832,
                        "bbox_detector": "yolox_l.torchscript.pt",
                        "pose_estimator": "dw-ll_ucoco_384_bs5.torchscript.pt",
                        "scale_stick_for_xinsr_cn": "enable"}}
g["pose_save"] = {"class_type": "SaveImage", "inputs": {"images": ["pose", 0], "filename_prefix": "OPGROW_poseimg"}}
saves["pose_save"] = {"body": BODY, "clothing": CLOTHING, "tier": -1, "kind": "pose", "label": "OPGROW_poseimg"}

# per-tier txt2img with pose locked
for t in TIERS:
    cup, sl, hy = be.tier_to_cup_tag(t), be.tier_to_slider_weight(t), be.tier_to_hyper_concept_weight(t)
    pfx = "t%d" % t
    m = model(pfx, sl, hy)
    p = encode(pfx, cup)
    g[pfx + "_cna"] = {"class_type": "ControlNetApplyAdvanced",
                       "inputs": {"positive": p, "negative": ["neg", 0], "control_net": ["cn", 0],
                                  "image": ["pose", 0], "strength": CN_STRENGTH,
                                  "start_percent": 0.0, "end_percent": 1.0}}
    g[pfx + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g[pfx + "_ks"] = {"class_type": "KSampler",
                      "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral",
                                 "scheduler": "normal", "denoise": 1.0, "model": m,
                                 "positive": [pfx + "_cna", 0], "negative": [pfx + "_cna", 1],
                                 "latent_image": [pfx + "_lat", 0]}}
    g[pfx + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": [pfx + "_ks", 0], "vae": ["ckpt", 2]}}
    label = "OPGROW_%s_%s_t%d" % (BODY, CLOTHING, t)
    g[pfx + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [pfx + "_vd", 0], "filename_prefix": label}}
    saves[pfx + "_save"] = {"body": BODY, "clothing": CLOTHING, "tier": t, "kind": "cn", "cup": cup,
                            "slider": sl, "hyper": hy, "label": label}


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


print("submitting openpose growth graph: base + pose + %d tiers" % len(TIERS))
r = post("/prompt", {"prompt": g})
pid = r["prompt_id"]
print("prompt_id", pid)
t0 = time.time()
while time.time() - t0 < 4000:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(6)
print("drained", int(time.time() - t0), "s")

manifest = {"cn": CN_NAME, "cn_strength": CN_STRENGTH, "tiers": TIERS, "frames": []}
h = get(f"/history/{pid}")
e = h.get(pid, {})
outs = e.get("outputs", {})
st = e.get("status", {}).get("status_str")
print("status", st)
if st == "error":
    for m in e.get("status", {}).get("messages", []):
        if m[0] == "execution_error":
            print("ERROR:", m[1].get("exception_type"), m[1].get("exception_message"))
for node_id, meta in saves.items():
    imgs = outs.get(node_id, {}).get("images", [])
    m = dict(meta)
    m["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"]) for im in imgs]
    manifest["frames"].append(m)
open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "frames with files:", sum(1 for f in manifest["frames"] if f.get("files")))
