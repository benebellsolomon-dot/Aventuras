# Ambrosia Body-DB Audit — Biomechanics: Posture, Mobility, Interaction Limits, Sensitivity

**Date:** 2026-06-07
**Subject:** the biomechanics dimension of `src/ambrosia.naiscript` (verbatim port of alpha52) — `posture_ratio` (~638), `posture_labels` / `POSTURE_THRESHOLDS` (~385, ~655), `estimated_body_weight_kg` (~627), `breast_mass_body_pct` (~696), `INTERACTION_MILESTONES` (~289) + their consumers `nextMilestone`/`check_milestones_crossed` (~823, ~893), `compute_sensitivity` (~834), `compute_skin_tension` (~859).
**Scope:** validate each axis against real anthropometric / clinical data (cited), then **design the fantasy escalation** (H/I/J … Z/ZZ and beyond) so the genre's "can no longer X" beats stay internally consistent. Extends — does not repeat — `research/body-math-audit.md` (which covered cup/bust/weight/volume and explicitly *punted* on posture).
**Method:** engine outputs are the **verbatim functions run in Node** (`research/body-db/_biomech_calc.mjs`), not hand math. Reference frame throughout: height 165 cm, build `curvy` (→ body 62 kg), shape `natural` (posture shapeFactor 1.25), no lactation, unless noted.

---

## TL;DR — verdict per axis

| Axis | Engine status | Call |
|---|---|---|
| `breast_mass_body_pct` (mass / (body+mass)·100) | Physically correct ratio; the right master variable | **KEEP** |
| `estimated_body_weight_kg` denominator | Sound magnitude, but **double-counts** breast mass into a whole-body figure that already includes it | **FIX (minor)** |
| `posture_ratio` driver | **Mass-only.** Ignores the moment arm (projection) that real biomechanics says is the actual driver | **REBUILD (moment-based)** |
| `POSTURE_THRESHOLDS` low bands (A–G) | **Over-pathologizes** — flags "minor forward tilt" at DD; clinical data says standing posture is statistically unaffected through surgical macromastia | **FIX (raise low thresholds)** |
| `POSTURE_THRESHOLDS` mid/high bands | Good label *content*; escalation curve is plausible **once re-keyed to moment** | KEEP labels / re-key driver |
| `INTERACTION_MILESTONES` weight-keyed (stand/furniture/architecture) | Genuinely weight/load-driven — correct axis | **KEEP** |
| `INTERACTION_MILESTONES` spatial (see feet, touch toes, doorway, chair) | **Mis-keyed to weight** — these are *geometry* (projection/volume), not mass | **FIX (re-key to projection/volume)** |
| `compute_sensitivity` growth-surge + lactation terms | Well-designed, fire in the right ranges | **KEEP** |
| `compute_sensitivity` extreme-size term `max(0.7, 1−t·0.001)` | **Inert** — never leaves "normal" until ~tier 200; ~10× too weak for the playable band | **FIX (recalibrate scale)** |
| `compute_skin_tension` | Event-driven (growth velocity + engorgement), not size — correct design, no real-world conflict | **KEEP** |
| Top-end saturation (tier > ~128) | Posture maxes out; rest of the 260-tier ladder reads identical | **FIX (optional far-fantasy bands)** |

**One-line thesis:** the engine models postural load as **mass ÷ body-mass**, but real spinal load is a **moment = mass × forward distance from the spine**. The engine already computes that forward distance (`bust_projection_cm`, blessed as sound by the prior audit) and then *throws it away* in `posture_ratio`. Re-introducing it is the single highest-value structural fix and the key that makes the fantasy range self-consistent.

---

## 1. The engine, measured (verbatim functions, baseline frame)

### 1.1 How the chain is wired

```
estimated_body_weight_kg(H, build) = max(20, 0.4·H − 8 + BUILD_WEIGHT_MODS[build])     // 62 kg @165/curvy
total_breast = 2 · weight_per_side_kg(tier, H)        // (+ milk if lactating)
posture_ratio = min(0.95, [ total_breast / (body + total_breast) ] · SHAPE_POSTURE_FACTOR[shape])
breast_mass_body_pct = [ total_breast / (body + total_breast) ] · 100     // same ratio, ×100, UNshaped, UNbounded
```
`posture_labels` bins `posture_ratio` through the 10-band `POSTURE_THRESHOLDS`. `INTERACTION_MILESTONES` are read off **total breast weight in kg** independently of posture. Sensitivity and skin-tension are independent again. So there are **three parallel "how big is too big" axes** (posture-ratio, milestone-kg, sensitivity-tier) that never reference each other — a structural smell flagged in §6.

### 1.2 Full-ladder sweep (the numbers that drive every call below)

| tier | letter | breast total kg | breast/body % | posture_ratio | posture label | active milestone |
|---:|:--|--:|--:|--:|:--|:--|
| 0 | A | 0.36 | 0.6 | 0.007 | unaffected | (none) |
| 6 | D | 1.16 | 1.8 | 0.023 | unaffected | (none) |
| 8 | E | 1.50 | 2.4 | 0.029 | **minor forward tilt** | (none) |
| 10 | F | 1.86 | 2.9 | 0.036 | minor forward tilt | can't go braless |
| 13 | GG | 2.47 | 3.8 | 0.048 | noticeable forward lean | can't go braless |
| 20 | K | 4.16 | 6.3 | 0.079 | pronounced forward arch | can't see her feet |
| 30 | P | 7.26 | 10.5 | 0.131 | profound permanent arch | can't touch toes |
| 40 | U | 11.16 | 15.3 | 0.191 | profound permanent arch | embrace-press |
| 50 | Z | 15.86 | 20.4 | 0.255 | spine bowed | doorway-sideways |
| 60 | ZE | 21.36 | 25.6 | 0.320 | structurally dominated | can't reach ground |
| 80 | ZO | 34.76 | 35.9 | 0.449 | body secondary to breasts | can't stand unaided |
| 100 | ZY | 51.36 | 45.3 | 0.566 | vestigial beneath their mass | can't fit a chair |
| 150 | ZZY | 106.86 | 63.3 | 0.791 | body exists only as origin | custom furniture |
| 200 | ZZZY | 182.36 | 74.6 | 0.933 | body exists only as origin | architectural |
| 260 | ZZZZZE | 299.36 | 82.8 | 0.950 (capped) | body exists only as origin | architectural |

**First-entry tiers** (curvy/natural): minor tilt @ **tier 7 (DD)**, noticeable lean @ 12 (G), pronounced arch @ 20 (K), profound arch @ 29 (OO), spine bowed @ 42 (V), structurally dominated @ 55, body-secondary @ 73, vestigial @ 98, "body exists only as origin" @ **tier 128 (ZZN)** — and nothing changes for the remaining 130+ tiers.

---

## 2. Real-world reference data (cited)

### 2.1 Breast mass as a fraction of body weight — the master calibration

This is the single most useful external anchor, because it tells us *where reality ends*:

- **Gigantomastia clinical threshold: total breast mass > ~3% of body weight.** This is the cited definitional cutoff for the most severe diagnosable category. [Cleveland Clinic; Wikipedia "Breast hypertrophy"; ScienceDirect "Redefining gigantomastia"]
- **Documented extreme real case: 9.3% of body weight** (4.9 kg of breast tissue removed, 2.6 + 2.3 kg). The most extreme recorded resection was **17.2 kg** (Turin, 2008). [Wikipedia "Breast hypertrophy"]
- Typical (non-pathological) breast mass per side is **~0.5 kg**: reduction-mammoplasty/mastectomy specimen means cluster at **511 g** (median 478, range 126–1975 g, n=395) and **522–545 g** in other series; tissue density **0.95–0.98 g/mL**. [PMC12448591; PMC3227377; PMC6635214]

**What this validates:** the engine's `breast_mass_body_pct` axis is the *correct* master variable, and its numbers land the real-world milestones almost perfectly:
- engine reaches **3% (gigantomastia)** at **tier ~10–11 (F/FF)** — i.e. the engine's "F-cup" is exactly the real clinical boundary of severe hypertrophy. Sound.
- engine reaches **9.3% (most-extreme-recorded)** at **tier ~24–25 (M)**, ~5.3 kg total — matching the real 4.9 kg case. Sound.
- everything **above tier ~25 / ~10%** has **no real-world referent at all** — it is pure fantasy and must be *designed*, not validated. This is the realistic/fantasy boundary for this dimension. (Note it sits *higher* on the ladder than the cup-label boundary the prior audit drew at ~G/tier 13 — by the load axis the body stays in documented-human territory up to ~M.)

### 2.2 The decisive finding: in the realistic range, big breasts barely change standing posture

The genre intuition "big breasts → hunched, forward-arched posture" is **weaker than expected in the clinically realistic range**, and this is well-documented:

- **Breast-reduction posture study (n=42 patients, mean 1,111 g removed per the resection range 312–2,155 g; 37 controls):** preop back-inclination 1.61°±3.66 ventral vs control 0.28°±4.18 dorsal; postoperative change only **0.89°** and **not significant (p=0.104)**. Regression: inclination depended on **BMI alone, not cup size or macromastia status.** Authors' conclusion: the postural differences were "**too small to account for** the development of back pain." [PMC3785590, *The Effect of Breast Hypertrophy on Patient Posture*]
- **Postmenopausal kyphosis study (n=44, bra sizes 10A–22E):** **no** correlation between breast size and thoracic kyphosis (r=0.20, p=0.20). BUT thoracic *pain* did correlate with breast size (r=0.46, p=0.002) and localized T7/T8 tenderness (p=0.007/0.02), with breast size the only significant independent predictor of pain. [PMC3704920]
- The broader literature is genuinely **mixed** on the kyphosis link (some series find cup size raises kyphotic angle; the rigorous controlled ones above do not), but converges on: macromastia reliably produces **pain and soft-tissue symptoms** (bra-strap grooving, neck/back/shoulder pain — reported at 91/53/45% in macromastia cohorts), and *correlates with* but does not cleanly *cause* gross postural change in the standing human range. [Springer s00266-022-03141-w; ACR macromastia/kyphosis/fall-risk abstract]

**Implication for the engine (realistic band, A–G):** the right narrative output is **ache, strain, bra-dependence, soft-tissue symptoms — NOT visibly altered posture or mobility loss.** The engine's "minor forward tilt at DD (tier 7)" and "noticeable forward lean at G (tier 12)" **over-state** what the data supports. The realistic range should read *unaffected posture / aching tissue*, with visible postural change reserved for the fantasy band where mass leaves the human envelope.

### 2.3 Why posture *should* eventually collapse — the moment-arm principle

Spinal/cervical load is governed by **torque (moment) = force × moment arm**, not force alone. The canonical quantification is Hansraj's cervical-spine model: a ~5 kg (10–12 lb) head generates **~5 kg** of load neutral, but tilting it forward raises the effective load to **27 lb @15°, 40 lb @30°, 49 lb @45°, 60 lb @60°** — i.e., load **multiplies as the mass moves forward of the spine**, roughly *+10 lb per inch of forward offset.* [Hansraj, *Surg Technol Int* 2014; applegatewellness.com PDF mirror]

Breast mass sits **anterior to the thoracic spine**, and its moment arm is exactly `bust_projection_cm` (distance the center of mass sits forward of the chest wall). So the true postural load is:

```
spinal_moment  ∝  breast_mass × projection_distance
```

Both factors **balloon with tier** in the engine (mass quadratically, projection as a cube-root of volume × shape). Their product escalates **super-linearly** — which is exactly the curve the fantasy genre wants, and it arises **with no arbitrary constants**, purely from quantities the engine already computes. This is the backbone of the rebuild in §4–5.

### 2.4 Sensitivity at extreme size — direction is right, the genre/clinical basis

- Reduction-mammoplasty and macromastia literature report **reduced nipple/breast sensation at very large sizes** (stretched cutaneous nerves; sensation often *improves* after reduction) — so the engine's design intent ("dulled at extreme scale") is **directionally correct.** [reduction-mammoplasty sensation literature, consistent with the engine comment "nerve endings stretched thin"]
- Conversely, **engorgement/lactation and rapid stretch raise sensitivity** (tension on mechanoreceptors) — also matching the engine's lactation/growth-surge multipliers.

So `compute_sensitivity`'s *shape* is defensible; only the extreme-size *coefficient* is wrong (§3.5).

---

## 3. Per-axis findings & calls

### 3.1 `breast_mass_body_pct` — **KEEP**
The ratio `mass/(body+mass)·100` is physically meaningful and, per §2.1, its numbers line up with the real gigantomastia (3%) and most-extreme (9.3%) anchors at sensible tiers. It is the right master variable for the whole dimension. The `bodyPctNote()` prose ladder (~813) is well-graded. No change.

### 3.2 `estimated_body_weight_kg` denominator — **FIX (minor, honesty)**
`0.4·H − 8 + build_mod` gives 62 kg @165/curvy — a reasonable whole-woman weight. Two issues:
1. **Double-count.** `posture_ratio`/`body_pct` compute `total_breast / (body + total_breast)`, but `body` (a whole-body weight) *already includes* a normal woman's ~1 kg of breast tissue. At small sizes the error is sub-1%; by tier 50 (~16 kg added on top of a body that baked in ~1 kg) it's negligible-to-modest. Cleanest fix: subtract a baseline breast allowance, `body_lean = estimated_body_weight_kg − BASELINE_BREAST_KG`, then `ratio = total_breast / (body_lean + total_breast)`. Low priority but worth a comment.
2. **Frame sensitivity is weak.** At fixed tier 13, `posture_ratio` barely moves across builds (petite 0.058 → full 0.047) because heavier builds add body weight *and* (via `frame_modifier`) breast weight, nearly cancelling. That's defensible, but means "frame" does little work in the posture axis — fine to leave, note it.

### 3.3 `posture_ratio` driver — **REBUILD (moment-based)**
This is the core structural finding. `posture_ratio` is **mass-ratio only**; it never references projection. Per §2.3 that is the wrong physics: a *dense, compact* 14 kg bust (low projection) and a *pendulous, far-projecting* 14 kg bust load the spine very differently, yet the engine scores them identically. The engine **already computes the missing term** (`bust_projection_cm`, blessed sound by the prior audit). Recommended driver:

```
// moment arm normalized so the realistic range ≈ today's behavior
moment = total_breast_kg · (projection_cm / PROJ_REF)        // PROJ_REF ~ 6 cm (a real D/DD depth)
load_index = moment / (body_lean + moment-equivalent)         // keep a bounded 0..~1 ratio for banding
```
Net effect: in A–G (projection 3–7 cm) `load_index ≈` the current mass ratio (so the realistic range is unchanged after the §3.4 threshold fix); in the fantasy range, where projection runs to 20–90+ cm, the load escalates *faster* than mass alone — giving the "spine bowed / structurally dominated" bands a real driver instead of a hand-tuned mass cutoff. The `SHAPE_POSTURE_FACTOR` (natural 1.25 / firm 1.0 / gravity_defying 0.65) then reads correctly as a **moment modifier** (pendulous shapes have longer arms — exactly why "natural" should load the spine more, "gravity_defying" less). It is currently applied to a mass ratio, where it's just an unexplained fudge; on a moment it becomes physically motivated.

### 3.4 `POSTURE_THRESHOLDS` low bands — **FIX (raise A–G)**
Per §2.2, real standing posture is statistically unaffected through surgical macromastia. The engine flags **minor forward tilt at tier 7 (DD, ratio 0.026)** and **noticeable lean at tier 12 (G)** — too aggressive. Recommendation: lift the first two `ratio_max` cutoffs so the entire **A–G band (tiers 0–13, < ~4% body mass / < ~2.5 kg) reads `unaffected` posture**, and let that band's *flavor* come from ache/strain/bra-dependence (the §2.2 pain finding) rather than a posture label. Keep the mid/high band **labels** (their content is good and the fantasy range is the point); only the entry tiers need to move up, and once §3.3's moment driver is in, the high bands re-key onto a sounder curve automatically.

### 3.5 `compute_sensitivity` extreme-size term — **FIX (recalibrate); rest KEEP**
The growth-surge (×1.5 within 3 gens, ×1.2 within 6) and lactation (×1.3/1.5/1.8 by fill) multipliers are well-designed and fire in the playable range. But the extreme-size reducer `base *= max(0.7, 1 − tier·0.001)` is **inert**: it only reaches the `dulled` band (≤0.8) at **tier ~200**, and bottoms out (0.7 floor) at **tier 300** — both far past any playable size (typical play 8–60). So the "nerve endings stretched thin at vast scale" effect the genre wants **never actually triggers**. Per §2.4 the *direction* (reduced sensation at huge size) is clinically correct; only the scale is wrong — the coefficient is ~5–10× too weak. Recommendation: make the reducer bite in the fantasy band (e.g. begin meaningful reduction by tier ~30–40 and floor by ~tier 80), and/or key it to skin-tension/projection so a hugely *stretched* breast reads `dulled` while a freshly *grown* one reads `hypersensitive` (the two already-present surge terms then create a satisfying arc: rapid growth → hypersensitive; long-settled vastness → dulled).

### 3.6 `compute_skin_tension` — **KEEP**
Correctly **event-driven** (growth velocity Δtier + lactation engorgement), not size-driven. This matches reality (skin tension is about *recent* stretch and internal pressure, not absolute size — a long-settled large breast has accommodated). No real-world conflict; good as is.

### 3.7 `INTERACTION_MILESTONES` — **SPLIT: keep the load ones, re-key the spatial ones**
The milestone table is keyed entirely to **total breast weight (kg)**. But the entries fall into **two physically distinct classes**, and only one of them is actually weight-driven:

| milestone | true driver | engine key | call |
|---|---|---|---|
| can no longer go braless comfortably (1.5 kg) | mass (load on straps/tissue) | kg | **KEEP** |
| cleavage visible in any neckline (2.7 kg) | volume/projection | kg | re-key → projection/volume |
| cannot see her own feet when standing (4.0 kg) | **projection** (occlusion) | kg | **FIX → projection** |
| cannot reach past them to touch toes (6.0 kg) | **projection** | kg | **FIX → projection** |
| her lap disappears beneath them seated (7.5 kg) | volume/projection | kg | re-key → volume |
| breasts press between bodies on embrace (10 kg) | projection/volume | kg | re-key → projection |
| must turn sideways through doorways (14 kg) | **bust width / volume** | kg | **FIX → width/volume** |
| cannot reach the ground past them (20 kg) | projection + hang | kg | re-key → projection |
| cannot stand unaided for extended periods (30 kg) | **mass × moment** (load) | kg | **KEEP** (load) |
| cannot fit in a standard chair (45 kg) | **volume/footprint** | kg | re-key → volume |
| requires custom-built furniture to sit (70 kg) | volume + load | kg | **KEEP-ish** (load+bulk) |
| structural modifications to any room (130 kg) | volume + load | kg | **KEEP** (load) |
| architectural accommodation (180 kg) | volume + load | kg | **KEEP** (load) |

The "can't see feet / can't touch toes / sideways through doorway / can't fit a chair" beats are **geometric occlusion and bulk**, not weight. Two bodies of equal mass — one dense/compact, one light/voluminous — clear a doorway or occlude the feet *very* differently. Because the engine already produces `bust_projection_cm`, `cleavage_depth_cm`, `hang_drop_cm`, and (per the prior audit, with a `bust_cm` caveat) a bust width, these milestones should fire off **projection/volume thresholds**, while the genuinely load-bound beats (braless, can't-stand, furniture, architectural) stay on **kg**. This is the strongest *structural* recommendation in this dimension after §3.3, and it directly serves the genre's "can no longer X" mechanic by making each beat fire for the right *reason*.

> **Do NOT anchor any of these to `bust_cm`.** The prior audit found `bust_cm` ~2× geometrically inflated. Anchor every geometry milestone to **`bust_projection_cm` or volume** (the axes that audit blessed). Otherwise this dimension inherits that bug.

---

## 4. Realistic vs. fantasy — the split (this dimension)

| | Realistic (validated against data) | Fantasy (designed, no real referent) |
|---|---|---|
| **Tier band** | 0 – ~25 (A through ~M); load ≤ ~9–10% body mass | ~25+ ( > M ), load > 10% body mass |
| **Real anchor** | gigantomastia ≥3% body mass (tier ~10); extreme recorded 9.3% / 4.9 kg (tier ~25); 17.2 kg max ever removed | none — pure genre construction |
| **Posture** | statistically *unchanged* standing posture (PMC3785590); symptoms = **ache, strain, bra-dependence, soft-tissue pain** (PMC3704920) | progressive visible arch → spine bowed → structurally dominated, **driven by moment = mass × projection** (§2.3) |
| **Sensitivity** | normal, modulated by growth-surge & lactation | growth → hypersensitive; long-settled vastness → **dulled** (stretched nerves) — but only if §3.5 is recalibrated to bite here |
| **Interaction limits** | "can't go braless" (real, ~1.5 kg); cleavage/neckline | the full "can't see feet → doorway → chair → custom furniture → architectural" ladder — **each keyed to its true driver** (occlusion/bulk = geometry; standing/furniture = load) |
| **Skin tension** | event-driven by growth velocity & engorgement — same model both ranges | same model (correctly size-agnostic) |

**Design principle for the fantasy band:** keep it **mechanistically continuous** with the realistic band — same formulas (moment for load, projection/volume for geometry), just evaluated at out-of-human magnitudes. That is what makes "she can no longer turn to fit through the door" feel *earned* rather than arbitrary: it's the same occlusion math that, at human scale, merely says "her cleavage shows in this neckline."

---

## 5. Recommended fantasy-escalation model (concrete)

A four-regime ladder, each regime with a distinct **dominant driver**, so escalation is continuous and self-justifying:

1. **A–G (tiers 0–13) — Symptomatic, posturally intact.** Load < ~4% body mass. Posture label `unaffected`; narrative pressure = ache, heaviness, bra-dependence (`weightRef`/pain flavor). *Real-data-matched.*
2. **G–M (tiers 13–25) — Clinical-extreme, real arch begins.** Load ~4–10% (gigantomastia → most-extreme-recorded). Moment now bends posture: `forward lean → pronounced arch`. Geometry milestones start firing (feet occluded, toes unreachable) off **projection**, not weight. *Edge of real data; the believable transition zone.*
3. **M–Z (tiers 25–50) — Mid-fantasy, moment-dominated.** No real referent. `spine bowed → structurally dominated`. Load index driven by **mass × projection** (super-linear). "Sideways through doorways," "can't reach the ground" off **width/projection**. Sensitivity reducer (recalibrated) makes huge-but-settled breasts read `dulled`.
4. **Z+ (tiers 50+) — Far-fantasy, bulk/footprint-dominated, load transfers OFF the spine.** Once breasts are self-supporting (resting on floor/lap/furniture — engine `hang_drop_cm` exceeds standing clearance), spinal *moment* plateaus (the mass is held by the ground, not the spine), and the binding constraint becomes **volume/footprint**: furniture, room, architecture. This is the principled reason the top milestones (`custom furniture` 70 kg, `architectural` 180 kg) are correctly **load+bulk**, and it also fixes the **top-end saturation** (§ below): add 2–3 far-fantasy posture bands above tier ~128 keyed to *displacement/footprint* ("occupies the room," "a landmark," "environmental feature") so the back third of the 260-tier ladder isn't a dead "body exists only as origin" plateau.

**Top-end saturation (FIX, optional):** today every tier above ~128 maps to the same posture band and (above ~199) the same milestone. For a ladder that runs to 260+ with `ZZ`-and-beyond letters, add far-fantasy bands so growth keeps *reading* as growth — but key them to **environmental footprint**, not the (already maxed) spinal-load axis.

---

## 6. Cross-axis structural note (improvement, all ranges)

The three "too big" axes — **posture_ratio**, **milestone-kg**, **sensitivity-tier** — are computed independently and can **disagree**: posture is shape-aware, milestones are not; sensitivity's size term floors at a tier the other two never reach. After the fixes above they would share drivers (moment for load, projection/volume for geometry), which would make them **mutually consistent** instead of three parallel guesses. Recommend a single derived `load_index` and `geometry_index` feeding all three. This is the analog, in this dimension, of the prior audit's "one broken axis (`bust_cm`) contradicts the mass core" finding — here it's *three under-coupled axes* rather than one contradictory one.

---

## 7. Conflict with the prior audit (surfaced per task)

The prior `body-math-audit.md` lists, under "Keep unchanged," **"posture/body-pct."** This report **partially overturns that** — and the distinction matters:

- That audit's scope was the **cup-label / circumference** complaint; it explicitly said posture/body-pct "are **not the subject of the complaint** and are not faulted here." That was a **scope punt, not a validation** — it passed posture by *not examining it*.
- On examination: **`breast_mass_body_pct` does hold up** (§3.1) — so the audit's instinct was half-right. But **`posture_ratio` does not**: it leans entirely on mass, **discards the projection it already computes**, and **over-states the realistic range** (flagging postural change at DD that controlled clinical data says isn't there). So the "keep posture" line should be read as **"keep `body_pct`; rebuild `posture_ratio`'s driver and re-key the spatial milestones."**

No numerical contradiction with the prior audit's computed values (the weight/volume/projection chain it validated is the same one this report builds on). The divergence is purely about **what was in scope**: this dimension was looked at, and it needs work the earlier pass didn't claim it didn't.

---

## Appendix — sources

- **Posture / macromastia clinical:**
  - *The Effect of Breast Hypertrophy on Patient Posture* — PMC3785590 (n=42 reduction patients + 37 controls; 312–2,155 g removed; postural change 0.89°, p=0.104, **n.s.**; BMI-driven not cup-driven).
  - *Breast size, thoracic kyphosis & thoracic spine pain (postmenopausal)* — PMC3704920 / chiromt.biomedcentral.com 10.1186/2045-709X-21-20 (n=44; **no** kyphosis–size link r=0.20; **pain**–size link r=0.46, p=0.002).
  - *The Effect of Breast Size on Spinal Posture* — Springer Aesthetic Plastic Surgery s00266-022-03141-w.
  - ACR abstract — *Correlation Among Macromastia, Spinal Pain, Thoracic Kyphosis and Fall Risk*.
- **Moment-arm / spinal-load physics:**
  - Hansraj KK, *Assessment of Stresses in the Cervical Spine Caused by Posture and Position of the Head*, Surg Technol Int 2014 (head load 27/40/49/60 lb at 15/30/45/60°; ~+10 lb per inch forward — the moment principle).
- **Breast mass as % body weight / gigantomastia thresholds:**
  - Cleveland Clinic *Gigantomastia* (my.clevelandclinic.org/health/diseases/23191); Wikipedia *Breast hypertrophy* (>3% body weight = gigantomastia; documented 9.3% / 4.9 kg case; 17.2 kg max resection); ScienceDirect *Redefining gigantomastia* / *Gigantomastia — a classification*.
- **Breast weight / density / predictors:**
  - *Sister Bra Size Group and BMI Are More Indicative of Breast Weight Than Cup Size* — PMC12448591 / academic.oup.com/asj 45/10/1017 (n=395; mean 511 g, range 126–1975 g; sister-size ρ=0.76 > cup ρ=0.67 > BMI ρ=0.61).
  - *Weight versus volume in breast surgery* — PMC3227377 (mean 545 g / 509 mL; density ~0.98 g/mL). *Reduction Mammaplasty: What Cup Size Will I Be?* — PMC6635214.
- **Engine outputs:** `research/body-db/_biomech_calc.mjs` (verbatim alpha52/Ambrosia biomechanics functions run in Node).
