# Ambrosia Body-DB Audit — Lactation, Fill / Engorgement & Fluid Modeling

**Date:** 2026-06-07
**Subject:** the lactation + fluid subsystem of `src/ambrosia.naiscript` (verbatim port of `reference/BE   Breast Expansion v2 0 0-alpha52.naiscript`).
**Scope:** capacity, fill/engorgement effects, auto-fill, milk density, the `fluid_type` field — validated against real lactation science (cited), then a **fantasy fluid registry** designed to feed the upcoming *growth-pressure escalator*.
**Companion:** extends `research/body-math-audit.md` (cup/bust−band/weight/volume in the realistic range). **No conflicts** with that audit — two clean handoffs are flagged in §7.

---

## TL;DR — verdict by component

| Component | Where | Real-world check | Verdict |
|---|---|---|---|
| **Milk density `1.03`** | `DEFAULT_FLUID_DENSITY` (~376) | matches the standard test-weighing value for human milk **exactly** | **KEEP** ✅ |
| **`fill_percent` 0–100 semantics** | throughout | = real "degree of breast fullness" (Cregan/Hartmann) verbatim concept | **KEEP** ✅ |
| **Capacity quadratic (∝ size)** | `base_capacity_per_side_ml` (~604) | real capacity is **NOT** size-correlated (Daly/Hartmann); engine ties it to tier²; tracks real human range only through ~tier 7 | **KEEP as fantasy-by-design** (name the departure) |
| **Auto-fill `+8%/turn`** | `endOfTurnTicks` (~3044) | ≈ real 15–18 mL/hr at mid-tiers if 1 turn ≈ 1 hr; flat-% is superhuman at scale | **KEEP** (cadence knob; document the axis) |
| **Fill EFFECTS** (cleavage/hang/bounce/sensitivity/skin-tension/projection) | grep §3 | all qualitatively correct (engorged = firmer, rounder, less hang, more sensitive, tauter) | **KEEP** (thresholds arbitrary but fine) |
| **No emptying event** (let-down / nursing / expression) | only mutation is `+8` at 3045 | real breasts empty via let-down + removal; engine fill is monotone→100 | **FIX (add drain/release)** ⚠ |
| **`fluid_type` unwired** | stored at 1113/1361, used only as a display label | type should imply density + behavior; today it changes **nothing** | **REBUILD (registry)** ⚠ |
| **Autocrine slowdown near full (FIL)** | absent | real = negative feedback that self-limits | **INVERT by design** — see §5 (the escalator front-half) |

**The one structural reframe (most important design call):** real lactation's defining control loop — the **Feedback Inhibitor of Lactation (FIL)** — is *negative* feedback: a full breast slows its own synthesis to reach homeostasis. A breast-expansion **growth** game wants the **opposite**: full → pressure → growth → bigger capacity → more fill. So the fill model should be the **front half of a positive-feedback flywheel**, and that flywheel *is* the growth-pressure escalator the task says to stay compatible with. Do not "patch in FIL realism"; deliberately invert it and document why (§5).

---

## 1. What the engine actually does (extracted)

All formulas below are the verbatim ported functions; line numbers are Ambrosia (grep-confirmed). Numbers come from running the extracted functions in Node (`research/body-db/_lact_calc.mjs`), baseline frame H=165.

**Capacity (lactation storage), mL/side — quadratic in tier:**
```
base_capacity_per_side_ml(t) = 50 + 25·t + 1.5·t²          // (~604)
capacity_per_side_ml(t,H)    = base_capacity_per_side_ml(t) · frame_modifier(H)
```

**Fluid weight & fill — milk weight added on top of tissue weight:**
```
DEFAULT_FLUID_DENSITY = 1.03                                                   // (~376)
weight_per_side_full_kg(t,H,d) = weight_per_side_kg(t,H) + capacity_per_side_ml(t,H)·d/1000   // (~613)
weight_per_side_at_fill_kg(t,H,d,f) = empty + (full − empty)·f/100             // (~620) linear in fill
```

**Auto-fill — flat increment every turn, for any lactating member:**
```
endOfTurnTicks():  fill_percent = clamp(fill_percent + 8, 0, 100)              // (~3044)
```
→ empty → full in **12.5 turns**, independent of size, and then **pinned at 100 forever** (nothing consumes it).

**Fill feeds into the body via two channels:**
1. **Weight** — `weight_per_side_at_fill_kg` (milk mass) flows into `posture_ratio` and `breast_mass_body_pct`.
2. **Volume** — `bust_projection_cm` adds `milk_vol = capacity·fill/100` to `tissue_vol` before the radius/shape math, plus a pressure boost (§3).

**`fluid_type`** is stored (`milk|mana|arcane|ambrosia|custom`, default `'milk'`, lines 1113/1361) and **never read by any formula** — it is display-only. `fluid_density` is a *separate* manual number; the type does not set it. (In alpha52 there was a parallel `fluid_type_density` field, but the wiring still hard-codes `|| 1.03` everywhere — so the type→density link never existed in either version.)

### 1.1 Engine output across tiers (baseline frame, H=165, milk @ 1.03)

| tier | letter | cap/side mL | cap total mL | tissue vol/side mL | cap as % of tissue @ full | wt empty/side kg | wt full/side kg | milk wt/side kg |
|---:|:--|--:|--:|--:|--:|--:|--:|--:|
| 0 | A | 50 | 100 | 189 | 26% | 0.180 | 0.231 | 0.051 |
| 2 | B | 106 | 212 | 314 | 34% | 0.298 | 0.407 | 0.109 |
| 4 | C | 174 | 348 | 455 | 38% | 0.432 | 0.611 | 0.179 |
| 6 | D | 254 | 508 | 613 | 42% | 0.582 | 0.844 | 0.262 |
| 8 | E | 346 | 692 | 787 | 44% | 0.748 | 1.104 | 0.356 |
| 10 | F | 450 | 900 | 979 | 46% | 0.930 | 1.393 | 0.464 |
| 13 | GG | 629 | 1257 | 1298 | 48% | 1.233 | 1.880 | 0.647 |
| 16 | I | 834 | 1668 | 1655 | 50% | 1.572 | 2.431 | 0.859 |
| 20 | K | 1150 | 2300 | 2189 | 53% | 2.080 | 3.264 | 1.185 |
| 27 | NN | 1819 | 3637 | 3287 | 55% | 3.123 | 4.996 | 1.873 |
| 40 | U | 3450 | 6900 | 5874 | 59% | 5.580 | 9.133 | 3.554 |
| 50 | Z | 5050 | 10100 | 8347 | 61% | 7.930 | 13.131 | 5.202 |

---

## 2. Real-world reference data (cited)

### 2.1 Milk density — the engine's `1.03` is exactly right ✅
Human milk density is **≈ 1.03 g/mL**, and this is *the* standard value used to convert expressed-milk **volume → weight** in clinical test-weighing. Fat (3–5%, density ~0.93) pulls it slightly down; protein/lactose/minerals pull it up; net ~1.026–1.036. Foremilk (low fat) is marginally denser; hindmilk (fat up to 8–13 g/dL) marginally lighter. [NCBI *Nutrition During Lactation* / Milk Volume; news-medical creamatocrit; EKF Creamatocrit Plus]

> **Note vs the prior audit:** this **1.03 g/mL milk** is a *different quantity* from the prior audit's **0.95 g/cc tissue** density (`TISSUE_DENSITY_KG_PER_CM3`). Tissue is fat-dominant solid (~0.92–0.95); milk is an aqueous emulsion (~1.03). Both engine constants are individually correct; they must not be conflated.

### 2.2 Storage capacity — variable, and NOT correlated with breast size
"Storage capacity" = the max milk the glandular tissue holds between feeds. Measured ranges (Daly, Cox & Hartmann 1993; computerized breast measurement):
- Typical **~75–150 mL per breast**; documented spread roughly **80–600 mL**.
- Combined both-breast "average" expression ≈ **2–5 oz (≈60–150 mL)**, extreme up to **~10 oz (≈300 mL) in a single breast**.
- **Capacity is set by glandular tissue amount, not breast size** — small-breasted women can have large capacity and vice-versa. Storage capacity governs *feed frequency flexibility*, not supply. [drpaolavallarino; lknbreastfeedingsolutions; Hartmann/Owens/Cox 1996]

### 2.3 "Degree of fullness" — the engine's `fill_percent` is the real metric
Cregan/Hartmann define **degree of fullness = (breast volume now − minimum 24-h volume) / storage capacity × 100%**. This is *precisely* the engine's `fill_percent` (current milk / capacity). The semantic match is exact — **keep the variable and its 0–100 range.** [Cregan & Hartmann; academia.edu "Frequency and degree of milk removal…"]

### 2.4 Synthesis rate & the FIL feedback loop
- **Average synthesis ≈ 15–18 mL/hr per breast**, ≈ **800 mL/day** total, remarkably constant in established lactation. [PMC6165356 / MDPI Nutrients 2018 "Hourly Breast Expression"]
- **Rate is inversely related to fullness:** the fuller the breast, the slower it makes milk; the emptier, the faster. Mediated by **FIL (Feedback Inhibitor of Lactation)**, a whey protein that accumulates as milk sits and reversibly blocks secretion — **autocrine, per-breast** negative feedback that protects against overfilling. [Cregan/Hartmann; Wilde/Peaker FIL; KellyMom; NCBI NBK148970]
- **Critically for design:** real lactation is *self-limiting*. A growth game must invert this (§5).

### 2.5 Let-down (milk-ejection reflex) & engorgement
- **Let-down** = oxytocin reflex: suckling/stimulation → oxytocin → myoepithelial cells squeeze alveoli → milk ejected, onset **~1–2 min**, often multiple per feed. [thelactationcollection; sciencedirect Milk Ejection]
- **Engorgement** = overfull, swollen, firm, hot breasts; can *inhibit* let-down (duct compression, edema). This is the real correlate of the engine's high-fill "engorged" skin-tension state. [NCBI NBK235589; StatPearls Postpartum]
- The engine models the *static* engorged state well but has **no let-down event and no milk removal** at all — fill only rises.

### 2.6 Density anchors for the fluid registry (real fluids)
| Fluid | Density (g/mL) | Source |
|---|---|---|
| Breast fat **tissue** (not fluid) | ~0.92–0.95 | prior audit; ematch with implant "mimics fat" |
| **Silicone gel** implant | **0.97** | gartnerplasticsurgery; ASPS |
| Water | 1.00 | — |
| **Saline** implant | **1.00** | alamoplasticsurgery (specific gravity ~1) |
| **Human milk** | **1.03** | §2.1 |
| Honey / dense syrup (viscosity/density ceiling reference) | ~1.4 | food-science standard |

---

## 3. Fill-EFFECT validation (one row each — all KEEP)

Every fill effect is qualitatively correct against the engorgement literature (fuller = firmer, rounder, heavier, more sensitive, tauter skin, less hang, more slosh). Thresholds are arbitrary but narratively serviceable.

| Effect | Code (~line) | Fill behavior | Real-world parallel | Verdict |
|---|---|---|---|---|
| Projection pressure boost | `bust_projection_cm` 731 | `shape_factor += 0.15·(fill)^1.5` | overfull breast bulges rounder/forward | KEEP |
| Milk volume → projection | 720 | adds `cap·fill/100` mL to tissue vol | fluid genuinely adds volume | KEEP (inherits §7 bust_cm caveat) |
| Cleavage | `cleavage_depth_cm` 743 | `+0.15·(fill)^0.5` | fuller breasts press together | KEEP |
| Hang reduction | `hang_drop_cm` 756 | `−0.08·(fill−50)/50` above 50% | engorged = firmer, rides higher | KEEP |
| Bounce dampening | `bounce_amplitude_cm` 769 | ×0.85 when filled | turgid breast bounces less | KEEP |
| Bounce slosh | `bounce_quality` 774 | "heavy, sloshing" >30% | audible fluid movement | KEEP (flavor) |
| Sensitivity | `compute_sensitivity` 842 | ×1.3 / 1.5 / 1.8 at 50/80% | engorgement = tender/aching | KEEP |
| Skin tension | `compute_skin_tension` 864 | taut@50 / strained@70+Δ / engorged@90 | matches clinical engorgement ladder | KEEP |
| Posture/body-pct | 641/699 | uses fill weight | heavier full breasts pull posture | KEEP |

> Don't over-engineer these. The thresholds (30/50/70/90) are fine; spending effort re-deriving the constants would be gold-plating.

---

## 4. Capacity & auto-fill — validation (realistic vs fantasy)

### 4.1 Capacity — KEEP, with one named departure
- **Realistic window:** tier 0 = 50 mL/side reads slightly **low** vs real 75–150 typical. The curve passes through the real **typical** band at tiers **1–3 (76–138 mL)**, reaches the real **extreme** single-breast ceiling (~300 mL) at **tier 7 (≈298 mL)**, and **exceeds all documented human capacity from tier 8 (346 mL) upward**. So the honest realistic ceiling is **~tier 7 (D/E)** — not tier 10.
- **Fantasy-by-design departure:** the engine makes capacity **∝ tier²** (size-driven). Real capacity is **size-independent** (Daly/Hartmann, §2.2). This is a deliberate and *correct* genre choice — bigger fantasy breasts holding proportionally more fluid is exactly what the product wants — but it should be **documented as an intentional inversion of the real finding**, not mistaken for realism.
- **Capacity-to-tissue ratio is well-behaved:** milk tops out at 26% (tier 0) → 61% (tier 50) of tissue volume. Staying under tissue volume through the human range is physically sane; >50% at extreme tiers is fantasy and fine.

### 4.2 Auto-fill `+8%/turn` — KEEP as a cadence knob
- **Accidentally realistic mid-range:** tier 6 (D) at +8%/turn = **+20 mL/turn**. Real synthesis is **15–18 mL/hr/breast** → if **1 turn ≈ 1 hour**, the engine is dead-on. Superhuman only at large tiers (tier 50 = +404 mL/turn).
- **The realistic→fantasy axis to document:** real synthesis is ~constant *absolute* rate, so the **% rate falls as capacity grows**; the engine holds **% constant**, so absolute rate scales with capacity. Either is a defensible model; flag it as an axis, not a bug.
- **The real gap is not the rate — it's the lack of an off-ramp (§4.3).**

### 4.3 No emptying event — FIX
Grep confirms the **only** mutation of `fill_percent` is the `+8` at line 3045. There is **no let-down, nursing, expression, or drain** anywhere. Line 2712 mentions "letdown" only inside a *narrative directive string* — it never reduces fill. Result: every lactating member ratchets to 100% in ≤12.5 turns and **stays pinned there permanently**, so `fill_percent` collapses to a constant and all its nice 0–100 effects (§3) stop varying. **This is the one genuine mechanical defect in the subsystem.** Fix in §5/§6.

---

## 5. The design reframe — fill as the front half of the growth-pressure escalator

The task notes this work "feeds an upcoming growth-pressure escalator + fluids build." The lactation system is *already* that escalator's intake manifold — it just stops short.

**Real biology (negative feedback, to KEEP OUT):** fill ↑ → FIL ↑ → synthesis ↓ → homeostasis. Self-limiting.

**Genre physics (positive feedback, to BUILD):**
```
fill rises → reaches 100% (engorged) → PRESSURE accumulates while pinned at 100
   → sustained pressure crosses a threshold → GROWTH (tier ↑)
   → bigger tier → bigger capacity → fill % drops (same milk, larger vessel) → headroom to refill
   → loop
```
This is a **flywheel**: each growth cycle enlarges the vessel, the vessel refills, pressure rebuilds, it grows again. It reuses the existing fill machinery and gives the escalator a quantity to consume.

**Minimal, backward-compatible shape:**
- **KEEP** `fill_percent` as the 0–100 "degree of fullness" (real term, real semantics — §2.3).
- **ADD** a `pressure` accumulator (0–100, volatile) that only builds while `fill_percent` is pinned at 100 (the breast can't vent). Rate scales with fluid type's `growth_factor` (§6) and predisposition.
- **ADD** an emptying path (let-down/nursing/expression action, or a narrative-triggered release) that drops `fill_percent` and bleeds `pressure` — this is the relief valve and fixes §4.3 in the same stroke.
- **Pressure threshold → enqueue a growth-intent** through the existing growth-intent queue (the engine already drains one growth-intent/turn — §`drainGrowthIntents`), so the escalator plugs into the seam that's already there rather than inventing a new path.

This keeps every current behavior intact (fill still rises, effects still fire) and only adds an overflow lane.

---

## 6. The fantasy fluid registry (the `fluid_type` rebuild)

**Problem:** `fluid_type` is a dead label. **Fix:** make it a registry that supplies (a) **density** → straight into `weight_per_side_full_kg` (which *already* takes a `fluid_density` arg — wiring `fluid_type → default density` is a tiny change), (b) **fill behavior**, (c) a **growth_factor** that feeds the §5 pressure accumulator. Keep `'custom'`'s manual `fluid_density` override.

The load-bearing column is **growth_factor** — and it must be *ordered/principled*, not arbitrary. Mundane milk drives no intrinsic growth; the title fluid **ambrosia** is the dense, potent growth engine; mana/arcane sit between.

| `fluid_type` | density g/mL | real/fantasy | fill behavior | growth_factor (→ pressure) | rationale |
|---|---|---|---|---|---|
| `milk` | **1.03** | real (§2.1) | standard synth; FIL-like self-limit optional | **0** (mundane) | the calibrated baseline; KEEP density exactly |
| `cream` (opt.) | ~1.01 | real-ish (high-fat hindmilk) | slower, richer, heavier feel | 0 | flavor variant of milk; fat lowers density |
| `mana` | **1.00** | fantasy | water-like, fast refill, "luminous" | **low** (+) | ambient magical fluid; light, quick, gently expansive |
| `arcane` | ~1.10 | fantasy | viscous, glows, slosh-heavy | **medium** (++) | denser charged fluid; more pressure per fill |
| `ambrosia` | **~1.25** | fantasy (title fluid) | thick, golden, intensely pressured | **high** (+++) | the engine's namesake: dense + the strongest growth driver |
| `custom` | manual | user | inherits manual `fluid_density`; growth_factor authorable | author-set | preserves today's escape hatch |

**Density rationale anchored to real data (§2.6):** milk 1.03 (measured), mana 1.00 (water), arcane 1.10 (between milk and syrup), ambrosia 1.25 (approaching honey ~1.4, "thick and golden" without being implausibly heavy). All sit in a physically sane 1.0–1.4 band so the existing `weight_per_side_full_kg` math stays well-behaved — a fuller heavier fluid simply adds more posture/strain weight, which is the intended effect.

**Escalator bridge:** `growth_factor` is the single number the §5 pressure accumulator multiplies. `milk = 0` means a mundane dairy character (e.g. the holstaur Lucy) lactates copiously *without* runaway growth, while an `ambrosia`-filled character is a growth flywheel. This cleanly separates "lots of milk" from "milk that makes her grow" — exactly the genre control the product needs.

> **Out of scope (one line):** colostrum/transitional-milk modeling (lower early volume, higher protein) is real but adds nothing here — leave it out; it would be over-engineering.

---

## 7. Relationship to the prior audit (`body-math-audit.md`) — no conflict

Two clean handoffs, no contradictions:

1. **`bust_cm` inflation is inherited, not re-litigated.** The fill→`bust_projection_cm`→`bust_cm` path passes through the prior audit's broken `bust − band = ~4.08·proj` term, so **engorgement adds ~4× too much circumference** too. This is the *same* bug the prior audit owns; its §6 fix (re-derive `bust_cm` to ≈2·proj) automatically corrects the engorged case. **Deferred to that audit — not re-derived here** (a competing formula would only cause confusion).
2. **Two densities, both correct, must not be conflated:** tissue **0.95 g/cc** (fat solid; prior audit) vs milk **1.03 g/mL** (aqueous; this audit). Different substances, different numbers, both right.

Everything this audit recommends (registry, pressure accumulator, drain event) is **additive** to the prior audit's `bust_cm` repair — they don't touch the same code.

---

## 8. Consolidated recommendations

**KEEP (validated against real data):**
- `DEFAULT_FLUID_DENSITY = 1.03` — exact match to clinical milk density. Do not touch.
- `fill_percent` 0–100 = real "degree of fullness." Keep variable + range + all its qualitative effects (§3).
- Capacity quadratic and auto-fill `+8%/turn` — keep as fantasy-by-design + a cadence knob; **document the two named departures** (capacity ∝ size vs real size-independence; constant-% vs constant-absolute synthesis).

**FIX (genuine gaps):**
- **Add an emptying path** (let-down / nursing / expression action) so `fill_percent` isn't monotone-to-100. Without it the whole 0–100 system flatlines at 100 (§4.3). Highest-priority mechanical fix.

**REBUILD / BUILD (design):**
- **Wire `fluid_type` into a registry** (§6): type → default density (into existing `weight_per_side_full_kg`) + fill behavior + `growth_factor`; keep `custom` manual override.
- **Add the pressure accumulator** (§5): fill pinned at 100 → pressure builds (× fluid `growth_factor`) → threshold enqueues a growth-intent via the existing queue. This is the lactation half of the growth-pressure escalator and inverts FIL by design.

**DELIBERATELY DO NOT add real FIL negative feedback** — the genre needs positive feedback (§5). Note the inversion in a comment so it's not "fixed" later.

---

## Appendix — sources

- **Milk density 1.03 g/mL (test-weighing standard):** NCBI *Nutrition During Lactation* — Milk Volume (NBK235589); news-medical.net creamatocrit whitepaper; EKF Creamatocrit Plus; agriculture.institute density/specific-gravity.
- **Storage capacity (variable, size-independent; Daly/Hartmann):** drpaolavallarino.com "Storage capacity, milk supply, and breast size"; lknbreastfeedingsolutions.com storage capacity; Hartmann, Owens, Cox & Kent 1996 (SAGE 156482659601700404); Daly, Cox & Hartmann 1993.
- **Degree of fullness & FIL / synthesis control (Cregan/Hartmann; Wilde/Peaker):** academia.edu "Frequency and degree of milk removal and the short-term control of human milk synthesis"; KellyMom "How does milk production work?"; NCBI NBK148970 physiological basis of breastfeeding; australasianlactationcourses FIL PDF.
- **Synthesis rate 15–18 mL/hr, ~800 mL/day:** MDPI *Nutrients* 2018 "Hourly Breast Expression to Estimate the Rate of Synthesis of Milk and Fat" (PMC6165356 / PMID 30135368).
- **Let-down / milk-ejection reflex & engorgement:** thelactationcollection.com let-down glossary; sciencedirect "Milk Ejection" overview; StatPearls Physiology, Postpartum Changes (NBK555904); NBK235589.
- **Implant / fluid densities (silicone 0.97, saline ~1.0):** gartnerplasticsurgery.com silicone-vs-saline; alamoplasticsurgery.com; American Society of Plastic Surgeons.
- **Milk composition / colostrum:** PubMed 392766 "The composition of human milk"; NCBI Anatomy, Colostrum (NBK513256); frontiersin.org milk fat globule review.
- **Engine computations:** `research/body-db/_lact_calc.mjs` (verbatim-extracted alpha52/Ambrosia capacity + fill + weight functions, run in Node).
