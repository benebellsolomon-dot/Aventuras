"""Growth/burst gap — a multi-image GROWTH SEQUENCE (what a single still can't carry).
Same seed + same character; Breast_Size_Slider_Illustrious_V2 LoRA at increasing weight drives
consistent growth, reinforced by size tag + clothing-strain->burst progression. Final frame adds
hyper_breasts. Tuned base pipeline (dpmpp_2m karras cfg5 + hires)."""
import json, time, urllib.request, os
API="http://127.0.0.1:8188"; OUTDIR=r"D:\LLM\ComfyUI_windows_portable\ComfyUI\output"
MANIFEST=r"D:\LLM\ComfyUI_windows_portable\quality-upgrade\growth_sequence_manifest.json"
QP="masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres"
SUBJ="mature female, adult, long blonde hair, blue eyes, curvy, wide hips, collarbone"
NEG=("worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions, "
     "missing fingers, extra digits, fused fingers, mutated hands, malformed hands, extra fingers, "
     "jpeg artifacts, signature, watermark, text, blurry, monochrome, multiple views, censored, "
     "fused breasts, single breast, three breasts, extra breasts, uniboob, flat chest, "
     "plastic skin, glossy specular, wet sheen, child, loli, baby face, chibi, 2girls")
SLIDER="Breast_Size_Slider_Illustrious_V2.safetensors"
HYPER="hyper_breasts_ILXL_concept.safetensors"
MATTE="bedroom, standing, soft warm lighting, (matte skin:1.2)"
S=111
# frame: (label, slider_weight, hyper_weight, size_tag, clothing, expression)
FRAMES=[
 ("g1_start",   0.0, 0.0, "large breasts", "fitted white shirt", "calm, neutral expression"),
 ("g2_growing", 1.0, 0.0, "large breasts", "fitted white shirt, tight fabric", "surprised, slight blush"),
 ("g3_huge",    2.0, 0.0, "huge breasts", "taut shirt, cleavage, fabric stretched, stress folds", "surprised, blush, looking down"),
 ("g4_straining",3.0,0.0, "huge breasts", "straining buttons, gaping shirt, button gap, stress folds, popped button", "shocked, open mouth, blush"),
 ("g5_bursting",4.0, 0.0, "gigantic breasts", "torn shirt, flying button, bursting breasts, clothes ripping, breast expansion", "shocked, open mouth, hands raised"),
 ("g6_hyper",   4.0, 0.7, "gigantic breasts", "ripped open shirt, torn clothes, bursting breasts, breast expansion", "shocked, surprised, hands raised"),
]
def r8(x): return int(round(x/8)*8)
def build(label, sw, hw, size, cloth, expr):
    w,h=832,1216; g={}
    g["ckpt"]={"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"waiIllustriousSDXL_v170.safetensors"}}
    g["lora"]={"class_type":"LoraLoader","inputs":{"model":["ckpt",0],"clip":["ckpt",1],"lora_name":SLIDER,"strength_model":sw,"strength_clip":sw}}
    model=["lora",0]; clip=["lora",1]
    if hw>0:
        g["lora2"]={"class_type":"LoraLoaderModelOnly","inputs":{"model":["lora",0],"lora_name":HYPER,"strength_model":hw}}
        model=["lora2",0]
    pos=f"{QP}, 1girl, solo, {SUBJ}, {size}, {cloth}, {expr}, {MATTE}"
    g["pos"]={"class_type":"CLIPTextEncode","inputs":{"clip":clip,"text":pos}}
    g["neg"]={"class_type":"CLIPTextEncode","inputs":{"clip":clip,"text":NEG}}
    g["lat"]={"class_type":"EmptyLatentImage","inputs":{"width":w,"height":h,"batch_size":1}}
    g["ks"]={"class_type":"KSampler","inputs":{"seed":S,"steps":28,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":1.0,"model":model,"positive":["pos",0],"negative":["neg",0],"latent_image":["lat",0]}}
    g["vd"]={"class_type":"VAEDecode","inputs":{"samples":["ks",0],"vae":["ckpt",2]}}
    g["um"]={"class_type":"UpscaleModelLoader","inputs":{"model_name":"4x-AnimeSharp.pth"}}
    g["iuw"]={"class_type":"ImageUpscaleWithModel","inputs":{"upscale_model":["um",0],"image":["vd",0]}}
    g["is"]={"class_type":"ImageScale","inputs":{"image":["iuw",0],"upscale_method":"lanczos","width":r8(w*1.5),"height":r8(h*1.5),"crop":"disabled"}}
    g["ve"]={"class_type":"VAEEncode","inputs":{"pixels":["is",0],"vae":["ckpt",2]}}
    g["ksf"]={"class_type":"KSampler","inputs":{"seed":S,"steps":20,"cfg":5.0,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":0.4,"model":model,"positive":["pos",0],"negative":["neg",0],"latent_image":["ve",0]}}
    g["vdf"]={"class_type":"VAEDecode","inputs":{"samples":["ksf",0],"vae":["ckpt",2]}}
    g["save"]={"class_type":"SaveImage","inputs":{"images":["vdf",0],"filename_prefix":"TS_growth_"+label}}
    return g
def post(p,d):
    req=urllib.request.Request(API+p,data=json.dumps(d).encode(),headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(req,timeout=20).read())
def get(p): return json.loads(urllib.request.urlopen(API+p,timeout=20).read())
manifest={"frames":[]}
print("submitting",len(FRAMES),"growth frames")
for (label,sw,hw,size,cloth,expr) in FRAMES:
    try:
        r=post("/prompt",{"prompt":build(label,sw,hw,size,cloth,expr)})
        manifest["frames"].append({"label":label,"prompt_id":r["prompt_id"],"slider":sw,"hyper":hw,"size":size}); print("  queued",label,"slider",sw,"hyper",hw)
    except Exception as e:
        print("  FAIL",label,repr(e)); manifest["frames"].append({"label":label,"error":repr(e)})
print("waiting...")
t0=time.time()
while time.time()-t0<2500:
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
        if fr["status"]=="error":
            for m in e.get("status",{}).get("messages",[]):
                if m[0]=="execution_error": fr["error_detail"]="%s: %s"%(m[1].get("exception_type"),m[1].get("exception_message"))
    except Exception as e: fr["collect_error"]=repr(e)
open(MANIFEST,"w",encoding="utf-8").write(json.dumps(manifest,indent=2)); print("WROTE",MANIFEST,"DONE")
