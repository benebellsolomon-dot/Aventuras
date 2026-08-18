# Extreme-Bust Realism — Grounding the High-Tier Curve in Real Anatomy

**Date:** 2026-06-07
**Scope:** The EXTREME end of Ambrosia's bust ladder (roughly tier ~13 / G-cup upward through the documented human maximum and into the fantasy regime). Companion to `body-math-audit.md` (which covered A–G) and `ladder-reanchor-proposal.md` (prose).
**Mandate:** "Fantasy in scale, real in physics." Cup-letter sizes should map to *documented gigantomastia*; only genuinely-beyond-human sizes get fantasy scale, and even then weight/projection must extrapolate from real physics (weight = volume × tissue density; projection/hang via geometry + ptosis), not balloon.
**Method note:** "measured" = a figure recorded by Guinness or a clinical study; "self-reported/tabloid" = media figure, unverified; "estimate" = derived here from geometry/density (axes or assumptions chosen by the author and labeled as such). Every real figure carries a source URL in the Sources section.

---

## TL;DR — the verdict, and a correction to the brief's hypothesis

The brief hypothesized that the model is **too heavy at the top** ("18 kg/breast at the human-max bust likely exceeds real estimates"). **That specific hypothesis is REFUTED by the triangulation below.** At the human-max bust circumference, the engine's ~18 kg/side is *mid-range* of the real estimate band, not above it. The top-end **weight is approximately right**. Three things are actually wrong:

1. **Forward projection is unphysical** — this is the real defect. The engine emits 35–68 cm of *forward* projection at high tiers, but the equivalent-sphere radius of that same volume is only 17–28 cm. A breast cannot project forward past roughly its own radius; beyond that, the tissue **ptoses (hangs down)**. The engine has no ptosis model, so it sends all growth straight out the front. This is what reads as "cosmic."
2. **`bust_cm` circumference is unmoored** — the 368 cm "bust" at tier 200 is an artifact of the `2π·proj` term (already condemned in `body-math-audit.md` §4.3) *compounded* by the runaway projection it consumes. Fix the projection and re-derive circumference from geometry and it collapses to a sane number.
3. **The quadratic weight law keeps climbing *above* the human max** — fine *as fantasy* (those tiers are beyond-human by design), but it should be relabeled honestly: the engine reaches documented-human-max volume at ~tier 82, not at "ZZ+/tier 200." So the cup letters and the prose milestones are mis-anchored, not the mass law itself.

**The single concept this doc sells:** a "Z-equivalent" gigantic breast (real gigantomastia, ~15–20 L/side) should weigh ~15–20 kg/side, project forward ~20–28 cm, and **hang ~55–65 cm** — gigantic and heavy, but with the bulk expressed as *hang*, not as cosmic forward reach. Keep the weight law; replace projection with a volume-conserving ptosis partition; re-derive circumference from that.

---

## 1. Real extreme cases — measured dimensions + weights

### 1.1 The documented human maximum: Annie Hawkins-Turner ("Norma Stitz")

Guinness World Records lists her for "largest natural breasts." **The official Guinness figures are the only measured ones; everything about weight is self-reported and wildly inconsistent.**

| Quantity | Value | Status |
|---|---|---|
| Underbust (band) | **109.22 cm (43 in)** | **measured** (Guinness) |
| Bust, around chest over nipple | **177.8 cm (70 in)** | **measured** (Guinness) |
| ⇒ bust − band | **68.58 cm (27 in)** | derived from the two measured figures |
| Bra designation (Guinness) | wears a **US 52I** (largest manufactured); by US estimation **48V** (not manufactured) | measured/estimated (Guinness) |
| Bra designation (tabloid) | **102ZZZ**, later **107ZZZ / 36D→107ZZZ progression** | self-reported/tabloid |
| Per-breast weight | "more than a four-year-old child" (≈ 16–18 kg) | self-reported, qualitative |
| Weight figures in media | **28 lb each** (1999 GWR era) · **35 lb each** later · **44.9 lb each** · **56 lb each** · totals quoted **85 / 89.6 / 126 lb** | self-reported/tabloid, mutually inconsistent |

Diagnosis: **she was diagnosed with gigantomastia** (slow, progressive, ongoing growth). Sources: [Guinness via vercalendario](https://www.vercalendario.info/en/what/guinness-records-for-largest_natural_breasts.html); [Wikipedia: Norma Stitz](https://en.wikipedia.org/wiki/Norma_Stitz); [WUSA9](https://www.wusa9.com/article/news/local/virginia/photos-annie-hawkins-turner-holds-worlds-largest-natural-breasts-record/65-368712762); [HuffPost UK](https://www.huffingtonpost.co.uk/2012/07/13/norma-stitz-annie-hawkins-turner-102zzz-breasts-_n_1670486.html).

**Reliability:** band and over-nipple bust are the *only* reliable numbers. The "ZZZ" letters are tabloid — note that Guinness itself estimates **48V**, three different letter systems for one body (52I worn / 48V estimated / 102ZZZ claimed). This inconsistency is itself evidence: **at the extreme, the cup *letter* is unreliable; volume is the only stable invariant.** The weight figures are uncheckable because **an attached breast cannot be weighed** — so we triangulate it (§1.3) rather than trust any single tabloid number.

### 1.2 Gigantomastia / macromastia resection weights (clinical, MEASURED)

These are **excision** weights from reduction mammoplasty — tissue *removed*, a firm lower bound on whole-breast mass, and the only large-breast weights measured on a scale.

| Category | Per-breast resection | Source |
|---|---|---|
| Insurance "medically necessary" floor | ~500–600 g/side, or Schnur sliding scale (BSA-indexed; e.g. BSA 2.0 ⇒ ≥628 g/side) | [Schnur scale (Kris Day)](https://krisdayplasticsurgery.com/what-is-the-schnur-scale-and-what-does-it-have-to-do-with-my-bmi-bsa-and-my-ability-to-get-a-breast-reduction-covered-by-my-insurance/); [Brenner MD](https://www.kevinbrennermd.com/procedures/breast/breast-reduction-beverly-hills/schnur-scale/) |
| Gigantomastia threshold (common def.) | **>1500 g/side** removed; many use 1000–2000 g/side | [Gigantomastia classification (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S174868150700558X); [Cleveland Clinic](https://my.clevelandclinic.org/health/diseases/23191-gigantomastia) |
| Severe case series, mean | mean **2554 g/side**, range **1500–7050 g/side** | [reduction mammoplasty literature](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3807584/) |
| Severe series (15 pts), total | **2.2–10 kg total**, mean 4.71 ± 2.23 kg | [PubMed 40033539 / Nigerian J Clin Pract](https://pubmed.ncbi.nlm.nih.gov/40033539/) |
| Heaviest single-breast resection cited | **~7550 g/side** | [reduction mammoplasty literature](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3807584/) |

**Definitions** (no universal standard): *macromastia* = symptomatic large breasts, excess < ~2.5 kg; *gigantomastia* = the severe variant, excess > ~2.5 kg, or breast tissue **≥ 3% of total body weight**. [Healthline](https://www.healthline.com/health/gigantomastia); [LIN Europe](https://lineuropeclinic.com/breast-hypertrophy-what-is-gigantomastia/).

Caveat: resection weight is **excess removed, not whole-breast** — the surgeon leaves a residual mound — and reduction patients are *not* the largest-breasted people (Annie never had surgery). So clinical resection weights *underestimate* the human extreme.

### 1.3 Triangulating the human-max per-breast weight/volume

Because the attached breast can't be weighed, anchor on **volume × density** and cross-check against the spread of figures. Density used: **0.95–1.0 g/ml** (§3.2). Annie's geometry → volume by two routes:

| Route | Method | Per-breast volume | Per-breast weight @0.95–1.0 | Status |
|---|---|---|---|---|
| **A. Weight back-solve** | take each tabloid weight ÷ density | 28 lb/side → ~13 L · 35 lb → ~17 L · 44.9 lb → ~21 L · 56 lb → ~27 L | (the weights themselves) | self-report range |
| **B. Geometry (ellipsoid envelope)** | half-ellipsoid, axes ~ base 35 cm × hang ~55–60 cm × forward depth ~28–30 cm (eyeballed from photos) | **~19–27 L** | **~18–27 kg** | **estimate (author-chosen axes)** |

Both routes converge on **~13–27 L/side, ~13–27 kg/side** for the documented human maximum, centering near **~19 L / ~18–19 kg per side**. This is the number that decides the verdict.

---

## 2. Cup-size conventions at the extreme

- **Cup = (bust − band), ~2.54 cm (1 in) per US cup step.** 1″=A … 4″=D, 5″=DD/E, then +1 letter per inch (UK: DD, E, F, FF, G, GG, H… doubling; US: DD, DDD/F, G, H…). The letter "I" is commonly skipped in some systems; UK doubles (FF, GG, HH) where US increments. [bra-calculator](https://www.bra-calculator.com/breast-weight-volume-calculator/); [HauteFlair](https://www.hauteflair.com/blogs/lingerie/breast-size-chart-explained).
- **Beyond Z** there is **no standard** — "ZZ," "ZZZ," "beyond-Z" are vendor- or tabloid-invented. Guinness sidesteps it entirely, quoting Annie as a **52I worn / 48V estimated** rather than "ZZZ."
- **At Annie's 68.6 cm bust−band ≈ 27 in difference**, the naive 1-in-per-cup rule lands ~26 letters past A — i.e. deep into "beyond-Z" territory by circumference. But **the band confounds this**: a fixed breast volume reads as a *bigger letter on a smaller band* (sister-sizing: 34C = 32D = 30DD). So letter is doubly unstable.

**Engine implication:** stop driving the displayed letter from circumference (which `body-math-audit.md` already showed is the broken axis). Drive it loosely from **volume** via a cc→cup table, and accept that beyond ~real-gigantomastia the letter is a fantasy overlay, not a measurement.

---

## 3. Biophysical scaling — the calculations

### 3.1 Volume ↔ cup ↔ band

- **~150–250 cc per cup step** (commonly ~175 cc at a 34 band, ~160 cc at a 32 band); band adds ~25 cc/band. [Lauren Greenberg MD](https://laurengreenbergmd.com/breast/what-is-the-volume-in-cc-of-a-cup-size/); implant-sizing consensus.
- HauteFlair 34-band table (≈ cc/side): AA 180, A 230, B 290, C 340, D 400, DD 460, E 510; slope ⇒ F≈580, G≈650. [HauteFlair](https://www.hauteflair.com/blogs/lingerie/breast-size-chart-explained).
- Volume regression exists (Sigurdson & Kirkland, *Plast Reconstr Surg* 2006; R²≈0.89 vs water displacement) — confirms volume is predictable from anthropometry, the right invariant. [reduction-mammaplasty cup-prediction (PMC6635214)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6635214/).

### 3.2 Tissue density (g/ml) — for weight = volume × density

| Tissue | Density | Source |
|---|---|---|
| Adipose (fat) | **0.90 ± 0.02 g/cm³** | mastectomy-specimen measurement, [Quantification of glands and fat](https://www.sciencedirect.com/science/article/abs/pii/S0940960202800164) |
| Fibroglandular | **0.96 ± 0.02 g/cm³** (some sources 1.04–1.06) | same / [variation-in-breast-density (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S1748681509004318) |
| **Whole breast (mean)** | **0.95 g/cm³** | mean over 40 reduction specimens, same study |

**Verdict on density:** the engine's `TISSUE_DENSITY = 0.00095 kg/cm³ = 0.95 g/ml` is **correct and well-sourced.** Note `weight = volume × 0.95` is *already true in the engine by construction* (audit §4.2) — the brief's "fantasy must obey weight = volume × density" is **already satisfied internally**. For pendulous gigantomastia tissue (more fibrous/edematous, less pure fat) **0.95–1.0 g/ml** is the defensible band; I use **0.97** for the high-tier table as a small honest lean. *Do not "add density" — it's there. The lever is the volume(tier) curve and the projection geometry.*

### 3.3 Projection geometry — the core fix (ptosis + volume conservation)

**The problem, quantified.** Engine forward projection vs the equivalent-sphere radius of its *own* volume:

| tier | vol/side | engine fwd projection | equiv-sphere radius | physical? |
|---:|---:|---:|---:|:--|
| 20 | 2.2 L | 13.5 cm | 8.1 cm | already over |
| 50 | 8.3 L | 24.4 cm | 12.6 cm | impossible |
| 82 | 19.1 L | 34.8 cm | 16.6 cm | impossible |
| 200 | 96.0 L | **68.5 cm** | 28.4 cm | grossly impossible |

Forward projection **cannot exceed ~the breast's radius**; the engine's `base_r × log-growing shape_factor` has no ceiling, so it pushes all volume forward. **Reality: past a knee, forward projection saturates and the excess becomes vertical hang (ptosis).**

**Ptosis grading (Regnault 1976)** — nipple position vs the inframammary fold (IMF): Grade I nipple at IMF; Grade II below IMF; Grade III well below, pointing down; pseudoptosis = tissue sags, nipple high. Every gigantomastia breast is Grade III+ — the nipple sits far below the fold and the breast hangs. [Regnault classification](https://www.referenceaesthetic.com/brief-guide-to-breast-ptosis-classification/); [PlasticsFella](https://www.theplasticsfella.com/breast-ptosis/).

**The model — a volume-conserving ellipsoid partition.** Model the breast as a forward-bulging half-ellipsoid:

```
V = (π/6) · base_width · hang · forward_projection         [all in cm; V in cm³]
```

Drive shape by a ptosis factor `p(V) ∈ [0,1)` that ramps up with volume, then set two aspect ratios and solve the third by conservation (guaranteeing the dims always multiply back to the true volume):

```
p(V)        = 1 − 1/(1 + (V/3000)^0.7)            // ~0.5 near 3 L, →1 at giant
proj/base   = 1.00 − 0.45·p                       // hemispherical (1.0) → flattened-forward (0.55)
hang/base   = 1.00 + 1.40·p                       // round (1.0) → pendulous (2.4)
base_width  = ( 6V / (π · (hang/base) · (proj/base)) )^(1/3)
hang        = (hang/base) · base_width
forward_projection = (proj/base) · base_width
```

This makes **forward projection saturate** (sub-cube-root) while **hang absorbs the bulk**. Output:

| tier | vol/side | fwd proj | hang | base width | (engine proj was) |
|---:|---:|---:|---:|---:|---:|
| 13 | 1.3 L | 10.5 | 19 | 13 | 9.5 |
| 20 | 2.2 L | 11.8 | 24 | 15 | 13.5 |
| 35 | 4.8 L | 14.0 | 34 | 19 | 19.1 |
| 50 | 8.3 L | 15.9 | 44 | 23 | 24.4 |
| 66 | 13.2 L | 17.7 | 54 | 26 | 29.7 |
| **82** | **19.1 L** | **19.4** | **63** | **30** | 34.8 |
| 120 | 37.5 L | 23.1 | 82 | 38 | 46.3 |
| 200 | 96.0 L | **30.2** | 118 | 52 | **68.5** |

At the human-max tier 82 this gives forward projection **~19–28 cm** (vs Annie's eyeballed ~28–30 cm; the model is conservative, hang ~63 cm matches "hangs to the navel/waist"). Even at the absurd tier 200, forward projection is **30 cm, not 68** — the bulk has gone into 118 cm of hang and 52 cm of base width, which is what *should* happen. Volume conserves exactly at every row.

> **Small-size caveat:** this ptosis partition is for the **large/fantasy regime (this doc)**. At small sizes it slightly over-projects (600 ml → 8.8 cm vs real ~6 cm) because it assumes mild baseline ptosis. **Keep the existing validated A–G projection (`body-math-audit.md`)** for tiers 0–~13; blend into this partition above the gigantomastia threshold. Suggested blend: use the existing formula below ~1.5 L/side, this partition above ~3 L/side, linear-interpolate between.

### 3.4 Bust circumference — re-derive from geometry

The engine's `bust = band + 2π·proj·coverage·circFactor` is the term `body-math-audit.md` §4.3 condemned (≈4× projection instead of ~2×), and it's fed by the runaway projection — together producing the 368 cm "bust." **Two fixes compound:** (1) use the audit's repair `bust − band ≈ 2·proj` in the realistic range; (2) feed it the *saturated* projection. With `bust − band ≈ 2.2 · forward_projection`:

| tier | fwd proj | bust−band | bust (band 69) | engine bust was |
|---:|---:|---:|---:|---:|
| 50 | 15.9 | 35 | 104 | 134.6 |
| 82 | 19.4 | 43 | 112 | 173.9 |
| 200 | 30.2 | 66 | 135 | **368.4** |

**Important semantic note:** once the breast is ptotic, "bust over nipple" loses physical meaning — the tape drapes over hanging tissue, not around a sphere. At the fantasy end, **bust_circ should be a *derived display number* from base-width + projection geometry, not a measured girth.** (Annie's *measured* 178 cm bust on a 109 cm band = 69 cm bust−band corresponds to forward depth ~28–30 cm and the `2.2×` factor here — consistent.) The re-derived 112 cm at tier 82 is on a 69 cm band; on Annie's 109 cm band it would read ~152 cm — same breast, bigger torso. **Band confounds circumference; report volume alongside it.**

---

## 4. Physical effects at size (grounded)

- **Biomechanics / posture:** breast load pulls the center of gravity forward → compensatory forward-leaning posture; chronic neck/shoulder/back pain; **increased thoracic kyphosis, increased cervical & lumbar lordosis**; degenerative spinal changes over time. [Effect of breast hypertrophy on posture (PMC3785590)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3785590/); [influence of macromastia on spine (PubMed 40272533)](https://pubmed.ncbi.nlm.nih.gov/40272533/); [spine-surgeon review (PubMed 39505016)](https://pubmed.ncbi.nlm.nih.gov/39505016/).
- **Bra-strap grooving & nerve compression:** straps cut **shoulder grooves**; chronic pressure compresses the **brachial plexus** → thoracic-outlet-like paresthesia, headaches. These appear well before gigantomastia — in symptomatic macromastia (excess as little as ~500–1000 g/side). [CNSO](https://www.cnsomd.com/blog/macromastia-back-pain-from-large-breasts/); biomechanics search §4 sources.
- **Skin / daily life at gigantomastia scale:** inframammary **intertrigo** (rash, maceration), candidal infection, **skin ulceration** under the hang; impaired mobility, exercise, and sleep; difficulty with hygiene; all documented as resolving after reduction. [Healthline](https://www.healthline.com/health/gigantomastia); [Cleveland Clinic](https://my.clevelandclinic.org/health/diseases/23191-gigantomastia).
- **Where biology caps out:** the **documented human maximum** is Annie's regime — **bust−band ≈ 69 cm, per-side volume ~13–27 L, per-side weight ~13–27 kg** (triangulated, §1.3). Above that there is *no* human record; it is purely fantastical. The engine reaches this volume at **~tier 82**. Everything past tier ~82 is beyond-human by definition.

---

## 5. The re-grounded proposal

### 5.1 Critique of the current model (each axis)

| Axis | Current model at top | Reality | Verdict |
|---|---|---|---|
| **Weight** | tier 82 = 18.1 kg/side; tier 200 = 91 kg/side | human max ~13–27 kg/side (§1.3) at ~tier 82 | **tier-82 weight is RIGHT (mid-range).** The quadratic only runs away *above* the human max — which is the fantasy zone, so it's not "wrong," just needs honest relabeling. **KEEP the weight law.** |
| **Volume** | =weight/0.95, locked | same | correct by construction; **KEEP density 0.95–1.0.** |
| **Projection** | 35–68 cm forward, unbounded | must saturate (~19–28 cm at human max); excess → hang | **BROKEN — replace with §3.3 ptosis partition.** This is the real fix. |
| **Bust circumference** | 173 cm @t82, **368 cm @t200** | ~112–135 cm (re-derived); confounded by band | **UNMOORED — re-derive from §3.4** (audit's `2·proj` repair × saturated proj). |
| **Cup letter** | tier→letter ladder runs ahead of volume; ZZ+ from tier 92 | letter unstable even in reality (Annie: 52I/48V/102ZZZ) | **Re-anchor loosely to volume; treat letter as overlay above gigantomastia.** |

**Bottom line:** the brief's "weight too high at top" intuition is **wrong**; the actual unphysical outputs are **projection and the circumference it feeds.**

### 5.2 The regime boundary (stated in VOLUME, the stable invariant)

| Regime | Per-side volume | ≈ Engine tier | Per-side weight | What it is |
|---|---|---|---|---|
| Large / very large | up to ~1.5 L | ~0–13 (A–G) | up to ~1.4 kg | normal-to-large; covered by `body-math-audit.md` |
| **Gigantomastia (REAL)** | **~1.5 – ~20 L** | **~13 – ~82** | **~1.5 – ~19 kg** | documented medical range, up to the human max. **Cup letters map here.** First engine "Z" (tier 50, ~8 L) sits *inside* this band — it is gigantic but **real**. |
| **Beyond-human (FANTASY)** | **> ~20 L** | **> ~82 (ZZ+)** | **> ~19 kg** | no human record; fantasy — **but still weight = volume × density and projection via ptosis geometry.** |

So: **the cup-letter ladder should map to real gigantomastia up through ~tier 82 (Annie's volume); fantasy ("ZZ+") begins at tier ~82, NOT tier 200.** The engine's first Z (tier 50) is *not* cosmic — it's real-gigantomastia scale, which validates the user's core insight. What's broken isn't the Z being too early; it's (a) projection ballooning and (b) the prose calling tier-50 scale "environmental/architectural."

### 5.3 The fantasy-extrapolation rule

For tiers above the human max, **do not change the weight law** (keep the quadratic — it already = volume × 0.97). For shape, **keep using the §3.3 volume-conserving ptosis partition** — it never lets forward projection run away (30 cm even at 96 L), routing growth into hang and base width. That is the "continued real physics" the brief asks for: a tier-200 breast is `96 L × 0.97 = 93 kg`, projects forward 30 cm, hangs 118 cm, spreads 52 cm wide — **scaled-up, not cosmic.**

### 5.4 Formulas to implement

```js
// --- WEIGHT (unchanged; already volume×density) ---
weight_per_side_kg(t,H) = (0.18 + 0.055·t + 0.002·t²) · (H/165)^1.5      // KEEP
tissue_vol_ml           = weight_per_side_kg / TISSUE_DENSITY            // 0.00095 kg/cm³ (=0.95 g/ml); 0.97 optional high-tier

// --- SHAPE: volume-conserving ptosis partition (large/fantasy regime) ---
p          = 1 - 1/(1 + (V/3000)^0.7)                 // V = tissue_vol_ml
r_pb       = 1.00 - 0.45·p                            // forward_projection / base_width
r_hb       = 1.00 + 1.40·p                            // hang / base_width
base_width = ( 6·V / (π · r_hb · r_pb) )^(1/3)
hang       = r_hb · base_width
forward_projection = r_pb · base_width                // SATURATES — replaces old projection
// blend: keep existing A–G projection below ~1500 ml/side, this above ~3000 ml/side, lerp between.

// --- BUST CIRCUMFERENCE (re-derived; replaces 2π·proj term) ---
bust_minus_band = 2.2 · forward_projection            // audit's ~2·proj repair; report VOLUME alongside
bust_cm         = band + bust_minus_band              // display number; loses literal meaning when ptotic
```

### 5.5 Sample re-grounded tier table (curvy/natural frame, H=165, band 69 cm, density 0.97)

| tier | cup (overlay) | vol/side | weight/side | fwd projection | hang | base width | bust−band | regime |
|---:|:--|---:|---:|---:|---:|---:|---:|:--|
| 13 | G/GG | 1.3 L | 1.3 kg | 10.5 cm | 19 cm | 13 cm | 23 cm | large→gigantomastia |
| 20 | HH/J | 2.2 L | 2.1 kg | 11.8 cm | 24 cm | 15 cm | 26 cm | gigantomastia |
| 35 | M | 4.8 L | 4.7 kg | 14.0 cm | 34 cm | 19 cm | 31 cm | gigantomastia |
| 50 | **Z** | 8.3 L | 8.1 kg | 15.9 cm | 44 cm | 23 cm | 35 cm | gigantomastia (real) |
| 66 | ZZ-ish | 13.2 L | 12.8 kg | 17.7 cm | 54 cm | 26 cm | 39 cm | severe gigantomastia |
| **82** | **ZZ+ (human max)** | **19.1 L** | **18.5 kg** | **19.4 cm** | **63 cm** | **30 cm** | **43 cm** | **= Annie's documented regime** |
| 92 | ZZ+ | 23.3 L | 22.6 kg | 20.4 cm | 68 cm | 32 cm | 45 cm | **fantasy begins** |
| 120 | ZZ+ | 37.5 L | 36.3 kg | 23.1 cm | 82 cm | 38 cm | 51 cm | fantasy |
| 165 | ZZ+ | 67.1 L | 65.1 kg | 27.2 cm | 103 cm | 46 cm | 60 cm | fantasy |
| 200 | ZZ+ | 96.0 L | 93.1 kg | 30.2 cm | 118 cm | 52 cm | 66 cm | fantasy |

**The "Z-equivalent" answer (the payoff row):** a real Z-cup gigantic breast — tier ~50–82, **8–19 L/side** — should weigh **~8–19 kg/side**, project forward **~16–20 cm**, and **hang ~44–63 cm**. Vs the current model at tier 82: weight ~right (18 kg), but projection 35 cm → **19 cm** (halved, now physical), bust 174 cm → **112 cm** (no longer cosmic), and the previously-missing **hang (63 cm)** is now the dominant dimension — exactly how real gigantomastia presents.

### 5.6 Prose-milestone implication (hand to the ladder-reanchor pass)

`ladder-reanchor-proposal.md` should re-key milestones to **hang and ptosis**, not forward reach: at tier 50+ the breast **hangs to the navel/lap** (44 cm), at tier 82 **past the lap toward the knees when seated** (63 cm hang) — it does *not* "project a meter forward." "Environmental/architectural" prose belongs only at tier ~120+ (real fantasy), and even there the bulk is *spreading/hanging* mass, not a forward battering-ram.

---

## Appendix — sources

- **Human max (measured):** [Guinness via vercalendario](https://www.vercalendario.info/en/what/guinness-records-for-largest_natural_breasts.html) · [Wikipedia: Norma Stitz](https://en.wikipedia.org/wiki/Norma_Stitz) · [WUSA9](https://www.wusa9.com/article/news/local/virginia/photos-annie-hawkins-turner-holds-worlds-largest-natural-breasts-record/65-368712762) · [HuffPost UK (weight claims)](https://www.huffingtonpost.co.uk/2012/07/13/norma-stitz-annie-hawkins-turner-102zzz-breasts-_n_1670486.html)
- **Gigantomastia definition/classification:** [classification review (ScienceDirect S174868150700558X)](https://www.sciencedirect.com/science/article/abs/pii/S174868150700558X) · [Cleveland Clinic](https://my.clevelandclinic.org/health/diseases/23191-gigantomastia) · [Healthline](https://www.healthline.com/health/gigantomastia) · [LIN Europe](https://lineuropeclinic.com/breast-hypertrophy-what-is-gigantomastia/)
- **Resection weights:** [reduction-mammoplasty techniques (PMC3807584)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3807584/) · [inferior-pedicle case series (PubMed 40033539)](https://pubmed.ncbi.nlm.nih.gov/40033539/) · Schnur scale: [Kris Day](https://krisdayplasticsurgery.com/what-is-the-schnur-scale-and-what-does-it-have-to-do-with-my-bmi-bsa-and-my-ability-to-get-a-breast-reduction-covered-by-my-insurance/), [Brenner MD](https://www.kevinbrennermd.com/procedures/breast/breast-reduction-beverly-hills/schnur-scale/)
- **Cup/volume conventions:** [bra-calculator weight/volume](https://www.bra-calculator.com/breast-weight-volume-calculator/) · [HauteFlair size chart](https://www.hauteflair.com/blogs/lingerie/breast-size-chart-explained) · [Lauren Greenberg MD cc/cup](https://laurengreenbergmd.com/breast/what-is-the-volume-in-cc-of-a-cup-size/) · [cup-prediction regression (PMC6635214)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6635214/)
- **Tissue density:** [Quantification of glands and fat (ScienceDirect S0940960202800164)](https://www.sciencedirect.com/science/article/abs/pii/S0940960202800164) · [breast-density variation in reduction (S1748681509004318)](https://www.sciencedirect.com/science/article/abs/pii/S1748681509004318)
- **Ptosis grading:** [Regnault classification (Reference Aesthetic)](https://www.referenceaesthetic.com/brief-guide-to-breast-ptosis-classification/) · [PlasticsFella breast ptosis](https://www.theplasticsfella.com/breast-ptosis/)
- **Biomechanics / effects:** [posture (PMC3785590)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3785590/) · [macromastia spine (PubMed 40272533)](https://pubmed.ncbi.nlm.nih.gov/40272533/) · [spine-surgeon review (PubMed 39505016)](https://pubmed.ncbi.nlm.nih.gov/39505016/) · [CNSO macromastia](https://www.cnsomd.com/blog/macromastia-back-pain-from-large-breasts/)
- **Engine values & all derived tables:** computed in Node from the verbatim-extracted Ambrosia functions (`research/_engine_calc.mjs`) plus the partition model in this session; figures labeled estimate are author-derived from the cited anchors.
