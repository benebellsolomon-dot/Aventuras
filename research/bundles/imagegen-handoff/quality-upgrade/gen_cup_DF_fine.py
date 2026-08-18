"""D-F fine-granularity verification: does 0.25-step slider give distinguishable D/E/F in the flat low band?
Same locked scene as the calibration sweep; slider 0.25..1.5 at 0.25 steps (6 frames)."""
import json, time, urllib.request, os
API="http://127.0.0.1:8188"; OUTDIR=r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST=r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\cup_DF_fine_manifest.json"
QP="masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres"
FIXED=("1girl, solo, mature female, adult, long blonde hair, blue eyes, (fitted ribbed tank top:1.1), "
       "form-fitting clothes, cowboy shot, facing viewer, standing, arms at sides, neutral expression, "
       "plain grey background, even studio lighting, (matte skin:1.2)")
NEG=("worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions, "
     "missing fingers, extra digits, fused fingers, jpeg artifacts, signature, watermark, text, blurry, "
     "monochrome, multiple views, censored, fused breasts, single breast, uniboob, plastic skin, glossy specular, "
     "child, loli, baby face, chibi, 2girls")
SLIDER="Breast_Size_Slider_Illustrious_V2.safetensors"
S=111
WEIGHTS=[0.25,0.5,0.75,1.0,1.25,1.5]
def r8(x): return int(round(x/8)*8)
def build(w):
    W,H=832,1216; g={}
    g["ckpt"]={"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"waiIllustriousSDXL_v170.safetensors"}}
    g["lora"]={"class_type":"LoraLoader","inputs":{"model":["ckpt",0],"clip":["ckpt",1],"lora_name":SLIDER,"strength_model":w,"strength_clip":w}}
    g["pos"]={"class_type":"CLIPTextEncode","inputs":{"clip":["lora",1],"text":f"{QP}, {FIXED}"}}
    g["neg"]={"class_type":"CLIPTextEncode","inputs":{"clip":["lora",1],"text":NEG}}
    g["lat"]={"class_type":"EmptyLatentImage","inputs":{"width":W,"height":H,"batch_size":1}}
    g["ks"]={"class_type":"KSampler","inputs":{"seed":S,"steps":28,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":1.0,"model":["lora",0],"positive":["pos",0],"negative":["neg",0],"latent_image":["lat",0]}}
    g["vd"]={"class_type":"VAEDecode","inputs":{"samples":["ks",0],"vae":["ckpt",2]}}
    g["um"]={"class_type":"UpscaleModelLoader","inputs":{"model_name":"4x-AnimeSharp.pth"}}
    g["iuw"]={"class_type":"ImageUpscaleWithModel","inputs":{"upscale_model":["um",0],"image":["vd",0]}}
    g["is"]={"class_type":"ImageScale","inputs":{"image":["iuw",0],"upscale_method":"lanczos","width":r8(W*1.5),"height":r8(H*1.5),"crop":"disabled"}}
    g["ve"]={"class_type":"VAEEncode","inputs":{"pixels":["is",0],"vae":["ckpt",2]}}
    g["ksf"]={"class_type":"KSampler","inputs":{"seed":S,"steps":20,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":0.4,"model":["lora",0],"positive":["pos",0],"negative":["neg",0],"latent_image":["ve",0]}}
    g["vdf"]={"class_type":"VAEDecode","inputs":{"samples":["ksf",0],"vae":["ckpt",2]}}
    g["save"]={"class_type":"SaveImage","inputs":{"images":["vdf",0],"filename_prefix":"TS_cupDF_s%03d"%(int(round(w*100)))}}
    return g
def post(p,d):
    req=urllib.request.Request(API+p,data=json.dumps(d).encode(),headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(req,timeout=20).read())
def get(p): return json.loads(urllib.request.urlopen(API+p,timeout=20).read())
manifest={"frames":[]}
print("submitting",len(WEIGHTS),"D-F fine frames")
for w in WEIGHTS:
    try:
        r=post("/prompt",{"prompt":build(w)}); manifest["frames"].append({"slider":w,"prompt_id":r["prompt_id"]}); print("  queued",w)
    except Exception as e:
        print("  FAIL",w,repr(e)); manifest["frames"].append({"slider":w,"error":repr(e)})
print("waiting...")
t0=time.time()
while time.time()-t0<2000:
    q=get("/queue")
    if len(q.get("queue_running",[]))+len(q.get("queue_pending",[]))==0: break
    time.sleep(5)
print("drained",int(time.time()-t0),"s")
for fr in manifest["frames"]:
    pid=fr.get("prompt_id")
    if not pid: continue
    try:
        h=get(f"/history/{pid}"); e=h.get(pid,{}); outs=e.get("outputs",{})
        fr["files"]=[os.path.join(OUTDIR,im.get("subfolder",""),im["filename"]) for nid,o in outs.items() for im in o.get("images",[])]; fr["status"]=e.get("status",{}).get("status_str")
    except Exception as e: fr["collect_error"]=repr(e)
open(MANIFEST,"w",encoding="utf-8").write(json.dumps(manifest,indent=2)); print("WROTE",MANIFEST,"DONE")
