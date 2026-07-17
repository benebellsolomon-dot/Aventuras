r"""Chained-img2img expansion — reach hyper while holding the body, via small stepwise growth.

Single img2img from a 'large' base to 'hyper' is too big a jump (needs high denoise -> body
drifts). Instead chain: base t14 -> img2img t22 -> t30 -> t40 -> t50, each step img2img FROM THE
PREVIOUS frame's latent at a moderate denoise. Each step is a small breast increment, so a low/mid
denoise both preserves the (already-established) body AND lets breasts keep growing; growth
accumulates to hyper by the last frame. Body pin + anti-thick negatives counter cumulative drift.

One graph: base latent -> c22 latent -> c30 latent ... (each KSampler's latent feeds the next).
Renders one chain at D_STEP. Compare against expansion_hold_compare.png (single-step from base).
"""
import importlib.util
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\expansion_chain_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"

_spec = importlib.util.spec_from_file_location("be_prompt", BE_PROMPT)
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)

QP = ", ".join(be.QUALITY_TAGS)
MATURE = ", ".join(be.MATURE_ANCHOR)
ID = "long blonde hair, blue eyes"
BODY_PIN = "petite, slim, slender body, narrow waist, narrow hips, small frame, thin"
SCENE = (f"1girl, solo, {ID}, {BODY_PIN}, (fitted crop top:1.1), short shorts, cowboy shot, "
         "facing viewer, standing, arms away from sides, plain grey background, "
         "even studio lighting, (matte skin:1.2)")
NEG = (", ".join(be.HEAVY_UC_BASE) + ", " + be.IDENTITY_ANCHOR_NEG +
       ", 2girls, multiple views, chibi, baby face, plastic skin, glossy specular, "
       "wide hips, thick thighs, plump, fat, obese, thick waist, weight gain, curvy")

CKPT = "waiIllustriousSDXL_v170.safetensors"
SEED = 111
W, H = 832, 1216
CHAIN = [14, 22, 30, 40, 50]   # base then steps
D_STEP = 0.5                   # per-step img2img denoise

g = {}
saves = {}
g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}}
g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEG}}


def add_model(prefix, sl, hy):
    g[prefix + "_sm"] = {"class_type": "LoraLoaderModelOnly",
                         "inputs": {"lora_name": "Smooth_Booster_v5.safetensors",
                                    "strength_model": 0.5, "model": ["ckpt", 0]}}
    g[prefix + "_sl"] = {"class_type": "LoraLoaderModelOnly",
                         "inputs": {"lora_name": "Breast_Size_Slider_Illustrious_V2.safetensors",
                                    "strength_model": sl, "model": [prefix + "_sm", 0]}}
    last = prefix + "_sl"
    if hy > 0:
        g[prefix + "_hy"] = {"class_type": "LoraLoaderModelOnly",
                             "inputs": {"lora_name": "hyper_breasts_ILXL_concept.safetensors",
                                        "strength_model": hy, "model": [prefix + "_sl", 0]}}
        last = prefix + "_hy"
    return [last, 0]


def add_pos(prefix, cup):
    g[prefix + "_pos"] = {"class_type": "CLIPTextEncode",
                          "inputs": {"clip": ["clip", 0], "text": SCENE + (", " + cup if cup else "")}}
    return [prefix + "_pos", 0]


def ksamp(prefix, model, pos, latent, denoise):
    g[prefix + "_ks"] = {"class_type": "KSampler",
                         "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0,
                                    "sampler_name": "euler_ancestral", "scheduler": "normal",
                                    "denoise": denoise, "model": model, "positive": pos,
                                    "negative": ["neg", 0], "latent_image": latent}}
    return [prefix + "_ks", 0]


def out(prefix, latent, meta):
    g[prefix + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": latent, "vae": ["ckpt", 2]}}
    g[prefix + "_save"] = {"class_type": "SaveImage",
                           "inputs": {"images": [prefix + "_vd", 0], "filename_prefix": meta["label"]}}
    saves[prefix + "_save"] = meta


prev_latent = None
for i, t in enumerate(CHAIN):
    cup, sl, hy = be.tier_to_cup_tag(t), be.tier_to_slider_weight(t), be.tier_to_hyper_concept_weight(t)
    pref = "c%d" % t
    m = add_model(pref, sl, hy)
    p = add_pos(pref, cup)
    if i == 0:
        g[pref + "_lat"] = {"class_type": "EmptyLatentImage",
                            "inputs": {"width": W, "height": H, "batch_size": 1}}
        lat = ksamp(pref, m, p, [pref + "_lat", 0], 1.0)
        meta = {"step": i, "tier": t, "denoise": 1.0, "label": "EXPCHAIN_s0_t%d" % t}
    else:
        lat = ksamp(pref, m, p, prev_latent, D_STEP)
        meta = {"step": i, "tier": t, "denoise": D_STEP, "label": "EXPCHAIN_s%d_t%d" % (i, t)}
    out(pref, lat, meta)
    prev_latent = lat


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


print("submitting chained expansion:", CHAIN, "d_step", D_STEP)
r = post("/prompt", {"prompt": g})
pid = r["prompt_id"]
print("prompt_id", pid)
t0 = time.time()
while time.time() - t0 < 2000:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(5)
print("drained", int(time.time() - t0), "s")

manifest = {"chain": CHAIN, "d_step": D_STEP, "frames": []}
h = get(f"/history/{pid}")
e = h.get(pid, {})
outs = e.get("outputs", {})
print("status", e.get("status", {}).get("status_str"))
for node_id, meta in saves.items():
    imgs = outs.get(node_id, {}).get("images", [])
    meta = dict(meta)
    meta["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"]) for im in imgs]
    manifest["frames"].append(meta)
open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "frames with files:", sum(1 for f in manifest["frames"] if f.get("files")))
