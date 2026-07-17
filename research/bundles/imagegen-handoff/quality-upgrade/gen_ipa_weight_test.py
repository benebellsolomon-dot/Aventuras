r"""IPA weight test on the nude washout — curvy nude at IPA weight 0.6 and 0.7.

The full suite at IPA weight 0.8 washed out the nude path (overexposed/pale on bare skin).
Render curvy nude at lower IPA weights to find the value that removes the washout while keeping
identity lock. Compare against the 0.8 result (openpose_ipa_suite_manifest, curvy/nude).
"""
import importlib.util
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\ipa_weight_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"
CN_NAME = "controlnet-openpose-sdxl-xinsir.safetensors"
IPA_MODEL = "ip-adapter-plus-face_sdxl_vit-h.safetensors"
CLIPV = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
WEIGHTS = [0.6, 0.7]

_spec = importlib.util.spec_from_file_location("be_prompt", BE_PROMPT)
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)

QP = ", ".join(be.QUALITY_TAGS)
MATURE = ", ".join(be.MATURE_ANCHOR)
AFFIRM = ", ".join(be.CENSORSHIP_AFFIRM_POS)
ID = "long blonde hair, blue eyes"
POSE = "cowboy shot, facing viewer, standing, arms away from sides"
BG = "plain grey background, even studio lighting, (matte skin:1.2)"
BUILD = "curvy, hourglass figure, wide hips, defined waist, thick thighs"
ANTI = "obese, fat, bloated, shapeless, skinny, petite, flat chest figure"
NEG = (", ".join(be.HEAVY_UC_BASE) + ", " + be.IDENTITY_ANCHOR_NEG +
       ", 2girls, multiple views, chibi, baby face, plastic skin, glossy specular, " + ANTI)

SEED = 111
W, H = 832, 1216
BASE_TIER = 14
TIERS = [0, 8, 20, 33, 45, 50]


def scene(cup):
    s = (f"sensitive, {QP}, {MATURE}, {AFFIRM}, 1girl, solo, {ID}, {BUILD}, topless, nude, "
         f"bare breasts, nipples, areola, {POSE}, {BG}")
    return s + (", " + cup if cup else "")


def build(weight):
    tag = "w%02d" % int(weight * 100)
    g = {}
    saves = {}
    g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "waiIllustriousSDXL_v170.safetensors"}}
    g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
    g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEG}}
    g["cn"] = {"class_type": "ControlNetLoader", "inputs": {"control_net_name": CN_NAME}}
    g["ipam"] = {"class_type": "IPAdapterModelLoader", "inputs": {"ipadapter_file": IPA_MODEL}}
    g["clipv"] = {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": CLIPV}}

    def model(pfx, sl, hy):
        g[pfx + "_sm"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Smooth_Booster_v5.safetensors", "strength_model": 0.5, "model": ["ckpt", 0]}}
        g[pfx + "_sl"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Breast_Size_Slider_Illustrious_V2.safetensors", "strength_model": sl, "model": [pfx + "_sm", 0]}}
        last = pfx + "_sl"
        if hy > 0:
            g[pfx + "_hy"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "hyper_breasts_ILXL_concept.safetensors", "strength_model": hy, "model": [pfx + "_sl", 0]}}
            last = pfx + "_hy"
        return [last, 0]

    def enc(pfx, cup):
        g[pfx + "_pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": scene(cup)}}
        return [pfx + "_pos", 0]

    bm = model(tag + "base", be.tier_to_slider_weight(BASE_TIER), be.tier_to_hyper_concept_weight(BASE_TIER))
    bp = enc(tag + "base", be.tier_to_cup_tag(BASE_TIER))
    g[tag + "blat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g[tag + "bks"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 1.0, "model": bm, "positive": bp, "negative": ["neg", 0], "latent_image": [tag + "blat", 0]}}
    g[tag + "bvd"] = {"class_type": "VAEDecode", "inputs": {"samples": [tag + "bks", 0], "vae": ["ckpt", 2]}}
    g[tag + "fc"] = {"class_type": "ImageCrop", "inputs": {"image": [tag + "bvd", 0], "width": 400, "height": 400, "x": 216, "y": 16}}
    g[tag + "pose"] = {"class_type": "DWPreprocessor", "inputs": {"image": [tag + "bvd", 0], "detect_hand": "enable", "detect_body": "enable", "detect_face": "enable", "resolution": 832, "bbox_detector": "yolox_l.torchscript.pt", "pose_estimator": "dw-ll_ucoco_384_bs5.torchscript.pt", "scale_stick_for_xinsr_cn": "enable"}}

    for t in TIERS:
        cup, sl, hy = be.tier_to_cup_tag(t), be.tier_to_slider_weight(t), be.tier_to_hyper_concept_weight(t)
        pfx = "%s_t%d" % (tag, t)
        m = model(pfx, sl, hy)
        g[pfx + "_ipa"] = {"class_type": "IPAdapterAdvanced", "inputs": {"model": m, "ipadapter": ["ipam", 0], "image": [tag + "fc", 0], "clip_vision": ["clipv", 0], "weight": weight, "weight_type": "linear", "combine_embeds": "concat", "start_at": 0.0, "end_at": 1.0, "embeds_scaling": "V only"}}
        p = enc(pfx, cup)
        g[pfx + "_cna"] = {"class_type": "ControlNetApplyAdvanced", "inputs": {"positive": p, "negative": ["neg", 0], "control_net": ["cn", 0], "image": [tag + "pose", 0], "strength": 1.0, "start_percent": 0.0, "end_percent": 1.0}}
        g[pfx + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
        g[pfx + "_ks"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 1.0, "model": [pfx + "_ipa", 0], "positive": [pfx + "_cna", 0], "negative": [pfx + "_cna", 1], "latent_image": [pfx + "_lat", 0]}}
        g[pfx + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": [pfx + "_ks", 0], "vae": ["ckpt", 2]}}
        label = "IPAW_%s_t%d" % (tag, t)
        g[pfx + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [pfx + "_vd", 0], "filename_prefix": label}}
        saves[pfx + "_save"] = {"weight": weight, "tier": t, "label": label}
    return g, saves


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


chains = []
for w in WEIGHTS:
    g, saves = build(w)
    r = post("/prompt", {"prompt": g})
    chains.append({"weight": w, "prompt_id": r["prompt_id"], "saves": saves})
    print("queued weight", w, r["prompt_id"])
t0 = time.time()
while time.time() - t0 < 3000:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(5)
print("drained", int(time.time() - t0), "s")

manifest = {"tiers": TIERS, "frames": []}
for ch in chains:
    h = get(f"/history/{ch['prompt_id']}")
    e = h.get(ch["prompt_id"], {})
    outs = e.get("outputs", {})
    for node_id, meta in ch["saves"].items():
        imgs = outs.get(node_id, {}).get("images", [])
        m = dict(meta)
        m["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"]) for im in imgs]
        manifest["frames"].append(m)
open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "frames:", sum(1 for f in manifest["frames"] if f.get("files")))
