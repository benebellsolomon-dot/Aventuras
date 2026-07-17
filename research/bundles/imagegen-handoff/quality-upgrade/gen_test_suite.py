"""BE-quality test-suite generator. Builds API-format graphs across a test matrix,
submits them to the local ComfyUI queue, waits for completion, writes a manifest.
Run with embedded python. Designed to run in the background."""
import json, time, urllib.request, os

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\testsuite_manifest.json"

QP = "masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres"
SUBJ = "mature female, adult, long blonde hair, blue eyes, curvy, wide hips, collarbone, shiny skin"
NEG = ("worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions, "
       "missing fingers, extra digits, fused fingers, jpeg artifacts, signature, watermark, username, "
       "text, blurry, sketch, monochrome, greyscale, multiple views, oldest, censored, mosaic censoring, "
       "bar censor, child, loli, baby face, chibi")
S = 111

def P(core, count="1girl, solo"):
    return f"{QP}, {count}, {SUBJ}, {core}"

# matrix
CELLS = [
 # --- size ladder (isolate model size handling) ---
 dict(label="01_size_large",    positive=P("large breasts, fitted t-shirt, indoors, standing, smile"), hires=True),
 dict(label="02_size_huge",     positive=P("huge breasts, fitted t-shirt, indoors, standing, smile"), hires=True),
 dict(label="03_size_gigantic", positive=P("gigantic breasts, fitted t-shirt, indoors, standing, smile"), hires=True),
 # --- pipeline contribution (huge subject) ---
 dict(label="04_pipe_base",      positive=P("huge breasts, fitted t-shirt, indoors, standing, smile"), hires=False, face=False),
 dict(label="05_pipe_hires",     positive=P("huge breasts, fitted t-shirt, indoors, standing, smile"), hires=True,  face=False),
 dict(label="06_pipe_hires_face",positive=P("huge breasts, fitted t-shirt, indoors, standing, smile"), hires=True,  face=True),
 # --- DanTagGen on/off (same seed tags) ---
 dict(label="07_dtg_off", positive=P("huge breasts, swimsuit, beach"), hires=True),
 dict(label="08_dtg_on",  dtg_general="1girl, solo, mature female, huge breasts, swimsuit, beach", hires=True),
 # --- strain / growth depiction ---
 dict(label="09_strain_taut",  positive=P("huge breasts, taut shirt, cleavage, buttons straining, underboob"), hires=True),
 dict(label="10_strain_burst", positive=P("gigantic breasts, torn clothes, bursting breasts, clothes ripping, flying button, surprised, breast expansion"), hires=True),
 dict(label="11_topless",      positive=P("huge breasts, topless, nude, blush"), hires=True),
 # --- extreme size & multi-subject coherence ---
 dict(label="12_extreme_fullbody", positive=P("gigantic breasts, full body, standing, cowboy shot, plain background"), width=896, height=1280, hires=True),
 dict(label="13_two_char", positive=f"{QP}, 2girls, {SUBJ}, both huge breasts, bikini, beach, standing", count="2girls", width=1216, height=832, hires=True),
 # --- settings sensitivity ---
 dict(label="14_sampler_dpmpp", positive=P("huge breasts, fitted t-shirt, indoors, standing, smile"), sampler="dpmpp_2m", scheduler="karras", cfg=5.0, hires=True),
]

def r8(x): return int(round(x/8)*8)

def build_graph(c):
    w = c.get("width", 832); h = c.get("height", 1216)
    seed = c.get("seed", S); steps = c.get("steps", 28); cfg = c.get("cfg", 6.0)
    sampler = c.get("sampler", "euler_ancestral"); sched = c.get("scheduler", "normal")
    g = {}
    g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "waiIllustriousSDXL_v170.safetensors"}}
    g["neg"]  = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["ckpt",1], "text": NEG}}
    if c.get("dtg_general"):
        g["dtg"] = {"class_type": "PromptDanTagGen", "inputs": {
            "model": "KBlueLeaf/DanTagGen-delta-rev2", "artist": "", "characters": "", "copyrights": "",
            "special_tags": "", "general": c["dtg_general"], "blacklist": "", "rating": "nsfw",
            "target": "long", "width": w, "height": h, "escape_bracket": False, "temperature": 1.35}}
        pos_text = ["dtg", 0]
    else:
        pos_text = c["positive"]
    g["pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["ckpt",1], "text": pos_text}}
    g["lat"] = {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}}
    g["ks"]  = {"class_type": "KSampler", "inputs": {"seed": seed, "steps": steps, "cfg": cfg,
                "sampler_name": sampler, "scheduler": sched, "denoise": 1.0,
                "model": ["ckpt",0], "positive": ["pos",0], "negative": ["neg",0], "latent_image": ["lat",0]}}
    g["vd"]  = {"class_type": "VAEDecode", "inputs": {"samples": ["ks",0], "vae": ["ckpt",2]}}
    img = ["vd", 0]
    if c.get("hires", True):
        g["um"]  = {"class_type": "UpscaleModelLoader", "inputs": {"model_name": "4x-AnimeSharp.pth"}}
        g["iuw"] = {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["um",0], "image": img}}
        g["is"]  = {"class_type": "ImageScale", "inputs": {"image": ["iuw",0], "upscale_method": "lanczos",
                    "width": r8(w*1.5), "height": r8(h*1.5), "crop": "disabled"}}
        g["ve"]  = {"class_type": "VAEEncode", "inputs": {"pixels": ["is",0], "vae": ["ckpt",2]}}
        g["ksf"] = {"class_type": "KSampler", "inputs": {"seed": seed, "steps": 20, "cfg": cfg,
                    "sampler_name": sampler, "scheduler": sched, "denoise": 0.4,
                    "model": ["ckpt",0], "positive": ["pos",0], "negative": ["neg",0], "latent_image": ["ve",0]}}
        g["vdf"] = {"class_type": "VAEDecode", "inputs": {"samples": ["ksf",0], "vae": ["ckpt",2]}}
        img = ["vdf", 0]
    if c.get("face", False):
        g["det"] = {"class_type": "UltralyticsDetectorProvider", "inputs": {"model_name": "bbox/face_yolov8m.pt"}}
        g["fd"]  = {"class_type": "FaceDetailer", "inputs": {
            "image": img, "model": ["ckpt",0], "clip": ["ckpt",1], "vae": ["ckpt",2],
            "positive": ["pos",0], "negative": ["neg",0], "bbox_detector": ["det",0], "wildcard": "",
            "guide_size": 768, "guide_size_for": True, "max_size": 1024, "seed": seed, "steps": 20, "cfg": cfg,
            "sampler_name": sampler, "scheduler": sched, "denoise": 0.45, "feather": 5, "noise_mask": True,
            "force_inpaint": True, "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3.0,
            "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0,
            "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "cycle": 1,
            "inpaint_model": False, "noise_mask_feather": 20}}
        img = ["fd", 0]
    g["save"] = {"class_type": "SaveImage", "inputs": {"images": img, "filename_prefix": "TS_"+c["label"]}}
    return g

def post(path, data):
    req = urllib.request.Request(API+path, data=json.dumps(data).encode(), headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=20).read())

def get(path):
    return json.loads(urllib.request.urlopen(API+path, timeout=20).read())

manifest = {"cells": []}
print("submitting", len(CELLS), "cells")
for c in CELLS:
    try:
        r = post("/prompt", {"prompt": build_graph(c)})
        pid = r["prompt_id"]
        manifest["cells"].append({"label": c["label"], "prompt_id": pid,
                                  "positive": c.get("positive") or ("[DanTagGen] "+c.get("dtg_general","")),
                                  "hires": c.get("hires", True), "face": c.get("face", False),
                                  "sampler": c.get("sampler","euler_ancestral"), "cfg": c.get("cfg",6.0)})
        print("  queued", c["label"], pid)
    except Exception as e:
        print("  SUBMIT FAILED", c["label"], repr(e))
        manifest["cells"].append({"label": c["label"], "error": repr(e)})

# wait for queue to drain
print("waiting for queue to drain...")
t0 = time.time()
while time.time()-t0 < 3000:
    q = get("/queue")
    remaining = len(q.get("queue_running",[])) + len(q.get("queue_pending",[]))
    if remaining == 0: break
    time.sleep(5)
print("queue drained after", int(time.time()-t0), "s")

# collect outputs
for cell in manifest["cells"]:
    pid = cell.get("prompt_id")
    if not pid: continue
    try:
        h = get(f"/history/{pid}")
        outs = h.get(pid, {}).get("outputs", {})
        files = []
        for nid, o in outs.items():
            for im in o.get("images", []):
                files.append(os.path.join(OUTDIR, im.get("subfolder",""), im["filename"]))
        cell["files"] = files
        cell["status"] = h.get(pid, {}).get("status", {}).get("status_str")
    except Exception as e:
        cell["collect_error"] = repr(e)

with open(MANIFEST, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
print("WROTE manifest", MANIFEST)
print("DONE")
