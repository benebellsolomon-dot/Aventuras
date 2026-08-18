"""Deterministic generator for the WAI v17 quality preset (ComfyUI UI workflow format).
Defines nodes + links once; computes the inputs[].link and outputs[].links arrays.
Run with the embedded python. Writes the workflow into user/default/workflows/.
"""
import json, os

NEG = ("worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions, "
       "missing fingers, extra digits, fused fingers, jpeg artifacts, signature, watermark, username, "
       "text, blurry, sketch, monochrome, greyscale, multiple views, oldest, censored, mosaic censoring, "
       "bar censor, child, loli, baby face, chibi")
DTG_SEED = "1girl, solo, mature female, adult, huge breasts, blue bikini, beach"

# id: (type, pos, [output (name,type)], [input (name,type[,widgetname])], widgets_values)
NODES = {
 1:  ("CheckpointLoaderSimple", [40,40],  [("MODEL","MODEL"),("CLIP","CLIP"),("VAE","VAE")], [], ["waiIllustriousSDXL_v170.safetensors"]),
 2:  ("PromptDanTagGen", [40,220], [("output","STRING"),("llm_output","STRING")], [],
       ["KBlueLeaf/DanTagGen-delta-rev2","","","", "", DTG_SEED, "", "nsfw", "long", 832, 1216, False, 1.35]),
 3:  ("CLIPTextEncode", [470,40], [("CONDITIONING","CONDITIONING")], [("clip","CLIP"),("text","STRING","text")], [""]),
 4:  ("CLIPTextEncode", [470,320], [("CONDITIONING","CONDITIONING")], [("clip","CLIP")], [NEG]),
 5:  ("EmptyLatentImage", [470,560], [("LATENT","LATENT")], [], [832,1216,1]),
 6:  ("KSampler", [860,40], [("LATENT","LATENT")],
       [("model","MODEL"),("positive","CONDITIONING"),("negative","CONDITIONING"),("latent_image","LATENT")],
       [123456789,"fixed",28,6.0,"euler_ancestral","normal",1.0]),
 7:  ("VAEDecode", [1220,40], [("IMAGE","IMAGE")], [("samples","LATENT"),("vae","VAE")], []),
 8:  ("SaveImage", [1220,300], [], [("images","IMAGE")], ["WAI_v17_QUALITY_base"]),
 9:  ("UpscaleModelLoader", [860,440], [("UPSCALE_MODEL","UPSCALE_MODEL")], [], ["4x-AnimeSharp.pth"]),
 10: ("ImageUpscaleWithModel", [1220,500], [("IMAGE","IMAGE")], [("upscale_model","UPSCALE_MODEL"),("image","IMAGE")], []),
 11: ("ImageScale", [1500,500], [("IMAGE","IMAGE")], [("image","IMAGE")], ["lanczos",1248,1824,"disabled"]),
 12: ("VAEEncode", [1780,500], [("LATENT","LATENT")], [("pixels","IMAGE"),("vae","VAE")], []),
 13: ("KSampler", [1780,40], [("LATENT","LATENT")],
       [("model","MODEL"),("positive","CONDITIONING"),("negative","CONDITIONING"),("latent_image","LATENT")],
       [123456789,"fixed",20,6.0,"euler_ancestral","normal",0.4]),
 14: ("VAEDecode", [2140,40], [("IMAGE","IMAGE")], [("samples","LATENT"),("vae","VAE")], []),
 15: ("UltralyticsDetectorProvider", [860,640], [("BBOX_DETECTOR","BBOX_DETECTOR"),("SEGM_DETECTOR","SEGM_DETECTOR")], [], ["bbox/face_yolov8m.pt"]),
 16: ("FaceDetailer", [2460,40], [("image","IMAGE"),("cropped_refined","IMAGE"),("cropped_enhanced_alpha","IMAGE"),("mask","MASK"),("detailer_pipe","DETAILER_PIPE"),("cnet_images","IMAGE")],
       [("image","IMAGE"),("model","MODEL"),("clip","CLIP"),("vae","VAE"),("positive","CONDITIONING"),("negative","CONDITIONING"),("bbox_detector","BBOX_DETECTOR")],
       [768, True, 1024, 0, "fixed", 20, 6.0, "euler_ancestral", "normal", 0.45, 5, True, True, 0.5, 10, 3.0,
        "center-1", 0, 0.93, 0, 0.7, "False", 10, "", 1, False, 20, False, False]),
 17: ("SaveImage", [2820,40], [], [("images","IMAGE")], ["WAI_v17_QUALITY_final"]),
}

# (src_id, src_slot, dst_id, dst_slot, type)
LINKS = [
 (1,0,6,0,"MODEL"), (1,1,3,0,"CLIP"), (1,1,4,0,"CLIP"), (1,2,7,1,"VAE"),
 (2,0,3,1,"STRING"), (3,0,6,1,"CONDITIONING"), (4,0,6,2,"CONDITIONING"), (5,0,6,3,"LATENT"),
 (6,0,7,0,"LATENT"), (7,0,8,0,"IMAGE"), (7,0,10,1,"IMAGE"), (9,0,10,0,"UPSCALE_MODEL"),
 (10,0,11,0,"IMAGE"), (11,0,12,0,"IMAGE"), (1,2,12,1,"VAE"), (12,0,13,3,"LATENT"),
 (1,0,13,0,"MODEL"), (3,0,13,1,"CONDITIONING"), (4,0,13,2,"CONDITIONING"), (13,0,14,0,"LATENT"),
 (1,2,14,1,"VAE"), (14,0,16,0,"IMAGE"), (1,0,16,1,"MODEL"), (1,1,16,2,"CLIP"), (1,2,16,3,"VAE"),
 (3,0,16,4,"CONDITIONING"), (4,0,16,5,"CONDITIONING"), (15,0,16,6,"BBOX_DETECTOR"), (16,0,17,0,"IMAGE"),
]

links_json = []
for i, (sid, sslot, did, dslot, t) in enumerate(LINKS, start=1):
    links_json.append([i, sid, sslot, did, dslot, t])

nodes_json = []
for order, (nid, (ntype, pos, outs, ins, wv)) in enumerate(NODES.items()):
    inputs = []
    for slot, idef in enumerate(ins):
        name, typ = idef[0], idef[1]
        lk = next((i for i,(s,ss,d,ds,t) in enumerate(LINKS, start=1) if d==nid and ds==slot), None)
        entry = {"name": name, "type": typ, "link": lk}
        if len(idef) == 3:  # widget-converted input
            entry["widget"] = {"name": idef[2]}
        inputs.append(entry)
    outputs = []
    for slot, (name, typ) in enumerate(outs):
        ls = [i for i,(s,ss,d,ds,t) in enumerate(LINKS, start=1) if s==nid and ss==slot]
        outputs.append({"name": name, "type": typ, "links": ls, "slot_index": slot})
    nodes_json.append({
        "id": nid, "type": ntype, "pos": pos, "size": [320, 200], "flags": {},
        "order": order, "mode": 0, "inputs": inputs, "outputs": outputs,
        "properties": {"Node name for S&R": ntype}, "widgets_values": wv,
    })

wf = {"last_node_id": max(NODES), "last_link_id": len(LINKS), "nodes": nodes_json,
      "links": links_json, "groups": [], "config": {}, "extra": {}, "version": 0.4}

out = r"D:\LLM\ComfyUI_windows_portable\ComfyUI\user\default\workflows\illustrious_image__WAI_v17_QUALITY.json"
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(wf, f, indent=2)
print("WROTE", out)
print("nodes:", len(nodes_json), "links:", len(links_json))
# widget-count sanity
EXPECT = {1:1,2:13,3:1,4:1,5:3,6:7,7:0,8:1,9:1,10:0,11:4,12:0,13:7,14:0,15:1,16:29,17:1}
bad = [(nid, len(NODES[nid][4]), EXPECT[nid]) for nid in NODES if len(NODES[nid][4]) != EXPECT[nid]]
print("widget-count mismatches:", bad if bad else "none")
