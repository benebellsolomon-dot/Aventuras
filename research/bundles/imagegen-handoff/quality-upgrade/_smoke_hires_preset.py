r"""Live smoke: substitute the upgraded illustrious_image.json (model-upscale hires) and run it
through ComfyUI to confirm the new node graph executes end-to-end."""
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

tokens = {
    "POSITIVE_PROMPT": "masterpiece, best quality, very aesthetic, newest, 1girl, solo, silver hair, large breasts, fitted sweater, cowboy shot, cafe",
    "NEGATIVE_PROMPT": "worst quality, low quality, bad anatomy, bad hands, child, loli",
    "WIDTH": 832, "HEIGHT": 1216, "STEPS": 28, "CFG": 5.0,
    "SAMPLER": "dpmpp_2m", "SCHEDULER": "karras", "SEED": 4242, "JOB_ID": "smoke_hires_test",
    "SLIDER_LORA_STRENGTH": 0.3, "HYPER_CONCEPT_STRENGTH": 0.0, "SMOOTH_BOOSTER_STRENGTH": 0.5,
    "STEPS_HIRES": 18, "SEED_HIRES": 4242, "HIRES_DENOISE": 0.4,
}
wf = load_and_substitute(PRESETS, "illustrious_image.json", tokens)
assert "{{" not in json.dumps(wf), "unresolved token"


def post(p, d):
    r = urllib.request.Request(API + p, data=json.dumps(d).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=30).read())


def get(p):
    return json.loads(urllib.request.urlopen(API + p, timeout=30).read())


pid = post("/prompt", {"prompt": wf})["prompt_id"]
print("prompt_id", pid)
t0 = time.time()
while time.time() - t0 < 600:
    q = get("/queue")
    if len(q.get("queue_running", [])) + len(q.get("queue_pending", [])) == 0:
        break
    time.sleep(3)
h = get(f"/history/{pid}").get(pid, {})
st = h.get("status", {}).get("status_str")
imgs = [im["filename"] for o in h.get("outputs", {}).values() for im in o.get("images", [])]
print("STATUS", st, "IMAGES", imgs)
if st == "error":
    for m in h.get("status", {}).get("messages", []):
        if m[0] == "execution_error":
            print("ERR", m[1].get("exception_type"), str(m[1].get("exception_message"))[:300])
