# Image Generation Strategy — D:\LLM

Canonical, cross-project spec for anime NSFW / breast-expansion (BE) image generation on this PC.
Serves comic-continuer, scene-illustrator, and related projects (which call image gen through
**si-animator-bridge `/image` → ComfyUI on localhost**, not ComfyUI directly).

**Confirmed in place 2026-06-19** (full verification pass: presets, nodes, deps, models, services all green).
Detailed working docs live in `D:\LLM\ComfyUI_windows_portable\quality-upgrade\`; this file is the index + spec.

> **Wiring a NEW project?** Start with `handoff/NEW-PROJECT-INTEGRATION-GUIDE.md` (in the BE-imagegen
> handoff zip) — self-contained: `/image` API contract, preset routing, the tier ladder, prompt/negative
> construction, the artist/style block, body-hold, required ComfyUI assets, and a porting checklist.
> The zip's `reference-source/` carries the exact files to port (models.py, main.py, be_prompt.py,
> illustrious-prompt-builder.ts).

---

## 1. Stack
- **Base model:** `waiIllustriousSDXL_v170.safetensors` (WAI-illustrious-SDXL v17 — Illustrious/SDXL, NSFW finetune). Primary for all BE work; raw `Illustrious-XL-v2.0` kept only as fallback.
- **Runtime:** ComfyUI portable, `D:\LLM\ComfyUI_windows_portable\` (embedded Python 3.13, torch 2.11+cu130), RTX 4090 24GB. Auto-starts at logon (Task Scheduler `comfyui`), bound `0.0.0.0:8188`, tailnet-exposed (firewall `ComfyUI (Tailscale)`).
- **Cloud companion:** NovelAI V4.5 Full (ideation + two-character scenes only; cannot run locally — see [research report]).

## 2. Pipelines (GUI presets in `ComfyUI/user/default/workflows/`)
| Preset | Use | Chain |
|---|---|---|
| `illustrious_image__WAI_v17_QUALITY.json` | General BE | WAI v17 → 4x-AnimeSharp hires-fix (denoise 0.4) → hand-detailer → FaceDetailer (bypassed; enable for full-body/multi-char) |
| `illustrious_image__WAI_v17_INTIMATE_handrefiner.json` | Solo/intimate, contact-heavy | + contact hand-detailer (contact wildcard, denoise 0.55) → **HandRefiner** (MeshGraphormer+ImpactDetector depth → `illustriousXLDepth_v20` ControlNet → masked hand inpaint denoise 0.5) |

**Core sampler/pipeline defaults (both):** `dpmpp_2m` + `karras`, **CFG 5**, 28 steps base / 20 fix; 832×1216 portrait; matte skin (no `shiny skin`).

**Max-quality recipe — 2026-06-21 bake-off (`quality-upgrade/QUALITY-BAKEOFF-REPORT.md`):** greedy
bake-off confirmed `dpmpp_2m/karras` (crisper than euler_ancestral/normal — **now the production
default**, applied in be_prompt.py ⇄ Vellum builder ⇄ bridge ImageGenRequest), CFG 5, 28/18 steps,
smooth_booster 0.5. **Biggest single win: hires = 4x-AnimeSharp model-upscale 1.5× → KSampler d0.4**
(beats latent upscale — **now APPLIED** to all bridge image presets: illustrious_image + _ipa +
_styled_ipa + _openpose_faceid, via VAEDecode→UpscaleModel→ImageScaleBy 0.375→VAEEncode;
bridge tests green + live smoke validated). The **hand + face/eye detailer** (Impact Pack FaceDetailer,
the largest quality fix per the playbook) is **now in the main bridge preset** (after hires, live-validated);
variant replication is a flagged follow-up. **Artist-tag house blend** (Danbooru-verified, the biggest
*style* lever): default `(as109:0.9), (rella:0.8), (ciloranko:0.7)` after character/series on the
COLOR-anime path (NOT comic-continuer manga) — `quality-upgrade/ARTIST-TAGS-REPORT.md`.
**Detail Daemon (detail_amount 0.18) ADOPTED into the main preset hires pass** (SamplerCustomAdvanced
+ DetailDaemonSamplerNode); validated by a **10-case full-suite test** (`fullsuite_montage.png`:
tier 6→45 + hands/faces/full-body/two-char/nude — all pass, detailers firing). 2x-AnimeSharpV4 ≈ 4x
(kept 4x); FreeU/PAG/SEG installed as optional hero toggles. Full SOTA gap map: `quality-upgrade/SOTA-GAP-ANALYSIS.md`.
**Best anime style:** `(highly detailed, intricate, sharp focus)` always-on; `(semi-realistic, realistic
skin, volumetric lighting)` or `(ultra-detailed, 8k, intricate)` for hero shots; cel/retro/pastel
flatter, vibrant adds gloss. *(Note: open both presets once in the GUI to confirm rendering — node graphs validated against live schemas, but UI-graph rendering isn't headlessly verifiable.)*

## 3. Prompt playbook (essentials — full version: `quality-upgrade/BE-PROMPT-PLAYBOOK.md`)
- **Quality prefix:** `masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres`
- **Maturity guard (mandatory):** `mature female, adult` + `curvy, wide hips, collarbone`; negatives `child, loli, baby face, chibi`.
- **Size:** one size tag; `huge` is the coherence ceiling for stills — reach bigger via garment-failure framing or the slider (§4).
- **Separation:** `(deep cleavage:1.2), cleavage`. **Never `between breasts`/`inter-breast shadow`** (summons a phantom object in the cleavage, worst in 2-char shots).
- **Strain (failure-mode block):** `taut fabric, stress folds, gaping shirt, popped button, torn seam, asymmetric strain, fabric puckering at seams`. Rigid garments (swimsuit/leotard) sell strain best.
- **Gravity:** `hanging/heavy/soft/sagging breasts, soft tissue compression, cast shadow under breast`; supine → `breasts spreading to sides, flattened` + **drop deep-cleavage on reclining**.
- **Hands:** hand-detailer pass is the biggest single quality fix; on-breast contact → contact-deformation tags + hand-detailer denoise 0.55 fed the contact prompt; finger geometry on grips → HandRefiner (intimate preset).
- **Negatives (standard):** quality + anatomy + hands (`fused/mutated/extra fingers`) + fusion (`fused breasts, uniboob`) + prop (`object between breasts, phone, can…`) + specular (`plastic skin, glossy specular, wet sheen`).

## 4. Size dial — cup calibration (`Breast_Size_Slider_Illustrious_V2`, LoraLoader model+clip)
Calibrated slider weight → apparent cup (WAI v17, fixed seed; ordinal/approximate ±0.5–1 grade):

| Cup | Slider | | Cup | Slider |
|---|---|---|---|---|
| D | 0.5 | | G | 2.0 |
| E | 1.0 | | G/H | 2.5 |
| F | 1.5 | | H/I | 3.0 |

- **D–F:** 0.25 steps from 0.5 (half-cups 0.75/1.25); don't go below 0.5 (flat there). Anchor `large breasts`.
- **G–H:** 0.5 steps suffice (G=2.0, H=3.0). Anchor `huge breasts`.
- **Always fix the seed** for A/B size comparison. Rate ≈ 1 cup / 0.5 step (non-linear). Full report: `quality-upgrade/CUP-CALIBRATION-REPORT.md`.

## 5. Growth / expansion sequences (multi-image)
A still can't carry growth; a **sequence** does: same seed + character; `Breast_Size_Slider_Illustrious_V2` at increasing weight (0→4) + `hyper_breasts_ILXL_concept` (~0.7) on the final frame; reinforce with size tag + clothing strain→burst + escalating reaction. Best burst = slider 4.0 + `torn shirt, flying button, bursting breasts`. For tight identity/outfit lock across frames, hold clothing tags constant + IPAdapter PLUS FACE. Harness: `quality-upgrade/gen_growth_sequence.py`. (Animated growth → Wan 2.2 I2V + BE motion LoRA, separate pipeline.)

**Body-hold (keep the body fixed while only the breasts grow) — 2026-06-20:** the size LoRAs are
*global* model modifiers, so per-size **txt2img drifts the whole body** (build/hips/waist/identity),
and the BE/hyper LoRAs bias toward a curvier figure. **Method = OpenPose ControlNet + txt2img.**
Extract one OpenPose skeleton (`DWPreprocessor`, `scale_stick_for_xinsr_cn=enable`) from a base
render, then render each tier as a **full-denoise txt2img** with that skeleton applied
(`ControlNetApplyAdvanced`, strength 1.0) + the tier's slider/cup/hyper. OpenPose has **no breast
keypoints**, so breasts grow at FULL ladder magnitude (flat→hyper) while the skeleton locks
pose/framing; no chaining → clean quality. Hold the build with a constant **body-build pin**
(`petite, narrow waist, narrow hips…` — choose+lock petite/curvy/full/athletic) + **anti-thick
negatives** (`wide hips, thick thighs, plump, fat, weight gain`). **Identity lock = IPAdapter FaceID
PLUS V2** (insightface) for BOTH clothed and nude — `IPAdapterUnifiedLoaderFaceID` (preset "FACEID
PLUS V2", lora_strength 0.6, provider CPU) → `IPAdapterFaceID` (weight 0.8, weight_faceidv2 1.0,
linear, "V only"), reference = full base image (insightface finds the face). Validated 4 builds ×
clothed/nude: full growth + build-lock + tight identity + clean tone + maturity-safe
(`gen_faceid_suite.py`). ⚠️ The older IPA **plus-face** (`ip-adapter-plus-face`, CLIP-vision ref)
also locks identity but **washes out the NUDE skin tone** (weight/start_at/K+V only partially help) —
use FaceID for nude; plus-face is fine for clothed-only. Reports: `OPENPOSE-BODY-HOLD-REPORT.md`,
`faceid_tone_compare.png`.
Harnesses: `gen_openpose_growth.py`, `gen_openpose_suite.py`; report `quality-upgrade/OPENPOSE-BODY-HOLD-REPORT.md`.
⚠️ **Chained img2img (earlier attempt) FAILED on growth** — holds the body but per-step growth at
d~0.5 is too small to reach hyper and long chains degrade; do not use it for expansion. (One-shot
"same body, slightly bigger breasts" regen via single img2img at denoise 0.5–0.6 is still fine — the
bridge editor's `INIT_DENOISE=0.55` — but it can't span flat→hyper.)

## 6. Environment setup (installed this effort)
- **Custom nodes:** `ComfyUI_DanTagGen` (patched — but wedges ComfyUI on this build; **prefer Autocomplete-Plus** for tag assist), `ComfyUI-Autocomplete-Plus`. Already had Impact Pack, controlnet_aux, IPAdapter_plus, Manager.
- **pip (embedded py3.13):** `tiktoken`; `yacs timm trimesh`; `mediapipe absl-py flatbuffers sounddevice` (install mediapipe with `--no-deps` to avoid the opencv-contrib `cv2.pyd` lock with ComfyUI running).
- **Models added:** `hand_yolov8s.pt` (detailer detector). Already present: `illustriousXLDepth_v20` ControlNet, `4x-AnimeSharp`/`4x-UltraSharp`, BE/size LoRAs.
- **OpenPose stack (added 2026-06-20, for body-hold §5):** `controlnet-openpose-sdxl-xinsir.safetensors` (xinsir SDXL OpenPose CN, 2386 MB) in `models/controlnet/`; DWPose detectors in `comfyui_controlnet_aux/ckpts/` (`hr16/yolox-onnx/yolox_l.torchscript.pt`, `hr16/DWPose-TorchScript-BatchSize5/dw-ll_ucoco_384_bs5.torchscript.pt`). **Install gotcha:** `huggingface_hub`'s xet backend HANGS on the xinsir repo's large file — download with `curl -L` from the HF `resolve/main/...` URL instead (small detector files curl fine too).
- **IPAdapter FaceID stack (added 2026-06-20, identity lock §5):** pip into embedded py3.13 — `onnxruntime onnx scikit-image` + **insightface 0.7.3 from the Gourieff prebuilt cp313 wheel installed `--no-deps`** (no official py3.13 wheel; `--no-deps` avoids an opencv reinstall that would clobber ComfyUI's cv2). **Patch** `insightface/app/__init__.py` to make the `mask_renderer` import optional (it pulls albumentations→opencv). Models: `ip-adapter-faceid-plusv2_sdxl.bin` (models/ipadapter), `ip-adapter-faceid-plusv2_sdxl_lora.safetensors` (models/loras), `buffalo_l` (models/insightface/models/buffalo_l). Provider CPU. Install script: `quality-upgrade/install_faceid.ps1` (run steps directly, not via `-ExecutionPolicy Bypass`).

## 7. Capability status
**Solved:** size ladder + ceiling, cup-size dial, separation, failure-mode strain, supine gravity, arched pose + navel, expression/affect, matte skin, multi-subject de-fusion, hands (general + on-breast contact + finger geometry), growth/burst sequences.
**Production tier ladder (the bridge/consumer "tiers"):** the cup-tag-primary ladder
(`be_prompt.py` ⇄ Vellum `illustrious-prompt-builder.ts`, bit-exact lockstep) — distinct from
the slider-only cup dial in §4 — was swept end-to-end 2026-06-20 and is **monotonic 0→50**
after the **v2.2 hyper-band recalibration** (fixed a gigantic→hyper seam dip + top-band
compression: slider held 0.5→0.6, hyper LoRA ramp 0.5→0.85). Report:
`quality-upgrade/TIER-LADDER-REPORT.md`.
**Open (structural):** **side-lying gravity** (lateral breast pool) — needs a recline-plane depth/OpenPose ControlNet (not yet built).

## 8. File index (`D:\LLM\ComfyUI_windows_portable\quality-upgrade\`)
- **Playbook:** `BE-PROMPT-PLAYBOOK.md` (the working prompt/settings reference). **Progress:** `REFINEMENT-PROGRESS.md`.
- **Reports:** `BE-QUALITY-REPORT` (v1), `…v2/v3-REPORT`, `…v5/v6-SOLO-INTIMATE-REPORT`, `CUP-CALIBRATION-REPORT.md`, `TIER-LADDER-REPORT.md` (production tier ladder + v2.2 hyper-band recal), `HYPER-BAND-SUITE-REPORT.md`, `NUDE-LADDER-REPORT.md`, `OPENPOSE-BODY-HOLD-REPORT.md` (body-hold: OpenPose+FaceID), `QUALITY-BAKEOFF-REPORT.md` (2026-06-21 max-quality recipe + style test), `CHANGE-REPORT` + `INSTALL-TEST-PLAN`.
- **Generators/harnesses:** `build_preset_v3.py`, `build_preset_intimate.py`, `gen_test_suite_v*.py`, `gen_growth_sequence.py`, `gen_cup_calibration.py`, `gen_cup_DF_fine.py`, `gen_tier_ladder_sweep.py`, `gen_hyper_band_study.py`, `make_tier_montage.py`.
