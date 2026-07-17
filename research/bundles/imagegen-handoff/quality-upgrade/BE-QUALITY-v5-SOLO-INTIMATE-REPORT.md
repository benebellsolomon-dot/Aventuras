-of-mind
This is a synthesis task. I have all the data I need in the JSON. No tools required — just write the report.

# SOLO/INTIMATE BE-Scene Image-Quality Report — v5 Round (8 cells)
**Pipeline:** WAI-illustrious-SDXL v17 + ComfyUI, tuned v3 (dpmpp_2m_karras, CFG5, hand-detailer, matte skin, deep-cleavage)

---

## 1. TL;DR

The current pipeline renders **faces, affect, hair, and bedroom ambience at a reliably high bar** (expression_affect averages ~7.4, peaking 8.5 on `lying_side`), but **fails the entire physical-interaction core of this regime**. Across all 8 cells the two defining mechanics of intimate solo scenes — **hand-on-breast contact deformation** and **gravity-correct soft-tissue behavior** — are broken or absent. Mean overall is **6.1/10**: competent portraiture wrapped around non-functional body physics.

Three systemic defects recur in nearly every cell:
- **Hands are the worst region whenever present** (`hands` mean ~3.9; `self_grope` 3, `growth_intimate` 4, `closeup` 4). Fingers fuse into mittens/blobs, knuckles and nails dissolve, and where hands touch breasts they read as **decals laid on the surface** — zero indentation, zero inter-finger bulge, zero contact shadow. The prompt's "fingers sinking / soft-tissue compression" is delivered in **0 of 8** images.
- **Gravity is consistently wrong** (`reclining_gravity` mean ~4.4). Upright/seated poses (`self_grope`, `growth_intimate`) show breasts as **rigid forward shelves** that should drape; supine poses (`pov` 3.5, `lying_back` partial) show **rigid hemispheres projecting straight up** instead of spreading laterally. Only `lying_back` got supine spread directionally right.
- **Clone-symmetry and arm dropout.** Breasts render near-perfectly mirrored (`expression`, `self_grope`) with hard balloon contours and a sharp central cleavage seam; arms vanish below the shoulder in `self_grope`, `lying_back`, and partially `arched`.

**Highest-impact prompt-engineering changes for this regime (priority order):**
1. **Mandatory hand-fix inpaint pass** (low-denoise, hand-targeted) on every cell where hands are in frame — this is the single biggest score ceiling. No positive-prompt tweak will fix mitten fingers at base denoise.
2. **Add explicit contact-deformation tags** — `fingers pressing into breast, skin indentation, flesh bulging between fingers, contact shadow` — paired with **higher local denoise at the hand/breast boundary**. Contact is currently inert in 100% of touch cells.
3. **Pose-conditioned gravity tags**: for upright → `hanging breasts, heavy breasts sagging, breast drape, soft underside`; for supine → `breasts spreading to sides, flattened, gravity pulling toward chest`. Current `deep-cleavage` LoRA/tag bias is fighting gravity by forcing forward projection.
4. **Break clone-symmetry**: add `asymmetric breasts, natural breast asymmetry` positive + `symmetrical breasts, mirrored, identical breasts` negative.
5. **Anti-dropout + anti-merge negatives**: `missing arms, missing hands, floating breasts, fused fingers, melted fingers, plastic skin`.

---

## 2. Scoreboard

| Label | Focus | Overall | Key dimension | Standout weakness |
|---|---|---|---|---|
| `v5_01_self_grope` | hand-on-breast (cup from below) | **5.0** | hand_on_breast **3** | Hands = mirrored blobs; areola discs fuse into fingertips; rigid spheres defy seated gravity |
| `v5_02_lying_back` | supine gravity (from above) | **6.5** | reclining_gravity **7.5** | Both arms vanish below shoulders; breast size/areola mismatch; waist-axis perspective bend |
| `v5_03_lying_side` | side-lying drape | **6.5** | reclining_gravity **4.5** | Breasts hang frontal, no lateral pool toward mattress; underbust melts into bedding |
| `v5_04_arched` | arched/presenting kneel | **6.0** | pose_coherence **5** | No spine arch; breasts float forward vs upright kneel; left support hand dissolves into bed |
| `v5_05_expression` | intimate affect | **6.5** | expression_affect **8** | Clone-mirrored breasts; garment blobs in lower corners; no hands despite self-touch intent |
| `v5_06_pov` | POV / looking-at-viewer | **6.5** | reclining_gravity **3.5** | Supine breasts project straight up as rigid spheres; hard medial specular seam; arms cropped out |
| `v5_07_growth_intimate` | growth-in-context + touch | **6.0** | hand_on_breast **4** | Both hands blobby + inert contact; "torn clothes/bursting" prompt unrendered; rigid shelf cleavage |
| `v5_08_closeup` | close-frame contact QA | **6.0** | hand_on_breast **5** | Hands flat overlays, fused/foreshortened fingers; areola fully occluded → QA target unverifiable |

Means: overall **6.1** · expression_affect **7.4** · reclining_gravity **4.4** · hands (where present) **3.9** · soft_tissue_deform **5.0**.

---

## 3. Dimension Findings

### HAND-ON-BREAST CONTACT — `self_grope`, `growth_intimate`, `closeup`
**Pipeline handles it: NO.** This is the regime's defining mechanic and it fails in all three dedicated cells (hand_on_breast 3 / 4 / 5).
- **Two compounding failures.** (a) *Hand anatomy*: fingers fuse into mittens/blobs, knuckles/nails absent (`self_grope` "identical mirrored blobs", `growth_intimate` "reads as a mitten", `closeup` "fused/foreshortened... thumb melts into the breast"). (b) *Contact physics*: even when a hand is correctly placed, it sits **ON** the tissue — no indentation, no inter-finger flesh bulge, no occlusion/contact shadow (`growth_intimate` "physically inert"; `self_grope` "tissue stays convex and unbroken under the grip").
- **What helped:** `closeup` is the **only** cell showing any real deformation ("surface dimples slightly under the palms, upper-pole flattens a touch") — close framing + larger contact area gave the sampler more pixels to resolve pressure. This is the directional proof that tighter framing + explicit contact tags can work.
- **What failed:** the `self_grope` fingertip/areola boundary **melts/fuses** (areola discs sit atop fingertips with undefined boundary). In `closeup` the areola is **fully occluded**, so the QA target is unverifiable as composed — a composition mistake.

### RECLINING GRAVITY — `lying_back`, `lying_side`, `pov`
**Pipeline handles it: PARTIALLY (1 of 3).**
- **`lying_back` (7.5) is the lone success** — supine mass spreads laterally toward the arms and flattens/widens, which is correct supine behavior. "From above" framing (pillow, foreshortened face, downward sightline) reinforced it.
- **`pov` (3.5) is the worst** — same supine intent, but breasts **project straight up as rigid hemispheres**, no lateral spread, no drape toward sternum, with a hard medial specular seam reading as a rendered tangent line. The difference from `lying_back` suggests the gravity result is **unstable/seed-dependent**, not reliably conditioned.
- **`lying_side` (4.5)** — gravity reads near-frontal; breasts hang straight down instead of pooling toward the mattress (upper breast should drape over the lower). Underbust dissolves into bedding with no ribcage attachment.
- **Takeaway:** the pipeline *can* produce supine spread (`lying_back`) but does not do so **reliably** — the `deep-cleavage`/forward-projection bias wins by default. Side-lying lateral pool is essentially never rendered.

### POSE COHERENCE — `arched`, `kneeling`(in `arched`/`closeup`), `lying`
**Pipeline handles it: WEAK on complex poses.** (pose_coherence: `arched` 5, `lying_side` 5.5, `growth_intimate` 5).
- **`arched` is the clearest failure** — the requested spine arch is **absent**; torso renders near-vertical and flat with no navel/midline, and breast gravity fights the kneel (forward float vs expected hang). The left support hand dissolves into bedding.
- **Recurring lower-torso defect zone:** navel/midline missing in `arched`, `lying_back`, `pov`, `closeup`; abdomen→hip→thigh boundaries are "mushy" with soft melts between breast underside, abdomen, and thigh.
- **`lying_back` waist-axis bend** — top-down upper body vs more frontal hips folds the torso unnaturally at the waist (camera inconsistency).

### EXPRESSION / AFFECT — `expression`, `arched` (+ all cells)
**Pipeline handles it: YES — this is the strength.** (expression_affect: `lying_side` 8.5, `self_grope`/`expression`/`lying_back` 8–7.5).
- **Consistently working tags:** half-lidded eyes, dual-cheek/nose-bridge blush, parted lips → reads as coherent aroused/drowsy affect across nearly every cell. Symmetric eyes, clean iris highlights, no eye/iris artifacts. Hair and warm bedside-lamp key light reinforce intimacy.
- **The one affect loss is framing-driven:** `closeup` (expression_affect 6) crops at the upper lip, removing parted-lips/blush signal — a composition choice, not a model failure. Keep the mouth in frame when affect matters.

---

## 4. Intimate Prompt-Engineering Recommendations

Concrete tag blocks. Booru-style, ordered by intended weight; `(tag:1.x)` = emphasis.

**A. Hand-on-breast contact (use with a hand-fix inpaint pass — see §5):**
```
positive: grabbing own breast, hand on breast, (fingers sinking into breast:1.3),
          (skin indentation:1.2), flesh squeezed between fingers, soft breast deformation,
          fingertip pressing, (contact shadow under fingers:1.1), individual fingers,
          detailed knuckles, articulated thumb
negative: (fused fingers:1.4), mitten hands, blob hand, (extra fingers:1.3),
          melted fingers, hand floating above breast, flat hand, decal hand
```
Pair with **higher local denoise (~0.5–0.6) at the hand/breast region** via inpaint, or a hand-detailer pass with breast-contact in the positive so the detailer doesn't "clean off" the deformation.

**B. Reclining gravity:**
```
supine (lying on back / POV):
  positive: lying on back, (breasts spreading to sides:1.3), (flattened breasts:1.2),
            gravity pulling breasts toward chest, soft sagging sideways, reduced projection
  negative: (breasts projecting upward:1.3), rigid breasts, spherical breasts,
            (floating breasts:1.2), hard cleavage seam

side-lying:
  positive: lying on side, (breast resting on mattress:1.3), upper breast draping over lower,
            (lateral breast pool:1.2), underbust crease, breast on bed
  negative: breasts hanging straight down, frontal breast gravity
```
Note: this regime needs the `deep-cleavage` forward-projection bias **dialed down for reclining cells** — consider lowering that tag's weight or LoRA strength when `lying`/`POV` is in the prompt, since it is actively fighting supine spread.

**C. Intimate expression (already strong — lock it in):**
```
positive: half-lidded eyes, (seductive expression:1.1), blush, parted lips,
          flushed cheeks, looking at viewer, soft intimate gaze
```
Keep the mouth in frame whenever affect is the cell's purpose (counter-example: `closeup` cropped it).

**D. Intimate framing / lighting:**
```
positive: warm bedside lamp lighting, soft rim light, intimate bedroom, shallow depth of field,
          (matte skin:1.2), subsurface skin, soft shadows
negative: (plastic skin:1.4), wax skin, (glossy specular:1.3), wet sheen,
          blotchy highlights, blown-out highlights, bloom
```
The wet-plastic/blotchy specular flagged in `pov`, `expression`, and `closeup` directly contradicts the "matte skin" pipeline goal — the negatives above plus a small CFG drop should restore matte subsurface.

**E. Regime-wide negatives to add:**
```
(missing arms:1.3), missing hands, disconnected limbs, (symmetrical breasts:1.2),
mirrored breasts, identical breasts, clone breasts, balloon breasts,
(plastic skin:1.3), areola fused with hand, third breast
```

---

## 5. v6 Priorities

**P1 — Hand quality + contact deformation (blocks the whole regime).**
*Change:* Make a **hand-targeted inpaint/hand-fix pass mandatory** in the graph for any cell with hands in frame (ADetailer/hand-detailer with a hand-bbox model, local denoise ~0.5). Feed it the §4A contact block so it resolves articulated fingers **and** press-deformation rather than cleaning the hand into a smooth blob. Validate against `self_grope` (3) and `growth_intimate` (4). This is the highest-ceiling fix — it gates 3 dedicated cells plus partial credit elsewhere.

**P2 — Gravity conditioning by pose (fix the supine instability).**
*Change:* Add the §4B pose-conditioned gravity tags **and lower the `deep-cleavage` tag/LoRA weight on reclining cells**. `lying_back` (7.5) proves the model *can* do supine spread; `pov` (3.5) proves it's unreliable by default. If tags alone don't stabilize, condition with a ControlNet depth/pose hint for the supine silhouette. Validate `pov` and `lying_side` reach `lying_back`'s level.

**P3 — Pose coherence for arch/kneel + lower-torso landmarks.**
*Change:* For `arched`, add `(arched back:1.3), curved spine, presenting` and strongly consider an **OpenPose ControlNet** to force the spine curve the prompt alone cannot produce (currently torso renders flat-vertical). Add `navel, defined abdomen, abdominal midline` across cells to fix the recurring "mushy lower-torso/no navel" defect (`arched`, `lying_back`, `pov`, `closeup`).

**P4 — Clone-symmetry + arm-dropout + merge artifacts.**
*Change:* Add the §4E negatives (`symmetrical/mirrored/identical breasts`, `missing arms/hands`, `areola fused with hand`). Targets the mirror-clone breasts in `expression`/`self_grope`, the vanished arms in `lying_back`/`self_grope`, and the fingertip↔areola melt in `self_grope`.

**P5 — Specular/skin matte regression + composition QA.**
*Change:* Apply §4D matte negatives and trim CFG slightly to kill the wet-plastic/blotchy speckle (`pov`, `expression`, `closeup`) that contradicts the matte-skin pipeline goal. Add a **composition rule**: never fully occlude the areola/nipple in a contact-QA cell (`closeup` occluded its own test target) and keep wrists in-frame when hand QA matters (`pov` cropped hands out).

---
**Bottom line:** v6 should treat faces/affect/lighting as solved and **redirect all engineering effort to hands, contact deformation, and pose-conditioned gravity** — the three axes that currently separate this pipeline from delivering credible intimate solo scenes.