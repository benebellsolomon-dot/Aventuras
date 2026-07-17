r"""Chained-img2img sampler test — fix the cumulative graininess on long chains.

Hypothesis: euler_ancestral INJECTS noise each step; chaining ~9 img2img steps compounds it into
a grainy/'fried' look (worst on bare skin). Non-ancestral samplers (dpmpp_2m, euler) are
deterministic and should chain cleanly. Render the worst case (petite NUDE full chain) with two
non-ancestral samplers; compare against the euler_ancestral baseline (tier_suite_nude.png petite row).
"""
import importlib.util
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\chain_sampler_manifest.json"
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
BUILD = "petite, slim, slender body, narrow waist, narrow hips, small frame, thin"
ANTI = "wide hips, thick thighs, plump, fat, obese, thick waist, weight gain, curvy"
NEG = (", ".join(be.HEAVY_UC_BASE) + ", " + be.IDENTITY_ANCHOR_NEG +
       ", 2girls, multiple views, chibi, baby face, plastic skin, glossy specular, " + ANTI)

TIER_CHAIN = [0, 2, 8, 14, 20, 26, 33, 40, 45, 50]
D_STEP = 0.5
SEED = 111
W, H = 832, 1216
# (tag, sampler, scheduler)
SAMPLERS = [("dpmpp2m", "dpmpp_2m", "karras"), ("euler", "euler", "normal")]


def scene(cup):
    s = (f"sensitive, {QP}, {MATURE}, {AFFIRM}, 1girl, solo, {ID}, {BUILD}, topless, nude, "
         f"bare breasts, nipples, areola, {POSE}, {BG}")
    return s + (", " + cup if cup else "")


def build_chain(tag, sampler, scheduler):
    g = {}
    saves = {}
    g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "waiIllustriousSDXL_v170.safetensors"}}
    g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
    g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEG}}

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
        pfx = "%s_f%d" % (tag, i)
        m = model(pfx, sl, hy)
        g[pfx + "_pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": scene(cup)}}
        if i == 0:
            g[pfx + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
            latent_in, d = [pfx + "_lat", 0], 1.0
        else:
            latent_in, d = prev, D_STEP
        g[pfx + "_ks"] = {"class_type": "KSampler",
                          "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": sampler,
                                     "scheduler": scheduler, "denoise": d, "model": m, "positive": [pfx + "_pos", 0],
                                     "negative": ["neg", 0], "latent_image": latent_in}}
        g[pfx + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": [pfx + "_ks", 0], "vae": ["ckpt", 2]}}
        label = "CST_%s_s%d_t%d" % (tag, i, t)
        g[pfx + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [pfx + "_vd", 0], "filename_prefix": label}}
        saves[pfx + "_save"] = {"sampler": tag, "step": i, "tier": t, "cup": cup, "label": label}
        prev = [pfx + "_ks", 0]
    return g, saves


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


chains = []
for tag, sampler, scheduler in SAMPLERS:
    g, saves = build_chain(tag, sampler, scheduler)
    r = post("/prompt", {"prompt": g})
    chains.append({"tag": tag, "prompt_id": r["prompt_id"], "saves": saves})
    print("queued", tag, sampler, scheduler, r["prompt_id"])

t0 = time.time()
while time.time() - t0 < 3000:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(5)
print("drained", int(time.time() - t0), "s")

manifest = {"tier_chain": TIER_CHAIN, "d_step": D_STEP, "frames": []}
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
