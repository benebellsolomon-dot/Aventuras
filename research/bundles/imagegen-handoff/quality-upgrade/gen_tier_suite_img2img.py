r"""Full TIER ladder via chained img2img — across 4 body types x clothed/nude.

Verifies that the body-hold method (chained img2img: each frame img2img from the previous frame's
latent at a moderate denoise + body-build pin + anti-thick negatives) still yields PROPER TIER BUST
GROWTH — monotonic and well-separated across bands — while the body build stays locked.

8 chained sequences = {petite, curvy, full, athletic} x {clothed, nude}. Each sequence is one
ComfyUI graph: base tier rendered txt2img, every later tier img2img from the previous latent.
Tier chain covers all bands. Compare bust sizes against the txt2img ladder (tier_ladder_torso.png).
"""
import importlib.util
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\tier_suite_img2img_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"

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

# (pin tags, build-specific anti-thick/anti-thin negatives)
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
BODY_ORDER = ["petite", "curvy", "full", "athletic"]
CLOTHING_ORDER = ["clothed", "nude"]
TIER_CHAIN = [0, 2, 8, 14, 20, 26, 33, 40, 45, 50]   # covers all bands flat->hyper
D_STEP = 0.5
SEED = 111
W, H = 832, 1216


def scene(build_pin, clothing, cup):
    if clothing == "clothed":
        s = (f"{QP}, {MATURE}, 1girl, solo, {ID}, {build_pin}, (fitted crop top:1.1), short shorts, "
             f"{POSE}, {BG}")
    else:  # nude (sensitive rating path: rating tag + affirm, no censorship-suppression)
        s = (f"sensitive, {QP}, {MATURE}, {AFFIRM}, 1girl, solo, {ID}, {build_pin}, topless, nude, "
             f"bare breasts, nipples, areola, {POSE}, {BG}")
    return s + (", " + cup if cup else "")


def build_chain(body, clothing):
    build_pin, anti = BODY_TYPES[body]
    neg_text = UC_COMMON + ", " + anti
    g = {}
    saves = {}
    g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "waiIllustriousSDXL_v170.safetensors"}}
    g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
    g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": neg_text}}

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

    prev = None
    for i, t in enumerate(TIER_CHAIN):
        cup, sl, hy = be.tier_to_cup_tag(t), be.tier_to_slider_weight(t), be.tier_to_hyper_concept_weight(t)
        pfx = "f%d" % i
        m = model(pfx, sl, hy)
        g[pfx + "_pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": scene(build_pin, clothing, cup)}}
        if i == 0:
            g[pfx + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
            latent_in = [pfx + "_lat", 0]
            d = 1.0
        else:
            latent_in = prev
            d = D_STEP
        g[pfx + "_ks"] = {"class_type": "KSampler",
                          "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral",
                                     "scheduler": "normal", "denoise": d, "model": m, "positive": [pfx + "_pos", 0],
                                     "negative": ["neg", 0], "latent_image": latent_in}}
        g[pfx + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": [pfx + "_ks", 0], "vae": ["ckpt", 2]}}
        label = "TSI_%s_%s_s%d_t%d" % (body, clothing, i, t)
        g[pfx + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [pfx + "_vd", 0], "filename_prefix": label}}
        saves[pfx + "_save"] = {"body": body, "clothing": clothing, "step": i, "tier": t,
                                "cup": cup, "slider": sl, "hyper": hy, "denoise": d, "label": label}
        prev = [pfx + "_ks", 0]
    return g, saves


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


chains = []
print("submitting", len(BODY_ORDER) * len(CLOTHING_ORDER), "chains x", len(TIER_CHAIN), "tiers")
for clothing in CLOTHING_ORDER:
    for body in BODY_ORDER:
        g, saves = build_chain(body, clothing)
        try:
            r = post("/prompt", {"prompt": g})
            chains.append({"body": body, "clothing": clothing, "prompt_id": r["prompt_id"], "saves": saves})
            print("  queued %-8s %-7s prompt_id %s" % (body, clothing, r["prompt_id"]))
        except Exception as e:
            print("  FAIL", body, clothing, repr(e))

print("waiting...")
t0 = time.time()
while time.time() - t0 < 5000:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(6)
print("drained", int(time.time() - t0), "s")

manifest = {"tier_chain": TIER_CHAIN, "d_step": D_STEP, "body_order": BODY_ORDER,
            "clothing_order": CLOTHING_ORDER, "frames": []}
for ch in chains:
    h = get(f"/history/{ch['prompt_id']}")
    e = h.get(ch["prompt_id"], {})
    outs = e.get("outputs", {})
    st = e.get("status", {}).get("status_str")
    for node_id, meta in ch["saves"].items():
        imgs = outs.get(node_id, {}).get("images", [])
        m = dict(meta)
        m["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"]) for im in imgs]
        m["status"] = st
        manifest["frames"].append(m)

open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "frames with files:", sum(1 for f in manifest["frames"] if f.get("files")))
