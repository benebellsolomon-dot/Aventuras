r"""Body-holding expansion SEQUENCE generator (reusable).

Produces a breast-expansion sequence where the body build (petite / curvy / athletic), pose,
outfit, and identity stay LOCKED while only the breasts grow — via chained img2img (each frame
img2img from the previous frame's latent at a moderate denoise), with the body pinned in the
prompt and figure-bulking suppressed in the negative. See EXPANSION-BODY-HOLD-REPORT.md.

Configure the block below, then run. One ComfyUI graph; base computed once, each subsequent frame
chains off the previous latent.
"""
import importlib.util
import json
import os
import time
import urllib.request

# ── CONFIG ───────────────────────────────────────────────────────────────────
IDENTITY = "long blonde hair, blue eyes"
OUTFIT = "(fitted crop top:1.1), short shorts"
POSE = "cowboy shot, facing viewer, standing, arms away from sides"
BG = "plain grey background, even studio lighting, (matte skin:1.2)"

# body-build presets: (pin tags, build-specific anti-thick negatives)
BODY_TYPES = {
    "petite":   ("petite, slim, slender body, narrow waist, narrow hips, small frame, thin",
                 "wide hips, thick thighs, plump, fat, obese, thick waist, weight gain, curvy"),
    "curvy":    ("curvy, hourglass figure, wide hips, defined waist",
                 "obese, fat, bloated, shapeless"),
    "athletic": ("athletic build, toned, fit, abs, lean muscle, narrow waist",
                 "plump, fat, obese, soft body, weight gain"),
}
BODY_TYPE = "petite"          # <- choose the locked build
TIER_CHAIN = [14, 22, 30, 40, 50]   # base tier, then growth steps (one band per step)
D_STEP = 0.5                  # per-step img2img denoise (0.5 hold-faithful; raise last step for more size)
SEED = 111
W, H = 832, 1216
PREFIX = "EXPSEQ"
# ─────────────────────────────────────────────────────────────────────────────

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\expansion_sequence_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"

_spec = importlib.util.spec_from_file_location("be_prompt", BE_PROMPT)
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)

QP = ", ".join(be.QUALITY_TAGS)
MATURE = ", ".join(be.MATURE_ANCHOR)
BUILD_PIN, ANTI_THICK = BODY_TYPES[BODY_TYPE]
SCENE = f"{QP}, {MATURE}, 1girl, solo, {IDENTITY}, {BUILD_PIN}, {OUTFIT}, {POSE}, {BG}"
NEG = (", ".join(be.HEAVY_UC_BASE) + ", " + be.IDENTITY_ANCHOR_NEG +
       ", 2girls, multiple views, chibi, baby face, plastic skin, glossy specular, " + ANTI_THICK)

g = {}
saves = {}
g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "waiIllustriousSDXL_v170.safetensors"}}
g["clip"] = {"class_type": "CLIPSetLastLayer", "inputs": {"stop_at_clip_layer": -2, "clip": ["ckpt", 1]}}
g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEG}}


def add_model(pfx, sl, hy):
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


def add_pos(pfx, cup):
    g[pfx + "_pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": SCENE + (", " + cup if cup else "")}}
    return [pfx + "_pos", 0]


def ksamp(pfx, model, pos, latent, denoise):
    g[pfx + "_ks"] = {"class_type": "KSampler",
                      "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "euler_ancestral",
                                 "scheduler": "normal", "denoise": denoise, "model": model, "positive": pos,
                                 "negative": ["neg", 0], "latent_image": latent}}
    return [pfx + "_ks", 0]


def out(pfx, latent, meta):
    g[pfx + "_vd"] = {"class_type": "VAEDecode", "inputs": {"samples": latent, "vae": ["ckpt", 2]}}
    g[pfx + "_save"] = {"class_type": "SaveImage", "inputs": {"images": [pfx + "_vd", 0], "filename_prefix": meta["label"]}}
    saves[pfx + "_save"] = meta


prev = None
for i, t in enumerate(TIER_CHAIN):
    cup, sl, hy = be.tier_to_cup_tag(t), be.tier_to_slider_weight(t), be.tier_to_hyper_concept_weight(t)
    pfx = "f%d" % i
    m, p = add_model(pfx, sl, hy), add_pos(pfx, cup)
    if i == 0:
        g[pfx + "_lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}}
        lat = ksamp(pfx, m, p, [pfx + "_lat", 0], 1.0)
        d = 1.0
    else:
        lat = ksamp(pfx, m, p, prev, D_STEP)
        d = D_STEP
    out(pfx, lat, {"step": i, "tier": t, "cup": cup, "denoise": d, "slider": sl, "hyper": hy,
                   "label": "%s_%s_s%d_t%d" % (PREFIX, BODY_TYPE, i, t)})
    prev = lat


def post(p, dd):
    req = urllib.request.Request(API + p, data=json.dumps(dd).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


print("body=%s chain=%s d_step=%.2f" % (BODY_TYPE, TIER_CHAIN, D_STEP))
r = post("/prompt", {"prompt": g})
pid = r["prompt_id"]
print("prompt_id", pid)
t0 = time.time()
while time.time() - t0 < 2500:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(5)
print("drained", int(time.time() - t0), "s")

manifest = {"body_type": BODY_TYPE, "chain": TIER_CHAIN, "d_step": D_STEP, "frames": []}
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
print("WROTE", MANIFEST, "frames:", sum(1 for f in manifest["frames"] if f.get("files")))
