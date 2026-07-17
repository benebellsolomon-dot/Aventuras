# Ambrosia Body-DB — Structure, Consistency, Testability & Extensibility Audit

**Date:** 2026-06-07
**Subject:** the body-measurement database in `src/ambrosia.naiscript` (~lines 233–982), a verbatim port of `reference/BE   Breast Expansion v2 0 0-alpha52.naiscript`. ~22 helper functions + ~12 data tables, aggregated by `compute_body_snapshot()`.
**Scope of THIS report:** holistic DB review — **(a)** structure/architecture, **(b)** internal consistency (contradictions beyond the known `bust_cm` bug), **(c)** testability (the invariants/anchor-tests that should guard each dimension), **(d)** extensibility & what's missing. Covers **all dimensions** (not just the four the prior audit examined) across **all ranges** (realistic A–G *and* the H…Z/ZZ/beyond fantasy ladder). Cited real-world data for the dimensions the prior audit left uncited (lactation capacity, projection, head-scale).
**Read-only.** No script files were edited. All engine numbers below are the verbatim-extracted functions run in Node (`research/body-db/_full_dump.mjs`, `_dims_check.mjs`; prior `research/_engine_calc.mjs`, `_geom_check.mjs`).
**Relationship to prior audit** (`research/body-math-audit.md`): that audit is **confirmed and not contradicted**. It diagnosed `bust_cm` (bust−band ≈ 4.08·proj vs real ~2·proj) and the tier→letter ladder running ~2 cups behind volume, in the A–G range. This report **extends** it across every other dimension and the entire fantasy range, and reframes the fix as a *testability* problem: the bug hid because nothing cross-checked measurements against each other.

---

## 0. TL;DR — KEEP / FIX / REBUILD at a glance

| # | Component | Realistic range (A–G) | Fantasy range (H–Z+) | Call |
|---|---|---|---|---|
| 1 | Weight quadratic (`base_weight_per_side_kg`) | author-calibrated, sound | monotonic, intentional blow-up | **KEEP** |
| 2 | Tissue volume (`weight / 0.95 g/cc`) | locked to weight, density correct | locked to weight | **KEEP** |
| 3 | Projection (`bust_projection_cm`) | plausible depths (3–9 cm) | monotonic, drives the (good) prose ladder | **KEEP** |
| 4 | **`bust_cm` (bust−band)** | **~2× too big; self-contradicts mass** | error ratio tapers 2.5×→1.0× | **FIX** (per prior audit) |
| 5 | **Tier→letter ladder** | **labels an F-by-volume "D"** | internally consistent, opaque | **FIX** (re-anchor to volume) |
| 6 | COMPARATIVE_DESCRIPTIONS (51-band prose) | matches projection/diameter geometry | well-designed, head-cross-check passes | **KEEP** |
| 7 | SHAPE_DESCRIPTORS (3×6) | fine | fine | **KEEP** |
| 8 | Posture ratio + thresholds | coherent with mass | saturates sensibly | **KEEP** |
| 9 | INTERACTION_MILESTONES | fire in sane order vs mass | sane order | **KEEP** (one tuning note) |
| 10 | **`capacity_per_side_ml` (lactation)** | **magnitude plausible to ~D–F, but scales with size & frame — real storage does NOT** | unbounded quadratic | **FIX** (decouple from size; newly surfaced) |
| 11 | **Bounce `cap`/`tier_scale` params** | **inert (dead code) at every tier, every shape** | inert | **FIX** (remove or make binding) |
| 12 | **`projectionRef` / `hangRef` prose buckets** | fine | **mid-buckets span ~30 cup-letters; projRef top rung near-dead** | **FIX** (extend + split) |
| 13 | **`compute_sensitivity` tier term** | **near-inert; dry+settled is always "normal"** | tier term finally bites ~t200 | **FIX** (rebalance) |
| 14 | `compute_skin_tension` | event-driven state machine, fine | fine | **KEEP** |
| 15 | Cleavage / hang derivations | proportional to projection, fine | hang>projection above ~t133 (by design) | **KEEP** |

**Headline:** the DB has a **sound physical spine** (weight → volume → projection → prose) and a **broken labeling/circumference skin** (`bust_cm`, the letter ladder) — the prior audit's verdict, now confirmed across the whole range. THIS audit adds **three new structural defects** the prior pass didn't look at: **(10) lactation capacity is coupled to size when real storage capacity is independent of it**, **(11) the bounce cap parameters are provably dead code**, and **(13) sensitivity is effectively a constant** for the overwhelmingly common dry/settled character. Plus **(12)** two prose-reference helpers saturate at the top. None of the new defects is fatal; all are cheap fixes. The deeper finding is that **nothing in the DB cross-validates anything else** — there is not one assertion that ties bust to weight, prose to mass, or capacity to reality — which is exactly why a 2× geometry error survived to production. **The single highest-leverage improvement is an anchor-test harness**, seeded by the two dump scripts already written for this audit.

---

## 1. Architecture map — how every dimension derives from `tier_index`

The DB is a **pure, stateless, single-integer-driven** function cluster. Everything flows from one master scalar, `tier_index` (an integer; each tier = one half-cup), plus a small frame `{height_cm, waist_cm, build, breast_shape, lactation_active, fill_percent, fluid_density}`. `compute_body_snapshot(inputs)` is the sole aggregator (lines 908–982); it calls ~20 helpers and returns a flat ~40-field object.

### 1.1 The derivation DAG (what depends on what)

```
tier_index ─┬─> base_weight_per_side_kg ──> weight_per_side_kg ─┬─> tissue_vol ──> bust_projection_cm ─┬─> bust_cm (+band)
            │      (quadratic)            (× frame_modifier(H))  │                  (vol→sphere r       │     (BROKEN scaling)
            │                                                    │                   ×flatten×shape)    ├─> cleavage_depth_cm
            │                                                    │                                      ├─> hang_drop_cm
            │                                                    ├─> weight_full / weight_at_fill ──┐    └─> bounce_amplitude_cm
            │                                                    │      (+ capacity × density)      │
            │                                                    └─> posture_ratio ──> posture/mobility/clothing labels
            │                                                           (breast / (body+breast))
            ├─> base_capacity_per_side_ml ──> capacity_per_side_ml (× frame_modifier)  [feeds milk weight & projection]
            ├─> tier_index_to_letter        (pure string ladder; NOT derived from any measurement)
            ├─> describe_size_comparative   (51-band lookup by tier_max)
            ├─> describe_shape              (3×6 lookup by tier_max)
            └─> compute_sensitivity / compute_skin_tension (consume gens_since_growth + fill, barely tier)
```

**Two observations about the topology:**

1. **Weight is the true root.** `weight_per_side_kg` is the load-bearing primitive; volume, projection, posture, milk-weight, and every projection-derived field (bust, cleavage, hang, bounce) descend from it. This is a *good* design — one calibrated curve, everything else geometric. The prior audit's "sound spine" is literally this trunk.

2. **The cup LETTER is a sibling, not a descendant.** `tier_index_to_letter` is a pure alphabetical encoding of the integer; it is **not** computed from weight/volume/bust. So the letter and the measurements are free to disagree — and they do (the prior audit's core complaint). Likewise `describe_size_comparative` and `describe_shape` are indexed by raw `tier_index`, independent of the measurement chain. **The labeling layer floats free of the physics layer.** That decoupling is the structural root cause of "the D-cup that weighs like an F."

### 1.2 Constants & tables inventory

| Group | Constants/tables | Lines |
|---|---|---|
| Frame/scaling | `BASELINE_WAIST_CM`, `FRAME_MODIFIER_REF_HEIGHT_CM`, `FRAME_MODIFIER_EXPONENT` | 254–256 |
| Weight | `BASE_WEIGHT_{CONST,LINEAR,QUAD}` | 260–262 |
| Capacity | `BASE_CAPACITY_{CONST,LINEAR,QUAD}`, `DEFAULT_FLUID_DENSITY` | 372–376 |
| Density/body | `TISSUE_DENSITY_KG_PER_CM3`, `BODY_WEIGHT_HEIGHT_{FACTOR,OFFSET}` | 378–382 |
| Shape modifiers | `SHAPE_CIRC_FACTOR`, `SHAPE_POSTURE_FACTOR`, `SHAPE_CLEAVAGE_FACTOR`, `SHAPE_HANG_*`, `SHAPE_BOUNCE` | 265–286 |
| Build modifiers | `BUILD_WEIGHT_MODS`, `BUILD_BAND_OFFSET` | 269–272 |
| Qualitative ladders | `INTERACTION_MILESTONES`(13), `SENSITIVITY_LABELS`(6), `SKIN_TENSION_LABELS`(5), `BOUNCE_SCALE`(6), `CLEAVAGE_SCALE`(6), `POSTURE_THRESHOLDS`(10), `MAGNITUDE_BANDS`(6), `COMPARATIVE_DESCRIPTIONS`(51), `SHAPE_DESCRIPTORS`(3×6) | 288–493 |

**Structural assessment of the constants:**
- **Good:** all magic numbers are named constants at module top; shape/build modifiers are clean lookup dicts; the quadratics are 3-coefficient and legible.
- **Weak:** the calibration intent lives only in a *comment* (line 258–259: "D-cup ~1.2 kg, G ~2.3, K ~4.2, O ~6.6, Z ~15.9"). Those anchor points are the spec, but they are **not encoded as tests** — so a future edit to `BASE_WEIGHT_QUAD` would silently break them with no signal. Same for *every* table: the bands are asserted by authorial intuition, never checked.
- **Coupling smell:** `bust_projection_cm` hard-codes its three shape branches inline (lines 728–730) rather than reading a `SHAPE_PROJECTION_FACTOR` table the way every *other* shape-dependent function does. Minor inconsistency in style; makes the projection shape-curve harder to tune.

---

## 2. Internal-consistency audit — hunting for contradictions

The prior audit found one self-contradiction (bust−band describes a ~2× heavier object than the mass axis assigns). I checked **every pairing** of dimensions for analogous internal contradictions. Method: dump all dimensions across tiers 0–260 and look for (i) inversions/non-monotonicity, (ii) a derived value implying a different `tier_index` than its siblings, (iii) prose that contradicts the computed number at the same tier.

### 2.1 The known contradiction — CONFIRMED, full-range characterized

`bust_cm`'s added circumference is `2π·proj·coverage·circFactor`. The prior audit's "≈4.08·proj at low natural tier, real is ≈2·proj" reproduces exactly. New: I traced the **error ratio across the entire ladder** (engine bust−band ÷ the bust−band the engine's *own* volume/projection implies as a spherical cap):

| tier | proj | engine bust−band | self-consistent bust−band | overshoot |
|---:|--:|--:|--:|--:|
| 2 (B) | 4.1 | 16.9 | 6.7 | **2.5×** |
| 6 (D) | 6.0 | 25.1 | 14.2 | **1.8×** |
| 13 (GG) | 9.5 | 40.8 | 27.1 | 1.5× |
| 20 (K) | 13.5 | 59.5 | 42.2 | 1.4× |
| 50 (Z) | 24.4 | 119.6 | ~85 | ~1.4× |

The overshoot is **worst in the realistic range** (2.5× at B) and asymptotes to ~1.4× in fantasy. So the defect is *most visible exactly where realism matters most*. Because the ratio is tier-dependent, **no constant rescale fixes it** — confirming the prior audit's "re-derive, don't rescale." (Fix sketch in §6.)

### 2.2 NEW finding — lactation capacity vs. real storage physiology (an *external*/design defect, not an internal contradiction)

> **Framing (important):** unlike `bust_cm` — the one place two axes of the *same engine* disagree about one object's mass — capacity is **internally self-consistent**. It conflicts with *external physiology*, and the problem is a **design coupling** (deriving milk storage from fat size). It is a real defect, but **not** a second bust_cm-severity internal contradiction; don't read this as "two equal bugs."

`capacity_per_side_ml = (50 + 25·t + 1.5·t²) · frame_modifier(H)`. This couples milk **storage capacity** to tier (breast size) **and** to body frame. Engine values at the reference frame (H165): tier 0 = 50 ml/side, tier 6 ("D") = 254 ml/side, tier 13 = 629 ml/side, tier 20 = 1150 ml/side. *(Note: these are distinct from — and smaller than — the tissue-volume figures 189/613/1298/2189 ml that the prior audit reports; tissue volume is `weight/0.95 g/cc`, capacity is this separate quadratic.)* The `frame_modifier` multiplier inflates capacity further on tall frames (×1.14 at H180).

**The real-world finding directly contradicts the coupling.** Lactation research (Kent & Hartmann, *Storage capacity of the human breast*; LA Lactation) reports mean storage capacity **~170 ml per breast** (term mothers: 170 ± 66 ml L / 174 ± 44 ml R), with substantial between-woman spread (the cited means ±SD imply a wide distribution; some sources note ranges up to several-hundred ml — treat the exact upper bound as an estimate, not a retrieved figure), and — critically, the load-bearing fact — **storage capacity is NOT correlated with breast size**; it tracks glandular tissue, not fat volume. The engine instead makes a tier-6 "D" hold **254 ml/side** of milk (≈1.5× the population mean — within range, but *for the wrong reason*: scaled by fat-size), and by tier 13 (629 ml) / tier 20 (1150 ml) it is several× the human maximum *purely because the breast is large*, then inflates further by frame. The defect is the **coupling**, not (in the realistic range) the magnitude: real storage is size-independent, so deriving it from tier is structurally wrong even where the number lands in-range.

**Why this is a genuine internal/consistency defect, not just a realism miss:**
- The engine *reuses* `capacity_per_side_ml` inside `bust_projection_cm` (line 721) and `weight_per_side_full_kg` (line 617). So an over-large capacity **propagates** into projection and weight when lactating — a lactating tier-13 breast at 100% fill adds ~629 ml of "milk" on top of its ~1298 ml tissue, roughly +48% volume, visibly inflating projection/bust. The error is not cosmetic; it feeds the geometry.
- It conflates **two physically independent quantities** the literature explicitly separates: *fat-driven cup size* and *gland-driven milk storage*. Tying them means a flat-chested heavy-producer or a huge-breasted low-producer is unrepresentable.

**Severity: realistic range = FIX (it's wrong and it feeds geometry); fantasy range = acceptable** (a Z-cup holding gallons is genre-appropriate *if* decoupled from claiming it's physiological). Recommendation in §6.4.

### 2.3 Prose ladder vs. measurements — CONSISTENT (and notably well-built)

I cross-checked `COMPARATIVE_DESCRIPTIONS` semantics against the computed physics at each band. **The prose tracks the projection/diameter geometry well — it is one of the better-calibrated parts of the DB**, not a defect:

| prose anchor | engine at that tier | verdict |
|---|---|---|
| t8 "cupping one requires both hands, flesh spills past" | proj 7.0 cm, 1.5 kg total | apt |
| t10 "deep cleavage, warm valley" | cleavage 2.4 cm, proj 8.0 | apt |
| t20 "as wide as both her hands pressed together" | sphere-diameter ~16 cm ≈ two palms | apt |
| **t25 "approaching the size of her own head"** | **vol 2.95 L, sphere-diameter 17.8 cm** | **apt — real head ≈ 4–5 L, ~17–20 cm dia, ~55 cm circ; matches by diameter, conservative by volume** |
| t26 "rivals her head in size" | 3.1 L, 18.1 cm dia | apt (head ≈ 4 L; slightly under, fine) |
| t27 "too heavy to hold up without support" | 6.2 kg total | apt |

The "head-sized" rung (the advisor's prediction) **passes**: at tier 25 each breast is 17.8 cm in diameter vs a ~17–20 cm human head — defensible, even conservative. **Key structural insight:** the prose ladder is anchored (in the author's head) to **projection/diameter**, which is the *sound* part of the chain — whereas the cup *letter* is anchored to the raw integer, which is the *unsound* part. That's why the prose feels right while the letter feels wrong. **KEEP the prose; it is effectively a second, independent, correct "size sense" the DB already contains** — and it can serve as a cross-check oracle for re-anchoring the letter (§5).

> **Reframe (per advisor):** the band-index *coarsening* at the top (every-half-cup → every-2 → big jumps, lines 408, 423, 440, 453) is **by design**, documented in the source comment. Prose and letter are both keyed to `tier_index` and cannot "desync" from each other. The only legitimate prose test is *semantic* (does rung T match physics at T?) — and it passes. **Not flagged.**

### 2.4 Milestones vs. mass — CONSISTENT order, two soft tuning notes

`INTERACTION_MILESTONES` are weight-gated (total empty kg). I computed the tier at which each fires:

| weight gate | fires at tier | letter | description | note |
|--:|--:|:--|---|---|
| 1.5 kg | 9 | EE | "can no longer go braless comfortably" | soft: a real EE is already firmly bra-dependent; fine as a *fantasy* threshold |
| 2.7 kg | 15 | HH | "cleavage visible in any neckline" | order OK |
| 4.0 kg | 20 | K | "cannot see her own feet" | order OK |
| 6.0 kg | 27 | NN | "cannot touch toes" | order OK |
| 10 kg | 38 | T | "breasts press when she embraces" | order OK |
| 14 kg | 47 | XX | "must turn sideways through doorways" | order OK |
| 45 kg | 93 | ZUU | "cannot fit in a standard chair" | order OK |
| 130 kg | 167 | ZZZHH | "structural modifications to any room" | order OK |
| 180 kg | 199 | ZZZXX | "architectural accommodation" | order OK |

**Monotone and sensibly spaced** — no milestone fires out of order, and they ramp smoothly into the fantasy zone. These are **weight-anchored, which is the right primitive** (mass, not letter, governs encumbrance). **KEEP.** *Soft notes only:* (a) the milestones are gated on **empty** tissue weight in this analysis, but `check_milestones_crossed` is called by the engine with whatever total it's given — if lactation fill is included at call sites, a lactating character will trip milestones "early," which is arguably correct but should be a conscious choice; (b) the first rung "no longer braless at 1.5 kg/EE" is late vs reality (a C/D already wants support) but consistent with the engine's deliberately heavy mass curve — a *judgment call*, not a contradiction.

### 2.5 Posture vs. mass — CONSISTENT (bounded ratio behaves)

`posture_ratio = min(0.95, [breast/(body+breast)] · shapeFactor)`. Transitions (natural, H165, average): unaffected→t6, forward-lean→t12, arch→t19, profound arch→t28, spine-bowed→t40, structurally-dominated→t53, …, "she IS her breasts"→t123. **Monotone, bounded [0,0.95], saturates gracefully.** The bounded form (prior audit's "v2.1") correctly prevents ratio>1. **KEEP.** The shapeFactor (natural 1.25, gravity_defying 0.65) sensibly makes pendulous breasts more posture-affecting than buoyant ones. No contradiction.

### 2.6 Monotonicity sweep — PASS (no inversions anywhere)

Across tiers 0→260, every continuous dimension (weight, volume, projection, bust, bust−band, cleavage, hang, bounce, posture_ratio, capacity) is **strictly monotone increasing**. No stalls, no inversions, no non-physical dips. The letter ladder is also strictly monotone and round-trips (`tier_letter_to_index(tier_index_to_letter(t)) == t`) — I spot-checked the Z-gateway boundaries (48→Y, 49→YY, 50→Z, 51→ZZ, 52→ZA, 53→ZAA, 102→ZZA, 260→ZZZZZE) and they are self-consistent. **The fantasy ladder is internally sound** — its only sin is being disconnected from volume (§2.1, the letter problem), not being internally broken.

---

## 3. NEW structural defects (dead code, saturation, near-constants)

These are not "wrong numbers" — they are **structural/testability** problems the prior audit's narrow scope never reached. Each is the kind of latent trap an anchor-test would have caught.

### 3.1 Bounce `cap` / `tier_scale` parameters are **dead code** (every tier, every shape)

`bounce_amplitude_cm = min(proj · proj_mult, cap + t · tier_scale)`. The `cap`/`tier_scale` arm is meant to ceiling the bounce. I proved it **never binds**:

| shape | proj_mult | cap + tier_scale·t | first tier cap binds (≤300) |
|---|--:|---|:--|
| natural | 0.4 | 15 + 0.3t | **NEVER** |
| firm | 0.2 | 8 + 0.15t | **NEVER** |
| gravity_defying | 0.08 | 3 + 0.05t | **NEVER** |

Reason: projection grows ~`t^0.67` (cube-root of a quadratic volume) but the cap grows **linearly** in `t`, and the linear cap is always set above `proj·proj_mult` for all t in range. So `min()` always returns the projection arm. **The `cap` and `tier_scale` fields in `SHAPE_BOUNCE` are inert** — they do nothing, at any size, for any shape. This is both **dead code** (confusing to a maintainer who thinks they're active) and a **latent tuning trap** (someone could spend hours tuning `cap` with zero observable effect). **FIX:** either delete the cap arm (bounce = `proj·proj_mult·damp`, which is what actually runs), or — if a ceiling is genuinely wanted in deep fantasy — re-tune so the cap is sub-linear and actually intersects the projection curve. Either way, **add an invariant test** ("for representative tiers, bounce equals the projection arm" or "cap binds above tier X") so the intent is pinned.

### 3.2 `projectionRef` / `hangRef` prose buckets — coarse + one near-dead top rung at extreme scale

I tabulated which reference bucket each tier actually lands in (natural shape; using the extracted functions):

| tier | proj cm | `projectionRef` | hang cm | `hangRef` |
|---:|--:|---|--:|---|
| 60 | 27.7 | past her waist | 21.6 | past her knees |
| 90 | 37.3 | past her waist | 32.5 | past her knees |
| 105 | 41.8 | **past her knees** | 38.2 | her shins |
| 140 | 52.0 | past her knees | 53.0 | her shins |
| 165 | 59.0 | past her knees | 64.6 | pooling on the floor |
| 200 | 68.5 | further than her arms can reach | 82.2 | pooling on the floor |
| 260 | 84.0 | further than her arms can reach | 115.9 | pooling on the floor |

Two real findings (corrected from an earlier eyeball estimate):

1. **Mid-buckets span enormous tier ranges.** `projectionRef`'s "past her knees" rung covers **tiers 105–165** (≈30 cup-letters of growth) before changing; `hangRef`'s "her shins" covers ~105–150. So across a huge swath of the fantasy ladder the reference phrase is *frozen* even as the body keeps doubling — the prose granularity goes coarse exactly where the genre's open-ended growth most needs distinct escalation.
2. **`projectionRef`'s top rung is near-dead.** The final bucket (`≥90 cm → "extending further than she is tall"`) is **unreachable in the natural range** — projection maxes at 84 cm at tier 260. (It *is* reachable for firm (106 cm) and gravity_defying (130 cm) at t260, so it's near-dead, not fully dead — belongs with the §3.1 dead-parameter theme.) `hangRef`'s top rung ("pooling on the floor") is reached at ~tier 155 and then *also* freezes for everything above.

**FIX:** extend both ladders with 3–4 more rungs that keep escalating through environmental scale (projection: "wider than a doorway," "filling the room ahead of her," "a wall of flesh she cannot see past"; hang: "spreading across the floor," "pooling to the far wall"), and split the over-wide mid-buckets. Cheap, high narrative payoff, directly serves the stated product goal of believable open-ended growth.

### 3.3 `compute_sensitivity` is **near-constant** for the common case

Sensitivity = `1.0 · growth_surge · lactation_boost · max(0.7, 1 − 0.001·t)`. The **tier term is almost inert**: it only drops sensitivity below 1.0 via size, and only reaches the "dulled" label (≤0.8) at **tier 200**. Consequence: a **dry, long-settled** character (the default state between growth events and the most common state in play) is reported as **exactly "normal" (value 1.0)** from tier 0 all the way to ~tier 150. Sensitivity *only* moves when `gens_since_growth ≤ 6` (recent growth) or `lactation_active`. So for most of the game, for most characters, this dimension **emits a constant** and carries no information.

This may be *intentional* (sensitivity-as-event-spike rather than sensitivity-as-size-property), but it's worth a deliberate decision: either (a) accept it's an event flag and document that, or (b) give size a real (gentle, non-monotonic-friendly) role — e.g. mild *heightening* in the mid-fantasy range (more surface area, more nerve endings) before the late-game stretch-dulling, so the value isn't pinned at 1.0. **FIX = rebalance or document.** Low severity, but it's a dimension that currently mostly doesn't do anything.

### 3.4 `compute_skin_tension` — well-built, KEEP

By contrast, skin tension is a proper **event-driven state machine** (growth-velocity + lactation-engorgement → settled/normal/taut/strained/engorged). It reads `recent_growth_delta` and `gens_since_growth`, so it *responds to the dynamics* the way sensitivity should. No defect. **KEEP** — and use it as the design template for fixing sensitivity (§3.3).

### 3.5 Hang exceeds projection above ~tier 133 — **by design, KEEP**

`hang_drop_cm` crosses `projection` at tier 133 and exceeds it (ratio 1.20 at tier 200). For a *firm/round* breast that would be non-physical, but `hang` only applies to `natural` (gravity_defying returns 0), and a deeply pendulous natural breast at environmental scale *can* hang lower than it projects (flesh flows downward). Per the realistic-vs-fantasy split, this is **fantasy-by-design above ~tier 13** and is fine. **KEEP**, but it's a good *invariant boundary* to encode: "below tier 133, hang ≤ projection" (a regression guard that would catch an accidental sign/coefficient flip in the realistic range without false-flagging the intended fantasy behavior).

---

## 4. Realistic vs. fantasy — where each dimension should be held to which standard

The prior audit drew the line at ~G / tier 13. I keep that line and apply it per-dimension. **Below the line:** anthropometric fidelity is the test. **Above the line:** the *only* tests are internal consistency + believability (monotonic, no inversions, prose matches the computed object, milestones in order). Do **not** flag fantasy values against real data.

| Dimension | A–G (≤t13): held to REAL data | H–Z+ (>t13): held to INTERNAL consistency only |
|---|---|---|
| Weight | real per-cup weights (prior audit) | monotone, smooth — ✔ |
| Volume | real cc/cup (prior audit) | monotone — ✔ |
| Projection | real depth 3–9 cm — ✔ plausible | monotone, drives prose — ✔ |
| **bust−band** | **real ~2·proj — ✗ FIX** | tapering overshoot, by-design above G |
| **letter** | **real cc→cup — ✗ FIX (re-anchor)** | internally consistent ladder — ✔ |
| **capacity (milk)** | **magnitude plausible to ~D–F, but size-COUPLING is wrong (real storage is size-independent) — ✗ FIX the coupling** | unbounded gallons OK *if decoupled* |
| Prose ladder | matches geometry — ✔ | well-built, head-check passes — ✔ |
| Posture | coherent — ✔ | saturates gracefully — ✔ |
| Milestones | sane (soft notes) — ✔ | sane order — ✔ |
| Bounce | runs on projection arm — ✔ (but dead cap) | dead cap — FIX structure |
| Sensitivity | near-constant — FIX/document | tier term finally bites ~t200 |
| projectionRef/hangRef | fine | **saturates — ✗ FIX (extend)** |

**Explicitly DO NOT touch as "bugs":** capacity *magnitude* in fantasy, posture saturation, the weight quadratic, hang>projection above t133, the Z/ZZ ladder, the 51-band prose, projection past elbows/knees. These are intentional genre features. The realistic window (≤t13) is the only place anthropometric correctness is owed.

---

## 5. Testability — the heart of this audit

**The `bust_cm` bug survived to production because the DB has zero internal cross-checks.** Not one line asserts that bust agrees with weight, that prose agrees with mass, that capacity is physiological, or that a dimension is monotone. The fix is not just to repair `bust_cm` — it's to install the **anchor-test + invariant harness** that would have caught it, and would catch the next one. The two scripts written for this audit (`_full_dump.mjs`, `_dims_check.mjs`) are the seed; they should be promoted to a checked-in test suite that runs alongside the existing `test/run.sh`.

### 5.1 Two kinds of guard

**(A) Golden anchor values** — pin the author's calibration so an edit to any coefficient screams immediately. Encode the comment at line 258 as assertions, plus real-data anchors for the realistic range:

| tier | letter | assert weight_total ≈ | assert vol/side ≈ | assert bust−band ≈ (post-fix) | real-data source |
|---:|:--|--:|--:|--:|---|
| 6 | D | 1.2 kg (±0.1) | 400 ml | 10.2 cm | weight comment; HauteFlair D=400cc; ~4″ |
| 12 | G | 2.3 kg (±0.2) | 650 ml | 20 cm | weight comment; HauteFlair extrap; ~8″ |
| 20 | K | 4.2 kg (±0.3) | — | (fantasy: monotone only) | weight comment |
| 0 | A | 0.36 kg | 180–230 ml | 2.5 cm | HauteFlair A; ~1″ |

(Weight anchors match the engine today — they pin the author's calibration. The **vol/side and bust−band columns are real-data *targets***, not current engine output: the engine computes ~613 ml and ~25 cm bust−band at tier 6, i.e. it currently *fails* these — vol/side because the letter runs ~2 cups ahead of real cc/cup [prior audit], bust−band because of the `bust_cm` 2× bug. These two columns are what P1+P2 must bring into line; the weight column is the fixed point they calibrate around.)

**(B) Cross-dimension & structural invariants** — assert the relationships, not just point values. These are the checks whose *absence* let the bug hide:

1. **Mass↔volume↔projection coherence:** `tissue_vol == weight/0.00095` exactly; `projection` ∈ [0.7·r, 1.3·shape·r] of that volume's sphere radius. (Locks the spine.)
2. **Bust↔mass agreement (post-fix):** the cup implied by `bust−band` (at ~2.54 cm/cup) must be within ±1 cup of the cup implied by `volume` (via cc→cup), **for tiers ≤13**. *This is the single assertion that would have caught the original bug.*
3. **Monotonicity:** every continuous dimension strictly increases over t∈[0,260]. (Catches sign/coefficient flips.)
4. **Bounce-arm invariant:** `bounce == proj·proj_mult·damp` for representative tiers (documents §3.1 — fails loudly if someone "fixes" the dead cap into a binding one unintentionally).
5. **hang ≤ projection for t ≤ 133** (realistic-range guard; §3.5).
6. **Prose-band ↔ mass-band:** the COMPARATIVE rung at tier T must correspond to a hand-curated mass bracket (e.g. "head-sized" rungs require vol/side ∈ [2.5, 4] L). Pins prose to physics so a future projection-curve retune can't silently desync the narration.
7. **Letter round-trip:** `tier_letter_to_index(tier_index_to_letter(t)) == t` for t∈[0,300]; boundary cases (49,50,51,52,101,102) explicit.
8. **Capacity sanity (post-fix):** storage capacity should be driven by a per-character gland trait that is **independent of tier** (centered near the ~170 ml mean), per §2.2 — *not* a tier quadratic. The invariant to assert post-fix is the *decoupling* ("capacity does not change when only `tier_index` changes, holding the gland trait fixed"), not a fixed numeric band (a band would contradict size-independence and is what the current tier-derived values wrongly straddle).
9. **Bounds:** `posture_ratio ∈ [0, 0.95]`; `0 ≤ fill_percent ≤ 100`; all outputs finite & non-negative for any input incl. NaN/negative tier (the functions already clamp — assert it).

### 5.2 Suggested harness shape

Extend the existing node test runner (`test/run.sh`, already 202 assertions). Add `test/body_db.test.mjs` that imports the extracted functions and runs §5.1 (A)+(B). The two audit dumps already compute every needed value — converting them from `console.log` to `assert` is a few hours' work and gives the DB its first safety net. Run it in CI/`run.sh` so any coefficient edit is gated.

---

## 6. Recommendations — prioritized

### P0 — Install the anchor-test harness (§5)
Highest leverage, lowest risk. Without it, every fix below can silently regress. Seed from `research/body-db/_full_dump.mjs` + `_dims_check.mjs`. Encode the §5.1 golden values and invariants. **This is the durable fix for the *class* of bug, not just the instances.**

### P1 — Repair `bust_cm` (confirms & extends prior audit)
Per `research/body-math-audit.md` §6.1: replace `band + 2π·proj·coverage·circFactor` with a contribution anchored to real bust−band ≈ **2·projection** in A–G, modulated by a *small* shape spread (natural ~1.15, firm 1.0, gravity_defying ~0.85) instead of the 2π wrap, with a coverage ramp that only exceeds 1 in deep fantasy. The full-range error table (§2.1) confirms this must be a **re-derivation, not a rescale**. Target the §5.1 bust−band anchors. *(This is a continuation of the prior audit — not a new derivation.)*

### P2 — Re-anchor the displayed cup LETTER to volume (confirms prior audit)
Even with `bust_cm` fixed, `tier_index_to_letter` still labels an F-by-volume body "D." Derive the on-screen letter from the engine's **volume** via a cc→cup table (sister-size aware: smaller band ⇒ bigger letter), so letter, volume, and (fixed) bust−band all agree. Keep the raw `tier_index` as the internal scalar; the letter becomes a *presentation* of volume, not a relabel of the integer. **Use the prose ladder (§2.3) as the sanity oracle** — it already encodes a correct size-sense.

### P3 — Decouple lactation capacity from breast size (NEW, this audit)
**Priority note:** this is *design/future-proofing*, not a "users see a wrong number" emergency like P1 (`bust_cm`). In the realistic range the **magnitude** is plausible (t6 "D" = 254 ml, ~1.5× the human mean — in-range); the defect is the **size-coupling** (and the runaway magnitude only past the realistic band). So it ranks below the visible bust_cm/letter problems, but above cosmetic items.

`capacity_per_side_ml` should model **glandular storage**, which real data shows is **size-independent** (~170 ml mean; wide spread). Options: (a) make base capacity a **per-character trait** (a "milk producer" stat) largely independent of tier, with only a weak size coupling; (b) at minimum, drop the `frame_modifier` multiplier on capacity and flatten the quadratic so a realistic-range breast stores realistic milk. In fantasy, let capacity grow unbounded *but as an explicit "supernatural lactation" axis*, not as a claim about physiology. **Crucially**, audit the two call sites that feed capacity into `bust_projection_cm` and `weight_per_side_full_kg` so the milk contribution to geometry stays sane. Add the §5.1-B(8) capacity invariant.

### P4 — Remove/repair the dead bounce cap (NEW) + extend prose-ref ladders (NEW)
- Delete the inert `cap`/`tier_scale` arm of `bounce_amplitude_cm` (or make it bind in deep fantasy by design), and pin the behavior with invariant §5.1-B(4). (§3.1)
- Extend `projectionRef` and `hangRef` with 3–4 more rungs so environmental-scale sizes get distinct, escalating prose instead of one saturated phrase. Directly serves the core genre. (§3.2)

### P5 — Decide sensitivity's role (NEW)
Either document that `compute_sensitivity` is an *event spike* (and accept it's ~constant otherwise), or give size a gentle role so it isn't pinned at 1.0 for the common dry/settled case. Model after the (good) `compute_skin_tension` state machine. (§3.3)

### Architecture improvements (cross-cutting)
- **Move calibration into data, not comments.** The line-258 anchor points and every band threshold should be expressed as testable constants/fixtures, so intent is machine-checked.
- **Promote `bust_projection_cm`'s inline shape branches to a `SHAPE_PROJECTION_FACTOR` table** for consistency with every other shape-dependent function and easier tuning.
- **Separate "physical" outputs from "presentation" outputs** in `compute_body_snapshot`: the measurement core (weight/vol/proj/posture) is sound and should be the canonical truth; the *letter* and the prose are *renderings* of it. Making that split explicit prevents the labeling layer from drifting from the physics layer again — the structural root cause identified in §1.1.

---

## 7. What's missing / extensibility notes

- **No per-character lactation trait** (see P3) — the single biggest "missing axis": storage capacity, let-down, supply are all currently derived from size, which reality rejects.
- **No areola/nipple dimension.** A BE engine plausibly wants nipple/areola scaling (a common genre focus); currently absent. Cheap to add as another projection-derived geometric field with its own prose ladder.
- **No firmness/elasticity state beyond skin_tension's transient.** Skin tension is event-driven; there's no persistent "how firm is this size" property feeding projection/hang (it's baked into the `breast_shape` enum). Fine for now; a future axis.
- **Width/spread is implicit.** The model is essentially 1-D (one scalar → everything). Bust *width* (base footprint) and *separation* (cleavage) are derived only via projection. Real anthropometry (breast base width ~14 cm; §research) could anchor a width dimension; would improve the "as wide as her shoulders" prose claims.
- **Extensibility verdict:** the pure-function, single-scalar architecture is **genuinely good for extension** — new dimensions slot in as `f(tier_index, frame)` + a band table, exactly like the existing ones. The constraint isn't architecture, it's the *missing test net* (P0): without it, each new dimension is another place an un-cross-checked error can hide.

---

## 8. Conflicts with the prior audit

**None.** This audit **confirms** every prior finding:
- `bust_cm` bust−band ~2× too big → confirmed, and characterized across the *full* range (overshoot 2.5×→1.4×, worst in the realistic zone).
- Tier→letter ladder runs ~2 cups behind volume → confirmed.
- Weight/volume/projection spine sound and author-calibrated → confirmed; I extend the "sound" verdict to posture, milestones, and the prose ladder, which the prior audit didn't examine.
- Realistic-vs-fantasy line at ~G/tier-13 → adopted and applied per-dimension.

This audit **adds** (not contradicts): the lactation-capacity/size coupling defect (§2.2), the dead bounce cap (§3.1), the saturating prose-reference helpers (§3.2), the near-constant sensitivity (§3.3), and — the through-line — the **absence of any internal cross-validation** (§5), which is the structural reason the original bug was invisible. The one *reframe* (not a conflict): the prose-ladder "coarsening" at the top is by-design, and the prose ladder is actually a **well-calibrated asset** that should be used as the oracle for re-anchoring the letter.

---

## Appendix — sources

**New (this audit's dimensions):**
- Lactation storage capacity (~170 ml/breast mean, ±66 ml SD, wide between-woman spread, **size-independent** — the load-bearing fact): Kent & Hartmann, *Storage capacity of the human breast* (ResearchGate 352633738); Hartmann/Owens/Cox/Kent, *Breast Development and Control of Milk Synthesis* (J Hum Lact 1996, sagepub 10.1177/156482659601700404); LA Lactation "Normal Breastfeeding Facts" (lalactation.com); Nurture & Nourish Collective "Breastmilk Storage Capacity."
- Adult head dimensions (circumference ~55 cm female / 57 cm male; cranial *capacity* ~1.16–1.34 L; total head volume ~4–5 L by displacement): Wikipedia "Human head"; PMC4669896 (head circ ↔ intracranial volume); ScienceDirect S0303846708002096 (cranial capacity 18–22 yr).
- Breast projection / footprint anthropometry (nipple-to-IMF ~7.5–7.7 cm; breast base width ~14.3 cm): PMC6756646 (Saudi nulliparous); PMC5305059 (605 Asian patients); PMC12986069 (clinical footprint).

**Inherited (prior audit, cup/bust−band/weight/volume — unchanged):**
- bra-calculator.com (size charts, breast-weight-volume calc); hauteflair.com (34-band cc/cup table); thirdlove.com (size chart); Aesthetic Surgery Journal 2025/UCLA PMC12448591 (sister-size+BMI > cup letter for weight); laurengreenbergmd.com (cc/cup); tissue density 0.916–0.95 g/cc.

**Engine computations:** `research/body-db/_full_dump.mjs`, `research/body-db/_dims_check.mjs` (full-spectrum + state-machine probes), `research/_engine_calc.mjs`, `research/_geom_check.mjs` (prior audit) — all verbatim-extracted alpha52/Ambrosia functions run in Node.
