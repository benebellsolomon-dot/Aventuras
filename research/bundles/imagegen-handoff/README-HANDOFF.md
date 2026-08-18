# BE / Anime-NSFW Image-Gen Handoff — 2026-06-20

Self-contained handoff of the anime-NSFW / breast-expansion (BE) image-generation pipeline on
**WAI-illustrious-SDXL v17 + ComfyUI** (origin: `desktop-a26ivai`, RTX 4090). Carries the
strategy, presets, generators, full test record, montages, and the bridge integration so the
receiving machine can reproduce and continue.

It does **not** carry model weights (multi-GB; download per §3) or the ComfyUI install.

> **This bundle was REFRESHED 2026-06-20 (later same day)** to add the *tier-system* and
> *body-hold* research below (§5). The original v1–v8 / cup-calibration material is all still here.

> **REFRESHED again 2026-06-21** — the full max-quality recipe (dpmpp_2m/karras · 4x-AnimeSharp hires ·
> Detail Daemon · hand+face/eye detailer) is now on **all 6 bridge image presets**; artist/style blend
> validated; prompt builders polished. **➜ Wiring a new project? Read `NEW-PROJECT-INTEGRATION-GUIDE.md`
> first** — it's the self-contained how-to (API, routing, tier ladder, prompts, body-hold, required
> assets, checklist). The exact files to port are in `reference-source/`; the live presets in `bridge-presets/`.

---

## 1. What's in this bundle

```
BE-imagegen-handoff_2026-06-20/
├─ README-HANDOFF.md                 ← this file
├─ NEW-PROJECT-INTEGRATION-GUIDE.md  ← ★ START HERE to wire a new project (API, routing, tiers, prompts, assets)
├─ IMAGE-GENERATION-STRATEGY.md      ← AUTHORITATIVE spec / index (updated this session)
├─ be_image_quality_playbook.md      ← condensed prompt/settings reference
├─ reference-source/                 ← the exact files to PORT (contract + tier/prompt impls + routing)
│   ├─ models.py                     ← /image request contract (ImageGenRequest)
│   ├─ main.py                       ← preset routing + token-dict builder
│   ├─ be_prompt.py                  ← tier ladder + prompt assembly (manga)
│   └─ illustrious-prompt-builder.ts ← tier ladder + prompt assembly (color-anime; artist/style block)
├─ bridge-presets/                   ← the 6 LIVE bridge image presets (full max-quality recipe)
│   ├─ illustrious_image.json (default) / _ipa / _styled_ipa / _styled_ipa_img2img / _openpose_faceid / colorize
├─ presets/                          ← ComfyUI GUI workflows (manual/standalone use)
├─ quality-upgrade/                  ← full research + testing record (reports, harnesses, manifests)
├─ montages/                         ← curated contact sheets / comparison grids (the visual evidence)
└─ test-images/                      ← v1–v8 test renders the early reports reference
```

Read order: **IMAGE-GENERATION-STRATEGY.md** → §3/§5 there → the topic reports in `quality-upgrade/`.

---

## 2. Quick start (ST machine)
1. Install ComfyUI portable (origin: embedded Python 3.13 + torch cu13x).
2. Install custom nodes + pip deps + models (§3).
3. GUI presets → `ComfyUI/user/default/workflows/`; bridge presets are loaded by si-animator-bridge.
4. `gen_*.py` harnesses POST API-format graphs to `127.0.0.1:8188/prompt` and poll `/history`,
   writing a `*_manifest.json`; `make_*.py` build the montages in `montages/`.

---

## 3. Reproduction requirements

### Custom nodes
Impact-Pack, comfyui_controlnet_aux (DWPose preprocessor), ComfyUI_IPAdapter_plus, Autocomplete-Plus,
Manager. (DanTagGen wedges the py3.13 build — prefer Autocomplete-Plus.)

### pip (embedded python)
- HandRefiner: `yacs timm trimesh` + `--no-deps mediapipe absl-py flatbuffers sounddevice`.
- **FaceID (v2.5, NEW):** `onnxruntime onnx scikit-image` + **insightface 0.7.3** from the Gourieff
  prebuilt **cp313** wheel installed **`--no-deps`** (no official py3.13 wheel; `--no-deps` avoids an
  opencv reinstall that clobbers ComfyUI's cv2). Then **patch** `insightface/app/__init__.py` to make
  the `mask_renderer` import optional (it pulls albumentations→opencv). See `quality-upgrade/install_faceid.ps1`.

### Model files (download separately)
| File | dir | role |
|---|---|---|
| `waiIllustriousSDXL_v170.safetensors` | checkpoints | base |
| `Breast_Size_Slider_Illustrious_V2.safetensors` | loras | size dial |
| `hyper_breasts_ILXL_concept.safetensors` | loras | extreme size |
| `Smooth_Booster_v5.safetensors` | loras | quality booster |
| `illustriousXLDepth_v20.safetensors` | controlnet | HandRefiner depth |
| **`controlnet-openpose-sdxl-xinsir.safetensors`** | controlnet | **v2.5 OpenPose pose-lock** (curl from HF — hf_hub xet hangs) |
| **`ip-adapter-plus-face_sdxl_vit-h.safetensors`** | ipadapter | plus-face identity (clothed) |
| **`ip-adapter-faceid-plusv2_sdxl.bin`** | ipadapter | **FaceID identity (all paths)** |
| **`ip-adapter-faceid-plusv2_sdxl_lora.safetensors`** | loras | FaceID LoRA |
| **`buffalo_l/*.onnx`** | insightface/models/buffalo_l | insightface face detect/embed |
| DWPose: `yolox_l.torchscript.pt`, `dw-ll_ucoco_384_bs5.torchscript.pt` | comfyui_controlnet_aux/ckpts/hr16/… | pose detect |
| `4x-AnimeSharp.pth` / `hand_yolov8s.pt` | upscale_models / ultralytics/bbox | hires / hand-detailer |

---

## 4. State of the work — base pipeline (v1–v8, unchanged)
Sampler+pipeline defaults (dpmpp_2m karras CFG5, 4x-AnimeSharp hires 0.4, hand-detailer), size
ladder (`huge` ceiling), cup-size dial, `(deep cleavage:1.2)` separation, failure-mode strain,
supine gravity, arched pose+navel, affect, matte skin, multi-subject de-fusion, hands
(general/contact/HandRefiner), growth/burst sequences. Open: side-lying lateral-pool gravity.

## 5. This session's additions (tier system + body-hold)

**Production tier ladder validated + v2.2 hyper-band recalibration.** The cup-tag-primary ladder
(tier→cup tag + slider + hyper; in comic-continuer `be_prompt.py` ⇄ Vellum
`illustrious-prompt-builder.ts`, bit-exact) was swept end-to-end. Found + fixed a non-monotonic
**dip at the gigantic→hyper seam** and **top-band compression** → slider held 0.5→0.6, hyper ramp
0.5→0.85. `TIER-LADDER-REPORT.md`.

**Hyper-band full suite** — robust across framing/pose/seed/manga register (`HYPER-BAND-SUITE-REPORT.md`).
**Nude path** — monotonic on bare skin, no censoring, maturity guard holds at flat/small
(`NUDE-LADDER-REPORT.md`).

**Body-hold (keep body fixed, breasts grow) — SOLVED via OpenPose + FaceID.** Root cause: the size
LoRAs are global, so per-tier txt2img drifts the whole body.
- ❌ **Chained img2img FAILED** (holds body but mutes growth + degrades) — see `EXPANSION-BODY-HOLD-REPORT.md` (superseded banner).
- ✅ **Method = OpenPose CN (pose-lock) + body-pin/anti-thick (build-lock) + IPAdapter FaceID
  (identity-lock) + full-denoise txt2img (full growth).** Validated 4 builds (petite/curvy/full/
  athletic) × clothed/nude: full flat→hyper growth + build-lock + tight identity + clean tone +
  maturity-safe. FaceID (insightface) beats plus-face, which washed out nude skin tone.
  **`OPENPOSE-BODY-HOLD-REPORT.md` is the authoritative method doc.**

**Bridge integration (v2.5).** New preset `presets/illustrious_image_openpose_faceid.json`; the
bridge routes to it when an `ImageGenRequest.pose_face_anchor_b64` is supplied (the anchor frame is
both the OpenPose pose source and the FaceID identity reference). New request fields:
`pose_face_anchor_b64`, `openpose_strength`, `faceid_weight`, `faceid_weight_v2`,
`faceid_lora_strength`. 96 bridge tests green. **Caller side** (comic-continuer/Vellum sending the
anchor for expansion scenes) is the remaining follow-up.

### Key montages (in `montages/`)
`tier_ladder_torso*.png` (ladder), `hyper_band_montage.png`, `hyper_suite_*.png`, `nude_ladder_*.png`,
`growth_recheck.png` (img2img-fail proof), `openpose_vs_ladder.png`, `openpose_suite_{clothed,nude}.png`,
`faceid_suite_{clothed,nude}.png`, `faceid_tone_compare.png` (FaceID fixes nude washout),
`face_identity_compare.png`.

---
*Refreshed 2026-06-20. Canonical docs on origin (`D:\LLM\IMAGE-GENERATION-STRATEGY.md`,
`quality-upgrade/`) are source of truth; this README is orientation.*
