r"""OpenPose + IPAdapter-FACE tier growth — lock pose AND face identity while breasts grow.

Adds IPAdapter PLUS FACE (ip-adapter-plus-face_sdxl_vit-h) on top of the OpenPose method:
the base render's face becomes the identity reference for every tier, so the face stays the SAME
person across the whole expansion (OpenPose alone locks pose, not identity).

One graph: base txt2img -> base image -> DWPose skeleton + IPAdapter face reference (both from base);
per tier: model patched with IPAdapter-face, conditioning patched with OpenPose pose, full-denoise
txt2img with tier slider/hyper. Renders petite clothed, 10 tiers, at IPA weight 0.8.
"""
import importlib.util
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\openpose_ipa_v2_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"
CN_NAME = "controlnet-openpose-sdxl-xinsir.safetensors"
IPA_MODEL = "ip-adapter-plus-face_sdxl_vit-h.safetensors"
CLIPV = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
IPA_WEIGHT = 0.8
BODY, CLOTHING = "petite", "clothed"

_spec = importlib.util.spec_from_file_location("be_prompt", BE_PROMPT)
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)

QP = ", ".join(be.QUALITY_TAGS)
MATURE = ", ".join(be.MATURE_ANCHOR)
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
    s = f"{QP}, {MATURE}, 1girl, solo, {ID}, {BUILD}, (fitted crop top:1.1), short shorts, {POSE}, {BG}"
    return s + (", " + cup if cup else "")


g = {}
saves = {}
g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "waiIllustriousSDXL_v170.safetensors"}}
g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEG}}
g["cn"] = {"class_type": "ControlNetLoader", "inputs": {"control_net_name": CN_NAME}}
g["ipa_model"] = {"class_type": "IPAdapterModelLoader", "inputs": {"ipadapter_file": IPA_MODEL}}
g["clipv"] = {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": CLIPV}}


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


def enc(pfx, cup):
    g[pfx + "_pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": scene(cup)}}
    return [pfx + "_pos", 0]


# base render (pose + face reference source)
bm = model("base", be.tier_to_slider_weight(BASE_TIER), be.tier_to_hyper_concept_weight(BASE_TIER))
bp = enc("base", be.tier_to_cup_tag(BASE_TIER))
g["base_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
g["base_ks"] = {"class_type": "KSampler",
                "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral",
                           "scheduler": "normal", "denoise": 1.0, "model": bm, "positive": bp,
                           "negative": ["neg", 0], "latent_image": ["base_lat", 0]}}
g["base_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": ["base_ks", 0], "vae": ["ckpt", 2]}}
g["base_save"] = {"class_type": "SaveImage", "inputs": {"images": ["base_vd", 0], "filename_prefix": "OPIPA2_base"}}
saves["base_save"] = {"body": BODY, "clothing": CLOTHING, "tier": BASE_TIER, "kind": "base", "label": "OPIPA2_base"}
# FACE CROP of the base = IPAdapter reference (face-only -> identity locked, no body/breast pull)
g["facecrop"] = {"class_type": "ImageCrop", "inputs": {"image": ["base_vd", 0], "width": 400, "height": 400, "x": 216, "y": 16}}
g["facecrop_save"] = {"class_type": "SaveImage", "inputs": {"images": ["facecrop", 0], "filename_prefix": "OPIPA2_facecrop"}}
saves["facecrop_save"] = {"body": BODY, "clothing": CLOTHING, "tier": -2, "kind": "facecrop", "label": "OPIPA2_facecrop"}
g["pose"] = {"class_type": "DWPreprocessor",
             "inputs": {"image": ["base_vd", 0], "detect_hand": "enable", "detect_body": "enable",
                        "detect_face": "enable", "resolution": 832,
                        "bbox_detector": "yolox_l.torchscript.pt",
                        "pose_estimator": "dw-ll_ucoco_384_bs5.torchscript.pt",
                        "scale_stick_for_xinsr_cn": "enable"}}

for t in TIERS:
    cup, sl, hy = be.tier_to_cup_tag(t), be.tier_to_slider_weight(t), be.tier_to_hyper_concept_weight(t)
    pfx = "t%d" % t
    m = model(pfx, sl, hy)
    # IPAdapter-FACE patches the MODEL with the base face as identity reference
    g[pfx + "_ipa"] = {"class_type": "IPAdapterAdvanced",
                       "inputs": {"model": m, "ipadapter": ["ipa_model", 0], "image": ["facecrop", 0],
                                  "clip_vision": ["clipv", 0], "weight": IPA_WEIGHT, "weight_type": "linear",
                                  "combine_embeds": "concat", "start_at": 0.0, "end_at": 1.0,
                                  "embeds_scaling": "V only"}}
    p = enc(pfx, cup)
    g[pfx + "_cna"] = {"class_type": "ControlNetApplyAdvanced",
                       "inputs": {"positive": p, "negative": ["neg", 0], "control_net": ["cn", 0],
                                  "image": ["pose", 0], "strength": 1.0, "start_percent": 0.0, "end_percent": 1.0}}
    g[pfx + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g[pfx + "_ks"] = {"class_type": "KSampler",
                      "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral",
                                 "scheduler": "normal", "denoise": 1.0, "model": [pfx + "_ipa", 0],
                                 "positive": [pfx + "_cna", 0], "negative": [pfx + "_cna", 1],
                                 "latent_image": [pfx + "_lat", 0]}}
    g[pfx + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": [pfx + "_ks", 0], "vae": ["ckpt", 2]}}
    label = "OPIPA2_%s_%s_t%d" % (BODY, CLOTHING, t)
    g[pfx + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [pfx + "_vd", 0], "filename_prefix": label}}
    saves[pfx + "_save"] = {"body": BODY, "clothing": CLOTHING, "tier": t, "kind": "ipa", "cup": cup,
                            "slider": sl, "hyper": hy, "label": label}


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


print("submitting openpose+IPA-face graph: base + pose + %d tiers (ipa weight %.2f)" % (len(TIERS), IPA_WEIGHT))
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

manifest = {"ipa_weight": IPA_WEIGHT, "tiers": TIERS, "frames": []}
h = get(f"/history/{pid}")
e = h.get(pid, {})
outs = e.get("outputs", {})
st = e.get("status", {}).get("status_str")
print("status", st)
if st == "error":
    for m in e.get("status", {}).get("messages", []):
        if m[0] == "execution_error":
            print("ERROR:", m[1].get("exception_type"), str(m[1].get("exception_message"))[:300])
for node_id, meta in saves.items():
    imgs = outs.get(node_id, {}).get("images", [])
    m = dict(meta)
    m["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"]) for im in imgs]
    manifest["frames"].append(m)
open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "frames with files:", sum(1 for f in manifest["frames"] if f.get("files")))
