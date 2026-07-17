# Ambrosia Body-Database — Canonical Specification

**Date:** 2026-06-07
**Status:** Synthesis-lead deliverable. Consolidates the prior audit (`research/body-math-audit.md`) and all six dimension reports (`research/body-db/{cup-sizing,weight-volume,biomechanics,geometry-shape,lactation-fluids,db-structure}.md`) into one buildable reference.
**Subject:** the body-measurement engine in `src/ambrosia.naiscript` (~lines 233–982), a verbatim port of `reference/BE   Breast Expansion v2 0 0-alpha52.naiscript`.
**Read-only audit.** No script files were edited. Every engine number below is the verbatim-extracted functions run in Node (the `_*.mjs` repro scripts beside each report). All engine constants and the two FIX-target functions (`bust_cm` line 581, `bust_projection_cm` line 715) were re-confirmed against the live source on this pass.

---

## EXECUTIVE SUMMARY

### Verdict on overall DB health: **STRUCTURALLY SOUND SPINE, BROKEN LABELING SKIN — localized, cheap to fix.**

The engine is built as a pure, stateless, single-integer-driven function cluster: one master scalar `tier_index` → one author-calibrated **weight** quadratic → **volume** (weight ÷ density) → **projection** (volume → sphere radius × shape) → everything geometric (bust, cleavage, hang, bounce) and everything load-bearing (posture, milestones). **That physical spine is genuinely good** — `weight → volume → projection` is one coherent derivation, the weight curve is calibrated to real per-cup data, tissue density (0.95 g/cc) and milk density (1.03 g/ml) are both primary-source-correct, projection matches an independent spherical-cap model to ±0.2 cm through G, hang maps cleanly to Regnault ptosis grades, posture/body-pct lands the real gigantomastia thresholds, the milk-fill *effects* are all qualitatively right, and the 51-band comparative **prose ladder is one of the best-calibrated parts of the DB** (it is secretly anchored to the *sound* projection axis).

The defects cluster in the **labeling/presentation layer that floats free of the physics layer**, plus a handful of dead/saturated/under-coupled secondary fields. None is fatal; all are localized. In order of user-visible severity:

1. **`bust_cm` circumference is ~2× too big** (bust−band ≈ `4.08·proj`; real ≈ `2·proj`). It is the one true *internal contradiction*: the circumference describes an object ~2× the mass the engine's own weight model assigns to the same tier. Worst in the realistic range (2.5× at B), asymptotes to ~1.4× in fantasy. **Re-derive, don't rescale.**
2. **The cup LETTER is disconnected from the measurements** — it's a pure alphabetical encoding of the raw integer, so an F-by-volume body is labeled "D." Anchor it to (repaired) bust−band / volume.
3. **Milk storage capacity is coupled to breast size** (a tier² quadratic × frame), but real storage capacity is *size-independent* (gland-driven, ~170 ml mean). Magnitude is in-range to ~D–F; the *coupling* is wrong and it feeds back into projection/weight when lactating.
4. **The fantasy TOP fails the opposite way from the realistic end:** quadratic weight ⇒ linear size grows as `t^(2/3)`, so above ~tier 120 the *prose* ("room-filling," "building-scale," "buildings cannot contain her") outruns the *math* by ~100× (the engine's own "buildings cannot contain her" fires at 190 L total — a chest freezer, not a building).
5. **Dead/inert code:** the bounce `cap`/`tier_scale` parameters never bind (provably, at every tier/shape); the `compute_sensitivity` size term is inert until ~tier 200; `projectionRef`/`hangRef` prose ladders saturate mid-fantasy; `fluid_type` is a display-only label wired to nothing.

**The structural root cause of #1–#2 is that nothing in the DB cross-validates anything else** — not one assertion ties bust to weight, prose to mass, or capacity to reality. That is *why* a 2× geometry error reached production. The single highest-leverage fix is therefore not any one formula but an **anchor-test harness** (P0 below).

### Top 5 recommendations (priority order)

| # | Recommendation | Type | Why first |
|---|---|---|---|
| **P0** | **Install an anchor-test + invariant harness** (golden per-tier values + cross-dimension invariants), seeded from the audit dump scripts, wired into `test/run.sh`. | STRUCTURE | Durable fix for the *class* of bug. Without it every fix below can silently regress. The one missing assertion (`cup-by-bust−band ≈ cup-by-volume ±1 step, tiers ≤20`) is exactly the canary that would have caught the original bug. |
| **P1** | **Re-derive `bust_cm`** so bust−band ≈ `2·projection` in A–K (small shape spread natural ~1.15 / firm 1.0 / gravity_defying ~0.85, **not** the `2π` wrap), reproducing a standard bra calculator in the realistic range. | FIX (structural) | The lone internal contradiction; most visible exactly where realism matters; lead complaint. Re-derive, not rescale (error ratio is tier-dependent 2.5×→1.4×). |
| **P2** | **Re-anchor the displayed cup LETTER** to (repaired) bust−band / volume, not to the raw integer. Switch the ladder to a single real convention (UK), drop the AA-above-A inversion, and hand the *top* off to named environmental-scale tiers instead of stacked `Z`s. | FIX (labeling) | Even with `bust_cm` fixed, the letter still labels an F as "D." This is the user's core "nail the measurements" ask. |
| **P3** | **Decouple milk capacity from breast size** — make storage a per-character gland trait (~170 ml mean) with at most weak size coupling; drop the `frame_modifier` on capacity; let fantasy gallons be an explicit "supernatural lactation" axis. Also **add an emptying path** (let-down/expression) so `fill_percent` isn't monotone-to-100. | FIX + REBUILD | Wrong coupling that feeds geometry; and today fill ratchets to 100% and pins there, flat-lining the whole 0–100 system. |
| **P4** | **Resolve the fantasy numbers-vs-prose gap explicitly** (recalibrate the extreme-tier prose/ref ladders DOWN to meet the cube-root geometry — preferred — or add an exponential top-regime if literal environmental scale is a hard product requirement); and **clear the dead code** (bounce cap, sensitivity size term, saturated ref ladders, `fluid_type` registry). | DESIGN + FIX | Directly serves the "believable open-ended growth" goal and removes maintainer traps. The top-regime choice is a product decision flagged for the user. |

**The realistic range (A–~K) is anchorable to real data and currently misses on exactly two axes (`bust_cm`, letter). The fantasy range is mechanically coherent and well-calibrated through ~tier 165 (whole-person scale); only its top ~third needs prose/letter re-anchoring. The weight/volume/projection spine, the densities, posture, milestones order, and the prose ladder are KEEP. Fix the skin, not the spine.**

---

## PART 1 — VALIDATED REFERENCE TABLES (the definitive per-tier truth)

These tables are the **target** the engine should reproduce, not (except where noted) what it currently outputs. Realistic columns are anchored to cited real data; fantasy columns are designed for internal consistency and believability. Reference frame: **height 165 cm** (frame_modifier = 1.0), **waist 61 cm**, **build curvy** (band offset +8 → **band = 69 cm = 27.2″**), **shape natural**, no lactation — matching the engine's default so the numbers are directly comparable. Two engine tiers ≈ one real cup (each tier = one half-cup); `tier_index` is an integer.

> **The band caveat (applies to every cup/volume row):** the default curvy band is **27″**, but every published cc↔cup chart is anchored to a **34″** band. By the sister-size law (34C = 32D = 30DD — same volume, smaller band ⇒ bigger letter), a fixed cc on a 27″ band reads **2–3 letters larger** than on a 34″ band. The reference cup column below is stated **as it would read on the engine's own 27″ band** where that matters; the cc figures are the physical truth and band-independent.

### 1.1 Core physical spine — REALISTIC range (anchored to real data)

UK-cup column = **computed from §2.9 on the repaired bust−band** (`round(b−b ÷ 2.54)″` → UK ladder `['AA','A','B','C','D','DD','E','F','FF','G','GG','H',…]`), i.e. the repro's `cupFrom_b-b(UK)`. It is **not** eyeballed from a 34-band cc chart.

| tier | UK cup (computed, 27″ band) | bust−band (cm) | bust (cm) | band (cm) | weight/side (g) | weight total (kg) | volume/side (cc) | projection (cm) | source anchor |
|---:|:--|--:|--:|--:|--:|--:|--:|--:|:--|
| 0 | **C** | 7.1 | 76.1 | 69 | 180 | 0.36 | 189 | 3.1 | proj 3.1 ⇒ b−b 7.1 ⇒ C; HauteFlair A 189cc (vol agrees at 34-band) |
| 2 | **D** | 9.4 | 78.4 | 69 | 298 | 0.60 | 314 | 4.1 | proj 4.1; vol≈C@34=314cc |
| 4 | **DD** | 11.5 | 80.5 | 69 | 432 | 0.86 | 455 | 5.0 | proj 5.0; vol≈DD@34=455cc |
| 6 | **DD** | 13.8 | 82.8 | 69 | 582 | 1.16 | 613 | 6.0 | wt comment "D~1.2kg total"; vol≈F@34=613cc; DD/E wt 550–680g |
| 8 | **E** | 16.1 | 85.1 | 69 | 748 | 1.50 | 787 | 7.0 | proj 7.0; vol≈G@34=787cc; F wt 680–820g |
| 10 | **F** | 18.4 | 87.4 | 69 | 930 | 1.86 | 979 | 8.0 | proj 8.0; G–H@34 |
| 12 | **FF** | 20.7 | 89.7 | 69 | 1128 | 2.26 | 1187 | 9.0 | wt comment "G~2.3kg"; ~8″ b−b |
| 13 | **G** | 21.8 | 90.8 | 69 | 1233 | 2.47 | 1298 | 9.5 | edge of charted data |

**Notes on the realistic spine (all KEEP except the two FIX columns):**
- **bust−band & bust columns are the P1 TARGET (repaired `bust_cm`), not current output.** The engine currently computes ~12.7 cm b−b at tier 0 and ~25.1 cm at tier 6 — ~2× these. The repaired model (`band + 2·proj·1.15`) yields the values shown.
- **The UK-cup column is the P2 TARGET, computed from the bust−band on the left** (round-trips with §2.9 by construction — that mechanical self-consistency is the point; eyeballing it was the very class of bug this audit indicts). It runs ahead of a *tier-intent* reading because of the heavy weight floor (next bullet) and the 27″ band.
- **⚠ DECISION SURFACED — even after P1, tier 0 reads "C," not "A."** Projection at tier 0 is already **3.1 cm** (forced by the 180 g/side weight floor `BASE_WEIGHT_CONST = 0.18`), and `2·3.1·1.15 ≈ 7.1 cm ≈ C`. To make the smallest tier read "A" you'd need ~1.1 cm projection. So the bodies still run **~2 cups above their tier-intent label after the bust_cm fix** — which is the same "weight curve runs ~1 cup heavy by label" finding from the weight-volume and prior audits, now surfacing on the letter. **P2 must choose explicitly:** (a) let the displayed letter be honest to the measurements (tier 0 = C, the engine simply *starts* bigger than its "A" sticker — simplest, and arguably correct since the body genuinely masses a C), or (b) also lower the weight floor/linear coefficient so the smallest tier projects ~1 cm and reads A (re-calibrates the whole spine down by ~1 cup, touching the otherwise-KEEP weight curve). The table above shows option (a). This choice was previously hidden by an eyeballed "A/B" cell; it is now explicit.
- **Weight, volume, projection columns are current engine output and are KEEP** — author-calibrated, monotonic, physically a real (if ~1 cup heavy by label) breast. Volume is locked to weight (`vol = weight ÷ 0.00095`); density 0.95 g/cc is correct.

### 1.2 Core physical spine — FANTASY range (internally consistent by design)

Projection and hang columns recomputed for a single shape each (firm projection, natural hang) so both are monotone and reproduce from the engine functions. Other shapes scale predictably (natural projection ≈ 0.8× firm; gravity_defying hang = 0).

| tier | letter (UK→named) | weight/side (kg) | weight total (kg) | volume/side (L) | projection (cm, firm) | hang (cm, natural) | closest real object (per side) | regime |
|---:|:--|--:|--:|--:|--:|--:|:--|:--|
| 16 | I | 1.57 | 3.1 | 1.66 | 13.2 | 7.3 | grapefruit | clinical-extreme (real gigantomastia) |
| 20 | K | 2.08 | 4.16 | 2.19 | 16.1 | 8.9 | cantaloupe (~2.5 L) | clinical-extreme |
| 24 | M | 2.79 | 5.58 | 2.79 | 18.1 | 10.1 | toward human head | edge of recorded human (9.3% body mass case) |
| 27 | NN | 3.12 | 6.25 | 3.29 | 19.5 | 11.0 | ~human head (~4–5 L) | mid-fantasy begins |
| 30 | P | 3.63 | 7.26 | 3.82 | 21.0 | 11.9 | ≈ human head | mid-fantasy (moment-dominated) |
| 40 | U | 5.58 | 11.16 | 5.87 | 25.6 | 15.0 | ≈ basketball (~7 L) | mid-fantasy |
| 50 | Z | 7.93 | 15.86 | 8.35 | 30.0 | 18.3 | basketball+ | end of single-letter ladder |
| 60 | Z+1 "head-scale" | 10.7 | 21.4 | 11.2 | 34.3 | 21.6 | large watermelon (~12 L) | far-fantasy (bulk/footprint) |
| 82 | Z+2 "torso-scale" | 19 | 38 | 19 | 43.3 | 29.4 | beach ball (~30 L) | far-fantasy |
| 120 | Z+3 "furniture-scale" | 35.6 | 71.2 | 37.5 | 58.0 | 44.4 | larger than beach ball | far-fantasy |
| 165 | Z+4 "person-scale" | 63.7 | 127 | 67.1 | 74.3 | 64.6 | **≈ whole adult human (~70 L)** | far-fantasy (TOP of well-calibrated zone) |
| 200 | Z+5 "room-scale"* | 91.2 | 182 | 96.0 | 86.4 | 82.2 | ~1.4 humans (a bathtub is 160 L) | **prose/math gap zone** |
| 260 | Z+6 "environmental"* | 149.7 | 299 | 157.6 | 106.2 | 115.9 | ~2 bathtubs / a chest freezer | **prose/math gap zone** |

**Notes on the fantasy spine:**
- **Weight, volume, projection, hang are current engine output and are KEEP through ~tier 165** — coherent, monotonic, and well-mapped to real objects all the way to whole-person scale. This is a genuinely strong fantasy range.
- **The letter column is the P2 TARGET:** real UK letters through ~K (tier 20), continue UK doubling to ~Y (end of single letters, tier ~48–50), then **named environmental-scale tiers** mapped to the prose breakpoints — NOT the current overloaded `Z`-prefix scheme (which makes `ZA`(52) read smaller than `ZZ`(51) and never hands off to the scale metaphors).
- **\* tiers 200/260 are the documented gap:** the engine's *measurements* there describe a bathtub/freezer; its *prose* says room/building scale. Object anchors: head ~4–5 L · basketball ~7 L · watermelon ~12 L · whole human ~66–75 L · bathtub ~160 L · refrigerator ~600 L · **small bedroom ~21,600 L** · two-car garage ~85,000 L. To literally reach a room is ~1,500× the basketball volume ⇒ would need ~tier 1,750+ under the quadratic. **This is fantasy-by-design colliding with mis-scaled prose — resolved in Part 3, P4.**
- **Realistic/fantasy boundary is dimension-specific (see Part 4 + §5.1):** for the *letter/labeling* axis, real-data fidelity is owed through ~K (tier ~20). For the *weight* axis, the engine stays inside *documented human* (gigantomastia resection) data much further — mean gigantomastia (~2,554 g/side) at ~tier 23, the 9.3%-body-mass extreme case at ~tier 25, the 7.5 kg extreme at ~tier 47. So the mid-tiers are grounded in real pathology data, not invention.

### 1.3 Secondary dimensions — per-tier reference

**Cleavage (pressed/displayed depth)** — *magnitudes OK; driver is mis-rooted, see Part 2 §2.2.*

| tier | vol-cup | cleavage firm (0.5×proj) | cleavage natural (0.3×proj) |
|---:|:--|--:|--:|
| 4 | D | 2.8 | 1.5 |
| 6 | F | 3.4 | 1.8 |
| 13 | G/J | 5.6 | 2.9 |
| 20 | fantasy | 8.1 | 4.0 |

Real anchor: intermammary cleft baseline **3 ± 0.6 cm** (range 1.6–5). These are reasonable *pressed* cleavage depths. The defect is that cleavage is driven by *projection* (so perky `gravity_defying` cleaves deepest — backwards for unsupported breasts) when the real driver is *medial spacing / how breasts press together*.

**Hang / ptosis (nipple drop below attachment)** — *KEEP; maps to Regnault grades.*

| tier | vol-cup | hang natural (cm) | hang firm (cm) | Regnault reading (natural) |
|---:|:--|--:|--:|:--|
| 0 | A | 1.9 | 0.8 | Grade I–II (over-reads slightly for a young A) |
| 4 | D | 3.1 | 1.4 | Grade III nat / II firm — realistic |
| 8 | G | 4.3 | 2.0 | Grade III nat / II firm |
| 13 | G/J | 6.1 | 2.9 | deep Grade III — apt for a large pendulous breast |

Regnault thresholds: Grade I ≤1 cm below IMF, II 1–3 cm, III >3 cm. Normal nipple-to-IMF 7.5 ± 1.6 cm. Firm curve lands Grade I–II, natural II–III, gravity_defying = 0 — correct ordering. **KEEP.** Above tier ~133 hang exceeds projection — **correct** pendulous behavior at fantasy scale, not a bug.

**Bounce (displacement amplitude)** — *growth-with-size is correct; one dead-code bug + a clothed/unclothed decision.*

| tier | vol-cup | bounce firm (0.2×proj) | bounce natural (0.4×proj) | bare-breast benchmark | supported (−50–75%) |
|---:|:--|--:|--:|:--|:--|
| 4 | D | 1.1 | 2.0 | ~4 cm (Portsmouth, walking) | ~1–2 cm ← engine matches |
| 6 | F | 1.3 | 2.4 | ~5 cm | ~1.5–2.5 cm ← engine matches |
| 13 | G/J | 2.2 | 3.8 | larger → more | engine = supported-level |

Portsmouth corpus: bare D-cup **4.2 cm walking → 15.2 cm running → 20 cm sprinting**; ~50% vertical / 25% lateral / 25% fore-aft; displacement rises with mass. The engine sits at **bra-supported** levels (matches data *if* clothed; ~2× low *if* unclothed). For this genre, unclothed is the natural reading → roughly double the multiplier. **The `cap`/`tier_scale` parameters are dead code that never binds.**

**Posture / load** — *body-pct KEEP; posture_ratio driver should be rebuilt to moment-based.*

| tier | letter | breast total kg | breast/body % | posture_ratio | posture label | real-world referent |
|---:|:--|--:|--:|--:|:--|:--|
| 6 | D | 1.16 | 1.8 | 0.023 | unaffected | normal |
| 8 | E | 1.50 | 2.4 | 0.029 | **minor forward tilt** ← over-pathologized | clinically posture is *unaffected* here |
| 10–11 | F/FF | 1.86 | ~3.0 | 0.036 | minor tilt | **gigantomastia threshold (3% body mass)** |
| 20 | K | 4.16 | 6.3 | 0.079 | pronounced arch | — |
| ~24–25 | M | ~5.3 | ~9.3 | ~0.10 | profound arch | **most-extreme recorded human (9.3% / 4.9 kg)** |
| 50 | Z | 15.86 | 20.4 | 0.255 | spine bowed | pure fantasy |
| 200 | named | 182 | 74.6 | 0.933 | body exists only as origin | pure fantasy |

`breast_mass_body_pct` lands the real gigantomastia (3%) and extreme (9.3%) thresholds almost exactly — **KEEP, it is the right master variable.** But clinical data (PMC3785590, n=42 controlled) shows standing posture is *statistically unchanged* through surgical macromastia (change 0.89°, p=0.104 n.s.); the realistic symptom is **ache/strain/bra-dependence, not visible posture change**. So the low posture thresholds **over-pathologize** (flagging "tilt" at E/DD). And `posture_ratio` is **mass-only** — it discards the projection (moment arm) it already computes, when real spinal load is `moment = mass × forward-distance` (Hansraj: ~+10 lb per inch forward).

**Sensitivity** — *event terms KEEP; size term is inert (FIX/document).*
Growth-surge (×1.5 within 3 gens, ×1.2 within 6) and lactation (×1.3/1.5/1.8 by fill) multipliers are well-designed and fire in the playable range. The extreme-size reducer `max(0.7, 1 − 0.001·t)` only reaches "dulled" at ~tier 200 — inert for all play. Direction (reduced sensation at huge stretched size) is clinically correct; the coefficient is ~5–10× too weak.

**Lactation capacity / milk** — *values OK to ~D–F; size-coupling is wrong.*

| tier | letter | capacity/side (ml) | inside real range? |
|---:|:--|--:|:--|
| 0 | A | 50 | below clinical floor (Kent 74 ml) |
| 4 | C | 174 | ✅ ≈ Kent mean (~170–180) |
| 6 | D | 254 | ✅ (~1.5× mean, in-range) |
| 8 | E | 346 | ✅ near ceiling (Kent max 382) |
| 10 | F | 450 | just above clinical ceiling |
| 13 | GG | 629 | fantasy |

Kent 2006: **74–382 ml/breast, mean ~180**, and **NOT correlated with breast size** (gland-driven, not fat). Milk density 1.03 g/ml is exactly right. `fill_percent` = real "degree of fullness." The defects: capacity is a tier² quadratic × frame (should be size-independent), milk/tissue ratio drifts 26%→60% with no rationale, there's no emptying path, and `fluid_type` (milk/mana/arcane/ambrosia/custom) is a display label wired to nothing.

---

## PART 2 — RECOMMENDED CALCULATION MODEL (KEEP / FIX / REBUILD per piece)

The model the engine *should* use. Each piece is marked KEEP (from alpha52, validated), FIX (repair in place), or REBUILD (replace the approach). Constants confirmed against source on this pass.

### 2.0 The spine — KEEP (do not touch)

```
frame_modifier(H)          = (H / 165)^1.5                          // KEEP (aesthetic lever; doc-caveat it's not a height↔bust fit)
base_weight_per_side_kg(t) = 0.18 + 0.055·t + 0.002·t²              // KEEP (author-calibrated to real per-cup g; monotonic)
weight_per_side_kg(t,H)    = base_weight_per_side_kg(t) · frame_modifier(H)   // KEEP
tissue_vol_per_side(t,H)   = weight_per_side_kg(t,H) / 0.00095      // KEEP (density 0.95 g/cc — primary-source correct; volume locked to weight)
bust_projection_cm(...)    = (3·total_vol/2π)^(1/3) · flatten · shape_factor // KEEP (matches spherical-cap to ±0.2 cm thru G)
   flatten     = min(1, 0.7 + 0.015·t)                             // KEEP
   shape_factor: natural 1+0.3·ln(1+t/10) | firm 1+0.4·ln(1+t/6) | gravity_defying 1+0.5·ln(1+t/4)  // KEEP
band(W,build) = W + BUILD_BAND_OFFSET[build]                        // KEEP (3–10 cm offsets plausible; doc the 27″ band trap)
```

> **Validation invariant for the spine (P0):** `tissue_vol == weight/0.00095` exactly; `projection ∈ [0.7·r, 1.3·shape·r]` of that volume's sphere radius. These three cannot disagree — they're one derivation — and the harness should assert it so a coefficient edit can't silently break the trunk.

### 2.1 `bust_cm` — **FIX (structural, P1)** — the lead fix

**Current (broken):**
```
bust_cm = band + 2π · proj · coverage · circFactor
        // added bust−band ≈ 2π·proj·0.5·1.30 ≈ 4.08·proj   ← ~2× too big
```

**Replacement (re-derive, geometry-first, no new tables):**
```
const SHAPE_CIRC_SPREAD = { natural: 1.15, firm: 1.0, gravity_defying: 0.85 };  // small spread, NOT 2π
function bust_cm(tier, waist, height, shape, build) {
  const proj = bust_projection_cm(tier, height, shape, /*lact*/false, 0);
  const band = waist + (BUILD_BAND_OFFSET[build] ?? 5);
  return band + 2 * proj * (SHAPE_CIRC_SPREAD[shape] ?? 1.0)
              * coverageRamp(tier);          // coverageRamp = 1.0 in A–K, >1 only in deep fantasy
}
```
- **Anchor:** real bust−band ≈ **2·projection** in A–G (a spherical cap on the chest wall, not a free-floating circle of radius=projection wrapped around the torso, which is what `2π·proj` does and then `circFactor 1.30` inflates further).
- **Result:** tier-6 b−b ≈ `2·6.0·1.15 ≈ 13.8 cm` → real DD/E, matching weight (582 g/side) and projection (6 cm). The three "size signals" finally agree.
- **Why re-derive, not rescale:** the current error ratio is tier-dependent (2.5× at B → 1.4× at Z). A constant divisor would fix one tier and miss the rest. The `coverageRamp` lets bust−band intentionally diverge upward only in deep fantasy by design.
- **Acceptance test:** for tiers 0–20, feeding the repaired `bust_cm` + band back through a standard calculator (`cup = round((bust−band)/2.54)″`) must round-trip to a coherent letter that agrees with the cc→cup lookup at that band within ±1 step. Today this fails 0/18.

### 2.2 Cleavage — **FIX (re-root the driver)** or relabel

**Current:** `cleavage_depth_cm = projection · SHAPE_CLEAVAGE_FACTOR[shape] · (1 + lactBoost)` — driven by projection, with `gravity_defying` (0.7×) cleaving *deepest* (backwards for unsupported breasts).

- **Minimal (relabel + document):** rename the field's intent to **pressed/displayed cleavage depth** and keep the formula; under that reading the factor ordering (firmer/more-projected tissue forms a deeper *pressed* valley) is defensible, and it matches the CLEAVAGE_SCALE prose ("press together when her arms are at her sides"). Lowest effort, preserves downstream prose.
- **Better (add the missing real variable):** introduce `intermammary_distance` (~3 cm default, frame-scalable) — the one real anthropometric variable the geometry set is missing — and make cleavage `= (medial fullness from volume) × (1 − gap/threshold) × press_factor(shape)`, so wide-set/perky bodies cleave shallower and large close-set bodies deepest.

### 2.3 Hang — **KEEP** (one optional nudge)
Formula maps cleanly to Regnault grades (see §1.3). Optional: a small floor so a tier-0/A natural reads "no meaningful hang" (ptosis grade 0) rather than 1.9 cm. The `hang > projection` crossover above tier ~133 is **correct** and must not be "fixed."

### 2.4 Bounce — **FIX (delete dead cap) + DECIDE clothed/unclothed**
```
// Current: bounce = min(proj·proj_mult, cap + t·tier_scale) · damp
//   The cap arm NEVER binds at any tier/shape (proven). It is dead code.
```
- **Delete the cap arm** → `bounce = proj·proj_mult·damp` (what actually runs), **or** re-tune the cap sub-linear so it genuinely intersects the projection curve in deep fantasy by design. Do not leave a `min()` branch that silently never fires.
- **Decide clothed vs unclothed.** For this genre (frequent nudity, "skin-to-skin" prose register), unclothed is the natural reading → roughly **double** the multiplier (toward ~0.55–0.7 natural / ~0.35–0.45 firm) to land D-cup at the bare-breast ~4 cm walking figure. Under a supported reading, KEEP current values but align the prose register.
- **KEEP:** growth-with-size (empirically correct — displacement rises with mass), the 0.85 lactation damping, and `bounce_quality` (clean lookup, no defect).

### 2.5 Posture — **KEEP body_pct; REBUILD posture_ratio driver; FIX low thresholds**
- **`breast_mass_body_pct` = KEEP** — lands the real 3% (gigantomastia) and 9.3% (extreme) thresholds; the right master variable.
- **`posture_ratio` driver = REBUILD (moment-based):** real spinal load is `moment = mass × projection`, not mass alone. The engine already computes projection and throws it away. Recommended:
  ```
  moment     = total_breast_kg · (projection_cm / PROJ_REF)     // PROJ_REF ~6 cm (a real D/DD depth)
  load_index = moment / (body_lean + moment-equivalent)          // bounded 0..~1 for banding
  ```
  In A–G (proj 3–7 cm) this ≈ today's behavior; in fantasy (proj 20–90 cm) load escalates *faster* than mass — giving "spine bowed / structurally dominated" a real driver. `SHAPE_POSTURE_FACTOR` then reads correctly as a *moment* modifier (pendulous = longer arm = more load).
- **Low thresholds = FIX (raise):** lift the first two `ratio_max` cutoffs so the whole A–G band reads `unaffected` (clinical data: standing posture is statistically unchanged through macromastia). Let that band's flavor come from **ache/strain/bra-dependence**, not a posture label.
- **`estimated_body_weight_kg` = FIX (minor):** subtract a baseline breast allowance before the ratio (`body_lean = body − BASELINE_BREAST_KG`) so breast mass isn't double-counted into a body figure that already includes it.

### 2.6 Sensitivity — **KEEP event terms; FIX size term**
Keep the growth-surge and lactation multipliers. Recalibrate the extreme-size reducer to bite in the fantasy band (meaningful reduction by ~tier 30–40, floor by ~tier 80), and/or key it to skin-tension/projection so a *freshly grown* breast reads hypersensitive while a *long-settled vast* one reads dulled. Or explicitly document it as an event-spike (and accept it's ~constant otherwise). Use `compute_skin_tension` (a proper event-driven state machine — **KEEP**) as the template.

### 2.7 Milestones — **KEEP load ones; FIX (re-key) spatial ones**
Milestones are weight-gated and fire in **monotone, sensible order** — KEEP the *primitive* (mass governs encumbrance). But the entries split into two physical classes; only one is truly weight-driven:
- **KEEP on kg (load):** "can't go braless" (1.5), "can't stand unaided" (30), "custom furniture" (70), "structural mods" (130), "architectural" (180).
- **RE-KEY to projection/volume (geometry/occlusion):** "can't see her feet" (4.0), "can't touch toes" (6.0), "lap disappears" (7.5), "press on embrace" (10), "sideways through doorways" (14), "can't reach ground" (20), "can't fit a chair" (45). Two equal-mass bodies (one dense, one voluminous) clear a doorway / occlude the feet very differently.
- **DO NOT anchor any milestone to `bust_cm`** (it's the ~2×-inflated axis). Anchor geometry milestones to `bust_projection_cm` / volume (the blessed axes).

### 2.8 Milk / lactation — **KEEP density+fill+effects; FIX capacity coupling; REBUILD fluid_type; ADD drain**
- **KEEP:** `DEFAULT_FLUID_DENSITY = 1.03` (exact clinical milk density), `fill_percent` 0–100 (= real "degree of fullness"), and all fill *effects* (§1.3 — all qualitatively correct).
- **FIX capacity coupling:** real storage is **size-independent** (~170 ml mean, gland-driven). Make base capacity a **per-character gland trait** (a "milk producer" stat) largely independent of tier; drop the `frame_modifier` on capacity; flatten the quadratic in the realistic range. Let fantasy gallons be an explicit "supernatural lactation" axis, not a physiology claim. **Audit the two call sites** (`bust_projection_cm` line 721, `weight_per_side_full_kg` line 617) so the milk contribution to geometry stays sane.
  - Alternative if a size-link is wanted: `capacity = tissue_vol · MILK_FRACTION` with `MILK_FRACTION ≈ 0.40` (reproduces the Kent mean at tiers 4–8, and 0.40 × 189 cc at tier 0 ≈ 76 ml — already above the 74 ml floor, subsuming the "raise BASE_CAPACITY_CONST" nit). Pick ONE constant; this removes the 26%→60% drift but keeps the (deliberate) size coupling — choose it only if "bigger ⇒ proportionally more milk" is the intended genre lean.
- **ADD an emptying path** (let-down/nursing/expression action, or narrative-triggered release) that drops `fill_percent` — today the only mutation is `+8%/turn` (line ~3045), so fill ratchets to 100% in ≤12.5 turns and **pins there permanently**, flat-lining the whole 0–100 system. This is the one genuine *mechanical* defect in the subsystem.
- **REBUILD `fluid_type` into a registry** (it's currently a dead display label): type → default density (into the existing `weight_per_side_full_kg(...,d)` arg — a tiny wiring change) + fill behavior + a `growth_factor` for the planned pressure escalator. Density anchors (all in a physically sane 1.0–1.4 band): `milk 1.03` (measured), `mana 1.00` (water), `arcane ~1.10`, `ambrosia ~1.25` (thick/golden, approaching honey ~1.4), `custom` = manual override. `growth_factor`: milk 0 (mundane — copious milk *without* runaway growth), mana low+, arcane medium++, ambrosia high+++ (the namesake growth engine). This cleanly separates "lots of milk" from "milk that makes her grow."

### 2.9 Cup LETTER ladder — **FIX (re-anchor + simplify), P2**
**Current:** `tier_index_to_letter` is a pure alphabetical encoding of the integer (0:A 1:AA 2:B 3:BB … 50:Z 51:ZZ 52:ZA …), disconnected from any measurement. Three bugs: (1) AA sits *above* A (universal convention: AA < A); (2) doubled letters DD/FF/GG are read as *half*-steps but are *full* cups in UK, and BB/CC/EE are inventions; (3) the fantasy `Z`-prefix is overloaded (terminal *and* multiplier) so `ZA`(52) reads smaller than `ZZ`(51) and never hands off to the prose scale.

**Replacement:**
```
// (a) Realistic: derive the displayed letter from (repaired) bust−band — the primary real definition.
function cupFromBustBand_cm(diff_cm, system='UK') {
  const inch = Math.round(diff_cm / 2.54);
  const UK = ['AA','A','B','C','D','DD','E','F','FF','G','GG','H','HH','J','JJ','K','KK','L'];
  const US = ['AA','A','B','C','D','DD','DDD','G','H','I','J','K','L','M','N','O','P','Q'];
  const t = system === 'US' ? US : UK;
  return inch <= 0 ? 'AA' : (inch < t.length ? t[inch] : t[t.length-1] + '+');
}
```
- Use the **UK** sequence `A B C D DD E F FF G GG H HH J JJ K KK L…` (real, monotone, "I" skipped, doubles = full cups). Drop AA from the *growth* ladder start (or shift so index 0 = AA) — AA/AAA are below-baseline cups a growth RPG rarely starts beneath.
- Post-repair, bust−band *is* the cup definition, so this is simultaneously the volume-honest answer (they converge) and needs no runtime cc table.
- **Fantasy top (past ~K/tier 20 → end of single letters ~Y/tier 48):** continue UK doubling at a **constant cadence** (don't let the ∛-projection curve compress it — pick e.g. +3 cm bust−band per full cup past K and hold it). **Beyond Y:** switch to **named environmental-scale tiers** mapped to the existing `COMPARATIVE_DESCRIPTIONS` breakpoints (head/torso/furniture/person/room/environmental at tier_max 25/82/120/165/200/∞), so the letter and the prose finally speak one language. Use **volume**, not bust−band, as the anchor up here (bust−band flattens as ∛volume exactly when fantasy wants acceleration).
- **`tier_letter_to_index` = KEEP** (regenerate as the exact inverse of whatever ladder is chosen; it's mechanical).

---

## PART 3 — PRIORITIZED IMPROVEMENT PLAN + TEST STRATEGY

### 3.1 The fixes, in priority order

| P | Fix | Files/lines | Effort | Risk |
|---|---|---|---|---|
| **P0** | Anchor-test + invariant harness (§3.3). Seed from `_full_dump.mjs` + `_dims_check.mjs`; add `test/body_db.test.mjs`; wire into `test/run.sh`. | new test file | low | none (read-only checks) |
| **P1** | Re-derive `bust_cm` ≈ `band + 2·proj·spread·ramp` (§2.1). | `ambrosia.naiscript` ~581–593 | low | low |
| **P2** | Re-anchor cup letter to bust−band/volume; UK ladder; named fantasy tiers; fix AA inversion (§2.9). | ~506–530 (`tier_index_to_letter`, `tier_letter_to_index`) | medium | medium (presentation-wide) |
| **P3a** | Decouple milk capacity from size; drop frame_modifier on capacity; gland trait (§2.8). | ~604–606, call sites 617/721 | medium | medium (feeds geometry) |
| **P3b** | Add fill emptying path (let-down/expression) (§2.8). | ~3045 + new action | low–med | low |
| **P4a** | Resolve fantasy numbers-vs-prose gap (recalibrate prose/ref ladders DOWN — preferred; or exponential top-regime) (§3.2). | ~437–493 prose; ~781–800 ref ladders | low (prose) / high (math) | low / high |
| **P4b** | Delete dead bounce cap; recalibrate sensitivity size term; extend projectionRef/hangRef; wire fluid_type registry (§2.4, 2.6, 2.8). | ~282, ~834, ~781–800, ~1113 | low | low |
| **P5** | Posture: moment-based driver; raise low thresholds; re-key spatial milestones; fix body-weight double-count (§2.5, 2.7). | ~638–655, ~289 | medium | medium |

**General DB improvements (cross-cutting, do alongside):**
- **Move calibration into data, not comments.** The line-258 anchor points ("D~1.2kg, G~2.3, K~4.2…") and every band threshold should be testable constants/fixtures, machine-checked.
- **Separate "physical" from "presentation" outputs** in `compute_body_snapshot`: the measurement core (weight/vol/proj/posture) is canonical truth; the *letter* and *prose* are *renderings* of it. Making the split explicit prevents the labeling layer from drifting from physics again — the structural root cause.
- **Promote `bust_projection_cm`'s inline shape branches to a `SHAPE_PROJECTION_FACTOR` table** for consistency and easier tuning.
- **What's missing (extensibility):** per-character lactation trait (P3); areola/nipple dimension (common genre focus, cheap to add as projection-derived); an explicit bust *width* dimension (real base width ~14 cm) to ground "as wide as her shoulders" prose; persistent firmness/elasticity beyond skin-tension's transient. The single-scalar pure-function architecture is genuinely good for extension — the constraint is the missing test net, not the architecture.

### 3.2 The fantasy numbers-vs-prose gap — the one product DECISION

Two reports (weight-volume §6, geometry §5) independently prove the same thing with hard numbers: above ~tier 120 the cube-root linear growth makes the *measurements* fall ~100× short of the *prose*. The engine's own "buildings cannot contain her" milestone (180 kg) fires at 190 L total — a chest freezer. This is the **inverse** of the realistic-end `bust_cm` bug (there, math > words; here, words > math) and it's the geometric twin of the project's known **tracking-vs-rendering drift**.

- **Option A (PREFERRED) — keep cube-root physics, recalibrate the extreme-tier prose + ref ladders DOWN to meet it.** Re-anchor `COMPARATIVE_DESCRIPTIONS` above ~tier 50 and `projectionRef`/`hangRef` so "torso-sized / car-sized / fills-a-doorway" tracks the actual 0.3–1.1 m dimensions; soften the top ~3 milestone strings so their *literal* claims aren't contradicted (e.g. 180 kg → "requires custom architecture — no standard furniture or vehicle can hold her," which 190 L *does* satisfy). **Prose-only, zero physics churn, and it closes exactly the numbers-vs-prose divergence the project is fighting.** This is the recommended default.
- **Option B — add a geometric/exponential top regime** above a fantasy threshold so volume *literally* reaches room/building scale where the prose says so (`weight = weight(T) · exp(k·(t−T))` past `T_FANTASY`). The only shape that lets a bounded ladder span basketball → room → building. **But it breaks the calibrated weight quadratic and de-anchors projection from volume** — sacrificing the engine's central virtue. Choose only if literal environmental *measurements* (not person-scale + poetic prose beyond) are a hard product requirement, and isolate it as a clearly-flagged fantasy override so the realistic range stays clean.

**Recommendation: Option A.** The math is already excellent through tier ~165 (whole-person scale, which is enormous). Recalibrate the prose down to meet the physics rather than inflating physics to chase the prose. **This is a decision to surface to the user**, since it trades "literal building-scale numbers" against "engine coherence."

### 3.3 TEST STRATEGY — the invariant that guards each dimension

The bug hid because **nothing cross-checked anything**. The harness must assert *relationships*, not just point values, so this class of bug can't recur. Extend `test/run.sh` (already 202 assertions) with `test/body_db.test.mjs`:

**(A) Golden anchor values** — pin the author's calibration + real-data targets so any coefficient edit screams:

| tier | letter | weight_total | vol/side | bust−band (post-P1) | source |
|---:|:--|--:|--:|--:|:--|
| 0 | A | 0.36 kg | 180–230 ml | ~2.5–7 cm | HauteFlair; ~1″ |
| 6 | D | 1.2 kg (±0.1) | ~400–613 ml | ~10–14 cm | wt comment; HauteFlair; ~4–5″ |
| 12 | G | 2.3 kg (±0.2) | ~650–1187 ml | ~20 cm | wt comment; ~8″ |
| 20 | K | 4.2 kg (±0.3) | (fantasy: monotone only) | — | wt comment |

(Weight column pins the calibration and matches today. The vol/side and bust−band columns are what P1+P2 must bring into line — the engine currently *fails* them.)

**(B) Cross-dimension & structural invariants** — the checks whose *absence* let the bug hide:

1. **Spine coherence:** `tissue_vol == weight/0.00095` exactly; `projection ∈ [0.7·r, 1.3·shape·r]`.
2. **★ Bust↔mass agreement (the canary):** cup-implied-by-bust−band (÷2.54 cm) within **±1 cup** of cup-implied-by-volume (cc→cup), for tiers ≤20. *This single assertion would have caught the original bug; it fails by 3–4 cups today.*
3. **Monotonicity:** every continuous dimension strictly increases over t∈[0,260] (catches sign/coefficient flips).
4. **Bounce-arm invariant:** `bounce == proj·proj_mult·damp` for representative tiers (pins §2.4; fails loudly if the dead cap is accidentally made binding).
5. **Hang guard:** `hang ≤ projection` for t ≤ 133 (realistic-range guard; the fantasy crossover above is intended).
6. **Prose↔mass band:** the COMPARATIVE rung at tier T must fall in a hand-curated mass/volume bracket (e.g. "head-sized" rungs require vol/side ∈ [2.5, 4] L). Pins prose to physics so a projection retune can't silently desync narration.
7. **Letter round-trip:** `tier_letter_to_index(tier_index_to_letter(t)) == t` for t∈[0,300]; boundary cases (49,50,51,52,101,102) explicit.
8. **Capacity decoupling (post-P3):** capacity does **not** change when only `tier_index` changes (holding the gland trait fixed) — assert the *independence*, not a numeric band (a band would contradict size-independence).
9. **Bounds:** `posture_ratio ∈ [0,0.95]`; `0 ≤ fill_percent ≤ 100`; all outputs finite & non-negative for any input incl. NaN/negative tier (functions already clamp — assert it).

---

## PART 4 — FANTASY-BY-DESIGN vs MISCALIBRATED (explicit flags)

The user asked to flag every place the model departs from reality **by design** vs by **error**. This is the definitive list.

### Miscalibrated (FIX — wrong, even by the engine's own logic or in the realistic range)
- **`bust_cm` bust−band ~2× too big** (4.08·proj vs real ~2·proj). Internal contradiction. — P1
- **Cup letter disconnected from measurements** (labels an F-by-volume body "D"; AA above A; UK doubles mis-spaced as half-cups; BB/CC/EE invented; Z-prefix overloaded). — P2
- **Milk capacity coupled to breast size** (real storage is size-independent). Wrong coupling; feeds geometry when lactating. — P3
- **No fill emptying path** — fill pins at 100% forever, flat-lining the 0–100 system. — P3
- **Bounce `cap`/`tier_scale` are dead code** — never bind at any tier/shape. — P4
- **`compute_sensitivity` size term inert** until ~tier 200 — ~5–10× too weak. — P4
- **`projectionRef`/`hangRef` prose ladders saturate** mid-fantasy (one phrase frozen across ~30 cup-letters). — P4
- **`fluid_type` wired to nothing** (display-only label). — P4
- **Posture over-pathologizes the realistic range** (flags "tilt" at E/DD; clinical data says posture is unchanged through macromastia); **`posture_ratio` discards the moment arm** it computes. — P5
- **Extreme-tier prose claims literal scale the volume never reaches** ("room/building-scale" at bathtub/freezer volumes). — P4 decision (could be reframed as hyperbole-by-design instead — see §3.2).

### Fantasy-by-design (KEEP — intentional departures; do NOT "fix" against real data)
- **Weight quadratic blow-up above the human ceiling** (grounded in real gigantomastia data to ~tier 24, then intentional). The realistic/fantasy *weight* boundary is ~mid-gigantomastia (tier ~24), well above the cup-label boundary (~tier 20/K).
- **Capacity growing to gallons at fantasy tiers** — genre-appropriate *if* decoupled from claiming it's physiology (the magnitude is fine; only the size-coupling mechanism is the defect).
- **Milk as a chosen high fraction of volume at huge scale** — fine *if* it's a deliberate constant, not the current silent 26%→60% drift.
- **Projection/hang past elbows, knees, "her own height"** — cube-root geometry at out-of-human volumes; physically coherent.
- **`hang > projection` above tier ~133** — correct pendulous behavior for natural breasts at environmental scale ("flowing downward like flesh made liquid").
- **The Z/ZZ-and-beyond letter *magnitudes*** (the *sizes* are fine; only the *naming scheme* is the defect — rename to environmental-scale tiers, don't shrink the bodies).
- **The 51-band comparative prose ladder's coarsening at the top** (every-half-cup → every-2 → big jumps) — documented design; prose and letter are both keyed to tier_index and can't desync.
- **`frame_modifier (H/165)^1.5`** — an aesthetic "taller frame carries more" lever, not a fitted height↔bust law (real data: height is a weak predictor). Sane behavior; doc-caveat it so nobody later "validates" it against anthropometric tables.
- **Bounce growing with size** — empirically correct (displacement rises with mass); not a defect.

---

## PART 5 — RESOLVED CONFLICTS, OPEN QUESTIONS

### Conflicts between the reports — resolved here

1. **Realistic/fantasy boundary: "G/tier-13" (prior audit, db-structure) vs "tier-24" (weight-volume) vs "tier-25/M" (biomechanics).**
   **Resolution: the boundary is dimension-specific, and both are right for their axis.** The *cup-label/circumference* axis owes real-data fidelity through ~K (tier ~20) — that's where bra charts run out and where P1/P2 must match. The *weight* axis stays inside *documented human (gigantomastia)* data much further — mean gigantomastia ~tier 23, the 9.3% extreme ~tier 25, the 7.5 kg extreme ~tier 47. So "fantasy-by-design" starts ~tier 20 for *labeling* but ~tier 24 for *weight/load*. The dimension table (Part 4) states each explicitly. This *strengthens* the engine: its mid-tiers are grounded in real pathology, not invention. No contradiction — the earlier "G" framing simply used the label axis; the later reports pulled clinical weight data the prior audit hadn't.

2. **The cup-sizing report's "hand the fantasy letter off to the prose scale metaphors" vs weight-volume/geometry's "the prose is ~100× too big at the top."**
   **Resolution: both hold, at different layers.** The *letter naming* should hand off to named environmental tiers mapped to the prose breakpoints (P2) — that's about *nomenclature legibility* and is correct. Separately, the *prose's literal scale claims* outrun the *volume* (P4) — that's about *magnitude*, and the recommended fix is to recalibrate the prose magnitude DOWN (§3.2 Option A). After P4-Option-A, the prose breakpoints the letter hands off to will themselves be honest, so the two fixes compose cleanly: rename the top of the ladder *and* right-size the prose it points at.

3. **"Anchor the letter to volume" (prior audit) vs "anchor to repaired bust−band" (cup-sizing).**
   **Resolution: identical post-repair.** Once `bust_cm` is fixed, bust−band *is* the cup definition and equals the volume anchor. Anchor to **repaired bust−band** (the primary real-world definition; needs no runtime cc table), using volume only as the cross-check oracle and as the anchor for the *fantasy* top where bust−band flattens.

4. **Prior audit "KEEP posture/body-pct" vs biomechanics "REBUILD posture_ratio."**
   **Resolution: no real conflict — scope.** The prior audit explicitly *punted* on posture ("not the subject of the complaint"), it didn't validate it. On examination, `breast_mass_body_pct` holds (KEEP) but `posture_ratio`'s driver doesn't (REBUILD to moment-based) and its low thresholds over-pathologize (FIX). Read the prior "keep posture" as "keep body_pct; rebuild posture_ratio." No numerical contradiction — same spine.

5. **Milk capacity: "KEEP" (weight-volume, realistic values) vs "FIX" (db-structure, lactation-fluids, coupling).**
   **Resolution: KEEP the realistic *values*, FIX the *coupling law*.** The magnitudes are in-range to ~D–F; the defect is deriving size-independent storage from a size² quadratic × frame, which also feeds geometry. Both are saying the same thing at different grain. P3.

### Open questions for the user (decisions the audit can't make alone)

1. **Fantasy top regime (§3.2):** recalibrate prose DOWN to cube-root reality (Option A, preferred, prose-only) **or** add an exponential top-regime so numbers literally reach room/building scale (Option B, breaks spine coherence)? **This is the one genuine product call.**
2. **Bounce clothed vs unclothed (§2.4):** does the displayed amplitude model clothed or unclothed motion? (Genre suggests unclothed → ~double the multiplier.)
3. **Milk size-coupling (§2.8):** fully decouple (gland trait, most realistic) **or** keep a deliberate `capacity = volume · MILK_FRACTION` link (hyper-lactation genre lean)? Either is defensible; pick one constant.
4. **Sensitivity (§2.6):** event-spike-only (document it's ~constant otherwise) **or** give size a gentle role?
5. **Cup system:** UK (recommended, has the doubled-letter ladder the engine already leans toward) or US (DD/DDD then single letters)? And is the user's likely-misremembered "28J" target just garbage-in from the inflated bust, now resolved? (Yes — it was the engine's own ~2×-inflated bust fed to a calculator.)
6. **SE Memory/ATTG/Genre string** (from MEMORY's open narration-drift issue): out of scope for the body-DB but the prose↔physics realignment (P4-A) directly helps the tracking-vs-rendering drift, so worth sequencing together.

---

## Appendix — consolidated sources

**Cup sizing / bust−band:** bra-calculator.com (size charts, weight-volume calc); calculator.net; breakoutbras.com (cross-system conversion); thelingerieadvisor.com; en.wikipedia.org/wiki/Bra_size (EU 2 cm, FR=EU+15, JP/JIS 2.5 cm AAA/AA-below-A, AU→EU labels); thirdlove.com.
**Volume / weight per cup / implants:** hauteflair.com (34-band cc/cup table); billysbras.com (sister-size/band dependence); pacificaplasticsurgery.com, drkilleen.com, laurengreenbergmd.com (cc/cup ~150–250/cup); PubMed 28445356.
**Density:** Ding et al. arXiv:2302.06979 (adipose 0.90±0.02, fibroglandular 0.96±0.02 g/cm³); human milk 1.03 g/ml (NCBI NBK235589; EKF Creamatocrit); implant silicone 0.97 / saline 1.00.
**Gigantomastia / breast mass:** PMC10402957 (gigantomastia mean 2554±421 g, range 1500–7050 g/breast); PMC3807584; PubMed 23542843; Cleveland Clinic Gigantomastia; Wikipedia Breast hypertrophy (>3% body weight; 9.3%/4.9 kg case; 17.2 kg max resection); PMC12448591 (UCLA 2025 — sister-size+BMI > cup letter; mean 511 g, range 126–1975 g).
**Lactation:** Kent et al. 2006 Pediatrics 117(3):e387 (74–382 ml/breast, mean ~180, size-independent); Daly/Cox/Hartmann 1993; Hartmann/Owens/Cox/Kent 1996; MDPI Nutrients 2018 PMC6165356 (synthesis 15–18 ml/hr); KellyMom / NBK148970 (FIL feedback); StatPearls engorgement/let-down.
**Biomechanics / posture / bounce / ptosis:** PMC3785590 (posture unchanged through macromastia, p=0.104); PMC3704920 (no kyphosis–size link; pain–size link); Hansraj Surg Technol Int 2014 (cervical moment ~+10 lb/inch); Scurr/White/Hedger J Appl Biomech 25(4) 2009 + APS Physiology 2019 (D-cup 4.2→15.2→20 cm, ~50/25/25 split); Regnault 1976 / StatPearls NBK567792 (ptosis grades); PLOS One pone.0172122 (N:IMF 7.5±1.6 cm, width>13 cm threshold).
**Real-object volumes:** BNID 109718 (human ~66–75 L); themeasureofthings.com (basketball ~7 L, bathtub ~160 L); Int J Anat Res 2018 (head ~4–5 L); head circ ~55 cm female.
**Engine computations:** all `research/body-db/_*.mjs` + `research/_engine_calc.mjs`, `_geom_check.mjs` — verbatim-extracted alpha52/Ambrosia functions run in Node. Constants and the two FIX-target functions re-confirmed against `src/ambrosia.naiscript` on this synthesis pass.
