# 39 — Adversarial verification of the body/bust math

**Date:** 2026-07-18 · **Trigger:** Ben, before deploying be.5: "task a research agent to deeply
research the bust measurement, weight distribution, breast size calculation, and then audit it
adversarially to make sure we build our foundation on the right math." · **Verdict: SHIP** (as
0.7.6-be.6, after the fixes below).

**Method:** three independent parallel researchers — **A** (real-world sizing data + anchor
provenance, web), **B** (medical/physical literature, web), **C** (first-principles tape-path
geometry, exact convex-hull support-function integration) — none allowed to read our own corpus;
then fixes; then a fresh-context **adversarial refuter** attacking the fixed foundation (it
built an independent mirror of the math, validated against all 19 pinned test anchors, ran the
shipped suite, and swept every surface the canaries left uncovered). Full reports archived in
the session scratchpad (`audit-report-{A,B,C}.md`); key content preserved here.

## §1 What the research established

**A — sizing (the anchor):**
- Norma Stitz's two circumferences are the ONLY primary-source numbers (Guinness): bust
  **177.8 cm** on a **109.22 cm** band → diff **68.58 cm**. Her breast *weight* was never
  recorded — circulating figures span 9–27 kg/side; the corpus's "~28 lb each" could not be
  sourced anywhere, and independent reporting clusters HIGHER than our 19 L assumption.
- **The sharpest finding:** the 19,000 ml anchor constant only enters the formula as a ratio —
  a scaling gauge. The empirically testable content is **"projection 30 cm ↔ diff 68.6 cm"**,
  which the Guinness circumferences confirm. Keep 19,000; do NOT "correct" it to 13–14 L (worse
  supported). Treat the volume coordinate as ±30–40% uncertain.
- Calibration is structurally **n=1**: the literature records weight OR circumference for
  extreme cases, never both. No second (volume, diff) pair exists publicly.
- Density 0.95 supported (lit 0.98, range 0.92–1.09; fatty macromastia trends low). The
  2.54 cm/letter rule is the exact US/UK convention. Band offsets: fine for lean/hourglass
  builds; curvy/full positive-growing offsets are defensible ONLY under the idealized-hourglass
  reading (documented; genre-appropriate).

**B — medical/physical:**
- SUPPORTED by primary literature: density; the D/G/K mass anchors (on volume, not letters);
  the frame formula (0.4·H−8 = 58 kg @165 vs Devine 57 / Robinson 58.4); the 1.0 kg
  baseline-breast subtraction (typical total breast mass 0.7–1.0 kg); small-regime projection
  (tracks high-profile implant apex; reads slightly high ≥800 cc).
- **Droop channel validated remarkably well**: under the descent-below-normal reading, the
  model predicts SN-N ≈ 48 cm at 7.5 L/side; the largest documented human case (8.5 kg ≈ 9 L
  resection, JSCR 2026) measured **46–47 cm**.
- **Tier 47 (7.56 L/side) sits just below the largest documented human case (9 L)** — the
  model is data-grounded through Lucy's size; everything above is principled extrapolation.
- Milk capacity 40%-of-volume: confirmed pure fantasy (real capacity ~74–606 ml/breast,
  size-independent) — documented as deliberate genre physics, real numbers recorded.

**C — geometry (exact tape-path computation):**
- **The size backbone is SOUND**: the Norma pin sits above a naive hemisphere extrapolation
  because convex-hull amplification outweighs pendulous escape up to ~19 L — the constant-
  spread V^(1/3) law anchored at Norma survives exact computation on the natural curve.
- **Four real defects in the shape handling** (all in v0.7.6-be.5 as committed):
  1. HIGH — `gravity_defying` bust DECREASED tiers 17→18 (untested: canary only swept natural).
  2. HIGH — two-branch shape incommensurability (dome ≈0% shape gap; anchored 35%), causing a
     same-tier shape-ordering crossover at tiers 10–13.
  3. MED — shape ordering physically INVERTED for a standing tape (true standing order is
     gravity_defying > firm > natural: compact+forward reads bigger; pendulous escapes below
     the tape line — its length lives in hang).
  4. MED — the dome-only engorgement bump was silently lost when fill pushed V across the blend.
- Accepted approximations (documented in curves.ts): C floor (A/B unreachable, t0 ≈ 2.9″ diff —
  matches the NAI ladder's t0=C); band-level Δ≈4.4 cm; torso-width scaling (∓9% moderate /
  ∓3% huge for ±20% frames).

## §2 Fixes applied (all in be.6)

1. **Shape refactor** (defects 1–3): projection is now a shape-independent NATURAL backbone
   (the pinned curve — letters, Norma pin, T@47, X@64 all unchanged); shape enters ONCE as
   `SHAPE_TAPE_MULT {natural 1.0, firm 1.111, gravity_defying 1.222}` — the standing-tape order,
   σ=0.10 rebased to natural (the anchor case is pendulous-natural, measured standing per
   Guinness protocol). All shapes inherit backbone monotonicity BY CONSTRUCTION.
2. **Fill through volume only** (defect 4): the dome-only +0.15 bump removed; engorgement
   widens the tape via effective volume, branch-independently and monotonically.
3. **Canary armor extended**: all-shape tier monotonicity, standing shape order at every tier,
   monotone fill response (the exact sweeps that would have caught defects 1–4).
4. **Post-adversary fixes** (its three confirmed findings, all coherence/robustness):
   - Letter-vs-tape convention now FRAMED in the context-block header ("cup letter =
     size-identity, shape-independent; bust cm = shape-adjusted tape — firm/gravity-defying
     tape larger than the letter implies, and that is correct") so the narrator never sees an
     unexplained contradiction (a gd t47 reads T-cup with an X-diff tape — by design).
   - **Build-inference cliffs removed**: inferred band offset and frame-weight mod now
     interpolate continuously over waist-to-height ratio (BUILD_CURVE anchors; wide hips shift
     the ratio smoothly) — a 1 cm waist edit no longer jumps bust ±4 cm / weight ±4 kg.
     Explicit build/weight still use the exact table values. Labels snap (categorical display).
   - **Anatomy input validation**: waist/hips/height/weight clamp to sane finite ranges
     (Infinity/absurd values fall back to reference/estimate — the "Infinity-81-94 cm" hole).

## §3 The adversary's clean bill (what it tried and failed to break)

Structural immunity of the shape fixes (multiplier ≡ constant ratio at every (tier,fill));
fill monotone for all shapes ×tiers 0–300; blend seam smooth (max kink 0.05 cm); cross-channel
coherence droop↔tape (the shape that escapes the tape is the shape that hangs); NaN/Inf tier
paths; letter-ladder completeness (no skips, C@0 … X@64, Z@74, ZZ@79, ZZ+@95, cache sound);
Norma pin tight; same-letter-different-band behavior confirmed CORRECT (that's how real bra
sizing works). Its σ=0.10 attack concluded the constant is the defensible choice: the geometry
model's larger standing gap over-models pendulous escape (Norma's real natural diff lands at
its "firm" prediction), so the modest constant is right and the true size-dependence is
unverifiable past ~9 L — documented, not modeled.

## §4 Documented model caveats (the honest fine print)

1. Cup letter = volume-identity (shape/band/fill-independent); bust cm = the shape-adjusted
   standing tape. They diverge up to ~4 letters for gravity_defying — framed in the block.
2. The volume coordinate of the Norma anchor is a gauge with ±30–40% uncertainty; the diff
   coordinate is primary-source. n=1 by the structure of the public record.
3. Above ~9 L/side (≈ tier 52+) every constant is extrapolation beyond the documented human
   record — deliberately, this being a fantasy engine anchored to reality below.
4. The shape multiplier is a moderate-size constant; true standing-shape gaps likely grow with
   volume (unverifiable).
5. Milk capacity scaling is deliberate genre physics (~14× physiological max at 7.5 L).
6. Build offsets read builds as idealized-hourglass archetypes, not BMI classes.

## §5 Outcome

99 tests (6 files) green; svelte-check 0 errors; lint 0 errors. Shipped as **0.7.6-be.6**.
The foundation Phase 2 builds on is now: independently researched (3 agents, primary sources),
geometrically exact-checked, adversarially refuted, and canary-armored.
