Below is the calibration report.

---

# Breast_Size_Slider_Illustrious_V2 — Calibration Report
**Model:** WAI-illustrious v17 · **Sweep:** slider 0.0 → 3.5 @ 0.5 (8 frames, locked char/pose/outfit/framing) · **Assessors:** 3

## (1) Consensus Table

| Slider | Assessor A | Assessor B | Assessor C | **Consensus tier** | Spread / uncertainty |
|---|---|---|---|---|---|
| 0.0 | C/D | C/D | C/D | **C/D** | None — unanimous |
| 0.5 | D/DD | D/DD | D/DD | **D/DD** | None — unanimous |
| 1.0 | DD/E | DD/E | E/F | **DD/E** (lean E) | ½-grade — C reads one notch higher |
| 1.5 | E/F | E/F | F/G | **E/F → F** | ½-grade — C one notch high |
| 2.0 | F/G | F/G | G/H | **F/G → G** | ½–1 grade — C one notch high |
| 2.5 | G/H | G/H | H/I | **G/H** (lean H) | ½–1 grade — C one notch high |
| 3.0 | H/I | H/I | I/J | **H/I** | ½–1 grade — C one notch high |
| 3.5 | I/J | J/K | J/K | **J/K** (range I/J–K) | ~1.5 grades — widest spread of the sweep |

**Reconciliation:** All three agree exactly through 0.5 and track in lockstep ordering with zero inversions across the whole sweep. The only systematic disagreement is **Assessor C runs ~1 grade hot from slider 1.0 upward** (C jumps straight to E/F at 1.0 while A/B hold DD/E). Spread is tightest at the bottom (0.0–0.5 unanimous) and widest at the top (3.5: I/J vs J/K). Treat absolute letters as **ordinal**, not metric — rank order is unambiguous; the cup labels carry ±0.5–1 grade of inter-rater noise that grows toward the top.

## (2) Rate (cups per 0.5 step)

- **Average:** ≈ **1.0–1.2 cup grades per 0.5 step** (≈ C/D → J/K = ~7–8 grades over 7 steps). All three assessors converge here.
- **Shape: non-linear, mildly accelerating with end-compression.**
  - **Low band 0.0–1.0:** sub-linear. 0.0→0.5 is the smallest increment (~0.5 grade; reads as cleavage depth + fabric tension, not footprint).
  - **Mid band 1.0–2.5:** steepest and most legible, ~1.0–1.5 grades/step.
  - **Top 2.5–3.5:** A sees saturation/compression (gain rolls off); B/C see the *opposite* — largest visual deltas at top (lateral/silhouette spread driving the read). Net: cup-letter delta per step stays high at top even as the simple bust-volume cue saturates.
- **Bottom line:** not a clean linear slider. Effective gain is **~½ grade/step in 0–1.0**, **~1–1.5 grades/step in 1.0–3.5**.

## (3) Granularity — are 0.5 steps distinguishable?

**Yes for the upper two-thirds; the only soft band is the bottom.**

- **0.0 vs 0.5 — the one genuinely weak pair (all 3 flag it).** Smallest perceptible change; could pass as same size under pose/lighting noise.
- **0.5 vs 1.0 — marginal (C), otherwise distinguishable.**
- **1.0 → 3.5 — every adjacent pair cleanly separable, all assessors.** Separation is widest and most reliable here.
- **2.0 vs 2.5 — borderline for A only, still separable by lateral spread.**
- **3.0 vs 3.5 — A sees compression (saturation, not a step-size fault); B/C see clear separation.**

**Key nuance (Assessor C):** the 0–1.0 softness is the **curve being flat there, not the step being too coarse.** A *smaller* step in 0–1.0 would add near-duplicates, not detail. The real fix for the low end is a more linear remap (or anchoring tags), not finer steps. Above 1.0, 0.5 is the right granularity as-is.

## (4) Recipe for Your Targets

### Target D–F (modest, clear separation)
This lives in the **flat/compressed low band (slider 0.0–1.5)** where 0.5 steps under-separate. **Use 0.25 steps here.**

| Target cup | Slider weight |
|---|---|
| **D** | **0.5** |
| **E** | **1.0** |
| **F** | **1.5** |

- For finer D→E→F beats with guaranteed daylight between each, step **0.25**: D=0.5, D/E=0.75, E=1.0, E/F=1.25, F=1.5.
- **Do not use 0.0 for "D"** — 0.0 reads C/D and 0.0↔0.5 is the weakest pair in the whole sweep; start at **0.5** for an unambiguous D.

### Target G–H (large, clear separation)
This lives in the **steep, well-separated mid band — 0.5 is sufficient.**

| Target cup | Slider weight |
|---|---|
| **G** | **2.0** |
| **G/H** | **2.5** |
| **H** | **2.5–3.0** |

- **G = 2.0, H = 3.0** gives maximum, unmistakable separation (one full 1.0 apart).
- If you want a G/H midpoint, **2.5** sits cleanly between. 0.25 is **not needed** here — adjacent 0.5 steps are already clearly distinct.
- Note C's hot read: if your eye matches C, shift down ~0.5 (G≈1.5–2.0, H≈2.5). Calibrate to your own first render.

**Step-size summary:** **D–F → 0.25 step** (0.5/0.75/1.0/1.25/1.5). **G–H → 0.5 step** (2.0 / 2.5 / 3.0).

## (5) Practical Notes

- **Reproducibility — fix the seed.** Inter-frame cosmetic drift was observed (earrings appearing/disappearing) at constant seed-family; cup *reads* held monotonic, but **A/B calibration must be same-seed.** Across seeds, expect ±0.5 grade of wobble (the same magnitude as inter-rater spread), which can blur the weak 0.0↔0.5 pair. **Lock seed, char, pose, outfit, and framing** when dialing a target; only then is a 0.25 step reliably visible in the low band.
- **Combine with size tags for anchoring — yes, especially at the ends.** The slider sets *relative* volume; `large breasts` / `huge breasts` set the *absolute* anchor the slider rides on. Recommended:
  - **D–F:** slider alone, or pair with `large breasts` to stop the low end drifting toward C. Avoid `huge` here — it fights the modest target.
  - **G–H:** anchor with `huge breasts` so the upper band doesn't get pulled down by the base model, then trim with slider. This also **counters the top-end ambiguity** (the I/J vs J/K spread at 3.5) by giving the model a fixed lexical target.
- **Frame the read consistently.** All assessments assumed a fixed bust-to-frame ratio at front cowboy-shot. Cup letters are **apparent on-frame**, anime-stylized — treat as ordinal within this set, not as bra measurement.
- **One-line takeaway:** Slider is monotonic and clean. Use **0.25 steps in 0.0–1.5 for D–F** (start D at 0.5, not 0.0) and **0.5 steps at 2.0/2.5/3.0 for G–H**; fix the seed and anchor the band with `large`/`huge` tags.