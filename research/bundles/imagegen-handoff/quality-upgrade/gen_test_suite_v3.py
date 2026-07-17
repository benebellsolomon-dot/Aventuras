"""v3 BE-quality test suite — targets v2 residuals (P1-P6):
 P1 detailer invents objects (two_char): tighter hand mask (dilation 4, crop 2.0) + prop negatives + no held-object tokens
 P2 separation collapses under strained garment (burst): (deep cleavage:1.2) + inter-breast shadow + uniboob negatives
 P3 floating garment physics: failure-mode strain block (popped button/torn seam/asymmetric/puckering)
 P4 half-sold gravity: soft-tissue-compression + true-shadow tokens + both-breasts-visible pose
 P5 full-body crop: framing tokens + cropped negatives
 P6 residual specular: water/streak/sweat negatives
Each cell maps to its v2 baseline for before/after comparison."""
import json, time, urllib.request, os

API = "http://127.0.0.1:8188"
OUTDIR = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST = r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\testsuite_v3_manifest.json"

QP = "masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres"
SUBJ = "mature female, adult, long blonde hair, blue eyes, curvy, wide hips, collarbone"
NEG = ("worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions, "
       "missing fingers, extra digits, fused fingers, mutated hands, malformed hands, extra fingers, "
       "jpeg artifacts, signature, watermark, username, text, blurry, sketch, monochrome, greyscale, "
       "multiple views, oldest, censored, mosaic censoring, bar censor, fused breasts, single breast, "
       "three breasts, extra breasts, uniboob, flat chest, "
       "deformed object, warped object, holding object, water drips, skin streaks, specular streaks, sweat, "
       "child, loli, baby face, chibi")
HAND_WC = "(perfect hands, five fingers, detailed fingers, correct anatomy:1.1)"
SEP = "cleavage, between breasts, underboob shadow, narrow waist"
SEP_STRONG = "(deep cleavage:1.2), between breasts, inter-breast shadow, cast shadow under breast, narrow waist"
FAILSTRAIN = "taut fabric, fabric stretched, stress folds, gaping shirt, popped button, torn seam, asymmetric strain, fabric puckering at seams, stress wrinkles converging at closure"
GRAV = "hanging breasts, heavy breasts, soft breasts, sagging, both breasts sagging, soft tissue compression, cast shadow under breast"
S = 111

def P(core, count="1girl, solo"):
    return f"{QP}, {count}, {SUBJ}, {core}"

CELLS = [
 dict(label="v3_01_two_char", baseline="v2_07", face=True, width=1216, height=832,
      positive=f"{QP}, 2girls, {SUBJ}, both huge breasts, {SEP}, bikini, beach, standing, hands behind back, empty hands",
      count="2girls"),
 dict(label="v3_02_burst", baseline="v2_08", face=False,
      positive=P(f"gigantic breasts, {SEP_STRONG}, torn clothes, bursting breasts, {FAILSTRAIN}, flying button, surprised, breast expansion, hands raised")),
 dict(label="v3_03_strain_geo", baseline="v2_03", face=False,
      positive=P(f"huge breasts, taut shirt, {FAILSTRAIN}, cleavage, underboob, hands at sides")),
 dict(label="v3_04_gravity", baseline="v2_04", face=False,
      positive=P(f"huge breasts, topless, nude, {GRAV}, arms up, hands behind head, both breasts visible, blush")),
 dict(label="v3_05_fullbody", baseline="v2_06", face=True, width=832, height=1216,
      positive=P(f"gigantic breasts, {SEP}, full body, feet visible, head to toe, full figure, wide shot, standing, arms down, plain background"),
      neg_extra="cropped, cropped legs, out of frame, close-up, portrait"),
 dict(label="v3_06_swimsuit", baseline="v2_05", face=False,
      positive=P(f"huge breasts, competition swimsuit, {FAILSTRAIN}, asymmetric strain, beach, hand on hip")),
]

def r8(x): return int(round(x/8)*8)

def detailer(img, det_node, seed, wildcard):
    return {"class_type": "FaceDetailer", "inputs": {
        "image": img, "model": ["ckpt",0], "clip": ["ckpt",1], "vae": ["ckpt",2],
        "positive": ["pos",0], "negative": ["neg",0], "bbox_detector": [det_node,0], "wildcard": wildcard,
        "guide_size": 512, "guide_size_for": True, "max_size": 1024, "seed": seed, "steps": 20, "cfg": 5.0,
        "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 0.4, "feather": 5, "noise_mask": True,
        "force_inpaint": True, "bbox_threshold": 0.5, "bbox_dilation": 4, "bbox_crop_factor": 2.0,
        "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0,
        "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "cycle": 1,
        "inpaint_model": False, "noise_mask_feather": 20}}

def build_graph(c):
    w = c.get("width",832); h = c.get("height",1216); neg = NEG + (", "+c["neg_extra"] if c.get("neg_extra") else "")
    g = {}
    g["ckpt"] = {"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"waiIllustriousSDXL_v170.safetensors"}}
    g["neg"]  = {"class_type":"CLIPTextEncode","inputs":{"clip":["ckpt",1],"text":neg}}
    g["pos"]  = {"class_type":"CLIPTextEncode","inputs":{"clip":["ckpt",1],"text":c["positive"]}}
    g["lat"]  = {"class_type":"EmptyLatentImage","inputs":{"width":w,"height":h,"batch_size":1}}
    g["ks"]   = {"class_type":"KSampler","inputs":{"seed":S,"steps":28,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":1.0,"model":["ckpt",0],"positive":["pos",0],"negative":["neg",0],"latent_image":["lat",0]}}
    g["vd"]   = {"class_type":"VAEDecode","inputs":{"samples":["ks",0],"vae":["ckpt",2]}}
    g["um"]   = {"class_type":"UpscaleModelLoader","inputs":{"model_name":"4x-AnimeSharp.pth"}}
    g["iuw"]  = {"class_type":"ImageUpscaleWithModel","inputs":{"upscale_model":["um",0],"image":["vd",0]}}
    g["is"]   = {"class_type":"ImageScale","inputs":{"image":["iuw",0],"upscale_method":"lanczos","width":r8(w*1.5),"height":r8(h*1.5),"crop":"disabled"}}
    g["ve"]   = {"class_type":"VAEEncode","inputs":{"pixels":["is",0],"vae":["ckpt",2]}}
    g["ksf"]  = {"class_type":"KSampler","inputs":{"seed":S,"steps":20,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":0.4,"model":["ckpt",0],"positive":["pos",0],"negative":["neg",0],"latent_image":["ve",0]}}
    g["vdf"]  = {"class_type":"VAEDecode","inputs":{"samples":["ksf",0],"vae":["ckpt",2]}}
    img = ["vdf",0]
    g["hdet"] = {"class_type":"UltralyticsDetectorProvider","inputs":{"model_name":"bbox/hand_yolov8s.pt"}}
    g["hfd"]  = detailer(img,"hdet",S,HAND_WC); img = ["hfd",0]
    if c.get("face",False):
        g["fdet"] = {"class_type":"UltralyticsDetectorProvider","inputs":{"model_name":"bbox/face_yolov8m.pt"}}
        g["ffd"]  = detailer(img,"fdet",S,""); img = ["ffd",0]
    g["save"] = {"class_type":"SaveImage","inputs":{"images":img,"filename_prefix":"TS_"+c["label"]}}
    return g

def post(path,data):
    req = urllib.request.Request(API+path,data=json.dumps(data).encode(),headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(req,timeout=20).read())
def get(path): return json.loads(urllib.request.urlopen(API+path,timeout=20).read())

manifest={"cells":[]}
print("submitting",len(CELLS),"v3 cells")
for c in CELLS:
    try:
        r=post("/prompt",{"prompt":build_graph(c)})
        manifest["cells"].append({"label":c["label"],"prompt_id":r["prompt_id"],"baseline":c["baseline"],"positive":c["positive"],"face":c.get("face",False)})
        print("  queued",c["label"],r["prompt_id"])
    except Exception as e:
        print("  SUBMIT FAILED",c["label"],repr(e)); manifest["cells"].append({"label":c["label"],"error":repr(e)})
print("waiting for queue...")
t0=time.time()
while time.time()-t0<3000:
    q=get("/queue")
    if len(q.get("queue_running",[]))+len(q.get("queue_pending",[]))==0: break
    time.sleep(5)
print("queue drained after",int(time.time()-t0),"s")
for cell in manifest["cells"]:
    pid=cell.get("prompt_id")
    if not pid: continue
    try:
        h=get(f"/history/{pid}"); outs=h.get(pid,{}).get("outputs",{})
        cell["files"]=[os.path.join(OUTDIR,im.get("subfolder",""),im["filename"]) for nid,o in outs.items() for im in o.get("images",[])]
        cell["status"]=h.get(pid,{}).get("status",{}).get("status_str")
    except Exception as e: cell["collect_error"]=repr(e)
with open(MANIFEST,"w",encoding="utf-8") as f: json.dump(manifest,f,indent=2)
print("WROTE",MANIFEST); print("DONE")
