r"""OpenPose + IPAdapter FaceID (PLUS V2 SDXL) suite — tight identity via insightface embeddings.

FaceID uses insightface FACE EMBEDDINGS (not global CLIP image stats), so it should lock identity
WITHOUT the nude skin-tone washout that plus-face caused. Reference = the full base image
(insightface detects the face itself).

Per tier: model(slider/hyper) -> IPAdapterUnifiedLoaderFaceID (adds FaceID LoRA + loads ipadapter +
insightface) -> IPAdapterFaceID(face ref) -> OpenPose CN on conditioning -> full-denoise txt2img.

SMOKE=True validates one chain (petite clothed, 3 tiers) before the full 4-build x clothed/nude run.
"""
import importlib.util
import json
import os
import time
import urllib.request

SMOKE = __import__("os").environ.get("FACEID_SMOKE", "0") == "1"

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\faceid_suite_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"
CN_NAME = "controlnet-openpose-sdxl-xinsir.safetensors"
FACEID_PRESET = "FACEID PLUS V2"
FACEID_LORA_STRENGTH = 0.6
FACEID_WEIGHT = 0.8
FACEID_WEIGHT_V2 = 1.0
PROVIDER = "CPU"

_spec = importlib.util.spec_from_file_location("be_prompt", BE_PROMPT)
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)

QP = ", ".join(be.QUALITY_TAGS)
MATURE = ", ".join(be.MATURE_ANCHOR)
AFFIRM = ", ".join(be.CENSORSHIP_AFFIRM_POS)
ID = "long blonde hair, blue eyes"
POSE = "cowboy shot, facing viewer, standing, arms away from sides"
BG = "plain grey background, even studio lighting, (matte skin:1.2)"
UC_COMMON = (", ".join(be.HEAVY_UC_BASE) + ", " + be.IDENTITY_ANCHOR_NEG +
             ", 2girls, multiple views, chibi, baby face, plastic skin, glossy specular")

BODY_TYPES = {
    "petite":   ("petite, slim, slender body, narrow waist, narrow hips, small frame, thin",
                 "wide hips, thick thighs, plump, fat, obese, thick waist, weight gain, curvy"),
    "curvy":    ("curvy, hourglass figure, wide hips, defined waist, thick thighs",
                 "obese, fat, bloated, shapeless, skinny, petite, flat chest figure"),
    "full":     ("full figure, voluptuous, thick, soft body, wide hips, thick thighs, plump",
                 "skinny, petite, thin, anorexic, morbidly obese, athletic"),
    "athletic": ("athletic build, toned, fit, abs, lean muscle, narrow waist",
                 "plump, fat, obese, soft body, weight gain, skinny"),
}
if SMOKE:
    BODY_ORDER, CLOTHING_ORDER, TIERS = ["petite"], ["clothed"], [0, 26, 50]
else:
    BODY_ORDER, CLOTHING_ORDER, TIERS = ["petite", "curvy", "full", "athletic"], ["clothed", "nude"], [0, 2, 8, 14, 20, 26, 33, 40, 45, 50]
BASE_TIER = 14
SEED = 111
W, H = 832, 1216


def scene(build_pin, clothing, cup):
    if clothing == "clothed":
        s = f"{QP}, {MATURE}, 1girl, solo, {ID}, {build_pin}, (fitted crop top:1.1), short shorts, {POSE}, {BG}"
    else:
        s = (f"sensitive, {QP}, {MATURE}, {AFFIRM}, 1girl, solo, {ID}, {build_pin}, topless, nude, "
             f"bare breasts, nipples, areola, {POSE}, {BG}")
    return s + (", " + cup if cup else "")


def build_graph(body, clothing):
    build_pin, anti = BODY_TYPES[body]
    neg_text = UC_COMMON + ", " + anti
    g = {}
    saves = {}
    g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "waiIllustriousSDXL_v170.safetensors"}}
    g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
    g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": neg_text}}
    g["cn"] = {"class_type": "ControlNetLoader", "inputs": {"control_net_name": CN_NAME}}

    def model(pfx, sl, hy):
        g[pfx + "_sm"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Smooth_Booster_v5.safetensors", "strength_model": 0.5, "model": ["ckpt", 0]}}
        g[pfx + "_sl"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "Breast_Size_Slider_Illustrious_V2.safetensors", "strength_model": sl, "model": [pfx + "_sm", 0]}}
        last = pfx + "_sl"
        if hy > 0:
            g[pfx + "_hy"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": "hyper_breasts_ILXL_concept.safetensors", "strength_model": hy, "model": [pfx + "_sl", 0]}}
            last = pfx + "_hy"
        return [last, 0]

    def enc(pfx, cup):
        g[pfx + "_pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": scene(build_pin, clothing, cup)}}
        return [pfx + "_pos", 0]

    bm = model("base", be.tier_to_slider_weight(BASE_TIER), be.tier_to_hyper_concept_weight(BASE_TIER))
    bp = enc("base", be.tier_to_cup_tag(BASE_TIER))
    g["base_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
    g["base_ks"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 1.0, "model": bm, "positive": bp, "negative": ["neg", 0], "latent_image": ["base_lat", 0]}}
    g["base_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": ["base_ks", 0], "vae": ["ckpt", 2]}}
    g["pose"] = {"class_type": "DWPreprocessor", "inputs": {"image": ["base_vd", 0], "detect_hand": "enable", "detect_body": "enable", "detect_face": "enable", "resolution": 832, "bbox_detector": "yolox_l.torchscript.pt", "pose_estimator": "dw-ll_ucoco_384_bs5.torchscript.pt", "scale_stick_for_xinsr_cn": "enable"}}

    for t in TIERS:
        cup, sl, hy = be.tier_to_cup_tag(t), be.tier_to_slider_weight(t), be.tier_to_hyper_concept_weight(t)
        pfx = "t%d" % t
        m = model(pfx, sl, hy)
        g[pfx + "_fidload"] = {"class_type": "IPAdapterUnifiedLoaderFaceID",
                               "inputs": {"model": m, "preset": FACEID_PRESET, "lora_strength": FACEID_LORA_STRENGTH, "provider": PROVIDER}}
        g[pfx + "_fid"] = {"class_type": "IPAdapterFaceID",
                           "inputs": {"model": [pfx + "_fidload", 0], "ipadapter": [pfx + "_fidload", 1], "image": ["base_vd", 0],
                                      "weight": FACEID_WEIGHT, "weight_faceidv2": FACEID_WEIGHT_V2, "weight_type": "linear",
                                      "combine_embeds": "concat", "start_at": 0.0, "end_at": 1.0, "embeds_scaling": "V only"}}
        p = enc(pfx, cup)
        g[pfx + "_cna"] = {"class_type": "ControlNetApplyAdvanced",
                           "inputs": {"positive": p, "negative": ["neg", 0], "control_net": ["cn", 0], "image": ["pose", 0], "strength": 1.0, "start_percent": 0.0, "end_percent": 1.0}}
        g[pfx + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
        g[pfx + "_ks"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 1.0, "model": [pfx + "_fid", 0], "positive": [pfx + "_cna", 0], "negative": [pfx + "_cna", 1], "latent_image": [pfx + "_lat", 0]}}
        g[pfx + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": [pfx + "_ks", 0], "vae": ["ckpt", 2]}}
        label = "FID_%s_%s_t%d" % (body, clothing, t)
        g[pfx + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [pfx + "_vd", 0], "filename_prefix": label}}
        saves[pfx + "_save"] = {"body": body, "clothing": clothing, "tier": t, "cup": cup, "slider": sl, "hyper": hy, "label": label}
    return g, saves


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


chains = []
print("SMOKE=%s; submitting %d graphs" % (SMOKE, len(BODY_ORDER) * len(CLOTHING_ORDER)))
for clothing in CLOTHING_ORDER:
    for body in BODY_ORDER:
        g, saves = build_graph(body, clothing)
        try:
            r = post("/prompt", {"prompt": g})
            chains.append({"body": body, "clothing": clothing, "prompt_id": r["prompt_id"], "saves": saves})
            print("  queued %-8s %-7s %s" % (body, clothing, r["prompt_id"]))
        except Exception as e:
            print("  FAIL", body, clothing, repr(e)[:200])

print("waiting...")
t0 = time.time()
while time.time() - t0 < 8000:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(6)
print("drained", int(time.time() - t0), "s")

manifest = {"preset": FACEID_PRESET, "weight": FACEID_WEIGHT, "smoke": SMOKE, "tiers": TIERS,
            "body_order": BODY_ORDER, "clothing_order": CLOTHING_ORDER, "frames": []}
for ch in chains:
    h = get(f"/history/{ch['prompt_id']}")
    e = h.get(ch["prompt_id"], {})
    outs = e.get("outputs", {})
    st = e.get("status", {}).get("status_str")
    if st == "error":
        for m in e.get("status", {}).get("messages", []):
            if m[0] == "execution_error":
                print("ERROR %s/%s: %s | %s" % (ch["body"], ch["clothing"], m[1].get("exception_type"), str(m[1].get("exception_message"))[:200]))
    for node_id, meta in ch["saves"].items():
        imgs = outs.get(node_id, {}).get("images", [])
        mm = dict(meta)
        mm["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"]) for im in imgs]
        mm["status"] = st
        manifest["frames"].append(mm)
open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "frames with files:", sum(1 for f in manifest["frames"] if f.get("files")))
