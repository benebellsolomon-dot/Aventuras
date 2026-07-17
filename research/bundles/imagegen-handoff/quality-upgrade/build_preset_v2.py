"""Generator for the WAI v17 quality preset v2 (applies the BE-quality findings).
Changes vs v1: dpmpp_2m+karras CFG5; gloss removed; hand+fusion negatives; active hand-detailer
(hand_yolov8s); FaceDetailer(face) present but BYPASSED by default (mode 4); DanTagGen removed
(it wedges ComfyUI) -> manual positive prompt."""
import json, os

POS = ("masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres, "
       "1girl, solo, mature female, adult, long hair, huge breasts, cleavage, between breasts, "
       "curvy, wide hips, narrow waist, collarbone, fitted dress, indoors, standing, smile, soft lighting")
NEG = ("worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions, "
       "missing fingers, extra digits, fused fingers, mutated hands, malformed hands, extra fingers, "
       "jpeg artifacts, signature, watermark, username, text, blurry, sketch, monochrome, greyscale, "
       "multiple views, oldest, censored, mosaic censoring, bar censor, fused breasts, single breast, "
       "three breasts, extra breasts, child, loli, baby face, chibi")
HAND_WC = "(perfect hands, five fingers, detailed fingers, correct anatomy:1.1)"

def fd(wildcard):
    # FaceDetailer 29 widgets in object_info order (control_after_generate injected after seed)
    return [512, True, 1024, 0, "fixed", 20, 5.0, "dpmpp_2m", "karras", 0.45, 5, True, True, 0.5, 10, 3.0,
            "center-1", 0, 0.93, 0, 0.7, "False", 10, wildcard, 1, False, 20, False, False]

FD_OUT = [("image","IMAGE"),("cropped_refined","IMAGE"),("cropped_enhanced_alpha","IMAGE"),
          ("mask","MASK"),("detailer_pipe","DETAILER_PIPE"),("cnet_images","IMAGE")]
FD_IN = [("image","IMAGE"),("model","MODEL"),("clip","CLIP"),("vae","VAE"),
         ("positive","CONDITIONING"),("negative","CONDITIONING"),("bbox_detector","BBOX_DETECTOR")]

# id: (type, pos, outputs, inputs, widgets_values, mode)
NODES = {
 1:  ("CheckpointLoaderSimple", [40,40], [("MODEL","MODEL"),("CLIP","CLIP"),("VAE","VAE")], [], ["waiIllustriousSDXL_v170.safetensors"], 0),
 3:  ("CLIPTextEncode", [380,40], [("CONDITIONING","CONDITIONING")], [("clip","CLIP")], [POS], 0),
 4:  ("CLIPTextEncode", [380,320], [("CONDITIONING","CONDITIONING")], [("clip","CLIP")], [NEG], 0),
 5:  ("EmptyLatentImage", [380,560], [("LATENT","LATENT")], [], [832,1216,1], 0),
 6:  ("KSampler", [760,40], [("LATENT","LATENT")], [("model","MODEL"),("positive","CONDITIONING"),("negative","CONDITIONING"),("latent_image","LATENT")],
       [111,"fixed",28,5.0,"dpmpp_2m","karras",1.0], 0),
 7:  ("VAEDecode", [1120,40], [("IMAGE","IMAGE")], [("samples","LATENT"),("vae","VAE")], [], 0),
 8:  ("SaveImage", [1120,300], [], [("images","IMAGE")], ["WAI_v17_v2_base"], 0),
 9:  ("UpscaleModelLoader", [760,420], [("UPSCALE_MODEL","UPSCALE_MODEL")], [], ["4x-AnimeSharp.pth"], 0),
 10: ("ImageUpscaleWithModel", [1120,480], [("IMAGE","IMAGE")], [("upscale_model","UPSCALE_MODEL"),("image","IMAGE")], [], 0),
 11: ("ImageScale", [1400,480], [("IMAGE","IMAGE")], [("image","IMAGE")], ["lanczos",1248,1824,"disabled"], 0),
 12: ("VAEEncode", [1680,480], [("LATENT","LATENT")], [("pixels","IMAGE"),("vae","VAE")], [], 0),
 13: ("KSampler", [1680,40], [("LATENT","LATENT")], [("model","MODEL"),("positive","CONDITIONING"),("negative","CONDITIONING"),("latent_image","LATENT")],
       [111,"fixed",20,5.0,"dpmpp_2m","karras",0.4], 0),
 14: ("VAEDecode", [2040,40], [("IMAGE","IMAGE")], [("samples","LATENT"),("vae","VAE")], [], 0),
 15: ("UltralyticsDetectorProvider", [760,620], [("BBOX_DETECTOR","BBOX_DETECTOR"),("SEGM_DETECTOR","SEGM_DETECTOR")], [], ["bbox/hand_yolov8s.pt"], 0),
 16: ("FaceDetailer", [2360,40], FD_OUT, FD_IN, fd(HAND_WC), 0),
 17: ("UltralyticsDetectorProvider", [760,760], [("BBOX_DETECTOR","BBOX_DETECTOR"),("SEGM_DETECTOR","SEGM_DETECTOR")], [], ["bbox/face_yolov8m.pt"], 0),
 18: ("FaceDetailer", [2720,40], FD_OUT, FD_IN, fd(""), 4),   # mode 4 = bypassed by default (enable for full-body/multi-char)
 19: ("SaveImage", [3080,40], [], [("images","IMAGE")], ["WAI_v17_v2_final"], 0),
}

LINKS = [
 (1,0,6,0,"MODEL"),(1,1,3,0,"CLIP"),(1,1,4,0,"CLIP"),(1,2,7,1,"VAE"),
 (3,0,6,1,"CONDITIONING"),(4,0,6,2,"CONDITIONING"),(5,0,6,3,"LATENT"),(6,0,7,0,"LATENT"),
 (7,0,8,0,"IMAGE"),(7,0,10,1,"IMAGE"),(9,0,10,0,"UPSCALE_MODEL"),(10,0,11,0,"IMAGE"),
 (11,0,12,0,"IMAGE"),(1,2,12,1,"VAE"),(12,0,13,3,"LATENT"),(1,0,13,0,"MODEL"),
 (3,0,13,1,"CONDITIONING"),(4,0,13,2,"CONDITIONING"),(13,0,14,0,"LATENT"),(1,2,14,1,"VAE"),
 (14,0,16,0,"IMAGE"),(1,0,16,1,"MODEL"),(1,1,16,2,"CLIP"),(1,2,16,3,"VAE"),
 (3,0,16,4,"CONDITIONING"),(4,0,16,5,"CONDITIONING"),(15,0,16,6,"BBOX_DETECTOR"),
 (16,0,18,0,"IMAGE"),(1,0,18,1,"MODEL"),(1,1,18,2,"CLIP"),(1,2,18,3,"VAE"),
 (3,0,18,4,"CONDITIONING"),(4,0,18,5,"CONDITIONING"),(17,0,18,6,"BBOX_DETECTOR"),(18,0,19,0,"IMAGE"),
]

links_json = [[i, s, ss, d, ds, t] for i,(s,ss,d,ds,t) in enumerate(LINKS, start=1)]
nodes_json = []
for order, (nid, (ntype, pos, outs, ins, wv, mode)) in enumerate(NODES.items()):
    inputs = []
    for slot, (name, typ) in enumerate(ins):
        lk = next((i for i,(s,ss,d,ds,t) in enumerate(LINKS, start=1) if d==nid and ds==slot), None)
        inputs.append({"name": name, "type": typ, "link": lk})
    outputs = [{"name": name, "type": typ, "slot_index": slot,
                "links": [i for i,(s,ss,d,ds,t) in enumerate(LINKS, start=1) if s==nid and ss==slot]}
               for slot,(name,typ) in enumerate(outs)]
    nodes_json.append({"id": nid, "type": ntype, "pos": pos, "size": [320,200], "flags": {},
                       "order": order, "mode": mode, "inputs": inputs, "outputs": outputs,
                       "properties": {"Node name for S&R": ntype}, "widgets_values": wv})

wf = {"last_node_id": max(NODES), "last_link_id": len(LINKS), "nodes": nodes_json,
      "links": links_json, "groups": [], "config": {}, "extra": {}, "version": 0.4}
out = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\user\default\workflows\illustrious_image__WAI_v17_QUALITY.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(wf, f, indent=2)
print("WROTE", out, "| nodes:", len(nodes_json), "links:", len(links_json))
EXPECT = {1:1,3:1,4:1,5:3,6:7,7:0,8:1,9:1,10:0,11:4,12:0,13:7,14:0,15:1,16:29,17:1,18:29,19:1}
bad = [(nid, len(NODES[nid][4]), EXPECT[nid]) for nid in NODES if len(NODES[nid][4]) != EXPECT[nid]]
print("widget-count mismatches:", bad if bad else "none")
