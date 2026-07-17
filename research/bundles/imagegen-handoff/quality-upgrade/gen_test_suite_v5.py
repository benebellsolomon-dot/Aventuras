"""v5 — solo/intimate BE scene matrix on the tuned v3 pipeline.
New quality regime vs prior rounds (standing/multi-char): hand-on-breast self-interaction,
reclining gravity, intimate expression/affect, POV/close framing, growth-in-context.
All cells single-subject, maturity-guarded (mature female/adult). Technical QA of legal adult anime art."""
import json, time, urllib.request, os

API="http://127.0.0.1:8188"; OUTDIR=r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST=r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\testsuite_v5_manifest.json"
QP="masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres"
SUBJ="mature female, adult, long blonde hair, blue eyes, curvy, wide hips, collarbone"
NEG=("worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions, "
     "missing fingers, extra digits, fused fingers, mutated hands, malformed hands, extra fingers, "
     "extra hands, disembodied limb, third arm, extra arms, "
     "jpeg artifacts, signature, watermark, username, text, blurry, sketch, monochrome, greyscale, "
     "multiple views, oldest, censored, mosaic censoring, bar censor, fused breasts, single breast, "
     "three breasts, extra breasts, uniboob, flat chest, deformed object, warped object, holding object, "
     "object between breasts, can, bottle, cup, card, phone, smartphone, rectangle, slab, plate, "
     "water drips, skin streaks, specular streaks, sweat, child, loli, baby face, chibi, multiple girls, 2girls")
HAND_WC="(perfect hands, five fingers, detailed fingers, correct anatomy:1.1)"
S=111
def P(core): return f"{QP}, 1girl, solo, {SUBJ}, {core}"
CELLS=[
 dict(label="v5_01_self_grope", focus="hand-on-breast self-interaction + soft-tissue deform", face=False,
      positive=P("huge breasts, topless, hands on own breasts, grabbing own breasts, squeezing breast, fingers sinking into breast, soft tissue compression, breast deformed by hand, bedroom, on bed, aroused, blush, parted lips, looking at viewer, warm lighting")),
 dict(label="v5_02_lying_back", focus="reclining gravity (breasts settle to sides)", face=True,
      positive=P("huge breasts, topless, lying on back, on bed, white sheets, breasts spread to sides, soft breasts, looking at viewer, blush, from above, warm lighting")),
 dict(label="v5_03_lying_side", focus="side-lying breast drape", face=True,
      positive=P("huge breasts, topless, lying on side, on bed, breast drape, hanging breasts, soft breasts, seductive smile, looking at viewer, warm lighting")),
 dict(label="v5_04_arched", focus="arched/presenting pose coherence", face=True,
      positive=P("huge breasts, topless, arched back, kneeling on bed, presenting, aroused, parted lips, blush, hands on thighs, warm lighting")),
 dict(label="v5_05_expression", focus="intimate expression/affect (large face)", face=False,
      positive=P("huge breasts, topless, upper body, close-up, aroused, half-closed eyes, blush, parted lips, seductive, bedroom, looking at viewer, warm lighting")),
 dict(label="v5_06_pov", focus="POV / looking-at-viewer reclining intimacy", face=False,
      positive=P("huge breasts, topless, pov, lying down, looking at viewer, intimate, dim lighting, warm lighting, blush, arms up, both breasts visible")),
 dict(label="v5_07_growth_intimate", focus="BE growth in intimate context (self-touch + reaction)", face=False,
      positive=P("gigantic breasts, breast expansion, hands on own breasts, soft tissue compression, surprised, aroused, blush, torn clothes, bursting breasts, taut fabric, popped button, bedroom, on bed")),
 dict(label="v5_08_closeup", focus="close framing detail + hand-on-breast", face=False,
      positive=P("huge breasts, close-up on breasts, topless, hand on own breast, fingers sinking into breast, soft skin, soft tissue compression, intimate lighting, bedroom")),
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
    w,h=832,1216; g={}
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
    g["hfd"]=detailer(["vdf",0],"hdet",HAND_WC); img=["hfd",0]
    if c.get("face",False):
        g["fdet"]={"class_type":"UltralyticsDetectorProvider","inputs":{"model_name":"bbox/face_yolov8m.pt"}}
        g["ffd"]=detailer(img,"fdet",""); img=["ffd",0]
    g["save"]={"class_type":"SaveImage","inputs":{"images":img,"filename_prefix":"TS_"+c["label"]}}
    return g
def post(p,d):
    req=urllib.request.Request(API+p,data=json.dumps(d).encode(),headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(req,timeout=20).read())
def get(p): return json.loads(urllib.request.urlopen(API+p,timeout=20).read())
manifest={"cells":[]}
print("submitting",len(CELLS),"v5 cells")
for c in CELLS:
    try:
        r=post("/prompt",{"prompt":build(c)}); manifest["cells"].append({"label":c["label"],"prompt_id":r["prompt_id"],"focus":c["focus"],"positive":c["positive"],"face":c.get("face",False)}); print("  queued",c["label"],r["prompt_id"])
    except Exception as e:
        print("  FAIL",c["label"],repr(e)); manifest["cells"].append({"label":c["label"],"error":repr(e)})
print("waiting...")
t0=time.time()
while time.time()-t0<2500:
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
