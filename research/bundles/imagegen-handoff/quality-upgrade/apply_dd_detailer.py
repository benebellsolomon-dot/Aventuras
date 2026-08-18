r"""Replicate the Detail Daemon hires chain + hand/face detailer (from illustrious_image.json) into
the 3 variant bridge presets. Reads each preset's EXISTING hires KSampler (200:148) to reuse its
model + conditioning refs (so openpose_faceid keeps its CN-applied hires conditioning automatically),
swaps it for the SamplerCustomAdvanced + Detail Daemon chain, appends the hand+face detailer
(detailer uses PLAIN conditioning 200:120/200:121 + the preset's final model), rewires SaveImage."""
import json

PRESETS_DIR = r"D:\LLM\si-animator-bridge\src\presets"
TARGETS = [
    "illustrious_image_ipa.json",
    "illustrious_image_styled_ipa.json",
    "illustrious_image_openpose_faceid.json",
]


def transform(path):
    g = json.load(open(path, encoding="utf-8"))
    ks = g.get("200:148")
    assert ks and ks["class_type"] == "KSampler", f"{path}: 200:148 not a KSampler (already migrated?)"
    model_ref = ks["inputs"]["model"]          # final model node (ipa=118 / styled=112 chain / faceid=113)
    pos_ref = ks["inputs"]["positive"]          # hires conditioning (openpose uses CN-applied 200:123)
    neg_ref = ks["inputs"]["negative"]
    latent_ref = ks["inputs"]["latent_image"]   # model-upscale VAEEncode (200:147)

    # --- Detail Daemon hires chain (replaces the plain KSampler at 200:148) ---
    g["200:148a"] = {"inputs": {"sampler_name": "{{SAMPLER}}"}, "class_type": "KSamplerSelect", "_meta": {"title": "Base sampler for Detail Daemon"}}
    g["200:148b"] = {"inputs": {"sampler": ["200:148a", 0], "detail_amount": 0.18, "start": 0.2, "end": 0.8, "bias": 0.5, "exponent": 1.0, "start_offset": 0.0, "end_offset": 0.0, "fade": 0.0, "smooth": True, "cfg_scale_override": 0.0}, "class_type": "DetailDaemonSamplerNode", "_meta": {"title": "Detail Daemon"}}
    g["200:148c"] = {"inputs": {"model": model_ref, "scheduler": "{{SCHEDULER}}", "steps": "{{STEPS_HIRES}}", "denoise": "{{HIRES_DENOISE}}"}, "class_type": "BasicScheduler", "_meta": {"title": "Hires sigmas"}}
    g["200:148d"] = {"inputs": {"noise_seed": "{{SEED_HIRES}}"}, "class_type": "RandomNoise", "_meta": {"title": "Hires noise"}}
    g["200:148e"] = {"inputs": {"model": model_ref, "positive": pos_ref, "negative": neg_ref, "cfg": "{{CFG}}"}, "class_type": "CFGGuider", "_meta": {"title": "Hires guider"}}
    g["200:148"] = {"inputs": {"noise": ["200:148d", 0], "guider": ["200:148e", 0], "sampler": ["200:148b", 0], "sigmas": ["200:148c", 0], "latent_image": latent_ref}, "class_type": "SamplerCustomAdvanced", "_meta": {"title": "Hires-fix refine (Detail Daemon via SamplerCustomAdvanced)"}}

    # --- hand + face/eye detailer (plain conditioning 200:120/200:121, final model) ---
    g["200:170"] = {"inputs": {"model_name": "bbox/hand_yolov8s.pt"}, "class_type": "UltralyticsDetectorProvider", "_meta": {"title": "Hand detector"}}
    g["200:171"] = {"inputs": {"image": ["200:150", 0], "model": model_ref, "clip": ["200:105", 0], "vae": ["200:101", 2], "guide_size": 512.0, "guide_size_for": True, "max_size": 1024.0, "seed": "{{SEED}}", "steps": 20, "cfg": "{{CFG}}", "sampler_name": "{{SAMPLER}}", "scheduler": "{{SCHEDULER}}", "positive": ["200:120", 0], "negative": ["200:121", 0], "denoise": 0.45, "feather": 5, "noise_mask": True, "force_inpaint": True, "bbox_threshold": 0.5, "bbox_dilation": 4, "bbox_crop_factor": 2.0, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "bbox_detector": ["200:170", 0], "wildcard": "(perfect hands, five fingers, detailed fingers:1.1)", "cycle": 1}, "class_type": "FaceDetailer", "_meta": {"title": "Hand-detailer"}}
    g["200:172"] = {"inputs": {"model_name": "bbox/face_yolov8m.pt"}, "class_type": "UltralyticsDetectorProvider", "_meta": {"title": "Face detector"}}
    g["200:173"] = {"inputs": {"image": ["200:171", 0], "model": model_ref, "clip": ["200:105", 0], "vae": ["200:101", 2], "guide_size": 512.0, "guide_size_for": True, "max_size": 1024.0, "seed": "{{SEED}}", "steps": 20, "cfg": "{{CFG}}", "sampler_name": "{{SAMPLER}}", "scheduler": "{{SCHEDULER}}", "positive": ["200:120", 0], "negative": ["200:121", 0], "denoise": 0.4, "feather": 5, "noise_mask": True, "force_inpaint": True, "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3.0, "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93, "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "drop_size": 10, "bbox_detector": ["200:172", 0], "wildcard": "detailed face, detailed eyes", "cycle": 1}, "class_type": "FaceDetailer", "_meta": {"title": "Face-detailer (faces + eyes)"}}

    # rewire SaveImage (200:160) to the face detailer output
    g["200:160"]["inputs"]["images"] = ["200:173", 0]

    json.dump(g, open(path, "w", encoding="utf-8"), indent=2)
    print("  migrated %-44s model=%s hires_pos=%s" % (path.split("\\")[-1], model_ref, pos_ref))


import os  # noqa: E402
for t in TARGETS:
    transform(os.path.join(PRESETS_DIR, t))
print("DONE")
