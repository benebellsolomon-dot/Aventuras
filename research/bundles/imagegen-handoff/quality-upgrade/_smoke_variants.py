r"""Live smoke of the migrated variant presets (DD + detailer). openpose_faceid is the high-risk one
(OpenPose CN + FaceID + 4x hires + Detail Daemon + hand/face detailer); also smoke ipa."""
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, r"D:\LLM\si-animator-bridge")
from src.workflow_loader import load_and_substitute  # noqa: E402

API = "http://127.0.0.1:8188"
PRESETS = __import__("pathlib").Path(r"D:\LLM\si-animator-bridge\src\presets")
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"

COMMON = {
    "POSITIVE_PROMPT": "sensitive, masterpiece, best quality, very aesthetic, newest, 1girl, solo, long blonde hair, petite, slim, narrow waist, fitted crop top, short shorts, cowboy shot, huge breasts",
    "NEGATIVE_PROMPT": "worst quality, low quality, bad anatomy, bad hands, child, loli, 2girls",
    "WIDTH": 832, "HEIGHT": 1216, "STEPS": 28, "CFG": 5.0,
    "SAMPLER": "dpmpp_2m", "SCHEDULER": "karras", "SEED": 909,
    "SLIDER_LORA_STRENGTH": 0.3, "HYPER_CONCEPT_STRENGTH": 0.0, "SMOOTH_BOOSTER_STRENGTH": 0.5,
    "STEPS_HIRES": 18, "SEED_HIRES": 909, "HIRES_DENOISE": 0.4,
}
JOBS = [
    ("illustrious_image_openpose_faceid.json", {**COMMON, "JOB_ID": "smoke_opfaceid",
        "ANCHOR_IMAGE_FILENAME": "opfaceid_anchor.png", "OPENPOSE_STRENGTH": 1.0,
        "FACEID_WEIGHT": 0.8, "FACEID_WEIGHT_V2": 1.0, "FACEID_LORA_STRENGTH": 0.6}),
    ("illustrious_image_ipa.json", {**COMMON, "JOB_ID": "smoke_ipa",
        "REFERENCE_IMAGE_FILENAME": "opfaceid_anchor.png", "IPADAPTER_WEIGHT": 0.65,
        "SERIES_LORA_NAME": "", "SERIES_LORA_WEIGHT": 1.0,
        "INPUT_IMAGE_FILENAME": "", "CONTROLNET_STRENGTH": 0.85, "CONTROLNET_MODEL_NAME": "x",
        "INIT_IMAGE_FILENAME": "", "INIT_DENOISE": 0.55,
        "ANCHOR_IMAGE_FILENAME": "", "OPENPOSE_STRENGTH": 1.0, "FACEID_WEIGHT": 0.8,
        "FACEID_WEIGHT_V2": 1.0, "FACEID_LORA_STRENGTH": 0.6}),
]


def post(p, d):
    r = urllib.request.Request(API + p, data=json.dumps(d).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


for preset, toks in JOBS:
    try:
        wf = load_and_substitute(PRESETS, preset, toks)
    except Exception as e:
        print(preset, "SUBSTITUTE FAIL", repr(e)[:200]); continue
    pid = post("/prompt", {"prompt": wf})["prompt_id"]
    print(preset, "pid", pid)
    t0 = time.time()
    while time.time() - t0 < 400:
        q = get("/queue")
        if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
            break
        time.sleep(3)
    h = get(f"/history/{pid}").get(pid, {})
    st = h.get("status", {}).get("status_str")
    imgs = [im["filename"] for o in h.get("outputs", {}).values() for im in o.get("images", [])]
    print("  STATUS", st, "IMAGES", imgs)
    if st == "error":
        for m in h.get("status", {}).get("messages", []):
            if m[0] == "execution_error":
                print("  ERR", m[1].get("exception_type"), str(m[1].get("exception_message"))[:250])
