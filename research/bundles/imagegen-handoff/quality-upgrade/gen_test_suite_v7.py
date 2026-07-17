"""v7 — structural: HandRefiner (MeshGraphormer depth + Illustrious depth ControlNet) to fix
finger render quality on contact grips (the ceiling left after v6's contact mechanic landed).
Appends a hand-region depth-guided inpaint after the v6 contact hand-detailer.
Cells: 3 contact cells (detailer -> HandRefiner) + 1 ablation (HandRefiner only). Baselines = v6 contact cells.
NOTE: MeshGraphormer downloads its model on first run."""
import json, time, urllib.request, os
API="http://127.0.0.1:8188"; OUTDIR=r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST=r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\testsuite_v7_manifest.json"
QP="masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres"
SUBJ="mature female, adult, long blonde hair, blue eyes, curvy, wide hips, collarbone"
NEG=("worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions, "
     "missing fingers, extra digits, fused fingers, mutated hands, malformed hands, extra fingers, extra hands, "
     "disembodied limb, third arm, extra arms, missing arms, missing hands, "
     "(symmetrical breasts:1.2), mirrored breasts, identical breasts, clone breasts, areola fused with hand, "
     "jpeg artifacts, signature, watermark, text, blurry, monochrome, multiple views, censored, "
     "fused breasts, single breast, three breasts, extra breasts, uniboob, flat chest, holding object, "
     "plastic skin, glossy specular, wet sheen, child, loli, baby face, chibi, 2girls")
CONTACT="grabbing own breast, hand on breast, (fingers sinking into breast:1.3), (skin indentation:1.2), flesh squeezed between fingers, soft breast deformation, fingertip pressing, (contact shadow under fingers:1.1), individual fingers, detailed knuckles, articulated thumb"
CONTACT_WC="(fingers sinking into breast:1.2), skin indentation, flesh between fingers, individual fingers, detailed knuckles, articulated thumb, contact shadow, five fingers"
ASYM="asymmetric breasts, natural breast asymmetry"; NAVEL="navel, defined abdomen, abdominal midline"
AFFECT="half-lidded eyes, (seductive expression:1.1), blush, parted lips, looking at viewer"
MATTE="warm bedside lamp lighting, soft rim light, intimate bedroom, (matte skin:1.2), subsurface skin"
S=111
def P(core): return f"{QP}, 1girl, solo, {SUBJ}, {core}"
CELLS=[
 dict(label="v7_01_self_grope", baseline="v6_01", mode="detailer_HR",
      positive=P(f"huge breasts, topless, {CONTACT}, {ASYM}, {NAVEL}, bedroom, on bed, {AFFECT}, {MATTE}")),
 dict(label="v7_02_closeup", baseline="v6_02", mode="detailer_HR",
      positive=P(f"huge breasts, upper body, cowboy shot, topless, {CONTACT}, areola visible, nipples, {ASYM}, soft skin, {MATTE}")),
 dict(label="v7_03_growth", baseline="v6_03", mode="detailer_HR",
      positive=P(f"gigantic breasts, breast expansion, {CONTACT}, {ASYM}, surprised, aroused, blush, torn clothes, bursting breasts, taut fabric, popped button, bedroom")),
 dict(label="v7_04_self_grope_HRonly", baseline="v6_01", mode="HR_only",
      positive=P(f"huge breasts, topless, {CONTACT}, {ASYM}, {NAVEL}, bedroom, on bed, {AFFECT}, {MATTE}")),
]
def r8(x): return int(round(x/8)*8)
def hand_detailer(img):
    return {"class_type":"FaceDetailer","inputs":{"image":img,"model":["ckpt",0],"clip":["ckpt",1],"vae":["ckpt",2],
        "positive":["pos",0],"negative":["neg",0],"bbox_detector":["hdet",0],"wildcard":CONTACT_WC,"guide_size":512,
        "guide_size_for":True,"max_size":1024,"seed":S,"steps":20,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras",
        "denoise":0.55,"feather":5,"noise_mask":True,"force_inpaint":True,"bbox_threshold":0.5,"bbox_dilation":6,
        "bbox_crop_factor":2.5,"sam_detection_hint":"center-1","sam_dilation":0,"sam_threshold":0.93,"sam_bbox_expansion":0,
        "sam_mask_hint_threshold":0.7,"sam_mask_hint_use_negative":"False","drop_size":10,"cycle":1,"inpaint_model":False,"noise_mask_feather":20}}
def handrefiner(g, src):
    g["mg"]={"class_type":"MeshGraphormer+ImpactDetector-DepthMapPreprocessor","inputs":{"image":src,"bbox_detector":["hdet",0],"bbox_threshold":0.5,"bbox_dilation":10,"bbox_crop_factor":3.0,"drop_size":10,"mask_bbox_padding":30,"mask_type":"based_on_depth","mask_expand":8,"rand_seed":88,"resolution":512}}
    g["cnet"]={"class_type":"ControlNetLoader","inputs":{"control_net_name":"illustriousXLDepth_v20.safetensors"}}
    g["cnap"]={"class_type":"ControlNetApplyAdvanced","inputs":{"positive":["pos",0],"negative":["neg",0],"control_net":["cnet",0],"image":["mg",0],"strength":0.8,"start_percent":0.0,"end_percent":1.0}}
    g["enc2"]={"class_type":"VAEEncode","inputs":{"pixels":src,"vae":["ckpt",2]}}
    g["mask2"]={"class_type":"SetLatentNoiseMask","inputs":{"samples":["enc2",0],"mask":["mg",1]}}
    g["ksh"]={"class_type":"KSampler","inputs":{"seed":S,"steps":20,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":0.7,"model":["ckpt",0],"positive":["cnap",0],"negative":["cnap",1],"latent_image":["mask2",0]}}
    g["vdh"]={"class_type":"VAEDecode","inputs":{"samples":["ksh",0],"vae":["ckpt",2]}}
    return ["vdh",0]
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
    img=["vdf",0]
    if c["mode"]=="detailer_HR":
        g["hfd"]=hand_detailer(img); img=["hfd",0]; img=handrefiner(g,img)
    elif c["mode"]=="HR_only":
        img=handrefiner(g,img)
    g["save"]={"class_type":"SaveImage","inputs":{"images":img,"filename_prefix":"TS_"+c["label"]}}
    return g
def post(p,d):
    req=urllib.request.Request(API+p,data=json.dumps(d).encode(),headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(req,timeout=20).read())
def get(p): return json.loads(urllib.request.urlopen(API+p,timeout=20).read())
manifest={"cells":[]}
print("submitting",len(CELLS),"v7 cells")
for c in CELLS:
    try:
        r=post("/prompt",{"prompt":build(c)}); manifest["cells"].append({"label":c["label"],"prompt_id":r["prompt_id"],"baseline":c["baseline"],"mode":c["mode"],"positive":c["positive"]}); print("  queued",c["label"],r["prompt_id"])
    except Exception as e:
        print("  FAIL",c["label"],repr(e)); manifest["cells"].append({"label":c["label"],"error":repr(e)})
print("waiting (first run downloads MeshGraphormer model)...")
t0=time.time()
while time.time()-t0<3000:
    q=get("/queue")
    if len(q.get("queue_running",[]))+len(q.get("queue_pending",[]))==0: break
    time.sleep(5)
print("drained",int(time.time()-t0),"s")
for cell in manifest["cells"]:
    pid=cell.get("prompt_id")
    if not pid: continue
    try:
        h=get(f"/history/{pid}"); e=h.get(pid,{}); outs=e.get("outputs",{})
        cell["files"]=[os.path.join(OUTDIR,im.get("subfolder",""),im["filename"]) for nid,o in outs.items() for im in o.get("images",[])]
        cell["status"]=e.get("status",{}).get("status_str")
        if cell["status"]=="error":
            for m in e.get("status",{}).get("messages",[]):
                if m[0]=="execution_error": cell["error_detail"]="%s: %s"%(m[1].get("exception_type"),m[1].get("exception_message"))
    except Exception as e: cell["collect_error"]=repr(e)
open(MANIFEST,"w",encoding="utf-8").write(json.dumps(manifest,indent=2)); print("WROTE",MANIFEST,"DONE")
