r"""Expansion BODY-HOLD experiment — keep the body fixed (petite) while only the breasts grow.

Problem: the size LoRAs (Breast_Size_Slider, hyper_breasts_ILXL) are global model modifiers, so
changing their weight shifts the whole denoising path (body/hips/waist drift) even at a fixed seed;
the BE/hyper LoRAs also bias toward a curvier overall figure. Pure txt2img per size therefore can't
hold the body.

This compares fixes on a single expansion (tiers 14->22->30->40->50, petite body locked):
  base            — txt2img, tier 14 (large), petite body pinned, seed 111  -> base latent L0
  imgbase (d0.50) — img2img from L0 at each higher tier (body pin + slider/hyper/cup grow breasts)
  txt2img (ctrl)  — txt2img fixed seed + same body pin at each tier (expected: body still drifts)
  dsweep (t50)    — img2img from L0 at denoise 0.4/0.6/0.7 (find where breasts reach hyper but body holds)

Single graph: base KSampler computed once, its latent reused as the img2img init for every target
(no file staging; ComfyUI caches the base node). 832x1216 single-pass (no hires) for speed/clarity.
"""
import importlib.util
import json
import os
import time
import urllib.request

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\expansion_hold_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"

_spec = importlib.util.spec_from_file_location("be_prompt", BE_PROMPT)
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)

QP = ", ".join(be.QUALITY_TAGS)
MATURE = ", ".join(be.MATURE_ANCHOR)
ID = "long blonde hair, blue eyes"
# hard body-pin: petite build + pose/outfit/framing constant. This is the lever that, together
# with the img2img init, holds the body. Outfit shows waist+hips so drift is visible.
BODY_PIN = "petite, slim, slender body, narrow waist, narrow hips, small frame, thin"
SCENE = (f"1girl, solo, {ID}, {BODY_PIN}, (fitted crop top:1.1), short shorts, cowboy shot, "
         "facing viewer, standing, arms away from sides, plain grey background, "
         "even studio lighting, (matte skin:1.2)")
# anti-thickness negatives target hips/waist/thighs (NOT breasts) so the body can't bulk up
NEG = (", ".join(be.HEAVY_UC_BASE) + ", " + be.IDENTITY_ANCHOR_NEG +
       ", 2girls, multiple views, chibi, baby face, plastic skin, glossy specular, "
       "wide hips, thick thighs, plump, fat, obese, thick waist, weight gain, curvy")

CKPT = "waiIllustriousSDXL_v170.safetensors"
SEED = 111
W, H = 832, 1216
BASE_TIER = 14
TARGETS = [22, 30, 40, 50]
D_MAIN = 0.5
D_SWEEP = [0.4, 0.6, 0.7]

g = {}
saves = {}  # save_node_id -> meta

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
    text = SCENE + (", " + cup if cup else "")
    g[prefix + "_pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": text}}
    return [prefix + "_pos", 0]


def add_sampler(prefix, model, pos, latent, denoise):
    g[prefix + "_ks"] = {"class_type": "KSampler",
                         "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0,
                                    "sampler_name": "euler_ancestral", "scheduler": "normal",
                                    "denoise": denoise, "model": model, "positive": pos,
                                    "negative": ["neg", 0], "latent_image": latent}}
    return [prefix + "_ks", 0]


def add_out(prefix, latent, meta):
    g[prefix + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": latent, "vae": ["ckpt", 2]}}
    g[prefix + "_save"] = {"class_type": "SaveImage",
                           "inputs": {"images": [prefix + "_vd", 0], "filename_prefix": meta["label"]}}
    saves[prefix + "_save"] = meta


# ── base (tier 14, large) -> L0 ──────────────────────────────────────────────
bm = add_model("base", be.tier_to_slider_weight(BASE_TIER), be.tier_to_hyper_concept_weight(BASE_TIER))
bp = add_pos("base", be.tier_to_cup_tag(BASE_TIER))
g["base_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
L0 = add_sampler("base", bm, bp, ["base_lat", 0], 1.0)
add_out("base", L0, {"group": "base", "tier": BASE_TIER, "denoise": 1.0,
                     "label": "EXPHOLD_base_t%d" % BASE_TIER})

model_ref = {}  # tier -> img2img model ref (reused by dsweep)
for t in TARGETS:
    cup, sl, hy = be.tier_to_cup_tag(t), be.tier_to_slider_weight(t), be.tier_to_hyper_concept_weight(t)
    mA = add_model("a%d" % t, sl, hy)
    pA = add_pos("a%d" % t, cup)
    model_ref[t] = (mA, pA)
    # Arm A — img2img from base latent L0
    la = add_sampler("a%d" % t, mA, pA, L0, D_MAIN)
    add_out("a%d" % t, la, {"group": "imgbase", "tier": t, "denoise": D_MAIN,
                            "label": "EXPHOLD_imgbase_t%d_d%02d" % (t, int(D_MAIN * 100))})
    # Arm B — txt2img control (fixed seed + body pin)
    mB = add_model("b%d" % t, sl, hy)
    g["b%d_lat" % t] = {"class_type": "EmptyLatentImage",
                        "inputs": {"width": W, "height": H, "batch_size": 1}}
    lb = add_sampler("b%d" % t, mB, ["a%d_pos" % t, 0], ["b%d_lat" % t, 0], 1.0)
    add_out("b%d" % t, lb, {"group": "txt2img", "tier": t, "denoise": 1.0,
                            "label": "EXPHOLD_txt2img_t%d" % t})

# ── denoise sweep at the biggest jump (base->t50) ────────────────────────────
m50, p50 = model_ref[50]
for d in D_SWEEP:
    pref = "sw%02d" % int(d * 100)
    ls = add_sampler(pref, m50, p50, L0, d)
    add_out(pref, ls, {"group": "dsweep", "tier": 50, "denoise": d,
                       "label": "EXPHOLD_dsweep_t50_d%02d" % int(d * 100)})


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


print("submitting single graph: 1 base + %d img2img + %d txt2img + %d dsweep = %d outputs" %
      (len(TARGETS), len(TARGETS), len(D_SWEEP), len(saves)))
r = post("/prompt", {"prompt": g})
pid = r["prompt_id"]
print("prompt_id", pid)

print("waiting...")
t0 = time.time()
while time.time() - t0 < 3000:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(5)
print("drained", int(time.time() - t0), "s")

manifest = {"base_tier": BASE_TIER, "targets": TARGETS, "d_main": D_MAIN, "frames": []}
h = get(f"/history/{pid}")
e = h.get(pid, {})
outs = e.get("outputs", {})
status = e.get("status", {}).get("status_str")
print("status", status)
for node_id, meta in saves.items():
    imgs = outs.get(node_id, {}).get("images", [])
    meta = dict(meta)
    meta["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"]) for im in imgs]
    manifest["frames"].append(meta)
if status == "error":
    for m in e.get("status", {}).get("messages", []):
        if m[0] == "execution_error":
            manifest["error"] = "%s: %s" % (m[1].get("exception_type"), m[1].get("exception_message"))
            print("ERROR", manifest["error"])

open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
print("WROTE", MANIFEST, "DONE; frames with files:",
      sum(1 for f in manifest["frames"] if f.get("files")))
