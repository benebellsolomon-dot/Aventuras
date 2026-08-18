"""Generator for the SOLO/INTIMATE + HandRefiner preset (the converged v8 contact pipeline as a UI workflow).
base -> hires-fix -> contact hand-detailer (denoise 0.55, contact wildcard) -> HandRefiner
(MeshGraphormer+ImpactDetector depth -> illustriousXLDepth_v20 ControlNet -> masked inpaint denoise 0.5)."""
import json

POS = ("masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres, "
       "1girl, solo, mature female, adult, long hair, huge breasts, grabbing own breast, hand on breast, "
       "(fingers sinking into breast:1.3), skin indentation, contact shadow under fingers, individual fingers, "
       "asymmetric breasts, navel, bedroom, on bed, half-lidded eyes, blush, parted lips, looking at viewer, "
       "warm bedside lamp lighting, (matte skin:1.2), subsurface skin")
NEG = ("worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions, "
       "missing fingers, extra digits, fused fingers, mutated hands, malformed hands, extra fingers, extra hands, "
       "disembodied limb, third arm, extra arms, missing arms, missing hands, "
       "(symmetrical breasts:1.2), mirrored breasts, identical breasts, clone breasts, areola fused with hand, "
       "jpeg artifacts, signature, watermark, text, blurry, monochrome, multiple views, censored, "
       "fused breasts, single breast, three breasts, extra breasts, uniboob, flat chest, holding object, "
       "plastic skin, glossy specular, wet sheen, child, loli, baby face, chibi, 2girls")
CWC = "(fingers sinking into breast:1.2), skin indentation, flesh between fingers, individual fingers, detailed knuckles, articulated thumb, contact shadow, five fingers"

FD_OUT=[("image","IMAGE"),("cropped_refined","IMAGE"),("cropped_enhanced_alpha","IMAGE"),("mask","MASK"),("detailer_pipe","DETAILER_PIPE"),("cnet_images","IMAGE")]
FD_IN=[("image","IMAGE"),("model","MODEL"),("clip","CLIP"),("vae","VAE"),("positive","CONDITIONING"),("negative","CONDITIONING"),("bbox_detector","BBOX_DETECTOR")]
FD_W=[512,True,1024,0,"fixed",20,5.0,"dpmpp_2m","karras",0.55,5,True,True,0.5,6,2.5,"center-1",0,0.93,0,0.7,"False",10,CWC,1,False,20,False,False]
MG_W=[0.5,10,3.0,10,16,"based_on_depth",3,88,512]  # bbox_threshold,bbox_dilation,bbox_crop_factor,drop_size,mask_bbox_padding,mask_type,mask_expand,rand_seed,resolution

# id:(type,pos,outputs,inputs,widgets,mode)
NODES={
 1:("CheckpointLoaderSimple",[40,40],[("MODEL","MODEL"),("CLIP","CLIP"),("VAE","VAE")],[],["waiIllustriousSDXL_v170.safetensors"],0),
 3:("CLIPTextEncode",[360,40],[("CONDITIONING","CONDITIONING")],[("clip","CLIP")],[POS],0),
 4:("CLIPTextEncode",[360,320],[("CONDITIONING","CONDITIONING")],[("clip","CLIP")],[NEG],0),
 5:("EmptyLatentImage",[360,560],[("LATENT","LATENT")],[],[832,1216,1],0),
 6:("KSampler",[720,40],[("LATENT","LATENT")],[("model","MODEL"),("positive","CONDITIONING"),("negative","CONDITIONING"),("latent_image","LATENT")],[111,"fixed",28,5.0,"dpmpp_2m","karras",1.0],0),
 7:("VAEDecode",[1060,40],[("IMAGE","IMAGE")],[("samples","LATENT"),("vae","VAE")],[],0),
 8:("SaveImage",[1060,300],[],[("images","IMAGE")],["WAI_v17_intimate_base"],0),
 9:("UpscaleModelLoader",[720,420],[("UPSCALE_MODEL","UPSCALE_MODEL")],[],["4x-AnimeSharp.pth"],0),
 10:("ImageUpscaleWithModel",[1060,460],[("IMAGE","IMAGE")],[("upscale_model","UPSCALE_MODEL"),("image","IMAGE")],[],0),
 11:("ImageScale",[1320,460],[("IMAGE","IMAGE")],[("image","IMAGE")],["lanczos",1248,1824,"disabled"],0),
 12:("VAEEncode",[1560,460],[("LATENT","LATENT")],[("pixels","IMAGE"),("vae","VAE")],[],0),
 13:("KSampler",[1560,40],[("LATENT","LATENT")],[("model","MODEL"),("positive","CONDITIONING"),("negative","CONDITIONING"),("latent_image","LATENT")],[111,"fixed",20,5.0,"dpmpp_2m","karras",0.4],0),
 14:("VAEDecode",[1880,40],[("IMAGE","IMAGE")],[("samples","LATENT"),("vae","VAE")],[],0),
 15:("UltralyticsDetectorProvider",[720,600],[("BBOX_DETECTOR","BBOX_DETECTOR"),("SEGM_DETECTOR","SEGM_DETECTOR")],[],["bbox/hand_yolov8s.pt"],0),
 16:("FaceDetailer",[2120,40],FD_OUT,FD_IN,FD_W,0),
 17:("MeshGraphormer+ImpactDetector-DepthMapPreprocessor",[2120,420],[("IMAGE","IMAGE"),("INPAINTING_MASK","MASK")],[("image","IMAGE"),("bbox_detector","BBOX_DETECTOR")],MG_W,0),
 18:("ControlNetLoader",[2120,640],[("CONTROL_NET","CONTROL_NET")],[],["illustriousXLDepth_v20.safetensors"],0),
 19:("ControlNetApplyAdvanced",[2460,420],[("positive","CONDITIONING"),("negative","CONDITIONING")],[("positive","CONDITIONING"),("negative","CONDITIONING"),("control_net","CONTROL_NET"),("image","IMAGE")],[0.85,0.0,1.0],0),
 20:("VAEEncode",[2460,260],[("LATENT","LATENT")],[("pixels","IMAGE"),("vae","VAE")],[],0),
 21:("SetLatentNoiseMask",[2700,300],[("LATENT","LATENT")],[("samples","LATENT"),("mask","MASK")],[],0),
 22:("KSampler",[2820,40],[("LATENT","LATENT")],[("model","MODEL"),("positive","CONDITIONING"),("negative","CONDITIONING"),("latent_image","LATENT")],[111,"fixed",20,5.0,"dpmpp_2m","karras",0.5],0),
 23:("VAEDecode",[3160,40],[("IMAGE","IMAGE")],[("samples","LATENT"),("vae","VAE")],[],0),
 24:("SaveImage",[3160,300],[],[("images","IMAGE")],["WAI_v17_intimate_final"],0),
}
LINKS=[
 (1,0,6,0,"MODEL"),(1,1,3,0,"CLIP"),(1,1,4,0,"CLIP"),(1,2,7,1,"VAE"),
 (3,0,6,1,"CONDITIONING"),(4,0,6,2,"CONDITIONING"),(5,0,6,3,"LATENT"),(6,0,7,0,"LATENT"),
 (7,0,8,0,"IMAGE"),(7,0,10,1,"IMAGE"),(9,0,10,0,"UPSCALE_MODEL"),(10,0,11,0,"IMAGE"),
 (11,0,12,0,"IMAGE"),(1,2,12,1,"VAE"),(12,0,13,3,"LATENT"),(1,0,13,0,"MODEL"),
 (3,0,13,1,"CONDITIONING"),(4,0,13,2,"CONDITIONING"),(13,0,14,0,"LATENT"),(1,2,14,1,"VAE"),
 (14,0,16,0,"IMAGE"),(1,0,16,1,"MODEL"),(1,1,16,2,"CLIP"),(1,2,16,3,"VAE"),
 (3,0,16,4,"CONDITIONING"),(4,0,16,5,"CONDITIONING"),(15,0,16,6,"BBOX_DETECTOR"),
 (16,0,17,0,"IMAGE"),(15,0,17,1,"BBOX_DETECTOR"),
 (3,0,19,0,"CONDITIONING"),(4,0,19,1,"CONDITIONING"),(18,0,19,2,"CONTROL_NET"),(17,0,19,3,"IMAGE"),
 (16,0,20,0,"IMAGE"),(1,2,20,1,"VAE"),(20,0,21,0,"LATENT"),(17,1,21,1,"MASK"),
 (1,0,22,0,"MODEL"),(19,0,22,1,"CONDITIONING"),(19,1,22,2,"CONDITIONING"),(21,0,22,3,"LATENT"),
 (22,0,23,0,"LATENT"),(1,2,23,1,"VAE"),(23,0,24,0,"IMAGE"),
]
links_json=[[i,s,ss,d,ds,t] for i,(s,ss,d,ds,t) in enumerate(LINKS,start=1)]
nodes_json=[]
for order,(nid,(ntype,pos,outs,ins,wv,mode)) in enumerate(NODES.items()):
    inputs=[{"name":n,"type":t,"link":next((i for i,(s,ss,d,ds,tt) in enumerate(LINKS,start=1) if d==nid and ds==slot),None)} for slot,(n,t) in enumerate(ins)]
    outputs=[{"name":n,"type":t,"slot_index":slot,"links":[i for i,(s,ss,d,ds,tt) in enumerate(LINKS,start=1) if s==nid and ss==slot]} for slot,(n,t) in enumerate(outs)]
    nodes_json.append({"id":nid,"type":ntype,"pos":pos,"size":[300,200],"flags":{},"order":order,"mode":mode,"inputs":inputs,"outputs":outputs,"properties":{"Node name for S&R":ntype},"widgets_values":wv})
wf={"last_node_id":max(NODES),"last_link_id":len(LINKS),"nodes":nodes_json,"links":links_json,"groups":[],"config":{},"extra":{},"version":0.4}
out=r"D:\LLM\ComfyUI_windows_portable\ComfyUI\user\default\workflows\illustrious_image__WAI_v17_INTIMATE_handrefiner.json"
open(out,"w",encoding="utf-8").write(json.dumps(wf,indent=2))
EXPECT={1:1,3:1,4:1,5:3,6:7,7:0,8:1,9:1,10:0,11:4,12:0,13:7,14:0,15:1,16:29,17:9,18:1,19:3,20:0,21:0,22:7,23:0,24:1}
bad=[(nid,len(NODES[nid][4]),EXPECT[nid]) for nid in NODES if len(NODES[nid][4])!=EXPECT[nid]]
print("WROTE intimate preset | nodes",len(nodes_json),"links",len(links_json),"| widget mismatches:",bad if bad else "none")
