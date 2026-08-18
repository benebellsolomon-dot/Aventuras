"""v4 — focused P1 test: kill the cleavage-region object prior in multi-subject (two_char).
Three variants vs the v3_01 baseline:
 a) broadened prop/cleavage-object negatives + 'bare skin between breasts' positive + empty hands
 b) DROP the slot-inviting 'between breasts / inter-breast shadow' tokens (keep deep cleavage)
 c) occupy the hands + change composition (arms crossed under bust / hands on hips)"""
import json, time, urllib.request, os

API="http://127.0.0.1:8188"; OUTDIR=r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST=r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\testsuite_v4_manifest.json"
QP="masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres"
SUBJ="mature female, adult, long blonde hair, blue eyes, curvy, wide hips, collarbone"
NEG=("worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions, "
     "missing fingers, extra digits, fused fingers, mutated hands, malformed hands, extra fingers, "
     "jpeg artifacts, signature, watermark, username, text, blurry, monochrome, greyscale, "
     "multiple views, censored, fused breasts, single breast, three breasts, extra breasts, uniboob, flat chest, "
     "deformed object, warped object, holding object, object between breasts, cleavage cutout, "
     "can, bottle, cup, card, phone, smartphone, cellphone, rectangle, slab, plate, food, "
     "water drips, skin streaks, specular streaks, sweat, child, loli, baby face, chibi")
HAND_WC="(perfect hands, five fingers, detailed fingers, correct anatomy:1.1)"
S=111
CELLS=[
 dict(label="v4_01_neg_barecleavage", baseline="v3_01",
      positive=f"{QP}, 2girls, {SUBJ}, both huge breasts, (deep cleavage:1.2), cleavage, between breasts, inter-breast shadow, bare skin between breasts, narrow waist, bikini, beach, standing, hands behind back, empty hands"),
 dict(label="v4_02_no_between", baseline="v3_01",
      positive=f"{QP}, 2girls, {SUBJ}, both huge breasts, (deep cleavage:1.2), cleavage, narrow waist, bikini, beach, standing, hands behind back, empty hands"),
 dict(label="v4_03_arms_pose", baseline="v3_01",
      positive=f"{QP}, 2girls, {SUBJ}, both huge breasts, (deep cleavage:1.2), cleavage, between breasts, narrow waist, bikini, beach, standing, arms crossed under breasts, hands on own hips"),
]
def r8(x): return int(round(x/8)*8)
def detailer(img,det,wc):
    return {"class_type":"FaceDetailer","inputs":{"image":img,"model":["ckpt",0],"clip":["ckpt",1],"vae":["ckpt",2],
        "positive":["pos",0],"negative":["neg",0],"bbox_detector":[det,0],"wildcard":wc,"guide_size":512,"guide_size_for":True,
        "max_size":1024,"seed":S,"steps":20,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":0.4,
        "feather":5,"noise_mask":True,"force_inpaint":True,"bbox_threshold":0.5,"bbox_dilation":4,"bbox_crop_factor":2.0,
        "sam_detection_hint":"center-1","sam_dilation":0,"sam_threshold":0.93,"sam_bbox_expansion":0,
        "sam_mask_hint_threshold":0.7,"sam_mask_hint_use_negative":"False","drop_size":10,"cycle":1,
        "inpaint_model":False,"noise_mask_feather":20}}
def build(c):
    w,h=1216,832; g={}
    g["ckpt"]={"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"waiIllustriousSDXL_v170.safetensors"}}
    g["neg"]={"class_type":"CLIPTextEncode","inputs":{"clip":["ckpt",1],"text":NEG}}
    g["pos"]={"class_type":"CLIPTextEncode","inputs":{"clip":["ckpt",1],"text":c["positive"]}}
    g["lat"]={"class_type":"EmptyLatentImage","inputs":{"width":w,"height":h,"batch_size":1}}
    g["ks"]={"class_type":"KSampler","inputs":{"seed":S,"steps":28,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":1.0,"model":["ckpt",0],"positive":["pos",0],"negative":["neg",0],"latent_image":["lat",0]}}
    g["vd"]={"class_type":"VAEDecode","inputs":{"samples":["ks",0],"vae":["ckpt",2]}}
    g["um"]={"class_type":"UpscaleModelLoader","inputs":{"model_name":"4x-AnimeSharp.pth"}}
    g["iuw"]={"class_type":"ImageUpscaleWithModel","inputs":{"upscale_model":["um",0],"image":["vd",0]}}
    g["is"]={"class_type":"ImageScale","inputs":{"image":["iuw",0],"upscale_method":"lanczos","width":r8(w*1.5),"height":r8(h*1.5),"crop":"disabled"}}
    g["ve"]={"class_type":"VAEEncode","inputs":{"pixels":["is",0],"vae":["ckpt",2]}}
    g["ksf"]={"class_type":"KSampler","inputs":{"seed":S,"steps":20,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":0.4,"model":["ckpt",0],"positive":["pos",0],"negative":["neg",0],"latent_image":["ve",0]}}
    g["vdf"]={"class_type":"VAEDecode","inputs":{"samples":["ksf",0],"vae":["ckpt",2]}}
    g["hdet"]={"class_type":"UltralyticsDetectorProvider","inputs":{"model_name":"bbox/hand_yolov8s.pt"}}
    g["hfd"]=detailer(["vdf",0],"hdet",HAND_WC)
    g["fdet"]={"class_type":"UltralyticsDetectorProvider","inputs":{"model_name":"bbox/face_yolov8m.pt"}}
    g["ffd"]=detailer(["hfd",0],"fdet","")
    g["save"]={"class_type":"SaveImage","inputs":{"images":["ffd",0],"filename_prefix":"TS_"+c["label"]}}
    return g
def post(p,d):
    req=urllib.request.Request(API+p,data=json.dumps(d).encode(),headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(req,timeout=20).read())
def get(p): return json.loads(urllib.request.urlopen(API+p,timeout=20).read())
manifest={"cells":[]}
print("submitting",len(CELLS),"v4 cells")
for c in CELLS:
    try:
        r=post("/prompt",{"prompt":build(c)}); manifest["cells"].append({"label":c["label"],"prompt_id":r["prompt_id"],"baseline":c["baseline"],"positive":c["positive"]}); print("  queued",c["label"],r["prompt_id"])
    except Exception as e:
        print("  FAIL",c["label"],repr(e)); manifest["cells"].append({"label":c["label"],"error":repr(e)})
print("waiting...")
t0=time.time()
while time.time()-t0<2000:
    q=get("/queue")
    if len(q.get("queue_running",[]))+len(q.get("queue_pending",[]))==0: break
    time.sleep(5)
print("drained",int(time.time()-t0),"s")
for cell in manifest["cells"]:
    pid=cell.get("prompt_id")
    if not pid: continue
    try:
        h=get(f"/history/{pid}"); outs=h.get(pid,{}).get("outputs",{})
        cell["files"]=[os.path.join(OUTDIR,im.get("subfolder",""),im["filename"]) for nid,o in outs.items() for im in o.get("images",[])]; cell["status"]=h.get(pid,{}).get("status",{}).get("status_str")
    except Exception as e: cell["collect_error"]=repr(e)
open(MANIFEST,"w",encoding="utf-8").write(json.dumps(manifest,indent=2)); print("WROTE",MANIFEST,"DONE")
