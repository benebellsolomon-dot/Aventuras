# Wiring a New Project into the BE Image-Gen Pipeline

**Audience:** a new project (any language) that wants high-quality anime / breast-expansion image
generation with all the improvements from the 2026-06 quality work baked in.
**Last updated:** 2026-06-21. **Canonical cross-project index:** `D:\LLM\IMAGE-GENERATION-STRATEGY.md`.

You do **not** talk to ComfyUI directly. You POST to the **si-animator-bridge** `/image` API. The bridge
owns preset selection, the max-quality recipe, tier→LoRA mapping inputs, image staging, and job state.

```
your project ──HTTP /image──> si-animator-bridge (FastAPI :8001) ──> ComfyUI (:8188, localhost)
                                   │
                                   ├─ picks a preset by request fields (routing matrix below)
                                   ├─ substitutes {{TOKENS}} into the preset JSON
                                   └─ runs the full recipe: dpmpp_2m/karras · 4x-AnimeSharp hires ·
                                      Detail Daemon · hand+face/eye detailer
```

There are **two layers you implement**:
1. **Transport** — call the bridge `/image` API (§1–§4). Mechanical, stable contract.
2. **Prompt + tier logic** — build the positive/negative prompt and the per-tier LoRA strengths
   (§5–§7). Port the reference implementation; keep it in lockstep.

---

## 1. Endpoint + auth

| | |
|---|---|
| Base URL | `http://<host>:8001` (localhost on the gen PC; tailnet IP `100.100.142.29` from peers) |
| Auth | header `X-API-Key: <key>` on every endpoint except `/health` |
| Submit | `POST /image` → `202 { job_id, comfy_prompt_id, estimated_seconds, queue_position }` |
| Poll | `GET /image/{job_id}` → status (see §3) |
| Result | `GET /image/{job_id}/result` → the PNG (or WebP) bytes |
| Health | `GET /health` (no auth) → `{ ok, comfyui, ffmpeg, gpu, queue_depth, ... }` |
| VRAM evict | `POST /comfyui/free` → unloads models between heavy jobs |

The API key lives in the bridge config (`%LOCALAPPDATA%\si-animator-bridge\config.yaml`, key `api_key`)
and is mirrored to `current_api_key.txt` next to the input dir at startup. Inject it into your project
as a secret/env var — **do not hardcode**.

---

## 2. POST /image — request fields

Minimum: `prompt` (you build it per §5). Everything else has a sane default. Full contract is
`si-animator-bridge/src/models.py::ImageGenRequest`.

### Core
| field | type | default | notes |
|---|---|---|---|
| `prompt` | str (10–4000) | — | **required**; the full positive prompt you assemble (§5) |
| `negative_prompt` | str | bridge default | pass your built negative (§6); empty → bridge's generic UC |
| `width` / `height` | int | 832 / 1216 | SDXL portrait native; 1216×832 for wide/two-char |
| `steps` | int | 28 | base pass |
| `cfg` | float | 5.0 | sweet spot for WAI v17 |
| `sampler` | str | `dpmpp_2m` | **keep** — crisper than euler_a (bake-off verified) |
| `scheduler` | str | `karras` | **keep** |
| `seed` | int? | random | set for reproducibility |
| `workflow` | enum | `illustrious_image` | or `illustrious_colorize` (B&W→color) |
| `pre_convert_webp` | bool | false | also emit a WebP alongside the PNG |

### LoRA strengths — `lora_strengths: { ... }` (drive the tier, §7)
| field | range | meaning |
|---|---|---|
| `slider` | -3.5…3.5 | Breast Size Slider; signed fine-tune on top of the cup tag |
| `hyper_concept` | 0…1.5 | Hyper Breasts concept; 0 below tier 40, ramps in the hyper band |
| `smooth_booster` | 0…1.5 | Smooth Detailer Booster; default 0.5 |

### Hires-fix — `hires_fix: { steps, denoise, seed }`
Defaults 18 / 0.4 / (=base seed). The hires *method* (4x-AnimeSharp + Detail Daemon) is baked into the
preset — you only tune steps/denoise. Leave at default unless you have a reason.

### Routing inputs (presence of these selects the preset — see §4)
| field | enables |
|---|---|
| `reference_image_b64` (+ `reference_weight` 0.7) | IPAdapter style-transfer from a reference page |
| `series_lora_name` (+ `series_lora_weight` 1.0) | a series/style LoRA; **requires** reference too |
| `init_image_b64` (+ `init_denoise` 0.55) | img2img: preserve composition of an existing image |
| `input_image_b64` (+ `controlnet_strength` 0.85, `controlnet_model_name`) | colorize (with `workflow=illustrious_colorize`) |
| `pose_face_anchor_b64` (+ `openpose_strength` 1.0, `faceid_weight` 0.8, `faceid_weight_v2` 1.0, `faceid_lora_strength` 0.6) | **body-hold** for expansion scenes (§8) |

All image inputs are base64 of PNG/JPEG bytes, ≤ 9 MB raw. The bridge decodes, stages, and uploads to
ComfyUI for you.

### Minimal example
```bash
curl -X POST http://127.0.0.1:8001/image \
  -H "X-API-Key: $BRIDGE_KEY" -H "Content-Type: application/json" \
  -d '{
    "prompt": "sensitive, masterpiece, best quality, very aesthetic, newest, absurdres, official art, mature female, adult, 1girl, solo, long black hair, blue eyes, fitted blouse, cowboy shot, indoor, huge breasts",
    "negative_prompt": "embedding:Illust_Neg-neg, embedding:BadDigitalHandsNeg, bad anatomy, bad hands, signature, watermark, username, old, early, child, loli",
    "lora_strengths": { "slider": 0.3, "hyper_concept": 0.0, "smooth_booster": 0.5 },
    "seed": 12345
  }'
```

---

## 3. Polling + result

```
POST /image -> { job_id }
loop: GET /image/{job_id} -> { status, progress_pct, result_url_png, ... }
      status in: queued -> running -> (converting) -> complete | failed
when complete: GET /image/{job_id}/result -> image bytes
```
A full-recipe render is ~15–45 s on a 4090 (base + 4x upscale + Detail Daemon hires + 2 detailers).
Poll every ~2 s. `metadata` carries timing + the resolved preset.

---

## 4. Preset routing matrix

The bridge picks the preset from request fields (first match wins). All presets carry the **same
max-quality recipe**; they differ only in conditioning.

| Condition (in priority order) | Preset | Use for |
|---|---|---|
| `workflow == illustrious_colorize` | `illustrious_colorize.json` | B&W page → color |
| `pose_face_anchor_b64` set | `illustrious_image_openpose_faceid.json` | **body-hold expansion** (§8) |
| `reference` + `series_lora` + `init_image` | `illustrious_image_styled_ipa_img2img.json` | edit/regen, keep composition |
| `reference` + `series_lora` | `illustrious_image_styled_ipa.json` | styled continuation |
| `reference` only | `illustrious_image_ipa.json` | style-transfer from a page |
| (none of the above) | `illustrious_image.json` | **default txt2img** |

---

## 5. Building the positive prompt

Order matters for Illustrious attention. Reference impl: comic-continuer
`be_prompt.py::build_image_request` (manga) and vellum `illustrious-prompt-builder.ts` (color).

```
[rating], [quality stack], [world/theme], [lighting], [mature anchor],
[censorship-affirm if bare skin], [identity tags], [scene tags],
[body/pose tags], [cup tag], [style block], [extra]
```

**Constants (current, keep in lockstep across projects):**
```
QUALITY_TAGS   = masterpiece, best quality, very aesthetic, newest, absurdres, highres, official art
MATURE_ANCHOR  = mature female, adult           # always on — maturity guard
rating         = general | sensitive | explicit  (from your intimacy label; see intimacy_to_rating)
censorship-affirm (only when bare skin) = uncensored, detailed anatomy, clear view
cup tag        = tier_to_cup_tag(tier)  (§7)     # the PRIMARY size driver
```
> 2026-06-21 polish: **do not** add `amazing quality` (cargo-cult, dilutes the prompt head).

**Style block — the biggest *style* lever (color-anime projects only; NOT manga):**
append after identity tags. Validated on WAI v17 (`montages/quality_artiststyle_full.png`):
```
DEFAULT (premium):  (as109:0.9), (rella:0.8), (ciloranko:0.7), (highly detailed:1.2), intricate details, sharp focus
Painterly Glow:     (ciloranko:0.85), (wlop:0.6), (ningen mame:0.7)
Semi-real:          + (semi-realistic:1.15), realistic skin texture, volumetric lighting
```
Rules: 2–3 artists, weights 0.7–1.0, keep them near the front, total prompt ~20–40 tags. Full spec +
caveats: `quality-upgrade/ARTIST-TAGS-REPORT.md`.

**Manga/monochrome projects** instead use a style anchor `manga style, monochrome, screentone, line art,
detailed` and **skip the artist blend.**

**BE quality blocks (from the playbook, use as needed):**
- Separation: `(deep cleavage:1.2), cleavage` — **avoid** `between breasts` (phantom-prop bug).
- Strain: `popped button, torn seam, asymmetric strain, stress folds, gaping shirt`.
- Gravity: `hanging/heavy/soft breasts, soft tissue compression, cast shadow under breast`.
- Skin: leave matte; do **not** add `shiny/wet/oily skin`.
- Size ceiling for coherence in normal scenes ≈ `huge`; go higher only with the tier ladder + hyper LoRA.

---

## 6. Building the negative prompt

Current lightened baseline (2026-06-21 — embeddings carry the generic load, don't double it):
```
embedding:Illust_Neg-neg, embedding:BadDigitalHandsNeg,
bad anatomy, bad hands, signature, watermark, username, old, early,
child, loli, kid, shota, young, underage          # maturity — non-negotiable
```
Append **only when rating is explicit** (sex): the censorship-suppression cluster
(`censored, mosaic_censoring, bar_censor, ... , blurry_genitals`) — see `CENSORSHIP_SUPPRESSION_UC`.
Keep the negative short; long UC reduces quality on Illustrious.

---

## 7. The tier ladder (size system)

One integer `tier_index` (0–50) drives three coordinated outputs. **Cup tag is primary; slider is the
fine-tune; hyper LoRA only engages in the top band.** Port this exactly — it lives bit-identical in
comic-continuer `be_prompt.py` and vellum `illustrious-prompt-builder.ts` (+ tests in each). Change all
four together. Memory: `be_tier_ladder_lockstep`.

**`tier_to_cup_tag(t)`** (prompt tag):
| tier | tag |
|---|---|
| 0 | flat chest |
| 1–3 | small breasts |
| 4–13 | medium breasts |
| 14–21 | large breasts |
| 22–29 | huge breasts |
| 30–39 | gigantic breasts |
| 40+ | hyper breasts |

**`tier_to_slider_weight(t)`** — piecewise-linear sawtooth over anchors (→ `lora_strengths.slider`):
```
(0,-1.5) (4,-0.7) (8,-0.2) (12,0.1) (14,0.0) (21,0.4) (22,0.3) (29,0.6)
(30,0.4) (39,0.7) (40,0.5) (50,0.6) (100,0.6)
```
The reset-then-climb within each cup band gives smooth growth without the cup tag flipping too early.

**`tier_to_hyper_concept_weight(t)`** (→ `lora_strengths.hyper_concept`):
```
t < 40 : 0.0
40..50 : round(0.5 + (t-40)*0.035, 2)     # 0.5 → 0.85 ; 0.85 is the saturation ceiling
```

`smooth_booster` is constant 0.5. So for a tier you send:
`lora_strengths = { slider: tier_to_slider_weight(t), hyper_concept: tier_to_hyper_concept_weight(t), smooth_booster: 0.5 }`
and put `tier_to_cup_tag(t)` in the prompt.

---

## 8. Body-hold for expansion scenes (body stays, breasts grow)

When you want a sequence where the **body/pose/identity stay fixed** and only the bust grows across
tiers, send `pose_face_anchor_b64` (a base render of the character). The bridge routes to
`illustrious_image_openpose_faceid.json`:
- **DWPose → OpenPose ControlNet** locks stance/build framing from the anchor.
- **IPAdapter FaceID PlusV2** (insightface) locks the face/identity (no nude skin-tone washout).
- Each tier is a **full-denoise txt2img**, so growth lands at full ladder magnitude.

Per frame: same `pose_face_anchor_b64`, vary only the tier (cup tag + slider + hyper per §7). Do **not**
use chained img2img for growth (it mutes it). Knobs: `openpose_strength` 1.0 (looser ~0.7),
`faceid_weight` 0.8, `faceid_weight_v2` 1.0, `faceid_lora_strength` 0.6. Report:
`quality-upgrade/OPENPOSE-BODY-HOLD-REPORT.md`. Memory: `be_body_hold_openpose`.

---

## 9. What the presets bake in (the recipe — FYI, you don't configure it)

Every `illustrious_image*` preset runs: base KSampler (dpmpp_2m/karras, CFG 5, 28 steps) →
VAE decode → **4x-AnimeSharp** ESRGAN model-upscale → downscale to 1.5× → VAE encode → **hires refine
via SamplerCustomAdvanced + Detail Daemon** (detail_amount 0.18, 18 steps, denoise 0.4) → **hand
detailer** (FaceDetailer + hand_yolov8s) → **face/eye detailer** (FaceDetailer + face_yolov8m) → save.
Validated end-to-end across the tier range + hands/faces/full-body/two-char/nude
(`montages/fullsuite_montage.png`).

---

## 10. Required ComfyUI assets (must exist on the gen PC)

Put these under `D:\LLM\ComfyUI_windows_portable\ComfyUI\models\<dir>\`. (Already installed on this PC;
listed so a fresh box can be provisioned.)

| dir | file(s) |
|---|---|
| `checkpoints` | `waiIllustriousSDXL_v170.safetensors` |
| `loras` | `Smooth_Booster_v5.safetensors`, `Breast_Size_Slider_Illustrious_V2.safetensors`, `hyper_breasts_ILXL_concept.safetensors` (+ any series LoRA) |
| `embeddings` | `Illust_Neg-neg`, `BadDigitalHandsNeg` |
| `upscale_models` | `4x-AnimeSharp.pth` |
| `ultralytics/bbox` | `hand_yolov8s.pt`, `face_yolov8m.pt` |
| `ipadapter` | `ip-adapter-plus_sdxl_vit-h.safetensors` (+ FaceID PlusV2 SDXL, auto-resolved by the FaceID loader) |
| `clip_vision` | `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` |
| `insightface` | `buffalo_l` pack (FaceID) |
| `controlnet` | `controlnet-openpose-sdxl-xinsir.safetensors`, `manga-recolor.safetensors` (colorize) |
| `controlnet_aux/DWPose` | `yolox_l.torchscript.pt`, `dw-ll_ucoco_384_bs5.torchscript.pt` |

**Custom nodes:** ComfyUI Impact Pack + Impact-Subpack (FaceDetailer / UltralyticsDetectorProvider),
ComfyUI_IPAdapter_plus, comfyui_controlnet_aux (DWPreprocessor), Detail Daemon (DetailDaemonSamplerNode).
insightface install notes (py3.13 wheel, albumentations patch) are in
`quality-upgrade/REFINEMENT-PROGRESS.md`.

---

## 11. Source-of-truth files (copy/port from these)

| concern | file |
|---|---|
| API contract | `bridge-presets/` (this zip) + `si-animator-bridge/src/models.py` |
| Routing | `si-animator-bridge/src/main.py` (`submit_image`, `_build_image_token_dict`) |
| Tier ladder + prompt (manga) | `comic-continuer/comic_continuer/art/be_prompt.py` |
| Tier ladder + prompt (color) | `vellum/src/server/engine/illustrious-prompt-builder.ts` |
| The 6 presets | `bridge-presets/*.json` (this zip) = `si-animator-bridge/src/presets/` |
| Quality recipe rationale | `quality-upgrade/QUALITY-BAKEOFF-REPORT.md`, `SOTA-GAP-ANALYSIS.md` |
| Artist/style | `quality-upgrade/ARTIST-TAGS-REPORT.md` + `montages/quality_artiststyle_full.png` |
| Body-hold | `quality-upgrade/OPENPOSE-BODY-HOLD-REPORT.md` |
| BE prompt blocks | `quality-upgrade/BE-PROMPT-PLAYBOOK.md` |
| Cross-project index | `IMAGE-GENERATION-STRATEGY.md` |

---

## 12. Porting checklist

- [ ] Reach the bridge: `GET /health` returns `ok:true, comfyui:"connected"`.
- [ ] Store the API key as a secret; send `X-API-Key` on every call.
- [ ] Implement the tier ladder (§7) — cup tag + slider + hyper. Add tests; keep lockstep.
- [ ] Implement prompt assembly (§5) + negative (§6). For color-anime, add the default artist/style block.
- [ ] POST `/image`, poll `/image/{id}`, fetch `/image/{id}/result`.
- [ ] (Optional) body-hold: send `pose_face_anchor_b64` for expansion sequences (§8).
- [ ] Confirm the required assets (§10) exist on the gen PC.
- [ ] Leave `sampler/scheduler/cfg/hires` at defaults — the recipe is tuned.
