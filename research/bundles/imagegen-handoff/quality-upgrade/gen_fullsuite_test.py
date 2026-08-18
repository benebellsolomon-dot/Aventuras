r"""FULL SUITE TEST of the upgraded production main preset (illustrious_image.json):
sampler dpmpp_2m/karras + 4x-AnimeSharp model-upscale hires + Detail Daemon + hand/face detailer.
Renders a diverse validation set (tier range + hard cases: hands, faces, full-body, two-char, nude)
through the REAL bridge loader+preset, to confirm the complete recipe holds end-to-end at quality."""
import importlib.util
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, r"D:\LLM\si-animator-bridge")
from src.workflow_loader import load_and_substitute  # noqa: E402

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
PRESETS = __import__("pathlib").Path(r"D:\LLM\si-animator-bridge\src\presets")
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\fullsuite_manifest.json"
BE_PROMPT = r"D:\LLM\comic-continuer\comic_continuer\art\be_prompt.py"

_spec = importlib.util.spec_from_file_location("be_prompt", BE_PROMPT)
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)

QP = "masterpiece, best quality, very aesthetic, newest, absurdres, highres, official art"
MATURE = "mature female, adult"
AFFIRM = ", ".join(be.CENSORSHIP_AFFIRM_POS)
NEG = ("worst quality, low quality, lowres, bad anatomy, bad hands, missing fingers, extra digits, "
       "fused fingers, jpeg artifacts, signature, watermark, text, blurry, plastic skin, "
       "glossy specular, child, loli, chibi")

# (id, tier, scene, intimacy, W, H)
CASES = [
    ("01_small_casual", 6, "1girl, solo, short brown hair, casual t-shirt, cowboy shot, park background", "clean", 832, 1216),
    ("02_large_handface", 14, "1girl, solo, long blonde hair, (hand on cheek:1.1), fingers near face, blouse, upper body, indoor", "clean", 832, 1216),
    ("03_huge_fitted", 22, "1girl, solo, black hair, fitted tank top, cleavage, cowboy shot, city street", "suggestive", 832, 1216),
    ("04_gigantic_strain", 30, "1girl, solo, red hair, (taut shirt, stress folds, straining buttons:1.1), cowboy shot, office", "suggestive", 832, 1216),
    ("05_hyper_solo", 45, "1girl, solo, silver hair, sweater dress, cowboy shot, cozy cafe", "suggestive", 832, 1216),
    ("06_fullbody", 22, "1girl, solo, blue hair, full body, head to toe, feet visible, standing, sundress, plain background", "clean", 832, 1216),
    ("07_twochar", 22, "2girls, one long blonde hair one short brown hair, standing side by side, fitted tops, cowboy shot, plain background", "clean", 1216, 832),
    ("08_topless", 22, "1girl, solo, green hair, topless, bare breasts, nipples, cowboy shot, bedroom", "nude", 832, 1216),
    ("09_closeup_eyes", 14, "1girl, solo, purple hair, close-up, portrait, detailed eyes, face focus, soft light", "clean", 832, 1216),
    ("10_armsup_hands", 18, "1girl, solo, pink hair, (arms up:1.1), hands behind head, fitted top, cowboy shot", "suggestive", 832, 1216),
]


def build_pos(tier, scene, intimacy):
    rating = be.intimacy_to_rating(intimacy)
    cup = be.tier_to_cup_tag(tier)
    bare = rating in ("sensitive", "explicit")
    parts = [rating, QP, MATURE]
    if bare:
        parts.append(AFFIRM)
    parts.append(scene)
    if cup:
        parts.append(cup)
    return ", ".join(parts)


def tokens_for(cid, tier, scene, intimacy, W, H, seed):
    return {
        "POSITIVE_PROMPT": build_pos(tier, scene, intimacy),
        "NEGATIVE_PROMPT": NEG + (", 2girls, multiple views" if "2girls" not in scene else ", 3girls"),
        "WIDTH": W, "HEIGHT": H, "STEPS": 28, "CFG": 5.0,
        "SAMPLER": "dpmpp_2m", "SCHEDULER": "karras", "SEED": seed, "JOB_ID": "fullsuite_" + cid,
        "SLIDER_LORA_STRENGTH": be.tier_to_slider_weight(tier),
        "HYPER_CONCEPT_STRENGTH": be.tier_to_hyper_concept_weight(tier),
        "SMOOTH_BOOSTER_STRENGTH": 0.5, "STEPS_HIRES": 18, "SEED_HIRES": seed, "HIRES_DENOISE": 0.4,
    }


def post(p, d):
    r = urllib.request.Request(API + p, data=json.dumps(d).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


manifest = {"preset": "illustrious_image.json (upgraded: dpmpp_2m/karras + 4x-AnimeSharp hires + Detail Daemon + hand/face detailer)", "frames": []}
print("submitting", len(CASES), "full-suite cases")
for i, (cid, tier, scene, intimacy, W, H) in enumerate(CASES):
    seed = 700 + i
    toks = tokens_for(cid, tier, scene, intimacy, W, H, seed)
    wf = load_and_substitute(PRESETS, "illustrious_image.json", toks)
    meta = {"id": cid, "tier": tier, "intimacy": intimacy, "note": "t%d %s" % (tier, intimacy)}
    try:
        meta["prompt_id"] = post("/prompt", {"prompt": wf})["prompt_id"]
        print("  queued", cid, "tier", tier)
    except Exception as e:
        meta["error"] = repr(e)[:200]
        print("  FAIL", cid, repr(e)[:160])
    manifest["frames"].append(meta)

print("waiting...")
t0 = time.time()
while time.time() - t0 < 4000:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(6)
print("drained", int(time.time() - t0), "s")

for fr in manifest["frames"]:
    pid = fr.get("prompt_id")
    if not pid:
        continue
    h = get(f"/history/{pid}").get(pid, {})
    fr["status"] = h.get("status", {}).get("status_str")
    fr["files"] = [os.path.join(OUTDIR, im.get("subfolder", ""), im["filename"])
                   for o in h.get("outputs", {}).values() for im in o.get("images", [])]
    if fr["status"] == "error":
        for m in h.get("status", {}).get("messages", []):
            if m[0] == "execution_error":
                fr["err"] = "%s: %s" % (m[1].get("exception_type"), str(m[1].get("exception_message"))[:160])

open(MANIFEST, "w", encoding="utf-8").write(json.dumps(manifest, indent=2))
ok = sum(1 for f in manifest["frames"] if f.get("files"))
print("WROTE", MANIFEST, "success:", ok, "/", len(CASES))
for f in manifest["frames"]:
    if not f.get("files"):
        print("  MISSING/ERR", f["id"], f.get("status"), f.get("err", ""))
