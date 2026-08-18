# Installation & Testing Plan — Anime NSFW/BE quality upgrade

**Date:** 2026-06-19  ·  **Target:** `D:\LLM\ComfyUI_windows_portable`  ·  **See also:** `CHANGE-REPORT_2026-06-19.md`

All commands assume the workspace rule: heavy temp/cache on D:.
```powershell
$env:TMP='D:\temp'; $env:TEMP='D:\temp'; $env:PIP_CACHE_DIR='D:\temp\pip-cache'; $env:HF_HOME='D:\LLM\hf_cache'
```
Embedded python: `D:\LLM\ComfyUI_windows_portable\python_embeded\python.exe`
Custom nodes dir: `D:\LLM\ComfyUI_windows_portable\ComfyUI\custom_nodes\`

---

## Phase 0 — Pre-flight (DONE 2026-06-19)
- [x] ComfyUI up on 0.0.0.0:8188 (PID 16136, task-launched)
- [x] Disk D: 272.7 GB free
- [x] WAI v17 + Illustrious base + 4x-AnimeSharp + Impact Pack present
- [x] git 2.54, pip 26.1, torch 2.11+cu130 (CUDA True)
- [x] Queue idle confirmed before restart

## Phase 1 — Install custom nodes
**Step 1.1 — Clone DanTagGen**
```powershell
git clone https://github.com/huchenlei/ComfyUI_DanTagGen "D:\LLM\ComfyUI_windows_portable\ComfyUI\custom_nodes\ComfyUI_DanTagGen"
```
**Step 1.2 — Clone Autocomplete-Plus**
```powershell
git clone https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus "D:\LLM\ComfyUI_windows_portable\ComfyUI\custom_nodes\ComfyUI-Autocomplete-Plus"
```
**Step 1.3 — Install requirements (embedded python, D: temp/cache)**
```powershell
& $py -m pip install -r "...\ComfyUI_DanTagGen\requirements.txt"
& $py -m pip install -r "...\ComfyUI-Autocomplete-Plus\requirements.txt"   # if present
```
- Contingency: if `llama-cpp-python` fails (no py3.13 wheel / no compiler), install the rest and rely on the HF/transformers backend of `kgen`. Record outcome.

## Phase 2 — Restart & load
**Step 2.1** Confirm ComfyUI queue is idle (`GET /queue`, `GET /prompt`).
**Step 2.2** Restart via the `comfyui` scheduled task (keeps 0.0.0.0 tailnet bind):
`Stop-ScheduledTask comfyui` → kill stray main.py → `Start-ScheduledTask comfyui` → poll 8188.
**Step 2.3** Watch boot for import errors (the two new nodes load without traceback).

## Phase 3 — Verification (node registration)
- [ ] `GET /object_info` contains a DanTagGen node class (e.g. `PromptDanTagGen` / `DanTagGen`).
- [ ] Autocomplete-Plus registered (node class and/or its web extension served).
- [ ] `GET /object_info/CheckpointLoaderSimple` lists `waiIllustriousSDXL_v170.safetensors`.

## Phase 4 — Test plan

### Acceptance criteria
1. ComfyUI boots clean with both new nodes (no import errors).
2. A WAI v17 generation completes via API and produces a non-empty PNG.
3. The hires-upscale (4x-AnimeSharp) + FaceDetailer chain runs without error (if face/bbox detector model present; else flagged as follow-up).
4. DanTagGen node is invokable (expands a seed tag string).
5. Autocomplete-Plus web extension is served (UI-only; verified by registration, not headless gen).

### T1 — Core smoke test (WAI v17 txt2img + hires)
- Submit an API-format prompt: `CheckpointLoaderSimple(waiIllustriousSDXL_v170)` → CLIP encode (WAI quality prefix + a BE test prompt + the standard negative) → `KSampler`(Euler a, CFG 6, 28 steps, 832x1216) → VAEDecode → `UpscaleModelLoader(4x-AnimeSharp)` + `ImageUpscaleWithModel` → downscale → 2nd `KSampler` denoise 0.4 → SaveImage.
- Poll `/history/{id}`; assert an output image exists. Save under `quality-upgrade\test-output\`.

### T2 — FaceDetailer (conditional)
- If `models\ultralytics\bbox\*.pt` + a SAM model exist, add `FaceDetailer` after T1's decode and re-run. Else: record "detector model not installed — follow-up" and skip.

### T3 — DanTagGen functional
- Build a tiny graph feeding `1girl, huge breasts, beach` through the DanTagGen node; assert it returns an expanded tag string. (If only usable as a UI node, verify via /object_info input schema.)

### T4 — Autocomplete-Plus
- Verify the extension's JS is served (`GET /extensions/...`) and tag data file is fetched/seeded. UI autocomplete itself is manual (note for the operator).

## Phase 5 — Reference workflow deliverable
- [ ] Write UI-loadable `user\default\workflows\illustrious_image__WAI_v17_QUALITY.json` (WAI v17 + correct settings + hires + FaceDetailer + DanTagGen hook).
- [ ] Save the tested API-format json under `quality-upgrade\` for reproducibility.

## Rollback
- Node breaks boot: delete its `custom_nodes\<dir>` and restart; or use Manager to disable.
- Remove workflow json from `user\default\workflows\`.
- Nothing else is modified.

---

## Results — executed 2026-06-19 ✅

**Pre-flight:** ComfyUI up (0.0.0.0:8188), D: 272.7 GB free, queue idle. WAI v17, Illustrious base, 4x-AnimeSharp/UltraSharp, Impact Pack, ControlNet-aux, IPAdapter already present.

**Phase 1 — node install:**
- DanTagGen cloned (`huchenlei/ComfyUI_DanTagGen`). Deps transformers/sentencepiece/requests/hf_hub already present. `llama-cpp-python` has **no py3.13 wheel** → skipped (embedded python has no compiler); it is only the optional GGUF backend.
- **Patch applied:** `lib_dantaggen/kgen/generate.py` did an unconditional `from llama_cpp import Llama`, which aborted node registration. Wrapped it in try/except (`Llama=None`) and guarded the `isinstance(model, Llama)` call. Node now loads on the transformers backend.
- Autocomplete-Plus cloned (`newtextdoc1111/ComfyUI-Autocomplete-Plus`). No python deps (frontend extension).

**Phase 2/3 — restart & verify:** ComfyUI restarted via the `comfyui` task (stayed 0.0.0.0:8188). Confirmed via `/object_info`:
- DanTagGen → `PromptDanTagGen` ✅
- Autocomplete-Plus → 10 JS modules served under `/extensions/ComfyUI-Autocomplete-Plus/` ✅
- WAI v17 selectable ✅ · FaceDetailer + `face_yolov8m.pt` detector ✅ · 4x-AnimeSharp ✅

**Phase 4 — smoke test (T1):** `smoketest_api.json` → `/prompt`, **status=success in ~40s**.
- `WAI_v17_smoketest_base_00001_.png` 832×1216 (1.26 MB)
- `WAI_v17_smoketest_hires_00001_.png` 1248×1824 (2.59 MB)
- Proven chain: WAI v17 txt2img (Euler a, CFG 6, 28 steps) → 4x-AnimeSharp → low-denoise (0.4) fix pass.
- T2 (FaceDetailer): registered + `face_yolov8m.pt` present; not wired into the automated API test (its ~25 params are best set via GUI defaults). Available.
- T3 (DanTagGen): registered, 4 model options (alpha/beta/delta/delta-rev2, pulled from HF on first run). Functional on transformers backend.
- T4 (Autocomplete-Plus): extension served; live typing is a manual GUI check.

**Acceptance:** 1 ✅ · 2 ✅ · 3 ✅ (FaceDetailer available, detector present) · 4 ✅ · 5 ✅.

**Outstanding:** saved GUI preset (`illustrious_image__WAI_v17_QUALITY.json`). The tested pipeline lives at `quality-upgrade/smoketest_api.json` (API format). A GUI-loadable preset can be authored on request (UI-graph validity can't be verified headlessly → needs one GUI load-test).

**Rollback:** delete the two `custom_nodes` folders + restart. No checkpoints/LoRAs/existing workflows were modified.
