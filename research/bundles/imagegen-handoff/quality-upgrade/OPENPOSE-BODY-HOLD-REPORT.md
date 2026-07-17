# OpenPose Body-Hold — full tier growth with pose/body locked (THE method)

**Date:** 2026-06-20 · **Model:** WAI-illustrious-SDXL v17 · **CN:** xinsir OpenPose SDXL.
Supersedes the chained-img2img approach in `EXPANSION-BODY-HOLD-REPORT.md`, which **failed on
growth** (see that file's correction banner).

## Why img2img failed and OpenPose wins
- **Chained img2img** anchors each frame to the previous breast size; at the denoise needed to hold
  the body (~0.5) the per-step growth is tiny, so a full ladder reaches only ~large/huge, never
  hyper — and chaining many steps degrades into grain/static (worse with non-ancestral samplers).
  Body held, growth lost.
- **OpenPose ControlNet + txt2img**: each tier is a fresh **full-denoise txt2img** (so the
  slider/cup/hyper grow breasts at FULL strength = ladder magnitude), while an OpenPose skeleton
  (shoulders/arms/hips/head — **no breast keypoints**) holds pose + body framing. No chaining → no
  degradation. Growth full, body held, quality clean.

## Pipeline
1. Render a base body once (txt2img, the chosen build, tier ~14) → the pose source.
2. `DWPreprocessor` (DWPose, `scale_stick_for_xinsr_cn=enable`) → OpenPose skeleton.
3. `ControlNetLoader(controlnet-openpose-sdxl-xinsir.safetensors)`.
4. Per tier: `ControlNetApplyAdvanced(pose, strength 1.0, 0→1.0)` on (positive_tier, negative) →
   `KSampler(empty latent, denoise 1.0, tier slider/hyper LoRAs)` → decode.
5. Hold the build with body-pin tags + anti-thick negatives (per build); identity via fixed seed
   (add IPAdapter-FACE for tighter identity if needed).

Harnesses: `gen_openpose_growth.py` (single build), `gen_openpose_suite.py` (4 builds × clothed/nude).

## Results — full matrix PASS
Swept 4 builds (petite/curvy/full/athletic) × {clothed, nude} × 10 tiers (0→50). Grids:
`openpose_suite_clothed.png`, `openpose_suite_nude.png`; vs-ladder check `openpose_vs_ladder.png`.

- **Full tier bust growth restored** — every build grows flat→hyper at ladder magnitude (the
  vs-ladder comparison confirms OpenPose ≈ txt2img ladder; img2img stalled at large/huge).
- **Build-lock holds** — petite slim, curvy hourglass, full thick, athletic abs; each consistent
  across its whole tier row and distinct from the others at every tier.
- **Pose/framing locked** by the CN; **quality clean** (independent txt2img, no chaining grain).
- **Nude path**: bare-anatomy coherent (nipples/areola, separation, no fusion at hyper); **maturity
  guard holds** at the flat-nude bases for all builds.

## Install (done 2026-06-20)
- ControlNet model: `controlnet-openpose-sdxl-xinsir.safetensors` (2386 MB, xinsir/controlnet-
  openpose-sdxl-1.0) → `ComfyUI/models/controlnet/`. **Download via curl, NOT huggingface_hub** —
  hf_hub's xet backend hangs on this repo's large file; `curl -L` from the HF resolve URL works.
- DWPose detectors pre-staged (same curl method) to `comfyui_controlnet_aux/ckpts/`:
  `hr16/yolox-onnx/yolox_l.torchscript.pt` (208 MB), `hr16/DWPose-TorchScript-BatchSize5/
  dw-ll_ucoco_384_bs5.torchscript.pt` (129 MB). ComfyUI auto-registers the CN (no restart needed).

## Identity lock — IPAdapter-FACE refinement (added 2026-06-20, validated)
OpenPose locks pose but NOT face identity (each tier is a fresh txt2img, so the face drifts).
Fix: add **IPAdapter PLUS FACE** (`ip-adapter-plus-face_sdxl_vit-h` + `CLIP-ViT-H-14`) patching the
model on each tier, referencing the base person's face.

**Critical detail — reference a FACE CROP, not the full base image.** Feeding the full base
(which has t14-size breasts) as the IPA reference mildly **suppresses top-end growth** (the
reference body pulls size down). Cropping the base to the face region (`ImageCrop`, e.g.
x216 y16 400×400 on an 832×1216 cowboy shot) makes IPA carry identity ONLY → **tightest identity
lock AND full growth restored** (≈ openpose-only magnitude). Config: `weight_type="linear"`,
`weight 0.8`, `embeds_scaling="V only"`. Verified: `face_identity_compare.png` (3-row: openpose-
only drifts < IPA-full-body < IPA-face-crop tightest) and `ipa_growth_compare.png` (face-crop
restores the growth the full-body ref suppressed). Harness: `gen_openpose_ipa_v2.py`.
Minor (clothed): IPA adds a slight warm/brighten cast; weight ~0.7 keeps it negligible. For
multiple distinct characters, swap the face-crop reference per character.

### Identity method comparison — plus-face vs FaceID (both tested across 4 builds × clothed/nude)
| | IPA **plus-face** (`ip-adapter-plus-face`, CLIP-vision ref) | IPA **FaceID PLUS V2** (insightface embeddings) |
|---|---|---|
| Identity lock | tight | tight |
| Growth + build-lock | ✅ | ✅ |
| Clothed tone | ✅ (mild brighten) | ✅ clean |
| **Nude tone** | ✗ **washes out** (bright ref dominates all-skin figure; weight/start_at/K+V only partially help) | ✅ **clean** (embeddings carry identity, not global image stats) |

**→ RECOMMENDED: IPAdapter FaceID PLUS V2 for identity on BOTH clothed and nude.** It fixes the
plus-face nude washout. Config: `IPAdapterUnifiedLoaderFaceID(preset "FACEID PLUS V2",
lora_strength 0.6, provider CPU)` → `IPAdapterFaceID(weight 0.8, weight_faceidv2 1.0,
weight_type linear, embeds_scaling "V only")`, reference = the **full base image** (insightface
detects the face itself — no crop needed). Validated `gen_faceid_suite.py`; comparison
`faceid_tone_compare.png` (non-IPA vs plus-face-washed vs FaceID-clean), grids
`faceid_suite_{clothed,nude}.png`. plus-face remains a fine cheaper option for CLOTHED-only.

**Install (FaceID, done 2026-06-20):** insightface 0.7.3 (Gourieff prebuilt **cp313** wheel — no
official py3.13 wheel; install **--no-deps** to avoid clobbering ComfyUI's opencv) + onnxruntime +
onnx + scikit-image; **patch** `insightface/app/__init__.py` to make the `mask_renderer` import
(pulls albumentations→opencv) optional. Models: `ip-adapter-faceid-plusv2_sdxl.bin` (→ipadapter),
`ip-adapter-faceid-plusv2_sdxl_lora.safetensors` (→loras), `buffalo_l` insightface model
(→models/insightface/models/buffalo_l). Provider CPU (avoids onnxruntime-gpu/CUDA conflict).

## Caveats / next
- For **product expansion scenes**: generate each panel as OpenPose-locked txt2img sharing one
  extracted skeleton (+ fixed seed + body-pin), not chained img2img. The bridge would need an
  OpenPose preset (CN loader + DWPose + apply) — see the product-integration task.
- ControlNet strength 1.0 used; if pose feels over-constrained for dynamic shots, drop to ~0.7.
