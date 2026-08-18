Below is the synthesis report.

---

# Refinement Round v2 — Synthesis Report
**Pipeline:** WAI-illustrious-SDXL v17 + ComfyUI | **v2 changes:** dpmpp_2m_karras CFG5, gloss removal, hand-detailer pass (hand_yolov8s), hand+fusion negatives, gravity/strain-geometry tag blocks, separation aids

## 1. VERDICT — Did v2 improve overall?

**Yes, clearly.** v2 is a net win across the board.

- **Mean overall:** v1 = **5.69** → v2 = **6.875** (+1.19, ~+21%)
- **Mean target score:** v1 = **3.69** → v2 = **6.625** (+2.94, ~+80%)
- **Targets improved / same / regressed:** **7 improved, 1 same, 0 regressed** (of 8)
  - The lone "same" is `v2_08_burst` (target flat 6.5→6.5) — burst-depiction gain was cancelled by a separation regression, not a failure of the round.

No target moved backward on its headline metric. The biggest target-metric jumps were strain-geometry (4→8) and the two anti-fusion cells (3→7, 3→6).

## 2. Hands — Did the hand-detailer pass work?

**Mostly yes — a strong win in 7 of 8 cells, with 1 clear failure.**

- **Mean hands:** v1 = **3.5** → v2 = **6.44** (+2.94, ~+84%)
- Hands improved in 7/8 cells; the standout is `v2_06_fullbody` (3→8) and `v2_08_burst` (6→8).

**Where it failed / cheated:**
- **`v2_07_two_char` — the one outright miss (hands 3→3).** The detailer did not clean hands; it *introduced artifacts* — each girl now grips a malformed soda can, with fingers unresolved and hand geometry blended into can+breast. v1 simply had no hands in frame (nothing malformed), so this is arguably a quality regression even though the score is flat. The detailer invented props/objects rather than fixing anatomy.
- **"Solved by avoidance" cases — robustness unproven:** In `v2_02_gigantic_aids` (2→7), `strain_geo` (partly), and `v2_06`/`v2_02`, clean hand scores were achieved partly by hiding hands off-frame or behind the body. The detailer's ability to render *complex in-frame grips* is not yet proven in those cells.
- **In-frame weak spots:** `v2_01_huge_hands` right hand is stubby with a mushy thumb junction (left hand is clean); `v2_04_gravity` and `v2_05_swimsuit` hands are correct-count but slightly short/stubby.

**Net:** the hand-detailer is the single most valuable v2 addition where hands are in frame and *not* gripping an invented object.

## 3. Per-Fix Table

| Cell label | Target metric | v1→v2 target | Verdict | One-line takeaway |
|---|---|---|---|---|
| `v2_01_huge_hands` (vs 05_pipe_hires) | hand quality + gloss reduction | 3.5 → 7 | **improved** | Gloss removal + detailer both landed; matte skin, both hands resolved (left clean, right stubby). |
| `v2_02_gigantic_aids` (vs 03_size_gigantic) | separation / anti-fusion at gigantic | 3 → 7 | **improved** | Separation aids broke the single fused mass into two real breasts; hands clean only by hiding them. |
| `strain_geo_v1_vs_v2` | clothing strain-geometry realism | 4 → 8 | **improved** | Strain tokens produced genuine button-gap/stress-fold mechanics; biggest target jump of the round. |
| `v2_04_gravity` (vs 11_topless) | weight/sag/gravity realism | 3 → 6 | **improved** | Gravity block delivered pendulous teardrop + underboob shadow; far breast + arm-contact deformation still unsolved. |
| `v2_05_swimsuit` (vs 07_dtg_off) | rigid-garment strain realism | 3 → 6 | **improved** | Structured suit gave real compression/piping; folds are highlight-faked, logo is gibberish. |
| `v2_06_fullbody` (vs 12_extreme_fullbody) | hands at full-body + extreme-size | 3 → 6 | **improved** | Best hands of the set (8/10) but framing regressed — cropped to mid-thigh, feet cut, capping target at 6. |
| `v2_07_two_char` (vs 13_two_char) | multi-subject fusion + hands | 3 → 6 | **improved** | Inter-girl fusion fixed (big win); detailer backfired into malformed soda-can hands (3→3). |
| `v2_08_burst` (vs 10_strain_burst) | burst depiction + separation | 6.5 → 6.5 | **same** | Burst-in-progress depiction improved but central cleavage cleft regressed — gains cancel out. |

## 4. KEEP vs DROP/ADJUST

### KEEP — confirmed wins
- **Gloss removal ("no gloss").** Matte, diffuse skin in every cell that mentioned it (`v2_01`, `strain_geo`, `v2_04`). Zero downside. Lock it in.
- **dpmpp_2m_karras CFG5.** Coherent faces/overall throughout; no instability reported. Keep as base sampler.
- **Hand-detailer (hand_yolov8s) — for in-frame, non-gripping hands.** Drove the +2.94 hands mean. Keep, but see ADJUST.
- **Strain-geometry tag block** (taut fabric / stress folds / gaping shirt / button gap). Single biggest target lift (4→8). Keep and reuse.
- **Separation aids** (cleavage / between-breasts / underboob-shadow) + **fused-breast negatives.** Fixed single-mass fusion in `v2_02`, `v2_06`, and inter-subject fusion in `v2_07`. Keep — but they did **not** hold under the strained-shirt case in `v2_08` (see ADJUST).
- **Gravity block** (hanging / heavy / sagging / underboob-shadow). Clear 3→6 on `v2_04`. Keep and strengthen.

### DROP / ADJUST — no-ops or regressions
- **ADJUST the hand-detailer mask — it invents objects.** In `v2_07` the detailer created malformed soda cans fused to hands/breasts. **Constrain the detailer mask so it cannot add props**, and/or drop held-object prompts when the detailer runs. This is the highest-priority fix.
- **DROP held-can / held-prop tokens** in multi-subject cells (`v2_07`) — they gave the detailer something to mangle.
- **ADJUST separation weighting under strain.** In `v2_08` the strained-shirt shading erased the central cleft (separation regressed). The separation aids are not robust when a fastened/strained garment flattens the midline — they need reinforcement specifically in burst/strain cells.
- **Watch framing tokens.** `v2_06` cropped to mid-thigh despite "gigantic full body." Not a v2 change per se, but it caps the score — needs an explicit framing fix (see v3).

## 5. v3 PRIORITIES — Top 5 remaining weaknesses + concrete next change

**P1 — Hand-detailer invents/mangles held objects (`v2_07_two_char`).**
The most damaging residual: the detailer fused malformed soda cans into hands+breasts (hands 3→3, offsetting the fusion win).
→ **Change:** Constrain the hand-detailer to a hand-only mask (tighten the YOLO bbox / shrink mask dilation so it doesn't bleed onto props or chest), and **remove held-object tokens** ("holding can", etc.) from multi-subject prompts. Add `deformed object, warped can, fused fingers` to the negative. Re-test `v2_07` with empty hands or an occluding arm.

**P2 — Breast separation collapses under strained-garment shading (`v2_08_burst`).**
Separation aids work for bare/loose chests but the uniform under-shirt shading erased the central cleft (target flat 6.5→6.5).
→ **Change:** In burst/strain cells, increase weight on `(deep cleavage:1.2)` / `(cleavage gap:1.2)` and add `inter-breast shadow` explicitly; reduce the uniform mid-shirt shading by adding `flat chest, uniboob, single breast mass` to the negative. Goal: restore the deep central cleft v1 had while keeping v2's burst depiction.

**P3 — Garment physics is "floating/idealized," not load-bearing (`v2_02`, `strain_geo`, `v2_05`, `v2_06`).**
Recurring across four cells: shirt hems float unsupported over underboob (`v2_02`), a single button implausibly holds a wide-open shirt (`strain_geo`), folds are highlight-faked with no junction puckering (`v2_05`), and no torso strain folds justify the mass (`v2_06`).
→ **Change:** Add a "failure-mode" strain block — `popped button, torn seam, asymmetric strain, fabric puckering at seams, stress wrinkles converging at closure` — and weight asymmetry so the gap isn't rendered as a clean symmetric diamond. Consider a small img2img/inpaint strain pass on the placket region.

**P4 — Gravity is half-sold: occluded far breast + no arm-contact deformation (`v2_04_gravity`).**
Only the near breast shows convincing sag; the far breast behind the forearm is ambiguous, and the forearm pressing the chest causes zero tissue compression — undercutting the "heavy/soft" claim.
→ **Change:** Add `soft tissue compression, breast deformed by arm, indentation where arm presses, both breasts sagging` and a true-shadow token (`cast shadow under breast, occlusion shadow` rather than a painted line). Prefer poses where both breasts are visible, or accept single-breast framing to avoid the ambiguous occluded contour.

**P5 — Full-body framing regression (`v2_06_fullbody`).**
"Gigantic full body" cropped to mid-thigh, feet cut — caps an otherwise-excellent cell (great hands) at target 6.
→ **Change:** Enforce framing with `full body, feet visible, head to toe, full figure, wide shot` up front and `cropped, cropped legs, out of frame, close-up` in the negative; if SDXL still crops at portrait aspect, switch this cell to a taller aspect ratio (e.g. 832×1216) so head-to-feet fits.

**Honorable mention (P6 if budget allows):** residual **wet-skin specular drip/streak artifacts** persist on breast/abdomen in `v2_04` (and stray window speckles in `v2_01`) even after gloss removal — add `water drips, skin streaks, specular streaks, sweat` to the negative to finish the matte-skin job.

---

**Bottom line:** v2 is a confident ship — overall +1.19, target +2.94, hands +2.94, 7/8 targets improved, none regressed. Keep gloss removal, the sampler, strain-geometry, separation aids, gravity block, and the hand-detailer. The two things actually worth fixing before v3 are narrow: the **detailer inventing objects in multi-subject shots (`v2_07`)** and **separation collapsing under strained garments (`v2_08`)**.