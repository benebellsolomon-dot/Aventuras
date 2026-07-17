# Change Report — Anime NSFW/BE image-quality upgrade

**Date:** 2026-06-19
**System:** `D:\LLM\ComfyUI_windows_portable` (ComfyUI portable, embedded Python 3.13.12, torch 2.11.0+cu130, RTX 4090 24GB)
**Driver:** Multi-agent research (run `wf_cecec45e-713`, 2026-06-19) into best models/prompting/pipeline for anime NSFW breast-expansion (BE) work.

## 1. Purpose

Raise image quality for anime-style NSFW/BE projects (comic-continuer, scene-illustrator, NovelAI work) by adopting the research's "do-first" recommendations. ComfyUI is the local backend; the si-animator-bridge calls it over localhost, so these changes are transparent to the bridge.

## 2. Current state (verified pre-flight, 2026-06-19)

| Item | Status |
|---|---|
| ComfyUI | Up, `0.0.0.0:8188`, task-launched (`comfyui` scheduled task, tailnet-bound) |
| Disk D: | 272.7 GB free |
| `waiIllustriousSDXL_v170.safetensors` (primary pick) | **Already present**, 6.46 GB, complete |
| `Illustrious-XL-v2.0.safetensors` (raw base) | Present — to be **demoted** (research: weak daily driver, superseded by v3.x) |
| Realistic SDXL (jibMixRealisticXL, cyberrealisticXL) | Present (unrelated) |
| Impact Pack (FaceDetailer) + Subpack | **Already installed** |
| ControlNet-aux, IPAdapter_plus, Inpaint-CropAndStitch, Manager, ppm | **Already installed** |
| Upscalers 4x-AnimeSharp, 4x-UltraSharp (+5 more) | **Already present** |
| `ComfyUI_DanTagGen` | **MISSING — to install** |
| `ComfyUI-Autocomplete-Plus` | **MISSING — to install** |

**Conclusion:** the model, upscalers, detailer stack, ControlNet and IPAdapter are all already in place. The only gaps vs the research action plan's "do-first" tier are the two prompt-tooling custom nodes plus a standardized, tested reference workflow.

## 3. Changes in this installment

| # | Change | Rationale (from research) |
|---|---|---|
| C1 | Install **ComfyUI_DanTagGen** (Danbooru-tag upsampler) | "Cheapest quality-per-VRAM upgrade" — completes seed BE tags into a full, model-correct prompt; inherently NSFW-clean. |
| C2 | Install **ComfyUI-Autocomplete-Plus** (Danbooru+e621 tag autocomplete) | Live correct-vocabulary discovery + co-occurrence panel; reduces malformed tags. |
| C3 | Author a tested **reference workflow** (`illustrious_image__WAI_v17_QUALITY.json`) — WAI v17 + correct sampler/CFG + hires upscale (4x-AnimeSharp) + FaceDetailer chain | "Biggest quality wins are workflow, not a new model"; standardize per-model presets to avoid prompt-dialect cross-contamination. |
| C4 | Adopt **WAI v17 as primary base**; treat Illustrious-XL-v2.0 base as fallback only | Raw Illustrious base is a mediocre daily driver; ship on the NSFW finetune. |

**Explicitly out of scope for this installment** (research "do-next"/optional, deferred): NoobAI-XL v-pred download, abliterated-LLM prompt-enhancer (Ollama), Chroma1-HD, Wan animated-growth LoRAs. These are separate, larger items.

## 4. Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| DanTagGen dependency (`kgen`/`llama-cpp-python`) fails to build on embedded Python 3.13 | Medium | Node won't load | Prefer the transformers/HF backend; if `llama-cpp-python` has no py3.13 wheel, skip it — `kgen` falls back to the HF model. Document outcome. |
| ComfyUI restart interrupts an in-flight generation or a bridge job | Low | Lost in-flight job | Restart only after confirming queue is idle; bridge has no active job. |
| A custom node breaks ComfyUI startup | Low | ComfyUI won't boot | Rollback = delete the node folder + restart (steps in test plan). ComfyUI-Manager also disables broken nodes. |
| Pip writes wheels to C: temp and fills C: | Low | Install failure | Set `TMP/TEMP/PIP_CACHE_DIR=D:\temp` before pip (workspace rule). |

## 5. Rollback summary

- **Per node:** delete `custom_nodes\ComfyUI_DanTagGen` (or `...Autocomplete-Plus`) and restart ComfyUI. No model files or other config are touched.
- **Reference workflow:** delete the `.json` from `user\default\workflows\`. Existing workflows are untouched.
- **No checkpoint, LoRA, or existing-workflow files are modified or deleted by this installment.**

## 6. Sign-off

Execution results, pass/fail per step, and the smoke-test output image are recorded in `INSTALL-TEST-PLAN_2026-06-19.md` (§Results) alongside this report.
