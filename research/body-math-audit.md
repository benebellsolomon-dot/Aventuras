# Ambrosia Body-Math Audit — Cup Labels vs Measurement Physics

**Date:** 2026-06-07
**Subject:** `src/ambrosia.naiscript` body engine (lines ~233–982), a verbatim port of `reference/BE   Breast Expansion v2 0 0-alpha52.naiscript`.
**Question:** The tier→cup-letter labels don't match the computed measurements under real bra-fitting math. Is the calculation system fundamentally wrong (recreate), or merely mislabeled (relabel)?

---

## TL;DR — Verdict: **(B) RECREATION WARRANTED, but localized**

The body is **not** uniformly "N cup sizes bigger than its label," so a single relabel cannot make it honest (that kills option A by its own definition). The mass→volume→projection chain is internally coherent and physically plausible in the A–G range, but **one component — the `bust_cm` circumference formula — is structurally broken**: it adds ~1.5–1.8× too much circumference, even relative to the engine's *own* computed volume and projection. The fix is two-part and targeted, not a ground-up rebuild:

1. **Repair `bust_cm`** (structural): real bust−band ≈ **2× projection** in A–G; the engine uses ≈ **4.2× projection**.
2. **Re-anchor the displayed cup letter to volume/weight** (labeling): the bodies run ~2–3 cups bigger than their label even by the (sound) mass axis.

**Do NOT do what option (A) literally prescribes** — "derive the cup letter from bust−band." That anchors the label to the *one broken axis* and yields "J" at tier 6, which is *more* wrong than "D." The user's bra-calculator result (96 cm bust → 28J) is garbage-in: it was fed the engine's already-inflated bust.

**The four numbers that decide it (tier 6, the "D-cup" case, curvy/natural frame):**

| Axis | Engine value | What it implies in reality | Verdict |
|---|---|---|---|
| Weight/side | **0.582 kg** (1.16 kg total) | DD–E @ 34 band → ≥F on engine's 27" band | ~2–3 cups over "D" |
| Tissue volume/side | **613 ml** | F @ 34 band → higher on 27" band | agrees with weight |
| Projection | **6.0 cm** | a real DD/E breast depth | agrees |
| **Bust − band** | **25.1 cm** (9.9″) | **~J cup** | **lone outlier, ~6 cups over** |

The circumference describes an object roughly **twice the mass** the weight model assigns to the same tier. That mutual contradiction — internal, needing no external data — is the backbone of the verdict.

---

## 1. Formula extraction & port-fidelity check

### 1.1 Port fidelity — CONFIRMED FAITHFUL (not a transcription bug)

All constants and the core measurement functions are byte-identical between alpha52 and Ambrosia. Diffs run:

- Constants (`BASELINE_WAIST_CM`, `BASE_WEIGHT_*`, `BASE_CAPACITY_*`, `TISSUE_DENSITY_KG_PER_CM3`, `SHAPE_CIRC_FACTOR`, `BUILD_BAND_OFFSET`, `FRAME_MODIFIER_*`, `DEFAULT_FLUID_DENSITY`): **identical** (alpha52 lines 627–755 ↔ Ambrosia 254–382).
- `bust_cm`: identical except one blank line (alpha52:1618–1631 ↔ Ambrosia:581–593).
- `bust_projection_cm`: **byte-identical** (alpha52:1760–1782 ↔ Ambrosia:715–738).
- `base_weight_per_side_kg`, `weight_per_side_kg`, `base_capacity_per_side_ml`, `capacity_per_side_ml`, `weight_per_side_full_kg`: identical (alpha52:1632–1655).

**Whatever is wrong here was wrong in alpha52.** The bug is in the original measurement spec, not the port. (Computations below were produced by running the verbatim-extracted functions in Node — see `research/_engine_calc.mjs` and `research/_geom_check.mjs` — not by hand re-derivation.)

### 1.2 The formulas (with constant values inlined)

Let `t` = tier_index, `H` = height_cm, `W` = waist_cm, `build`, `shape`.

**Frame modifier** (all weights/capacities/volumes scale by this):
```
frame_modifier(H) = (H / 165)^1.5            // = 1.0 at the baseline H=165
```

**Weight per side (tissue only), kg** — quadratic in tier:
```
base_weight_per_side_kg(t) = 0.18 + 0.055·t + 0.002·t²
weight_per_side_kg(t,H)    = base_weight_per_side_kg(t) · frame_modifier(H)
```
Author's calibration comment (Ambrosia:258–259): tuned so "D-cup ~1.2 kg total, G-cup ~2.3 kg, K-cup ~4.2 kg." This is a deliberate fit to real breast-weight data.

**Lactation capacity per side, ml** — quadratic:
```
base_capacity_per_side_ml(t) = 50 + 25·t + 1.5·t²
capacity_per_side_ml(t,H)    = base_capacity_per_side_ml(t) · frame_modifier(H)
```

**Projection (cm forward from chest wall)** — weight → volume → sphere radius → shape/flatten:
```
tissue_vol = weight_per_side_kg(t,H) / 0.00095        // ml; density 0.95 g/cc
base_r     = ( 3·tissue_vol / (2π) )^(1/3)            // radius of a HEMISPHERE of that volume
shape_factor(natural)  = 1 + 0.3·ln(1 + t/10)
flattenFactor          = min(1, 0.7 + 0.015·t)        // 0.7 at t0 → 1.0 at t20
projection = round( base_r · flattenFactor · shape_factor , 0.1 )
```

**Bust circumference, cm** — band + a circumference contribution from projection:
```
band       = W + BUILD_BAND_OFFSET[build]             // curvy: +8 → band = 69 at W=61
coverage   = min(0.95, 0.5 + 0.002·t)                 // ≈0.5 at low tiers
circFactor = SHAPE_CIRC_FACTOR[shape]                 // natural 1.30, firm 1.0, gravity_defying 0.80
bust_cm    = band + 2π · projection · coverage · circFactor
```
The added circumference (= bust − band) at natural/low tier is `2π·proj·0.5·1.30 ≈ 4.08·proj`. **This is the broken term** (see §4).

**Posture / body-pct** use `estimated_body_weight_kg(H,build) = max(20, 0.4·H − 8 + BUILD_WEIGHT_MODS[build])` and bound the breast/(body+breast) ratio. These consume weight and are coherent with it; they are not the subject of the complaint and are not faulted here.

---

## 2. Engine output across tiers — baseline frame

**Frame:** waist 61, height 165, build **curvy** (band offset +8 → **band = 69 cm = 27.2″**), shape **natural**, no lactation. (Numbers are the verbatim functions run in Node.)

| tier | label | bust cm | band | bust−band | proj cm | wt/side kg | wt total kg | vol/side ml | implied cup from bust−band |
|---:|:--|--:|--:|--:|--:|--:|--:|--:|:--|
| 0 | A | 81.66 | 69 | 12.7 | 3.1 | 0.180 | 0.36 | 189 | DD (~5″) |
| 2 | B | 85.88 | 69 | 16.9 | 4.1 | 0.298 | 0.60 | 314 | G (~7″) |
| 4 | C | 89.75 | 69 | 20.7 | 5.0 | 0.432 | 0.86 | 455 | H (~8″) |
| 6 | **D** | 94.09 | 69 | **25.1** | 6.0 | 0.582 | 1.16 | 613 | **J (~10″)** |
| 8 | E | 98.50 | 69 | 29.5 | 7.0 | 0.748 | 1.50 | 787 | L (~12″) |
| 13 | GG | 109.82 | 69 | 40.8 | 9.5 | 1.233 | 2.47 | 1298 | P (~16″) |
| 20 | K | 128.55 | 69 | 59.5 | 13.5 | 2.080 | 4.16 | 2189 | >T (~23″) |
| 27 | NN | 142.31 | 69 | 73.3 | 16.2 | 3.123 | 6.25 | 3287 | >T (~29″) |
| 40 | U | 168.01 | 69 | 99.0 | 20.9 | 5.580 | 11.16 | 5874 | >T (~39″) |
| 50 | Z | 188.58 | 69 | 119.6 | 24.4 | 7.930 | 15.86 | 8347 | >T (~47″) |

The "implied cup from bust−band" column uses the US convention of ~2.54 cm (1″) per cup step (A=1″, B=2″, …, D=4″, DD=5″, then +1 letter per inch). Even tier **0** ("A") shows a 12.7 cm (5″) bust−band — already a "DD" by circumference.

---

## 3. Real-world references (cited)

### 3.1 Cup = bust − underbust; ~2.54 cm (1″) per US cup step
Each inch of (bust − band) ≈ one cup letter: 1″=A, 2″=B, 3″=C, 4″=D, 5″=DD, 6″=E/DDD, 7″=F/G, 8″=H, 9″=I, 10″=J. US & UK share band; cup naming diverges after D (US: DD, DDD; UK: DD, E, F…). [bra-calculator.com size charts; HauteFlair AA–HH chart; ThirdLove]

Built **real cup ↔ (bust−band) table** (US):

| bust−band (cm) | 2.5 | 5.1 | 7.6 | 10.2 | 12.7 | 15.2 | 17.8 | 20.3 | 22.9 | 25.4 |
|---|---|---|---|---|---|---|---|---|---|---|
| cup | A | B | C | D | DD/E | E/F | F/G | H | I | **J** |

### 3.2 Breast WEIGHT per cup (grams per breast)
Mid-range band (34–36) reference table [bra-calculator.com breast-weight-volume-calculator]:

| Cup | per breast (g) | both (lb) |
|---|---|---|
| D | 400–550 | 1.8–2.4 |
| DD/E | 550–680 | 2.4–3.0 |
| F (DDD) | 680–820 | 3.0–3.6 |
| G | 820–1000 | 3.6–4.4 |

Other published estimates: A≈236 g, B≈272 g, C≈453 g, D≈680 g per breast [Ithy summary; OliviaPaisley]; "~200–400 g per cup step." A peer-reviewed study (Aesthetic Surgery Journal, Oct 2025, UCLA) finds **sister-bra-size group + BMI predict breast weight better than cup letter** — i.e., the same letter spans a wide weight range. [PMC12448591]

### 3.3 Breast VOLUME per cup (cc/ml) — band-anchored
HauteFlair explicit table, **"approximate volume per cup at a 34 band, 1 mL = 1 cc"**:

| AA | A | B | C | D | DD | E |
|---|---|---|---|---|---|---|
| ~180 | ~230 | ~290 | ~340 | ~400 | ~460 | ~510 |

Increment ≈ **+175 cc/cup at a 34 band, +160 cc/cup at a 32 band** [implant-sizing sources, RealSelf]. Extrapolating HauteFlair's slope: F≈580, G≈650 ml. Independent rule: "~150–200 cc ≈ one cup size" [Lauren Greenberg MD; multiple implant guides].

**Sister-size direction (critical):** 34C = 32D = 30DD — **same volume, smaller band ⇒ bigger letter.** "What is one cup in a 40″ band is nearly three cups in a 30″ band." So a fixed *absolute* volume maps to a *higher* letter on a smaller band.

### 3.4 Projection / dimensions per cup
A real spherical-cap breast model: a D-cup projects on the order of 5–7 cm of forward depth on a normal band. Real bust−band (a circumference delta) runs ≈ **2× the forward projection** across the A–G range (see §4 derivation) — not 4×.

### 3.5 Underbust(band) vs waist for a petite frame
Band ≈ underbust circumference. For a petite woman, underbust typically runs only modestly above natural waist — a few cm. The engine's `curvy +8` (band = waist+8 = 69 cm = 27.2″) is on the *high* side but within plausibility; `petite +3` / `slim +4` are realistic. **The band model is fine** and is *not* the source of the error. (Note: 27″ is a very small band — most cup→cc tables are 34-anchored, so the engine's bodies read as even larger letters on their own narrow frame.)

---

## 4. Per-dimension gap quantification

### 4.1 WEIGHT axis — ~2–3 cups heavy, but coherent (KEEP)
Engine tier 6 "D": **582 g/side**. Real D @ 34 band = 400–550 g; DD/E = 550–680 g. So 582 g ≈ a real **DD/E on a 34 band**. The engine's band is 27″ → by sister-sizing the same mass reads ≥**F**. → **the "D" body weighs like a DD–F, ~2–3 cups over its label.** The quadratic is monotonic and the author calibrated it deliberately; being ~1–2 cups heavy is an acceptable fantasy lean, not a defect. **Keep it.**

| tier | label | wt/side g | real cup by weight (34 band) | label gap |
|---:|:--|--:|:--|:--|
| 0 | A | 180 | <A (≈AA) | ~0 |
| 4 | C | 432 | D | +1 |
| 6 | D | 582 | DD/E | +1.5 |
| 8 | E | 748 | F | +2 |
| 13 | GG | 1233 | beyond table (~K) | fantasy zone |

### 4.2 VOLUME axis — agrees with weight (locked by construction; KEEP)
`tissue_vol = weight / 0.00095` ⇒ density **0.95 g/cc**, physically correct for fat-dominant breast tissue (real ≈ 0.916–0.95). Volume cannot disagree with weight — they're the same number rescaled. Tier 6 = **613 ml/side** → ~**F @ 34 band** (HauteFlair F≈580), higher on the 27″ band. Confirms §4.1: the body is an F+ wearing a "D" sticker.

| tier | label | vol/side ml | ~cup @ 34 band (absolute) |
|---:|:--|--:|:--|
| 0 | A | 189 | AA |
| 2 | B | 314 | C |
| 4 | C | 455 | DD |
| 6 | D | 613 | **F** |
| 8 | E | 787 | G |

**Note the offset is NOT constant** (0 cups at A, +1 at B/C, +2 at D, +2–3 at E). This already breaks option (A)'s premise that the body is "consistently N cups bigger."

### 4.3 BUST−BAND axis — the broken one (~6 cups over; FIX)
Tier 6: bust−band = **25.1 cm = 9.9″ → real J cup.** Versus the label "D" (10.2 cm) that's **mislabeled by ~6 cup sizes**. And the gap is **non-uniform**: tier 0 already shows 12.7 cm ("DD"), tier 6 25 cm ("J"), tier 20 59 cm. The bust−band axis disagrees with the weight/volume axis by **~3–4 cups at tier 6** and widening.

**The decisive internal contradiction (no external data needed):** the engine's *own* projection at tier 6 is 6.0 cm (the radius of its own computed 613 ml volume ≈ 5.3 cm). A breast that protrudes ~6 cm and holds ~613 ml cannot add 25 cm to a torso circumference. Modeling each breast as a spherical cap of the engine's own volume/projection, the added bust−band should be **≈ 14 cm**, not 25:

| tier | proj cm | vol ml | engine bust−band | bust−band its own volume implies | engine overshoot |
|---:|--:|--:|--:|--:|--:|
| 2 | 4.1 | 314 | 16.9 | 6.7 | **2.5×** |
| 6 | 6.0 | 613 | 25.1 | 14.2 | **1.8×** |
| 13 | 9.5 | 1298 | 40.8 | 27.1 | **1.5×** |
| 20 | 13.5 | 2189 | 59.5 | 42.2 | **1.4×** |

**Root cause:** `bust − band = 2π·proj·coverage·circFactor`. At natural/low tier that's `2π·proj·0.5·1.30 ≈ 4.08·proj`. But real bust−band ≈ **2·proj** (A–G). The `2π·proj` term effectively wraps the *entire circumference of a free-floating circle of radius = projection* around the chest, roughly double the geometric contribution of a cap sitting on the chest wall, and then `circFactor 1.30` inflates it another 30%. Net: **~2× too large at the realistic end, tapering to ~1.4× by tier 20.** Because the error ratio is tier-dependent, no constant rescale repairs it — the term must be re-derived.

---

## 5. Internal consistency assessment

**Two distinct objects live in this engine:**

**(a) The mass→volume→projection chain — COHERENT.** `volume = weight / 0.00095` exactly; `projection = ` (hemisphere radius of that volume) × shape/flatten. These three *cannot* contradict each other; they're one derivation. The density (0.95 g/cc) is physically right, the weight quadratic is monotonic and author-calibrated, and the resulting object (tier 6: 582 g, 613 ml, 6 cm projection) is a plausible real breast — specifically a real **DD–F**, not the labeled "D," but a *consistent physical object*. ✔

**(b) `bust_cm` — INCOHERENT with (a).** It claims a 25 cm bust−band for the very same breast that (a) says is 613 ml / 6 cm deep. Read as a real garment measurement, that bust−band describes a **~J cup ≈ 1.2–1.8 kg/side** breast — but the engine simultaneously assigns **0.58 kg/side**. **The circumference axis describes an object ~2–3× more massive than the mass axis does.** That is a genuine internal contradiction, not merely a wrong label.

**Conclusion:** the body is *not* "internally coherent but mislabeled" (which would be option A). It is coherent in its mass/volume/projection core and **self-contradictory at the circumference**. That is option **B** — but the incoherence is isolated to one formula.

---

## 6. Verdict & recommendation

### Verdict: **(B) — recreation warranted, localized to `bust_cm` + the label anchor.**

Option (A) fails on two counts:
1. There is no single offset N: by the (sound) volume axis the bodies run +0 cups at A, +2 at D, +2–3 at E — non-constant. "Consistently N bigger" is false.
2. Option (A)'s prescribed fix ("derive the cup letter from bust−band") anchors the label to the **single broken axis**, producing "J" at tier 6 — *further* from reality than the current "D." It would also de-calibrate the author's real-data weight fit.

But full recreation is *not* warranted: the mass/volume/projection chain is sound in the plausible range. The defect is one term.

### Recommendation (two-part, minimal):

**(i) Repair `bust_cm` [structural].** Replace `2π·proj·coverage·circFactor` with a circumference contribution that matches real bust−band ≈ **2× projection** in A–G. Because the current error ratio is tier-dependent (2.5×→1.4×), prefer a *re-derivation* over a constant rescale, so the curve matches reality across A–G and only diverges into fantasy above ~G by design.

**(ii) Re-anchor the displayed cup letter to volume/weight [labeling].** Even with `bust_cm` fixed, the tier→letter ladder still labels an F-by-volume body as "D." If the user wants the on-screen letter to read true, derive it from the engine's **volume** (via a cup↔cc table), *not* from bust−band. Repairing `bust_cm` alone is necessary but not sufficient for the user's complaint.

> Keep unchanged: the weight quadratic (author-calibrated, monotonic), density 0.95 g/cc, the projection geometry, the band model (waist + offset), posture/body-pct. None of these is the problem.

### 6.1 Sketch of a corrected `bust_cm`

Anchor circumference to the geometry/volume the engine already computes.

**Option A — geometry-first (recommended, no new tables):**
```
// Each breast modeled as a spherical cap on the chest wall.
// Added bust-band ≈ 2 × projection in the A–G range; let circFactor/coverage
// modulate around that, NOT around 2π.
bust_cm = band + 2 · projection · circ_shape[shape] · coverage_ramp(t)
//   circ_shape: natural ~1.15, firm 1.0, gravity_defying ~0.85   (small spread)
//   coverage_ramp(t): 1.0 in A–G, slowly rising >1 only in deep fantasy tiers
```
This yields tier 6 ≈ band + 2·6.0·~1.15 ≈ **69 + 13.8 ≈ 13.8 cm bust−band → a real DD/E**, matching the weight/volume axes and bringing the bust−band cup into line with the mass cup.

**Option B — volume-table-first (if exact cup labels matter most):**
```
cupIndex   = lookup(tissue_vol_per_side, cc_table_at_band(band))   // real cc→cup
bust_minus_band = 2.54 · cupIndex                                   // 1 inch/cup
bust_cm    = band + bust_minus_band
```
Drives bust−band directly from real volume→cup math, guaranteeing bust−band, volume, and the displayed letter all agree.

**Anchor points to calibrate against (real data, A–G; band ≈ engine's frame):**

| target cup | bust−band | per-breast volume | per-breast weight |
|---|---|---|---|
| A | ~2.5 cm | ~180–230 ml | ~200 g |
| C | ~7.6 cm | ~340 ml | ~450 g |
| D | ~10.2 cm | ~400 ml | ~500–680 g |
| F | ~17.8 cm | ~580 ml | ~700–820 g |
| G | ~20 cm | ~650 ml | ~820–1000 g |

Above ~G (tier ≈ 13+) the model is **fantasy by design** — let projection, circumference, and weight diverge from reality there; only the A–G window needs to match.

### 6.2 Where the model is fantasy-by-design vs miscalibrated
- **Miscalibrated (fixable, A–G):** `bust_cm` bust−band (~2× too big), and the tier→letter label running ~2 cups ahead of volume.
- **Fantasy-by-design (leave alone):** everything from tier ~13 (G+) upward — quadratic weight blow-up, projection past elbows/knees, Z/ZZ ladder, the 51-band comparative prose. These are intentional and correctly should not match anthropometric data.

---

## Appendix — sources

- Cup = bust−band, ~1″/cup, US/UK divergence: bra-calculator.com/size-charts/ ; hauteflair.com/blogs/lingerie/bra-sizes ; thirdlove.com/pages/bra-size-chart
- Breast weight per cup: bra-calculator.com/breast-weight-volume-calculator/ ; ithy.com/article/breast-weight-analysis-e4s1nkf3 ; oliviapaisley.com cup-size-weight-chart ; **Aesthetic Surgery Journal 2025 (UCLA), PMC12448591** (sister-size+BMI > cup letter for weight)
- Breast volume per cup (cc): hauteflair.com/blogs/lingerie/breast-size-chart-explained (34-band table) ; laurengreenbergmd.com/breast/what-is-the-volume-in-cc-of-a-cup-size/ ; implant cc/cup increments + sister-size band effect (RealSelf; implant-sizing guides)
- Engine computations: `research/_engine_calc.mjs`, `research/_geom_check.mjs` (verbatim-extracted alpha52/Ambrosia functions run in Node 25).
