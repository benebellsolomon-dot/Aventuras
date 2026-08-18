Tracking the BE-genre pipeline refinement. This is the synthesis step over the v2→v3 deltas.

# v3 Refinement Round — Synthesis Report

## (1) VERDICT

| Metric | v2 mean | v3 mean | Δ |
|---|---|---|---|
| **Overall** | 5.67 | **7.00** | +1.33 |
| **Hands** | 5.50 | **7.17** | +1.67 |
| **Target score** | 3.83 | **7.50** | +3.67 |

- **Overall:** 6/6 improved, 0 same, 0 regressed (on the overall axis).
- **Target metric:** 6/6 improved — every v3 fix moved its intended residual upward, none flat.
- **Hands:** 6/6 improved (5→7, 4→6, 7→8, 6→8, 6→7, 5→7). Mean +1.67. Caveat: in 4 of 6 cells (`v3_01`, `v3_03`, `v3_04`, `v3_05`) hands are partly or fully out of frame, so several hand gains are *avoidance* (hidden hands) rather than *confirmed clean anatomy*. The two cells with hands genuinely in-frame and tested — `v3_02_burst` (4→6) and `v3_06_swimsuit` (5→7) — both improved on real visible hands.

## (2) Per-Residual Table

| Cell | Residual | Target v2→v3 | Verdict | Did the fix land? |
|---|---|---|---|---|
| `v3_01_two_char` | Invented objects + multi-subject coherence | 4→6 | improved | **Partial.** Soda can removed, but a blue phone/card slab respawned in the same cleavage seat — prop negative transmuted the artifact rather than killing it. |
| `v3_02_burst` | Separation under strain + burst depiction | 5→8 | improved | **Yes.** (deep cleavage:1.2)+inter-breast shadow gave a deep continuous cleft; uniboob negatives killed central fusion; strain block converted gaping placket into genuine material failure. |
| `v3_03_strain_geo` | Load-bearing strain physics | 3→7 | improved | **Yes.** Real tension node — converging pucker spokes, asymmetric placket pull, horizontal stress wrinkles. Failure node still soft/mushy, but physics now reads. |
| `v3_04_gravity` | Gravity + both breasts visible + arm-contact deform | 4→8 | improved | **Yes.** Arms-up/hands-behind-head pose un-occluded the right breast and produced genuine soft-tissue compression at the inner-arm junction. |
| `v3_05_fullbody` | Head-to-feet framing (no crop) | 3→9 | improved | **Yes — strongest fix.** Framing tokens + cropped negatives + taller AR delivered a true head-to-feet frame, both feet with toes and ground clearance. |
| `v3_06_swimsuit` | Rigid-garment load-bearing strain | 4→7 | improved | **Yes.** Centerline split with asymmetric gap-open and radiating stress lines replaced v2's frictionless painted shell. Rupture still reads decorative, not 3D necked. |

## (3) P1 / P2 / Regressions

**P1 (no invented objects in two_char): NOT solved — half-met.** The prop negatives were *necessary but insufficient*. The metallic soda can is gone, but a **blue rectangular phone/card slab respawned in the identical cleavage seat on both subjects** (`v3_01`), recolored to the bikini palette. The model has a strong prior to fill the inter-breast cleavage region with *some* object; negating the specific noun (can/bottle/cup) just lets the next-most-likely prop take the slot. This is a location problem, not a vocabulary problem.

**P2 (separation held under strain): SOLVED.** `v3_02_burst` jumped 5→8. (deep cleavage:1.2) + inter-breast shadow + uniboob negatives produced two distinct rounded masses with a continuous shadow furrow and a real tonal gradient between them — no central fusion even under the torn-garment strain condition. This is the cleanest win of the round.

**Regressions: none.** No cell regressed on overall, target, or hands. Two *non-regression caveats* worth flagging:
- `v3_04_gravity`: introduced a new **pose-vs-physics tension** — with arms fully raised the top tissue attachment should lift, yet mass still pools low, so gravity vector and pose are mildly contradictory. Also pronounced L/R asymmetry (left larger/lower). Net still +4 target, but the gravity cue now rides entirely on one pose.
- `v3_04`/`v3_05`: both lean on hands-behind-head to win hands by *hiding* them. That banks the score but leaves the tightened detailer mask unvalidated on in-frame hands.

## (4) CONVERGENCE Call

**CONTINUE — one more round, single high-value fix.** This is *not* yet diminishing returns: target deltas are large (+2 to +6, mean +3.67), and one residual (P1) is structurally unsolved rather than just polish-limited. The other five are in polish territory (soft failure nodes, decorative rupture geometry, asymmetry) — those *are* diminishing returns and should not drive another round on their own.

**The single most valuable v4 change:** fix P1 by attacking *location*, not vocabulary. **Extend the hand-detailer/inpaint mask (or add a dedicated cleavage-region mask) to cover the upper inter-breast seam, and exclude that region from object-friendly conditioning** — so no prop can spawn there regardless of which noun is negated. Pair with a broadened prop negative (add `card, phone, rectangle, slab, smartphone, plate` to the existing `can/bottle/cup`) as a cheap belt-and-suspenders, but the mask is the real fix. P1 is the only residual where the artifact is *consistent, reproducible, and structural* across both subjects — highest expected value.

Everything else can ship as-is.

## (5) Consolidated Tuning Recommendations (fold into preset / prompt-library)

**Keep — promote to defaults (these landed):**
- `(deep cleavage:1.2)` + `inter-breast shadow` positive tokens → default for any cleavage/strain prompt. (`v3_02`)
- Uniboob negatives (`uniboob, fused breasts, single breast mass, no cleavage`) → permanent negative block. (`v3_02`)
- **Failure-mode strain block** (`material failure, stress folds, converging puckers, asymmetric seam pull, popped fastener, torn seam`) → default for all garment-strain intents. Single biggest cross-cell win — landed in `v3_02`, `v3_03`, `v3_06`. (`v3_02`/`v3_03`/`v3_06`)
- Full-body framing block (`feet visible, head to toe, wide shot, full body` + cropped negatives `cropped legs, cut off feet, out of frame` + taller AR) → default for any head-to-feet intent. (`v3_05`)
- Hand-detailer mask tightening (dilation 10→4, crop 3.0→2.0) → keep; cleaner knuckles/finger ridges in every in-frame case (`v3_02`, `v3_06`).
- `both breasts visible` + arms-up/hands-behind-head as the go-to "both-breasts + weight" pose. (`v3_04`)

**Fix in v4 (the one structural carry-over):**
- **Cleavage-region object suppression** — extend inpaint mask over the upper inter-breast seam + exclude from object-friendly conditioning; broaden prop negatives to `can, bottle, cup, card, phone, smartphone, rectangle, slab, plate`. This is the only unsolved residual. (`v3_01`)

**Watch / minor polish (do NOT spend a round on these alone):**
- `v3_04`: when using arms-up, soften the low-mass-pooling weight cue or add a top-attachment-lift token to resolve the pose-vs-gravity contradiction; rein in L/R asymmetry. Validate the detailer on an *arms-down, hands-in-frame* gravity variant — currently untested.
- `v3_03` / `v3_06`: failure node / rupture still reads soft or decoratively 2D — if pursued later, push toward torn-edge thickening/curling (`frayed edge, fabric thickness, 3D tear`), but low priority.
- `v3_06`: base suit material still slightly too glossy/skin-like away from the rupture — minor.
- Prefer at least one **hands-in-frame** test cell per future round so detailer-mask gains are confirmed on visible fingers, not banked via hidden hands.

**Net:** v3 is a strong round — 6/6 target improvements, P2 solved, zero regressions, mean overall 5.67→7.00. Ship v3 settings as the new baseline; run one focused v4 round on cleavage-region object suppression (P1), then expect convergence.