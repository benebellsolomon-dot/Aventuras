# 38 — Body-math audit: bust circumference, weight, and prose honesty

**Date:** 2026-07-17 · **Trigger:** Ben flagged tier 47 (X-cup) rendering "102-65-80, ~14 kg"
as physically incoherent and asked for a full review of the body math + per-tier prose before
any further building on these curves. **GATES Phase 2** (research/37).

**Method — three independent evidence sources, triangulated:**
1. Full-channel dump of the raw v0.4.7 spine (`compute_body_snapshot`) per tier at the
   reference frame (scratchpad `audit-body-math.mjs`, vm-sandbox pattern).
2. An independent geometric model (bust tape = convex-hull perimeter of torso ellipse + two
   breast mounds, via support functions), sanity-anchored at real C/G/K-cup volumes.
3. A corpus-science arbitration pass over our own validated research
   (body-database-spec, body-db/{cup-sizing,geometry-shape,weight-volume}, body-math-audit,
   ladder-reanchor-proposal, extreme-bust-realism, 35 §1.4).

## §1 Verdict

**The mass/volume/projection spine is validated-correct. The bust channel is a
*semantics-plus-calibration* problem, not a girth bug:**

- `bust_cm` = `band + 2·forward_projection·SHAPE_CIRC_SPREAD` — a spherical-cap chord
  approximation of over-the-nipple bust (naiscript:1443–1451). It tracks **forward
  projection**, which the P6 ptosis partition **deliberately saturates** (volume above
  ~1.85 L/side is shunted into `hang`/`droop` — "exactly how real gigantomastia presents",
  extreme-bust-realism §3.3/§5.5). Mass ×6 → bust +14 cm is *by design*, not an accident.
- **BUT the saturation is tuned ~35% too aggressive** against the single hard real-world
  anchor: Norma Stitz (~19 L/side, ≈ tier 82) measured bust−band **68.6 cm** (bust 178 cm on
  her 109 cm band); the model yields **44.6 cm**. The corpus even contradicts itself:
  extreme-bust-realism §3.4 back-calculates her forward depth at **28–31 cm** while §5.5
  assigns tier 82 only **19.4 cm**. So every consumer treating `bust_cm` as literal girth
  renders too small at volume — which is exactly what Ben saw.
- The naive "wrap the whole volume" model (my hull calc: t47 → ~149 cm) **overshoots** reality
  by the same token — it ignores hang. Reality sits between: **retune the projection through
  the real anchor** (§4 C1). The old "2π-wrap overshot 2×" fix (94→83 at tier 6; 368→138 at
  t200) was a genuine repair and is NOT the problem — keep it.
- Historical rendering like "DD-cup, 77 cm bust" is the documented **band trap** (band =
  waist + build offset; a 61 cm waist → 66 cm band → small absolute bust at a real DD), not
  an error (body-math-audit §3.5).

## §2 Evidence tables

**Spine vs naive hull vs corrected estimate** (reference frame: H 165, average, band 66,
natural; volumes are per side; corrected = §4 C1 formula):

| tier | letter | dry/side kg | vol/side | proj (shipped) | bust (shipped) | bust (naive hull) | **bust (corrected est)** |
|---:|---|---:|---:|---:|---:|---:|---:|
| 6 | DD | 0.58 | 0.61 L | ~6.6 | 79.8 | 90.4 | **79.8** (dome region — unchanged) |
| 13 | G | 1.23 | 1.30 L | 9.5 | 87.9 | 97.6 | **87.9** (unchanged) |
| 21 | JJ | 2.22 | 2.33 L | ~11.9 | 93.5 | 105.6 | **~97** |
| 31 | O | 3.81 | 4.01 L | ~13.5 | 97.0 | 121.6 | **~107** |
| 39 | S | 5.37 | 5.65 L | ~14.6 | 99.4 | 135.2 | **~112** |
| **47** | **X** | **7.18** | **7.56 L** | **15.5** | **101.7** | 148.6 | **~117** |
| 82 | ZZ+ | 18.14 | 19.1 L | ~19.6 | 110.5 | 187.3 | **~135** (Norma-check on HER 109 band: **178.1 ✓** = her measured 178) |
| 120 | ZZ+ | 35.58 | 37.5 L | ~21 | 119.2 | 220.3 | **~153** |

Lucy at tier 47 on her own frame (waist 65, curvy → band 73): **~124 cm** corrected vs 102
today. Full-fill adds fluid volume into the same model (engorgement widens honestly).

**Channels the spine computes that we never baked** (all present in the snapshot dump):
`bust_projection_cm`, `droop_cm` + `ptosis_factor`, `base_width_cm`, `areola_diameter_cm`,
`cleavage_depth_cm`, `bounce_amplitude_cm` + `bounce_quality`, `sensitivity`
{value,label,description}, `posture_ratio`, `weight_full_*`. Phase 2 Task 8's
sensitivity/bounce/cleavage ladders are sitting right there; `droop_cm` is the legible "where
the volume went" number (t47: hangs 26.7 cm).

**Also confirmed:** the spine never modeled hips (`hips_cm` ≡ waist = 61) — our per-character
baseline was the right call. `waist_cm`/`hips_cm` outputs from the spine are vestigial.

## §3 Findings

- **F1 (semantics):** `bust_cm` = saturating forward-projection display, not girth. Design
  intent documented; our BWH string presents it as literal girth — acceptable ONLY after F2's
  recalibration.
- **F2 (calibration defect — the real fix):** P6 partition under-reads forward projection
  ~35% at the top vs the Norma anchor and vs the corpus's own §3.4 back-calc. Fix in §4 C1.
- **F3 (letter decoupling — by design):** the displayed letter rides the UNSATURATED classic
  dome (`cup_band_ref_cm`, naiscript:1618–1627) precisely so letters keep climbing to ZZ+;
  "X at t47" is an authored overlay, ~7× past the largest real cup (K ≈ 960 cc). Corpus rule:
  stop treating letters as measurements past real gigantomastia; report volume/mass alongside
  (we already do).
- **F4 (weight):** frame estimate = `max(20, 0.4·H − 8 + buildMod)` — height+build only; no
  waist/hips input exists anywhere in the corpus. The proportion % correctly includes tissue
  (mass/(frame+mass)), but **no total body weight is displayed anywhere**, and a minor
  double-count exists (frame notionally includes baseline breasts; spec §2.5's
  `BASELINE_BREAST_KG` subtraction never shipped).
- **F5 (prose ladders are volume-honest):** comparative anchors check out against physical
  volumes through ~tier 165 — cantaloupe ~t20, human head ~t30, **basketball (7.1 L) ≈ t47 ✓**,
  watermelon ~t60, whole-person ~t165. The t47 prose ("broader than her torso") is literally
  true (breast Ø ~31 cm vs 28 cm torso width). **The prose was never the problem — the cm
  number contradicted its own prose.** Only the extreme top (t200 "room-filling" at 96 L)
  overshoots, already documented as authored register (35 §1.4).
- **F6 (goldens):** current golden fixtures pin the miscalibrated bust values — they must be
  re-pinned to the corrected model, plus the cross-channel mass-claim canary (research/36 §
  ST-era #39) so a mass↔measurement contradiction can never ship silently again.

## §4 Proposed corrections (the ruling menu)

- **C1 — Recalibrate P6 forward projection to the real anchors.** Keep the validated classic
  dome ≤1.35 L/side untouched; above the blend window, set
  `proj(V) = 30 · (V/19000)^(1/3)` cm (anchored so ~19 L → ~30 cm ⇒ Norma's measured 178 cm
  bust reproduces exactly on her band; V^(1/3) = linear-dimension scaling; blend region
  1.35–1.85 L stays a lerp and is near-continuous: dome ~12.4 vs curve ~13.8 at the seam).
  Keep the saturation *story* (hang still absorbs most growth — droop stays honest).
  Implement in `scripts/extract-ladder2.mjs` (override the projection in OUR bake — we never
  edit the naiscript), regenerate `BUST_CM_CURVES`, re-pin goldens.
- **C2 — Surface the other half of the partition:** add `droop_cm` (+ optionally
  `bounce/cleavage/areola/base_width`) to the baked tables; render hang-cm in block + panel so
  the saturation is legible ("hangs ~27 cm below the fold"), not hidden.
- **C3 — Honest body weight:** display **total = frame + tissue + fluid** in block + panel;
  subtract `BASELINE_BREAST_KG` (~0.5 kg) from the frame estimate to kill the double-count;
  OPTION C3b: infer build from stored waist/hips vs height (waist-to-height bands →
  petite/slim/average/curvy/full) so the frame estimate uses the BWH baseline instead of a
  manual build guess.
- **C4 — Letter policy (Ben's call):** (a) KEEP the authored letter overlay (X stays t47;
  letters are genre flavor, volume/mass stay the honesty carriers) — recommended, zero churn;
  or (b) re-anchor letters to the corrected bust−band (≈1 letter per inch ⇒ X lands near
  t38–40 — incidentally close to Lucy's old render marker 39, but every seeded tier and the
  sniffer shift with it).
- **C5 — Regression armor:** re-pinned goldens + the cross-channel canary (assert no
  comparative band's implied volume contradicts the mass curve beyond a stated poetic factor).

## §5 Impact

- **Phase 2 is gated on these rulings** — Task 8 (milestones/ladders) and the BWH surfaces
  build directly on the corrected curves; the reducer/conditions/pressure tasks are
  math-independent and could proceed in parallel if desired.
- Lucy's panel: 102 → ~117 (reference band) / ~124 (her curvy band) at tier 47 empty; more
  when filled. Playtest can proceed now with known-low bust numbers, or after the fix.
- No DB migration — curves are code; state (`tier`, baselines) is untouched. One bake + one
  version bump.

## §6 Rulings (Ben, 2026-07-17)

1. **C1 ADOPTED** — recalibrate forward projection to the real anchors:
   `proj(V) = 30·(V/19000)^(1/3)` above the blend window, validated dome untouched below.
2. **C4: STRICT LETTER RE-ANCHOR** — letters derive from corrected bust−band at 1″/letter
   (canonical ladder A,B,C,D,DD,E,F,G,H,J,K…Z, reference frame). **Correction recorded:** the
   first presentation of this option claimed re-anchoring moves X to ~tier 38–40 — that was
   WRONG (direction error); honest math moves X UP. Re-asked with true numbers; Ben confirmed
   strict re-anchor knowing the consequence: **tier 47 = T-cup; true X-cup ≈ tier 65
   (~26 kg)**; Lucy stays tier 47 and becomes a T-cup (her "38X" descriptor text is legacy
   authored sizing; the seed sniffer will now map "X" → ~65, so seeding-from-description and
   the panel tier should be reconciled at play time).
3. **C3 + C3b ADOPTED** — display total = frame + tissue + fluid; subtract
   `BASELINE_BREAST_KG` from the frame estimate; infer build from waist/hips vs height when a
   baseline is stored.
4. **C2 ADOPTED** — droop/hang cm surfaced in block + panel.
5. **C5 ADOPTED** — cross-channel canary test.
6. **Deferred** — sensitivity/bounce/cleavage/areola bake stays in Phase 2 Task 8.

**Implementation note:** bust becomes a runtime closed-form (band(waist,build) +
2·proj(V)·spread(shape), V including fill volume) — the baked `BUST_CM_CURVES` are retired;
letters become a derived ladder from the same closed-form at the reference frame; droop stays
a baked spine channel (its hang partition is the honest-direction channel).

## §7 Implementation (2026-07-18 — all rulings SHIPPED, version 0.7.6-be.5)

- New `src/lib/services/be/curves.ts`: the corrected closed-forms (mass/volume spine, corrected
  projection w/ dome+anchor blend, band(waist,build), build inference, derived letter ladder +
  anchors). Norma anchor golden-pinned: `109 + bustDiffCm(82) ≈ 178` ✓.
- `measurements.ts` rides curves: `bustCm(tier, shape, fill, baseline)` on HER band; `droopCm`
  (baked spine channel, fill-interpolated); honest weight (`frameKg` = estimate − 1 kg
  baseline-breast, `totalBodyWeightKg` = frame + tissue + fluid); `resolveBuild` C3b bands.
- `ladder.ts`: letters derive from the corrected diff (C@t0, DD@t4, **T@t47, X first at t64**,
  ZZ@~t76+, ZZ+@~t98); `tierForCupLetter` uses derived anchors (doubled legacy letters alias to
  their base). Band words / comparatives / image grounding UNCHANGED (image contract intact).
- Regenerated `ladder-data.ts` (extract scripts updated): letter tables + BUST_CM_CURVES out,
  `DROOP_CM_CURVES` in, goldens re-pinned (mass/capacity/bodyPct/droop).
- Context block: `Body weight: ~71 kg total (~57 kg frame + ~14 kg breast).` line + hang cm on
  the shape line. Panel: total weight, hang cm, height + build baseline fields (build shows the
  inferred value when unset).
- Canary (C5): letter monotonicity, no-saturation sweep, "outweighs her torso" mass check,
  head-volume bounds, the Norma pin. `research/` excluded from lint (archive, never reformat).
- 95/95 tests, svelte-check 0 errors, lint 0 errors.
- **Play-time note:** Lucy's descriptor text still says "38X" — the sniffer now maps X → ~t64,
  so seed-from-description would land her at true-X mass (~24 kg). Per the ruling she stays
  tier 47 = T-cup; set the panel tier directly, and the descriptor text gets rewritten in C6.
