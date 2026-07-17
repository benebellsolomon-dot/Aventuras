"""v6 — solo/intimate residual fixes (P1-P5 from v5 report).
P1 hand-on-breast contact: hotter hand-detailer (denoise 0.55) FED the contact block as wildcard + contact tags
P2 reclining gravity: pose-conditioned gravity tags; DROP deep-cleavage on reclining; supine negatives
P3 pose coherence: arch/curved-spine + navel/abdomen landmarks
P4 clone-symmetry/arm-dropout: anti-symmetry + anti-dropout negatives
P5 specular/matte + composition: matte negatives; keep QA target (areola/hands) in frame
Each cell maps to its v5 baseline."""
import json, time, urllib.request, os
API="http://127.0.0.1:8188"; OUTDIR=r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST=r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\testsuite_v6_manifest.json"
QP="masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres"
SUBJ="mature female, adult, long blonde hair, blue eyes, curvy, wide hips, collarbone"
NEG=("worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions, "
     "missing fingers, extra digits, fused fingers, mutated hands, malformed hands, extra fingers, extra hands, "
     "disembodied limb, third arm, extra arms, (missing arms:1.3), missing hands, disconnected limbs, "
     "(symmetrical breasts:1.2), mirrored breasts, identical breasts, clone breasts, balloon breasts, "
     "areola fused with hand, third breast, hand floating above breast, flat hand, decal hand, rigid breasts, "
     "jpeg artifacts, signature, watermark, username, text, blurry, sketch, monochrome, greyscale, multiple views, "
     "oldest, censored, mosaic censoring, bar censor, fused breasts, single breast, three breasts, extra breasts, "
     "uniboob, flat chest, deformed object, holding object, object between breasts, can, bottle, phone, "
     "plastic skin, wax skin, glossy specular, wet sheen, blotchy highlights, water drips, skin streaks, sweat, "
     "child, loli, baby face, chibi, multiple girls, 2girls")
SUPINE_NEG="(breasts projecting upward:1.3), spherical breasts, (floating breasts:1.2), hard cleavage seam"
CONTACT="grabbing own breast, hand on breast, (fingers sinking into breast:1.3), (skin indentation:1.2), flesh squeezed between fingers, soft breast deformation, fingertip pressing, (contact shadow under fingers:1.1), individual fingers, detailed knuckles, articulated thumb"
CONTACT_WC="(fingers sinking into breast:1.2), skin indentation, flesh between fingers, individual fingers, detailed knuckles, articulated thumb, contact shadow, five fingers"
HAND_WC="(perfect hands, five fingers, detailed fingers, correct anatomy:1.1)"
SUPINE="lying on back, (breasts spreading to sides:1.3), (flattened breasts:1.2), gravity pulling breasts toward chest, soft sagging sideways, reduced projection, from above"
SIDE="lying on side, (breast resting on mattress:1.3), upper breast draping over lower, (lateral breast pool:1.2), underbust crease, breast on bed"
ARCH="(arched back:1.3), curved spine, presenting, navel, defined abdomen, abdominal midline"
ASYM="asymmetric breasts, natural breast asymmetry"
NAVEL="navel, defined abdomen, abdominal midline"
AFFECT="half-lidded eyes, (seductive expression:1.1), blush, parted lips, flushed cheeks, looking at viewer, soft intimate gaze"
MATTE="warm bedside lamp lighting, soft rim light, intimate bedroom, (matte skin:1.2), subsurface skin, soft shadows"
S=111
def P(core): return f"{QP}, 1girl, solo, {SUBJ}, {core}"
CELLS=[
 dict(label="v6_01_self_grope", baseline="v5_01", face=False, hand_wc=CONTACT_WC,
      positive=P(f"huge breasts, topless, {CONTACT}, {ASYM}, {NAVEL}, bedroom, on bed, {AFFECT}, {MATTE}")),
 dict(label="v6_02_closeup", baseline="v5_08", face=False, hand_wc=CONTACT_WC,
      positive=P(f"huge breasts, upper body, cowboy shot, topless, {CONTACT}, areola visible, nipples, {ASYM}, soft skin, {MATTE}")),
 dict(label="v6_03_growth_intimate", baseline="v5_07", face=False, hand_wc=CONTACT_WC,
      positive=P(f"gigantic breasts, breast expansion, {CONTACT}, {ASYM}, surprised, aroused, blush, torn clothes, bursting breasts, taut fabric, popped button, bedroom")),
 dict(label="v6_04_pov_supine", baseline="v5_06", face=False, hand_wc=HAND_WC, neg_extra=SUPINE_NEG,
      positive=P(f"huge breasts, topless, pov, {SUPINE}, looking at viewer, {NAVEL}, {AFFECT}, dim warm lighting, both breasts visible")),
 dict(label="v6_05_lying_side", baseline="v5_03", face=True, hand_wc=HAND_WC,
      positive=P(f"huge breasts, topless, {SIDE}, soft breasts, seductive smile, looking at viewer, {NAVEL}, {MATTE}")),
 dict(label="v6_06_arched", baseline="v5_04", face=True, hand_wc=HAND_WC,
      positive=P(f"huge breasts, topless, {ARCH}, kneeling on bed, presenting, aroused, parted lips, blush, hands on thighs, {MATTE}")),
 dict(label="v6_07_lying_back", baseline="v5_02", face=True, hand_wc=HAND_WC, neg_extra=SUPINE_NEG,
      positive=P(f"huge breasts, topless, {SUPINE}, on bed, white sheets, looking at viewer, blush, {NAVEL}, {MATTE}")),
]
def r8(x): return int(round(x/8)*8)
def detailer(img,det,wc,denoise):
    return {"class_type":"FaceDetailer","inputs":{"image":img,"model":["ckpt",0],"clip":["ckpt",1],"vae":["ckpt",2],
        "positive":["pos",0],"negative":["neg",0],"bbox_detector":[det,0],"wildcard":wc,"guide_size":512,"guide_size_for":True,
        "max_size":1024,"seed":S,"steps":20,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":denoise,
        "feather":5,"noise_mask":True,"force_inpaint":True,"bbox_threshold":0.5,"bbox_dilation":6,"bbox_crop_factor":2.5,
        "sam_detection_hint":"center-1","sam_dilation":0,"sam_threshold":0.93,"sam_bbox_expansion":0,
        "sam_mask_hint_threshold":0.7,"sam_mask_hint_use_negative":"False","drop_size":10,"cycle":1,
        "inpaint_model":False,"noise_mask_feather":20}}
def build(c):
    w,h=832,1216; neg=NEG+(", "+c["neg_extra"] if c.get("neg_extra") else ""); g={}
    g["ckpt"]={"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"waiIllustriousSDXL_v170.safetensors"}}
    g["neg"]={"class_type":"CLIPTextEncode","inputs":{"clip":["ckpt",1],"text":neg}}
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
    g["hfd"]=detailer(["vdf",0],"hdet",c["hand_wc"],0.55); img=["hfd",0]
    if c.get("face",False):
        g["fdet"]={"class_type":"UltralyticsDetectorProvider","inputs":{"model_name":"bbox/face_yolov8m.pt"}}
        g["ffd"]=detailer(img,"fdet","",0.4); img=["ffd",0]
    g["save"]={"class_type":"SaveImage","inputs":{"images":img,"filename_prefix":"TS_"+c["label"]}}
    return g
def post(p,d):
    req=urllib.request.Request(API+p,data=json.dumps(d).encode(),headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(req,timeout=20).read())
def get(p): return json.loads(urllib.request.urlopen(API+p,timeout=20).read())
manifest={"cells":[]}
print("submitting",len(CELLS),"v6 cells")
for c in CELLS:
    try:
        r=post("/prompt",{"prompt":build(c)}); manifest["cells"].append({"label":c["label"],"prompt_id":r["prompt_id"],"baseline":c["baseline"],"positive":c["positive"]}); print("  queued",c["label"],r["prompt_id"])
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
