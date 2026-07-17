I'll write the report directly. The data is comprehensive and self-contained, so no tool calls are needed.

# WAI-illustrious-SDXL v17 — BE-Genre Image-Quality Report

**Pipeline:** WAI-illustrious-SDXL v17 + ComfyUI · **Run scope:** 13 evaluated cells (08_dtg_on failed; see note) · **Date:** 2026-06-14

---

## 1. TL;DR

**Overall verdict:** The model is **production-capable for the BE genre at the "huge" tier and below**, with a tight, predictable quality band (overall scores cluster 6.0–7.5). Faces, eyes, color separation, and tag adherence are consistently strong (face/eyes 7.0–8.5; prompt adherence 7–9 across every cell). The quality ceiling is set by two near-universal failure modes — **hands** (scored 3–5.5 in *every* cell) and **bust weight/strain physics** (gravity and fabric-tension cues are weak-to-absent almost everywhere). Size scaling is monotonic and reads the size token correctly, but coherence visibly breaks between **huge** and **gigantic** (`01→02→03`).

**Highest-impact tuning changes (in priority order):**

1. **Add an automated hand-region inpaint/ADetailer pass + hand negatives** (`bad hands, fused fingers, extra fingers, missing fingers`). Hands are the single largest score drag in 13/13 cells — fixing them lifts nearly every render by ~1 point.
2. **Cap the default size tag at `huge`.** It is the last tier (`02`) that holds breast separation, garment physics, and torso-join integrity; `gigantic` (`03`) degrades all three simultaneously and bleeds into unrelated attributes (garment color shift).
3. **Reduce global wet/specular skin gloss weight.** Uniform oily sheen flattens breast volume and reads as plastic across `09/10/11/14` — it is the second most visible artifact after hands.
4. **Make FaceDetailer conditional, not default.** At medium-portrait framing it is a near-zero-delta cost (`05`≈`06`). Gate it on face-bbox area (~<12–15% of frame) so it only runs on full-body/wide/multi-char shots that actually need it.
5. **Switch default sampler to `dpmpp_2m karras CFG5`** for cleaner backgrounds and no highlight banding, with `euler_a CFG6` reserved as an opt-in hero-crispness path.

---

## 2. Scoreboard

| Cell | Overall | Anat | Hands | Face/Eyes | Adher | Standout strength | Standout weakness |
|---|:--:|:--:|:--:|:--:|:--:|---|---|
| 01_size_large | 7.0 | 7 | 4 | 8 | 8 | Reference-quality face/color; clean bust-torso seam | Melted doorknob hand + cropped hand; bust trends over tag |
| 02_size_huge | 7.0 | 7 | 5 | 8 | 9 | Best volume-vs-coherence balance; defined cleavage | Painterly (not structural) shirt strain; lower hand |
| 03_size_gigantic | 6.0 | 5 | 3 | 7.5 | 8 | Strong hair/face; size silhouette sells "gigantic" | Breasts fuse to one shelf; no underbust; melted hand |
| 04_pipe_base | 6.5 | 6 | 4 | 7 | 8 | Clean face; strong tag adherence | Base-only softness; flat plasticky shirt; no underbust |
| 05_pipe_hires | 6.5 | 6 | 4 | 8 | 8.5 | Carries the pipeline; resolves all detail | Central breast seam + shirt banding; narrow-waist break |
| 06_pipe_hires_face | 7.5 | 7 | 5.5 | 8.5 | 9 | FaceDetailer face is the cleanest in run | Soft lower hand; ambiguous lower-right contour |
| 07_dtg_off | 7.0 | 7 | 5 | 8 | 8 | Convincing swimsuit strain; smooth chest transition | Merged fingers on under-bust hand; under-arm fabric junction |
| 09_strain_taut | 7.0 | 7 | 5 | 8 | 7 | Best static clothing-strain; clean inner separation | "Straining buttons" not depicted; both grip-hands fused |
| 10_strain_burst | 6.5 | 6 | 4 | 7.5 | 8.5 | Best active-burst concept; high tag adherence | Fused single-dome bust; mitten hands; blown specular |
| 11_topless | 6.5 | 6 | 5 | 8 | 8.5 | Cleanest bare anatomy; correct areola placement | Upper-pole floats off chest wall; patchy gloss |
| 12_extreme_fullbody | 7.0 | 6 | 3 | 8 | 8 | Strong full-body S-curve composition | Both hands melted; absent underbust seam |
| 13_two_char | 6.5 | 6 | 4 | 7.5 | 9 | Multi-subject stayed clean (no head/face fusion); size parity | All hands cropped/dissolved; inter-girl cleavage fuses |
| 14_sampler_dpmpp | 6.5 | 6 | 3 | 7.5 | 7 | Smooth, band-free, clean background | Cropped/melted hands; hard cutout breast edge; over-tag |
| ~~08_dtg_on~~ | — | — | — | — | — | **FAILED — DanTagGen node runtime error; auto-prompt A/B not possible this run** | — |

**Aggregate read:** Face/eyes mean ≈ 7.9 (strong). Hands mean ≈ 4.2 (the systemic floor). No cell scored hands above 5.5; no cell scored face/eyes below 7.

---

## 3. Size-Tag Findings

Evidence: same-seed/same-subject ladder `01_size_large → 02_size_huge → 03_size_gigantic`.

- **Scaling is monotonic and token-faithful.** Rendered volume increases consistently large < huge < gigantic with no inversion or plateau — the model genuinely reads the size token. Growth is roughly **linear from large→huge**, then **super-linear into gigantic**.
- **`large` (01):** Highest absolute quality and the cleanest tag-to-size match, though it trends ~one notch over a clean "large." Natural teardrop, symmetric seating, coherent shirt drape.
- **`huge` (02):** **The sweet spot.** Two distinct symmetric breasts, correct cleavage geometry, and *physically correct* horizontal shirt stretch-banding (this is real behavior, not an artifact). Last tier with full anatomical/compositional integrity.
- **`gigantic` (03):** **Coherence breakpoint.** Breasts merge into a near-single undifferentiated shelf with weak central separation; the bust-to-torso join becomes implausible (mass floats over a torso too small to attach it); garment stress lines become decorative streaks; and the large token perturbation **bleeds into unrelated attributes** (shirt color shifted to navy). Size is honored but at visible anatomy cost.

> **Recommended size-tag ceiling: `huge`.** This is the largest faithful scaling that retains clean anatomy, breast separation, plausible strain, and well-formed structure. Reserve `gigantic`/extreme only for shots that genuinely require it (`10`, `12`), and **always pair it with separation aids** (see §7).

---

## 4. Pipeline ROI

Evidence: same prompt/seed `04_pipe_base → 05_pipe_hires → 06_pipe_hires_face`.

- **base → hires: large, decisive delta.** The base render (`04`, ~256px, soft) is low-detail rather than defective — smeared eyes, flat hair masses, structureless fabric. The hires pass (`05`, ~400×640) resolves everything: discrete hair strands, fabric folds, jean stitching, sharp irises/catchlights, and a plausible 5-finger hand. **This stage carries the pipeline's quality.**
- **hires → hires+FaceDetailer: negligible delta.** `06` is near pixel-identical to `05` — only marginal iris/lash crispness and cleaner earring edges, no defect repair. At medium-portrait framing the face already occupies enough pixels that the hires sampler resolves it; **FaceDetailer had nothing broken to fix.** (Note `06`'s overall 7.5 vs `05`'s 6.5 reflects scorer variance on a near-identical frame, not a measurable detailer gain.)

> **Recommended default pipeline: `base → hires` only.** Skip FaceDetailer by default at portrait/medium framing. **Gate FaceDetailer on a face-bbox-to-frame-area threshold (~<12–15%)** so it runs only on full-body (`12`), wide, and multi-character (`13`) compositions where the hires sampler under-resolves faces and the detailer actually has defects to repair.

---

## 5. Sampler / CFG Recommendation

Evidence: same-seed `05_pipe_hires` (euler_a CFG6) vs `14_sampler_dpmpp` (dpmpp_2m karras CFG5).

**Near-tie; both clean on anatomy, paired eyes, and size adherence.**

- `euler_a CFG6` (05): slightly crisper hair/seams/stitching, but **faint banding in bright t-shirt highlights** and a busier background.
- `dpmpp_2m karras CFG5` (14): smoother, **no banding, cleaner background**, at the cost of slightly waxier skin/hair.

> **Default: `dpmpp_2m_karras`, CFG 5** — equal anatomy/size adherence, cleaner background, no banding, more robust across seeds and size tiers. Keep `euler_a CFG6` as an opt-in for hero shots needing maximum crispness; if it stays in the hires path, **drop CFG to ~5.5** to suppress the highlight banding seen in `05`. (Note: neither sampler fixes hands — both `05` and `14` merely crop/obscure them at the lower edge.)

---

## 6. Failure Modes & Mitigations

**A. Hands — the universal failure (every cell, scored 3–5.5).**
Pattern: fingers fuse/melt wherever a hand grips fabric (`09`, `10`, `11`), and hands at the frame edge either crop out or dissolve into mitten blobs (`01`, `04`, `12`, `13`, `14`). dpmpp low-step extremity dissolution is visible in `14`.
- *Mitigations:* append `bad hands, fused fingers, extra fingers, missing fingers, mitten hands` to the negative; **run an automatic hand-detection ADetailer/inpaint pass on every render, mandatory on any gripping pose**; stop relying on lower-frame cropping to dodge the failure (`13`, `14`) — let hands render and repair them instead.

**B. Extreme-size anatomy — fusion + missing attachment (`03`, `10`, `12`).**
Pattern: at gigantic scale breasts fuse into a single shelf with no inter-breast seam, **no underbust crease/shadow**, and the mass visually detaches from the ribcage (floats).
- *Mitigations:* add `cleavage, between breasts` separation emphasis and an underbust-shadow cue; add negatives `fused breasts, single breast, conjoined`; cap default size at `huge` (§3); regen extreme shots with an explicit anatomy quality tag + light bust-merge inpaint.

**C. Multi-subject seam fusion (`13`).**
Pattern: distinct heads/faces succeeded, but the *inner* breasts of the two girls fuse into an ambiguous central mass and straps melt into skin.
- *Mitigations:* **regional prompting / per-character masks** so each subject's chest is conditioned independently; add `extra breasts` to the negative for 2girls; condition each character's strap geometry separately.

**D. Garment-physics flatness & specular gloss (`04`, `05`, `09`, `10`, `11`, `14`).**
Pattern: shirts render as smooth shaded volumes (drape, not strain); uniform wet/oily specular flattens form; hires banding appears as fake "strain."
- *Mitigations:* reduce `wet / oily skin / glistening / shiny` weighting; prefer explicit directional-strain tags over relying on the model to infer tension (see §7); for `euler_a`, lower CFG to suppress highlight banding.

---

## 7. BE-Specific Tuning

**What worked:**
- **`huge` + fitted tee (02):** produced genuinely *correct* physics — horizontal stretch-banding across the apex and a believable underside drape. This is the recipe to anchor on.
- **Swimsuit/spandex strain (07):** glossy spandex with the suit edge cutting into soft tissue gave the **most convincing garment strain in the run** — rigid/elastic garments sell strain better than loose cotton tees.
- **Active-burst concept (10):** torn shirt + flying button + surprised affect + `breast expansion` delivered the strongest *moment-of-rupture* read and highest tag adherence (~90%) — excellent for freeze-frame growth shots.
- **Static taut-shirt (09):** `taut shirt, cleavage, underboob` with gripping hands produced the best *static* strain realism.

**What didn't:**
- **`gigantic` raw token (03, 12):** loses inter-breast separation and underbust attachment; not usable without separation/anatomy aids.
- **"buttons straining" (09):** **not literally rendered** — the model produces an open placket, not the tell-tale gaping diamond-gaps, placket pucker, or load-lines radiating from fastening points. This phrase under-delivers; don't rely on it alone.
- **Gravity/weight everywhere:** near-universally under-served. Bust sits high, round, and buoyant with minimal sag, no underbust shadow, and no compression/hammock effect (`04`, `05`, `10`, `11`, `12`, `13`, `14`). The model paints volume but not loaded soft-tissue physics.
- **Inferred strain:** leaving the model to imply tension yields painterly smudge (`02`, `03`), not converging stress folds.

**Emphasis / weight guidance:**
- Add explicit gravity cues: `hanging breasts, heavy, underboob shadow, sagging` to push weight realism the model won't infer on its own.
- Add explicit strain geometry rather than the literal "straining buttons": `taut fabric, fabric stretched, stress folds, gaping shirt, strained buttons` — and prefer rigid/elastic garment tags (swimsuit, leotard) when strain is the hero element.
- **De-emphasize specular:** drop or down-weight `shiny/wet/oily` toward neutral; the model over-applies gloss and it flattens volume.
- Keep size token at `huge` and reach larger scale via *garment failure / expansion framing* (`10`) rather than escalating to `gigantic`, which trades away the two-volume read.

---

## 8. Action Items (Prioritized)

| # | Priority | Action | Evidence |
|---|---|---|---|
| 1 | **P0** | Add a mandatory hand-detection ADetailer/inpaint pass + hand negatives to the default workflow | hands 3–5.5 in 13/13 cells |
| 2 | **P0** | **Fix and re-run the DanTagGen cell (`08_dtg_on`)** — node errored at runtime; the auto-prompt vs manual-prompt A/B could not be evaluated this run and remains an open question | note_cell_08 |
| 3 | **P1** | Set default size-tag ceiling to `huge`; flag `gigantic`+ to require separation/anatomy aids | 01→02→03 ladder; coherence break at huge→gigantic |
| 4 | **P1** | Make FaceDetailer conditional on face-bbox area (~<12–15%); remove from default portrait path | 05≈06 near-identical |
| 5 | **P1** | Switch default sampler to `dpmpp_2m_karras CFG5`; keep `euler_a CFG6` (→5.5) as hero opt-in | 05 vs 14 |
| 6 | **P2** | Reduce global wet/specular gloss weight across all BE prompts | gloss flattening in 09/10/11/14 |
| 7 | **P2** | Build a separation/underbust template (`cleavage, between breasts, underboob shadow` + fused-breast negatives) for any shot above huge | 03, 10, 12 fusion |
| 8 | **P2** | Add regional prompting / per-character masks for all multi-subject BE shots | 13 inter-girl cleavage fusion |
| 9 | **P3** | Add explicit gravity/strain tag block to the BE prompt library; deprecate reliance on "buttons straining" as a literal cue | weight under-served run-wide; 09 button miss |
| 10 | **P3** | Prefer rigid/elastic garments (swimsuit/leotard) when strain is the hero element | 07 strain quality |

---
*Note: 08_dtg_on excluded — DanTagGen node runtime error prevented render; auto-prompting could not be A/B-tested this run (Action Item #2).*