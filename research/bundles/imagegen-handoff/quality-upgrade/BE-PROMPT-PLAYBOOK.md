# BE Image-Quality Playbook — WAI-illustrious-SDXL v17 + ComfyUI

Empirically tuned over 4 refinement rounds (v1→v4, 2026-06-19). Baseline mean quality **5.69 → ~7.0+**.
Preset: `ComfyUI/user/default/workflows/illustrious_image__WAI_v17_QUALITY.json`.

## Pipeline (locked-in defaults)
- **Model:** `waiIllustriousSDXL_v170.safetensors`
- **Sampler:** `dpmpp_2m` + `karras`, **CFG 5**, 28 steps base / 20 steps fix
- **Resolution:** 832×1216 portrait (1216×832 wide for 2-char; 832×1216 for full-body to fit head-to-feet)
- **Hires:** 4x-AnimeSharp → downscale ×1.5 → VAEEncode → KSampler denoise **0.4** (decisive quality stage)
- **Hand-detailer (always):** FaceDetailer + `hand_yolov8s.pt`, **bbox_dilation 4, bbox_crop_factor 2.0**, denoise 0.45, wildcard `(perfect hands, five fingers, detailed fingers:1.1)` — lifted hands ~+3 pts. Keep hands **in frame** (don't bank gains by hiding them).
- **Face-detailer (conditional):** bypassed by default; **enable only for full-body / wide / multi-char** (face <~12–15% of frame). At portrait framing it's near-zero delta.

## Positive tag blocks (mix per shot)
- **Quality prefix:** `masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres`
- **Maturity guard (mandatory):** `mature female, adult` + `curvy, wide hips, collarbone`
- **Size:** `large` → `huge` → `gigantic`. **Ceiling = `huge`** for clean anatomy. Use ONE size tag. Reach bigger via *garment-failure/expansion framing*, not a larger token.
- **Separation (use this, NOT 'between breasts'):** `(deep cleavage:1.2), cleavage`. ⚠️ **Avoid `between breasts` / `inter-breast shadow`** — they trigger an object-in-cleavage prior (phantom phone/can), especially in 2-char shots. `(deep cleavage:1.2)` gives the separation without the prop.
- **Strain / growth (failure-mode block):** `taut fabric, fabric stretched, stress folds, gaping shirt, popped button, torn seam, asymmetric strain, fabric puckering at seams, stress wrinkles converging at closure`. Prefer rigid/elastic garments (swimsuit, leotard) when strain is the hero.
- **Gravity / weight:** `hanging breasts, heavy breasts, soft breasts, sagging, soft tissue compression, cast shadow under breast` + a pose where **both breasts are visible** (e.g. arms up / hands behind head).
- **Full-body framing:** `full body, feet visible, head to toe, full figure, wide shot` (+ cropped negatives, taller AR) — fixes the mid-thigh crop.
- **Skin:** leave matte — do NOT add `shiny skin`/`wet`/`oily` (over-applied, flattens volume).

## Negative (default block)
```
worst quality, low quality, bad quality, lowres, bad anatomy, bad hands, bad proportions,
missing fingers, extra digits, fused fingers, mutated hands, malformed hands, extra fingers,
jpeg artifacts, signature, watermark, username, text, blurry, sketch, monochrome, greyscale,
multiple views, oldest, censored, mosaic censoring, bar censor, fused breasts, single breast,
three breasts, extra breasts, uniboob, flat chest, deformed object, warped object, holding object,
object between breasts, can, bottle, cup, card, phone, smartphone, rectangle, slab, plate,
water drips, skin streaks, specular streaks, sweat, child, loli, baby face, chibi
```
For full-body add: `cropped, cropped legs, out of frame, close-up`.

## What measurably worked (per round)
- **v2 (+21% overall):** gloss removal, dpmpp_2m_karras CFG5, hand-detailer, hand+fusion negatives, strain-geometry, separation aids, gravity block.
- **v3:** failure-mode strain block (biggest cross-cell lift), `(deep cleavage:1.2)`+inter-breast shadow held separation under strain (P2 solved), framing fix (3→9), tighter hand mask.
- **v4:** dropping `between breasts`/`inter-breast shadow` killed the cleavage-object prop (P1 solved).

## Known residual limits (polish, low priority)
- Rupture/failure-node edges read soft / decoratively 2D (push `frayed edge, fabric thickness, 3D tear` if pursued).
- Gravity realism rides on the chosen pose; pronounced L/R asymmetry can appear with arms-up.
- Hand-detailer can still mildly stub fingers on complex in-frame grips; avoid held-object poses in multi-subject.

## Solo / Intimate scenes (rounds v5–v6)
Harder regime (baseline 6.1; faces/affect already strong ~7.4). Confirmed wins:

**Hand-on-breast contact deformation** (the key mechanic — now works):
- Positive: `fingers sinking into breast, fingertip indentation, soft tissue bulging between fingers, contact shadow under fingers, breast deformation, grip compression`
- Pipeline: **hand-detailer denoise 0.4→0.55 WITH the contact block fed as its wildcard** (a generic hand prompt cleans the grip into a flat decal; the contact prompt sculpts real displacement). This was *the* change that worked.
- Close/QA shots: add `cupping from below, areola visible above fingers` so the focal point isn't occluded.
- Ceiling: digit render quality — expect one weaker hand per render until a hand-ControlNet is added.

**Reclining gravity:**
- Supine (back-lying) — **reliable:** `lying on back, supine, breasts spreading to sides, breasts falling outward, flattened at apex, nipples diverging` + **DROP `deep cleavage` on reclining cells** (it forces an impossible vertical canyon) + supine negatives `breasts projecting upward, rigid spheres`. "from above" framing reinforces it.
- Side-lying — **NOT solved by tags** (cupping hand re-spheres it; needs ControlNet).

**Pose & landmarks:** `(arched back:1.3), curved spine` → genuine lumbar extension; `navel, defined abdomen, abdominal midline` fixes the recurring mushy lower-torso / missing navel.

**Expression/affect (strong — lock in):** `half-lidded eyes, (seductive expression:1.1), blush, parted lips, flushed cheeks, soft intimate gaze`; keep the mouth in frame when affect is the point.

**Regime negatives (add):** `(symmetrical breasts:1.2), mirrored/identical/clone breasts, (missing arms:1.3), missing hands, areola fused with hand, hand floating above breast, decal hand, plastic skin, glossy specular, wet sheen`.

**Contact-grip finger render (SOLVED v7–v8 — HandRefiner):** add a depth-guided hand inpaint AFTER the contact detailer (order matters: **detailer → HandRefiner**; HR alone flattens the contact deformation and gives no finger gain):
- `MeshGraphormer+ImpactDetector-DepthMapPreprocessor` (bbox_detector = `hand_yolov8s.pt`) → hand depth map + mask
- `ControlNetLoader(illustriousXLDepth_v20.safetensors)` → `ControlNetApplyAdvanced` (strength ~0.85) on that depth map
- `VAEEncode` → `SetLatentNoiseMask`(hand mask) → `KSampler` denoise **0.5** → `VAEDecode`
- Tuning that worked: **HR denoise 0.5 + tight mask** (`mask_expand 3, mask_bbox_padding 16`) fixes finger geometry while *preserving* the contact deformation; denoise 0.7 / wide mask over-irons the squeeze. Gate it on contact-heavy shots — on already-clean hands it can make them look plastic.
- Env setup (embedded py3.13): `pip install --only-binary :all: yacs timm trimesh` then `pip install --only-binary :all: --no-deps mediapipe absl-py flatbuffers sounddevice` (the `--no-deps` avoids the opencv-contrib `cv2.pyd` lock with the running ComfyUI).
- Reproducible pipeline: `quality-upgrade/gen_test_suite_v8.py`.

**Still open (structural, not prompt-tunable):**
- Side-lying lateral pool → depth/OpenPose ControlNet for the recline plane (not yet built).

## Growth / expansion sequences (ADDRESSED — multi-image)
A single still can't depict growth; a multi-image **sequence** does:
- **Driver:** `Breast_Size_Slider_Illustrious_V2` (LoraLoader, model+clip) at increasing weight across frames — tested `0 → 1 → 2 → 3 → 4` gives smooth monotonic growth. Add `hyper_breasts_ILXL_concept` (LoraLoaderModelOnly ~0.7) for the extreme/final frame.
- **Reinforce per frame:** size tag (large→huge→gigantic), clothing strain→burst progression (`fitted` → `taut, stress folds` → `straining buttons, gaping shirt, button gap` → `torn shirt, flying button, bursting breasts, breast expansion`), escalating reaction (`calm` → `surprised, blush` → `shocked, open mouth, hands raised`).
- **Identity:** fix the seed + character description across frames. Best burst frame in testing was **slider 4.0 + torn/flying-button/bursting tags** (motion lines + flying buttons + shocked read convincingly).
- **For tighter outfit/identity lock** (the test varied wardrobe because clothing tags changed per frame): keep the SAME clothing description and only escalate the strain/torn state, and/or add IPAdapter PLUS FACE on a fixed reference.
- **Animated growth (video, out of scope for stills):** Wan 2.2 I2V + a BE motion LoRA (Boobloom / BE-i2v).
- Reproducible: `quality-upgrade/gen_growth_sequence.py`.

## Cup-size calibration (granular size control)
`Breast_Size_Slider_Illustrious_V2` (LoraLoader, model+clip strength = the value) gives monotonic continuous size control. Calibrated slider→cup on WAI v17, fixed seed, locked scene (3-assessor consensus; cup labels are **ordinal/approximate**, ±0.5–1 grade):

| Slider | Cup | Slider | Cup |
|---|---|---|---|
| 0.0 | C/D | 2.0 | **G** |
| 0.5 | **D** | 2.5 | G/H |
| 1.0 | **E** | 3.0 | **H/I** |
| 1.5 | **F** | 3.5 | J/K |

- **Rate ≈ 1 cup per 0.5 step**, non-linear: *flat* in 0–1.0, *steepest* 1.0–2.5, *compressing* 3.0+.
- **G–H — 0.5 steps suffice:** G = 2.0, H = 3.0 (anchor with `huge breasts` so the band doesn't get pulled down).
- **D–F — use 0.25 steps from 0.5:** D = 0.5, E = 1.0, F = 1.5; half-cups at 0.75 / 1.25 read as visible intermediates. **Verified:** 0.5/0.75/1.0/1.25/1.5 are each distinct (D / D-E / E / E-F / F), but the **sub-0.5 region is flat (0.25 ≈ 0.5)** — so start D at 0.5 and don't go below it for granularity. Anchor with `large breasts` to stop drift to C; do NOT add `huge` here.
- **Always fix the seed** when A/B-comparing size (across-seed wobble ≈ ±0.5 grade). The slider sets *relative* volume; `large`/`huge` tags set the *absolute* anchor — combine them at the ends.
- Reproducible: `quality-upgrade/gen_cup_calibration.py`; full report `CUP-CALIBRATION-REPORT.md`.
