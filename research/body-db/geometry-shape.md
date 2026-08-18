# Body-DB Audit — Geometry & Shape: Projection · Cleavage · Hang · Bounce

**Date:** 2026-06-07
**Subject:** the shape/geometry dimensions of the Ambrosia body engine (`src/ambrosia.naiscript`, a verbatim port of alpha52): `bust_projection_cm` (~715), `cleavage_depth_cm` (~741), `hang_drop_cm` (~749), `bounce_amplitude_cm` (~763), `bounce_quality` (~773), and the `SHAPE_*` constant tables (~265–286) plus the body-relative reference ladders `projectionRef`/`hangRef` (~781–800).
**Scope:** validate the volume→projection chain and the three projection-derived measures (cleavage, hang, bounce) against cited real-world data in the realistic (A–G) range; then design/verify their behavior in the **fantasy** range (H/I/J … Z/ZZ and beyond); surface general improvements.
**Method:** the engine functions were extracted verbatim and run in Node (`research/body-db/_geom_shape_calc.mjs`, `_proj_model_check.mjs`, `_hang_ptosis.mjs`). Frame for all tables below: height 165 cm (frame_modifier = 1.0), no lactation unless noted. Per-side tissue volume and its volume-implied real cup (32-band-anchored, from the prior audit) are used as the anchor — **never the tier letter**, which the prior audit proved runs ~2 cups ahead of volume and is the known-broken labeling axis.

---

## TL;DR — verdict per dimension

| Dimension | Realistic-range verdict | Headline reason |
|---|---|---|
| **Projection** (`bust_projection_cm`) | **KEEP** | Hemisphere-radius × flatten × shape ≈ a spherical cap on a ~13 cm-wide breast root. Two independent geometric models agree to ±0.2 cm through G. Sits at the *medium*-projection end of real variation — sound. |
| **Cleavage** (`cleavage_depth_cm`) | **FIX (structural)** | Driver is wrong: real cleavage depth is governed by *medial breast spacing + how breasts press together*, not forward projection. Tying it to projection makes `gravity_defying` (most projected) cleave deepest — backwards for unsupported breasts. Magnitudes are plausible; the *model* is mis-rooted. |
| **Hang / drop** (`hang_drop_cm`) | **KEEP A–G, with a calibration nudge** | A–G drops (1.4–4.3 cm) map cleanly onto Regnault ptosis grades. Unbounded super-projection growth above ~tier 150 (hang > projection) is **physically correct for pendulous tissue**, NOT a bug. One nit: the `natural` base 0.6× makes even an A-cup "hang," when firm/young A-cups are ptosis-grade-0. |
| **Bounce** (`bounce_amplitude_cm`) | **FIX (one clear bug + one design call)** | **Clear bug:** the `cap` is **dead code that never binds** (its 15→75 cm values reveal the designer expected far larger amplitudes than the `proj_mult` term ever delivers). **Design call:** the amplitude (D-cup 1.1–2.2 cm) sits at *bra-supported* displacement levels; Portsmouth's bare-breast ~4 cm walking is 2–4× higher, so whether to raise it depends on whether bounce models clothed or unclothed motion. Growth-with-size is **correct** (real displacement rises with mass) — not a defect. |
| **Fantasy scaling (all dims)** | **DECISION REQUIRED** | Cube-root geometry means linear dimensions lag volume badly: tier 200 ≈ 96 L / 91 kg **per side** but projects only ~0.7–1.1 m. The COMPARATIVE_DESCRIPTIONS prose at that tier says "room-filling / building-scale / larger than the room she started in." Numbers and prose describe objects **orders of magnitude apart**. This is the geometric twin of the project's known *tracking-vs-rendering* drift. |

**One sentence:** projection is sound (KEEP) and hang is sound in-range (KEEP); cleavage is mis-rooted to the wrong driver (FIX-structural); bounce has one clear bug (a dead `cap`) plus a clothed-vs-unclothed amplitude *decision* (FIX); and the cube-root-vs-prose gap at Z+ is a deliberate-design decision the project must make explicitly, because no geometry change can close an order-of-magnitude gap without breaking the engine's core mass→volume→projection coherence.

---

## 1. Projection — `bust_projection_cm` → **KEEP**

### 1.1 What the engine does
```
tissue_vol = weight_per_side_kg / 0.00095            # ml; density 0.95 g/cc
base_r     = (3·total_vol / 2π)^(1/3)                # radius of a HEMISPHERE of that volume
shape_factor: natural 1+0.3·ln(1+t/10) | firm 1+0.4·ln(1+t/6) | gravity_defying 1+0.5·ln(1+t/4)
flattenFactor = min(1, 0.7 + 0.015·t)                # 0.7 @ t0 → 1.0 @ t20, then full hemisphere
projection = base_r · flattenFactor · shape_factor
```
The volume→radius→shape chain is the *same* coherent core the prior audit validated for weight/volume; projection is a clean derivative of it.

### 1.2 Real-world anchors (cited)
- **Spherical-cap geometry of a breast.** A breast sitting on the chest is well-modeled as a spherical cap: `V = π·h²·(3R − h)/3`, where `h` = forward projection (chest-wall-to-nipple) and `R` = base/root radius. [bra-calculator.com projection model; Bengtson Center standardization PDF]
- **Breast root width.** A D–G breast root diameter runs **>13 cm** (a clinical implant-vs-mastopexy threshold). [PLOS One 605-patient study; "breast width exceeds 13 cm"] → root radius `R ≈ 6.5 cm`.
- **Industry sewn-cup depth** (a garment, not soft-tissue, measure): AA≈1″ (2.5 cm), B≈2″ (5 cm), C≈3″ (7.6 cm), D≈4″ (10 cm) of high-point projection. [hugsforyourjugs; bra trade]. These **overstate** true tissue protrusion because they measure the molded cup, not the unsupported breast.
- **Projection is shape, not size:** "two people in the same letter can have completely opposite projection profiles — tissue that spreads wide and sits close to the chest (shallow) vs tissue that juts forward (projected)." [bra-calculator.com Projection Depth Analyzer]

### 1.3 The validation — two geometric models agree
Solving the spherical-cap height `h` for the engine's **own** tissue volume on a fixed `R = 6.5 cm` root, vs the engine's projection:

| tier | vol/side (ml) | vol-cup | engine firm (cm) | engine natural (cm) | spherical-cap @R=6.5 (cm) | industry sewn-cup (cm) |
|---:|---:|:--|---:|---:|---:|---:|
| 0 | 189 | A | 3.1 | 3.1 | 3.3 | 2.5 |
| 2 | 314 | C | 4.3 | 4.1 | 4.5 | 7.6 |
| 4 | 455 | D | 5.5 | 5.0 | 5.6 | 10.2 |
| 6 | 613 | F | 6.7 | 6.0 | 6.8 | 12.7 |
| 8 | 787 | G | 7.9 | 7.0 | 8.1 | 14.0 |
| 13 | 1298 | G/J* | 11.1 | 9.5 | 13.0 | 14.0 |

\* tier 13 vol = ~1298 ml ≈ J by raw volume, but at a 32-band; "G" by the conservative interpolation table. Cup-letter ambiguity here is the *labeling* bug, not a projection problem.

**Finding:** the engine's projection and an independent spherical-cap-on-a-13cm-root model agree to **±0.2 cm through tier 8 (G)**. The engine is effectively *already* a cap-on-fixed-root model dressed up as "hemisphere radius × flatten." That is a physically sound geometry. The engine sits **at the medium-projection end** of real variation — below the industry sewn-cup figures, which is correct because those are garment-cup depths that overstate unsupported tissue protrusion, and consistent with the "natural/spreads-somewhat-wide" profile.

### 1.4 Reconciliation with the prior audit
The prior audit called projection **"SOUND"** but anchored that to the *label* (tier 6 = "D" → ~6 cm DD/E depth). On the *volume* anchor, tier 6 is an **F** (~613 ml). I checked whether the hemisphere model might therefore *under*-project for the larger true volume — and the spherical-cap cross-check (§1.3) **refutes** that: 6.7 cm (engine) vs 6.8 cm (cap) is essentially exact. **No conflict with the prior audit — projection is KEEP, and the volume re-anchoring does not change that verdict.** (I record this because an earlier hypothesis in this audit — "maybe it under-projects for volume" — was killed by the cap-model check; the data, not the hunch, decides.)

### 1.5 Minor projection notes (not FIX-level)
- `flattenFactor` saturates at 1.0 at tier 20, after which projection = full-hemisphere-radius × shape_factor. Above ~G the engine is fantasy-by-design and this is fine.
- `projectionRef` ladder (~781) tops out at "extending further than she is tall" at **90 cm** — but projection reaches ~0.7–1.1 m only around tier 150–200, while the prose at those tiers is "room/building-scale" (see §5). The ref ladder under-describes the high end relative to COMPARATIVE_DESCRIPTIONS. Recalibrate alongside §5.

---

## 2. Cleavage — `cleavage_depth_cm` → **FIX (structural: wrong driver)**

### 2.1 What the engine does
```
cleavage_depth_cm = projection · SHAPE_CLEAVAGE_FACTOR[shape] · (1 + lactBoost)
SHAPE_CLEAVAGE_FACTOR = { natural: 0.3, firm: 0.5, gravity_defying: 0.7 }
```
Cleavage is a fixed fraction of forward projection, with `gravity_defying` cleaving **deepest** (0.7×).

### 2.2 Real-world anchors (cited)
- **Intermammary cleft distance** (the *horizontal* gap over the sternum) baseline **3 ± 0.6 cm, range 1.6–5 cm**; "wide-set" is >20 cm inter-areolar. [Breast Cleavage Remodeling with Fat Grafting, PubMed 29068922; wide-set surgical literature]
- Cleavage as a *visible valley* is driven by **medial breast tissue volume, how close the breasts sit (intermammary distance), and whether they are pushed/pressed together** (bra, posture, arms), not by how far they project forward. [intermammary cleft anthropometry; cosmetic "cleavage remodeling" reduces the *gap*, not projection]

### 2.3 The structural problem
The engine equates "cleavage depth" with `projection × factor`. But these are **different axes**:
- An *unsupported* breast cleaves **less** the more it projects forward and the firmer/perkier it is — perky `gravity_defying` breasts stand apart and create the *shallowest* natural cleavage, yet the engine gives them the *deepest* (0.7×). That ordering is **backwards for the unsupported case.**
- The factor ordering only makes sense if "cleavage_depth" is read as **pushed-up / pressed-together** cleavage (the bra-and-posture kind) — in which firmer, more projected tissue *does* form a deeper pressed valley. The CLEAVAGE_SCALE prose ("press together when her arms are at her sides," "squeezing from both sides") confirms this is the *intended* reading.

**So the magnitudes are plausible and the prose is internally consistent — but the formula is mis-rooted.** It silently models pressed-together cleavage while *labeling* a general "cleavage_depth_cm," and it omits the actual primary driver (medial spacing / intermammary distance), which the engine never represents at all.

### 2.4 Recommendation
- **Minimal (relabel + document):** rename the field's intent to *pressed/displayed cleavage depth* and keep the formula; the factor ordering is then defensible. Lowest-effort, preserves all downstream prose.
- **Better (add the missing driver):** introduce an `intermammary_distance` input (~3 cm default, frame-scalable) and make cleavage depth a function of **(medial fullness from volume) × (1 − gap/threshold) × press_factor(shape)**, so that wide-set or perky bodies cleave shallower and large-volume close-set bodies cleave deepest. This is the one place the geometry model is **missing a real anthropometric variable** the rest of the engine would benefit from.
- Either way, **flag** that projection is the wrong sole driver; if kept, it must be by deliberate "pressed-cleavage" definition, not by accident.

### 2.5 Magnitudes for reference (firm vs natural)
| tier | vol-cup | cleav firm (0.5×proj) | cleav natural (0.3×proj) |
|---:|:--|---:|---:|
| 4 | D | 2.8 | 1.5 |
| 6 | F | 3.4 | 1.8 |
| 13 | G/J | 5.6 | 2.9 |
| 20 | fantasy | 8.1 | 4.0 |
These are reasonable *pressed*-cleavage depths in-range; the issue is the driver, not the numbers.

---

## 3. Hang / drop — `hang_drop_cm` → **KEEP in A–G (calibration nudge); fantasy growth is correct**

### 3.1 What the engine does
```
if gravity_defying: hang = 0
baseFactor = SHAPE_HANG_BASE[shape] + SHAPE_HANG_TIER_SCALE[shape]·t
   natural: 0.6 + 0.003·t   firm: 0.25 + 0.001·t
hang_drop_cm = projection · max(0.1, baseFactor − firmReduction)   # lactation firms → less hang
```

### 3.2 Real-world anchors (cited)
- **Regnault ptosis classification (1976)** — the standard. Graded by nipple position relative to the inframammary fold (IMF): **Grade I** nipple ≤1 cm below fold; **Grade II** 1–3 cm below; **Grade III** >3 cm below / at the inferior pole. Pseudoptosis = sagging with nipple still above the fold. [Regnault 1976; theplasticsfella; StatPearls NBK567792]
- **Nipple-to-IMF (lower-pole height)** normal = **7.5 ± 1.6 cm** standing (605-patient study). N:IMF >9.5 cm and/or breast width >13 cm marks the threshold past which an implant alone cannot correct ptosis. [PLOS One pone.0172122]
- **Sternal-notch-to-nipple** youthful target 21–23 cm; it lengthens as breasts descend. [theplasticsfella; mastopexy planning]

### 3.3 Validation — A–G hang maps cleanly to ptosis grades
The engine's `hang_drop` is a *nipple-drop-below-attachment* proxy (not the full lower-pole height). Reading it against the Regnault thresholds (which are precisely "how far the nipple sits below the fold"):

| tier | vol-cup | hang natural (cm) | hang firm (cm) | Regnault reading (natural) |
|---:|:--|---:|---:|:--|
| 0 | A | 1.9 | 0.8 | Grade I–II (over-reads slightly for a young A) |
| 4 | D | 3.1 | 1.4 | Grade III natural / Grade II firm — realistic |
| 6 | F | 3.7 | 1.7 | Grade III natural / II firm |
| 8 | G | 4.3 | 2.0 | Grade III natural / II firm |
| 13 | G/J | 6.1 | 2.9 | deep Grade III natural — appropriate for a large pendulous breast |

**Finding:** the *firm* curve (0.25→) lands squarely in the Grade I–II band across A–G, and the *natural* curve (0.6→) in Grade II–III — exactly the right ordering (natural breasts sag more than firm; gravity_defying = 0 = no ptosis). This is **well-calibrated. KEEP.**

**One calibration nudge:** `SHAPE_HANG_BASE.natural = 0.6` gives even a tier-0 A-cup a 1.9 cm drop (Grade I–II), but a young/firm small breast is ptosis grade 0 (pseudoptosis at worst). Consider a small floor/threshold so A–B naturals can read "no meaningful hang." Low priority — it only affects the smallest tier.

### 3.4 Fantasy: hang exceeding projection is **correct, not a bug**
`baseFactor.natural = 0.6 + 0.003·t` crosses **1.0 at tier ≈ 133**, above which `hang_drop > projection` (tier 200: hang 82 cm vs proj 69 cm). Vertical drop and forward projection are **orthogonal axes**; for pendulous tissue at huge scale, the breast hangs *farther down than it sticks out* — which is exactly what the SHAPE_DESCRIPTORS.natural prose asserts ("flowing downward like flesh made liquid," "pooling across surfaces"). **Do not spend a FIX undoing this.** The only check: confirm the linear `0.003·t` growth is the *intended* fantasy behavior (it produces a believable accelerating sag); it is consistent and I recommend keeping it.

### 3.5 Nit: `hangRef` floor claim
`hangRef` (~792) says ≥60 cm = "pooling on the floor beneath her." A 60 cm drop from a standing chest (~125 cm off the ground) reaches roughly the *knees/shins*, not the floor. Same numbers-vs-prose mismatch flagged for projection (§1.5) and the extreme tiers (§5). Bump the "floor" threshold to ~110–120 cm, or soften the wording to "past her knees."

---

## 4. Bounce — `bounce_amplitude_cm` → **FIX (one clear bug + one design call)**

### 4.1 What the engine does
```
params = SHAPE_BOUNCE[shape]   # natural {0.4, cap15, ts0.3} firm {0.2, cap8, ts0.15} GD {0.08, cap3, ts0.05}
baseBounce = min( projection·proj_mult , cap + t·tier_scale )
bounce = baseBounce · (lactation ? 0.85 : 1.0)
```

### 4.2 Real-world anchors (cited) — the Portsmouth corpus
The University of Portsmouth Research Group in Breast Health (Wakefield-Scurr et al.) is the definitive source for breast displacement:
- **Bare-breasted D-cup:** resultant displacement **4.2 ± 1.0 cm walking (5 kph) → 15.2 ± 4.2 cm running (10 kph)**; vertical ~4 cm walking, ~10 cm running, **up to 20 cm sprinting**. [J Applied Biomechanics 25(4) 2009; PubMed 20095453; APS Physiology review 2019]
- **Movement split:** ~50% vertical, ~25% mediolateral, ~25% anteroposterior; figure-of-eight path. [APS 2019; PubMed 24942053]
- **Displacement increases with breast mass** — "greater breast displacement with increased breast mass"; D-cups can reach 20 cm vertical sprinting; excursion *velocity* also rises with size. [APS 2019; Modelling Female Breast Motion PMC11967444]

### 4.3 One clear bug, one design decision — and what is *not* wrong

**THE BUG — the `cap` is dead code that never binds.** `proj·proj_mult` is *always* below `cap + t·tier_scale`. Natural at tier 200: raw `0.4·68.5 = 27.4` vs cap `15 + 0.3·200 = 75` — the proj term wins at **every** tier from 0 to 200, so the `min()` cap branch has **zero effect**; bounce is purely `proj_mult · projection`. The telling detail: the cap *values* (15 cm rising to 75 cm) show the designer **expected far larger amplitudes** than the `proj_mult` term ever delivers (max ~27 cm). So the cap encodes an intent the formula never realizes — that mismatch, not the magnitude per se, is the real "under-delivery." **This is the one unambiguous defect.**

**THE DESIGN DECISION — clothed vs unclothed amplitude.** Engine D-cup (tier 4–6) bounce = **1.1 cm firm / 2.0–2.4 cm natural**. Portsmouth's **bare-breast** walking figure is ~4 cm; but everyday/sports bras cut displacement **50–75%** → ~1–2 cm — which **matches the engine almost exactly.** So the engine currently sits at **bra-supported** displacement levels. Whether that is "too low" depends entirely on an assumption the engine never states: *does the displayed amplitude model clothed or unclothed motion?* Given this genre (frequent nudity) and the BOUNCE_SCALE prose register ("warm flesh meeting warm flesh," "skin-to-skin"), **unclothed is the natural reading** — under which the amplitude should be raised toward the bare-breast ~4 cm and the multiplier roughly doubled (to ~0.55–0.7 natural / ~0.35–0.45 firm). Under a *supported* reading the current values are KEEP. **State the assumption; the FIX direction follows from it.**

**What is NOT wrong (corrections to a tempting misread):**
- **Growth-with-size is correct, not a defect.** bounce/projection is pinned at 0.20 (firm) / 0.40 (natural) at every tier, so absolute bounce grows with projection. This *matches the data* — the APS review explicitly finds "greater breast displacement with increased breast mass" (D-cups reach ~20 cm vertical sprinting). The engine is **right** to grow bounce with size. The only open question is whether the *fraction* should saturate at fantasy scale, and there is **no data** there — so it is a **design choice, tied to §5**, not a physics defect.
- **The labels do NOT "expect bigger numbers than the formula gives."** `lookupBounceScale` (~334) is an *amplitude-keyed* lookup — the label is *selected by* the computed amplitude, so gentle labels correctly attach to small amplitudes and it cannot disagree with the formula. The only real tension is **register**: the BOUNCE_SCALE *prose* is sensual/unclothed while the *magnitude* is supported-level — which is the same clothed-vs-unclothed decision above, not a separate defect.

### 4.4 Recommendation
- **Fix the dead cap (the clear bug).** Either make it a *real* saturation (choose a regime where `cap + t·tier_scale` actually becomes the smaller term above some fantasy tier, so amplitude tapers — fold into §5's fantasy decision), or **delete it** and accept the honest unbounded-linear growth (which is empirically correct in-range). What is not acceptable is leaving a `min()` branch that silently never fires and misrepresents the intended behavior.
- **Decide clothed vs unclothed, then set the multiplier.** For the unclothed reading (recommended for this genre), roughly double the multiplier to land D-cup at the bare-breast ~4 cm walking figure. For the supported reading, keep current values — but then align the BOUNCE_SCALE prose register so it does not promise unclothed "skin-to-skin" motion at supported amplitudes.
- Keep the lactation 0.85 dampening (firmer full breasts bounce less, slosh more) — that direction is correct and matches the literature.

### 4.5b `bounce_quality` (~773) — clean, no defect (KEEP)
The qualitative descriptor (`bounce_quality`) is a straightforward shape+lactation lookup: lactation+fill>30% → "heavy, sloshing"; else natural → "swaying, pendulous", gravity_defying → "buoyant, minimal", default → "bouncing". It is consistent with the shape model and the amplitude direction (sloshing on full lactation, minimal on gravity_defying), and correctly feeds the `lookupBounceScale` slosh-prose augmentation. No issue — KEEP.

### 4.5 Reference table (firm vs natural, current engine)
| tier | vol-cup | proj firm | bounce firm (0.2×) | bounce natural (0.4×) | bare-breast benchmark | supported (−50–75%) |
|---:|:--|---:|---:|---:|:--|:--|
| 4 | D | 5.5 | 1.1 | 2.0 | ~4 cm (Portsmouth, walking) | ~1–2 cm ← engine matches |
| 6 | F | 6.7 | 1.3 | 2.4 | ~5 cm (extrapolated) | ~1.5–2.5 cm ← engine matches |
| 13 | G/J | 11.1 | 2.2 | 3.8 | larger cups → more | engine = supported-level |
| 20 | fantasy | 16.1 | 3.2 | 5.4 | fantasy zone | — |

The engine's amplitudes line up with **bra-supported** displacement (bare minus 50–75%), confirming §4.3: the magnitude is correct *if* bounce models clothed motion, and ~2× low *if* it models unclothed.

---

## 5. The fantasy range — cube-root geometry vs hyperbolic prose (**DECISION REQUIRED**)

### 5.1 The core finding
All linear dimensions (projection, cleavage, hang, bounce) scale with **volume^(1/3)** — physically unavoidable, since they derive from a sphere/cap radius. But the COMPARATIVE_DESCRIPTIONS / SHAPE_DESCRIPTORS prose escalates **far faster than a cube root**. At the same tier the numbers and the prose describe objects that differ by **orders of magnitude**:

| tier | letter | weight/side | vol/side | projection (firm) | hang (natural) | prose says (COMPARATIVE_DESCRIPTIONS) |
|---:|:--|---:|---:|---:|---:|:--|
| 50 | Z | 7.9 kg | 8.3 L | 30 cm | 18 cm | "each heavier than she can hold and wider than her body" |
| 82 | ~ZZ-region | 19 kg | 19 L | 43 cm | 29 cm | "her body bows… terrain of flesh pressing against the floor" |
| 120 | — | 37 kg | 37 L | 58 cm | 44 cm | "she disappears behind their impossible fullness, soft mountain" |
| 200 | — | 91 kg | 96 L | 86 cm | 82 cm | "room-filling… press against every wall… architecture groaning" |

A breast **projecting 0.86 m and weighing 91 kg** is roughly **beach-ball-to-small-car scale** — emphatically *not* "room-filling," and nowhere near "larger than the room she started in." **At Z+ the engine's measurements and its own narration are describing different objects.** This is the geometric twin of the project's documented *tracking-vs-rendering* drift (MEMORY: "the tracked tier grew while the prose didn't"): here it is inverted — the prose outruns the numbers.

### 5.2 Why this is hard (the trade-off)
The engine's central virtue is that **mass → volume → projection is one coherent derivation** (the prior audit's main "KEEP"). You cannot make projection reach "room scale" at tier 200 *without* either:
- (a) inflating volume/weight super-linearly (breaking the calibrated weight quadratic and making weights physically absurd — tier 200 would weigh tonnes), or
- (b) decoupling linear dimensions from volume via an ad-hoc super-linear term (breaking the coherence — projection would no longer be the radius of the stated volume).

Either route sacrifices the one property that makes the body-DB trustworthy. **No free lunch.**

### 5.3 Recommendation — pick ONE, document it
1. **(Preferred) Keep cube-root geometry; recalibrate the extreme-tier prose + ref ladders to match the numbers.** Re-anchor COMPARATIVE_DESCRIPTIONS bands above ~tier 50 and the `projectionRef`/`hangRef` ladders so "torso-sized / car-sized / fills-a-doorway" language tracks the actual 0.3–1.1 m dimensions. Preserves engine coherence; costs prose edits only. This is the honest fix and keeps numbers↔prose aligned (directly relevant to the project's narration-drift problem).
2. **Declare the prose explicitly hyperbolic.** Accept that above Z the prose is *impressionistic genre escalation*, not a literal report of the cm figures, and add a one-line design note saying so. Zero code/prose churn; lowest effort; but leaves the same numbers↔prose divergence the project is fighting elsewhere.
3. **(Not recommended) Bolt on deliberate super-linear dimension growth above a chosen tier** (e.g., a separate `fantasy_scale` multiplier on linear dims past tier ~50). Makes the prose literally true but **breaks** the mass→volume→projection coherence and de-anchors projection from volume. Only choose this if "environmental scale must be geometrically literal" is a hard product requirement — and then isolate it clearly as a fantasy override so the realistic range stays clean.

**My call:** option 1. Keep the physics, recalibrate the high-tier prose/ref ladders down to meet it. It is the only option that both preserves the engine's coherence *and* closes the numbers-vs-prose gap that the project already knows hurts narration.

---

## 6. General improvements (accuracy · consistency · structure · what's missing)

1. **Bounce: fix the dead `cap` + decide clothed-vs-unclothed amplitude** (§4). The dead cap is the single clearest geometry bug; the amplitude is a one-line design decision (unclothed → ~double the multiplier; supported → keep). Growth-with-size is already correct.
2. **Cleavage: re-root to medial spacing, or relabel as pressed-cleavage** (§2). Add an `intermammary_distance` input — the one missing real anthropometric variable in the geometry set.
3. **Resolve the fantasy numbers-vs-prose gap explicitly** (§5) — recalibrate extreme-tier prose/ref ladders to the cube-root geometry.
4. **Dependency order matters.** Projection is the **root input** to cleavage, hang, and bounce. Any projection change cascades to all three — but since projection is KEEP, the cleavage/hang/bounce fixes can proceed independently against the *current* projection. If projection is ever retuned, re-tune the three multipliers after.
5. **Bounce realism (optional depth):** real bounce is **activity-dependent** (walk 4 cm → run 10–15 cm → sprint 20 cm) and **support-dependent** (a sports bra cuts it ~50–75%). The engine reports a single scalar. Consider an activity/support modifier so combat/running scenes read bigger and "supported/braced" reads smaller — high genre payoff, modest effort.
6. **Anisotropic motion (optional):** Portsmouth's ~50/25/25 vertical/ML/AP split means bounce is a 3-D figure-eight, not a 1-D number. A single "amplitude" is a fine abstraction, but if richer motion prose is ever wanted, the vertical:lateral:forward ratio is the cited basis.
7. **Reference-ladder calibration nits:** `projectionRef` tops out at 90 cm ("further than she is tall") yet projection reaches ~1.1 m at tier ~200 (§1.5); `hangRef` calls 60 cm "pooling on the floor" when it reaches the knees (§3.5). Recalibrate both alongside §5.
8. **Hang floor for small naturals** (§3.3): a tiny threshold so A–B firm/natural can read "no meaningful hang" (ptosis grade 0), matching reality. Low priority.

---

## 7. Realistic-vs-fantasy split (summary)

| | **Realistic (A–G, tiers 0–~13)** | **Fantasy (H+ … Z/ZZ+, tiers ~14+)** |
|---|---|---|
| **Projection** | KEEP — matches spherical-cap @13 cm root to ±0.2 cm; medium-projection end. | KEEP — cube-root growth is physically correct; just under-described by `projectionRef`/prose at Z+ (§5). |
| **Cleavage** | FIX driver (mis-rooted to projection; real driver = medial spacing). Magnitudes OK as "pressed" cleavage. | Same structural fix; fantasy magnitudes inherit projection's cube-root growth (fine). |
| **Hang** | KEEP — maps to Regnault grades I–III correctly (firm = I–II, natural = II–III, GD = 0). Nudge: floor for tiny A-cups. | KEEP — hang>projection above tier ~133 is *correct* pendulous behavior, matches "pooling/cascade" prose. |
| **Bounce** | Amplitude = bra-*supported* level; matches data if clothed, ~2× low if unclothed (genre → unclothed, so raise). `bounce_quality` KEEP. | Dead `cap` never binds — fix or delete it. Growth-with-size is *correct*; whether the fraction saturates at fantasy scale is a design choice (tie to §5), not a defect. |
| **Numbers↔prose** | Aligned. | **Divergent by orders of magnitude** — the central fantasy decision (§5). |

---

## Appendix — sources

**Bounce / breast biomechanics**
- Scurr J, White J, Hedger W. "Breast displacement in three dimensions during the walking and running gait cycles." *J Applied Biomechanics* 25(4), 2009. [journals.humankinetics.com/view/journals/jab/25/4/article-p322.xml ; PubMed 20095453] — D-cup bare resultant 4.2 cm walk → 15.2 cm run; ~56% vertical.
- "Multiplanar breast kinematics during different exercise modalities." [PubMed 24942053]
- "Breast Biomechanics: What Do We Really Know?" *American Physiological Society / Physiology*, 2019. [journals.physiology.org/doi/full/10.1152/physiol.00024.2019] — ~4 cm walk / ~10 cm run / ~20 cm sprint vertical; displacement rises with breast mass; ~50/25/25 vertical/ML/AP.
- "Modelling Female Breast Motion During Running." [PMC11967444]
- University of Portsmouth Research Group in Breast Health (Wakefield-Scurr et al.). [researchportal.port.ac.uk ; wakefield-scurr.com/research-1 ; port.ac.uk "a million breast bounces"]

**Hang / ptosis**
- Regnault P. "Breast ptosis: definition and treatment." 1976 (the classification). [theplasticsfella.com/breast-ptosis ; StatPearls NBK567792]
- Grade thresholds (I ≤1 cm, II 1–3 cm, III >3 cm below IMF) and N:IMF 7.5 ± 1.6 cm; N:IMF>9.5 cm / width>13 cm correction threshold. [PLOS One pone.0172122 — 605-patient prospective study]
- SSN-N youthful target 21–23 cm. [theplasticsfella; fotisofiadellis.com ptosis grading]

**Projection / geometry**
- Spherical-cap volume `V = π·h²·(3R−h)/3`; projection vs base radius. [bra-calculator.com/projection-depth-analyzer ; Bengtson Center standardization PDF]
- Industry sewn-cup depths (AA 1″ … D 4″). [hugsforyourjugs.blogspot.com 2018]
- Breast root width >13 cm (D–G). [PLOS One pone.0172122]
- Projection = shape not size; same letter → opposite profiles. [bra-calculator.com/projection-depth-analyzer]

**Cleavage**
- Intermammary cleft distance baseline 3 ± 0.6 cm (range 1.6–5 cm); wide-set >20 cm; cleavage driven by medial spacing not projection. [Breast Cleavage Remodeling with Fat Grafting, PubMed 29068922; wide-set breast surgical literature]

**Engine computations**
- `research/body-db/_geom_shape_calc.mjs`, `_proj_model_check.mjs`, `_hang_ptosis.mjs` (verbatim-extracted alpha52/Ambrosia functions run in Node). Companion to the prior audit's `research/_engine_calc.mjs` / `_geom_check.mjs`.
