# Ambrosia Body-DB Audit — Weight, Volume & Capacity Scaling

**Date:** 2026-06-07
**Dimension:** breast **weight (kg)**, **tissue volume (cc)**, and **lactation/milk capacity (ml)** — and the **frame modifier** and **tissue density** that scale them.
**Scope:** the full tier ladder, realistic (A–G) **and** fantasy (H … Z … ZZ … beyond). Read-only audit of `src/ambrosia.naiscript` (verbatim port of alpha52).
**Companion:** `research/body-math-audit.md` (cup/bust−band/weight/volume, **realistic range only**). This report **extends** it across all ranges and revises its reality-boundary claim. See §8 for the reconciliation.

---

## TL;DR — verdict per sub-model

| Sub-model | Formula | Realistic range (A–G, t≈0–13) | Fantasy range (H+ , t≥13) | Call |
|---|---|---|---|---|
| **Tissue density** | `0.95 g/cc` (the *only* free parameter on the whole volume axis) | **KEEP** — between adipose 0.90 and fibroglandular 0.96; correct for fat-dominant tissue | KEEP (fantasy tissue is fat-dominant ⇒ if anything ≤0.95) | **KEEP** |
| **Tissue weight curve** | `0.18 + 0.055·t + 0.002·t²` kg/side | **KEEP** — author-calibrated, monotonic, ~1 cup heavy by label but physically a real breast | **KEEP through the documented-pathology ceiling** (holds inside gigantomastia resection range to ~t37–40); **falls SHORT of environmental scale above ~t120** | **KEEP (realistic) / FIX-TOP (deep fantasy)** |
| **Milk capacity curve** | `50 + 25·t + 1.5·t²` ml/side | **KEEP** — tiers 2–13 land inside Kent 2006 (74–382 ml/breast). Tier 0 (50 ml) dips just under the clinical floor | **REBUILD coupling** — milk is an *independent* quadratic, so milk/tissue volume drifts 26%→60% with no design rationale; at fantasy scale milk should track tissue, not outpace it | **KEEP (realistic) / REBUILD coupling (fantasy)** |
| **Frame modifier** | `(H/165)^1.5` | **KEEP as stylization** — not anthropometrically grounded (height is a weak real predictor of breast size; BMI/band dominate) but a reasonable, monotonic "bigger frame ⇒ bigger bust" lever | KEEP | **KEEP (with caveat)** |

**The one headline finding (fantasy):** weight/volume is **quadratic in tier**, so **linear size grows as t^(2/3) — sublinear.** The model therefore *cannot* "blow up"; the real failure at the top is the **opposite** — it **falls orders of magnitude short** of the prose it is paired with. At tier 200 the prose says *"room-filling, press against every wall"* but the computed volume is **96 L/side (192 L total) — a bathtub, not a room** (a small bedroom is ~21,600 L). The weight model and the `COMPARATIVE_DESCRIPTIONS` / `INTERACTION_MILESTONES` ladders **describe different-sized objects at the same tier** — the same class of internal contradiction the prior audit found in `bust_cm`, but located at the *top* of the ladder and pointing the *other* way (math < words). See §6.

---

## 1. The formulas (constants inlined)

Let `t` = tier_index, `H` = height_cm.

```
frame_modifier(H)            = (H/165)^1.5                     // 1.0 at H=165
base_weight_per_side_kg(t)   = 0.18 + 0.055·t + 0.002·t²       // kg, tissue only
weight_per_side_kg(t,H)      = base_weight_per_side_kg(t)·frame_modifier(H)
tissue_vol_per_side(t,H)     = weight_per_side_kg(t,H) / 0.00095   // cc  (density 0.95 g/cc)
base_capacity_per_side_ml(t) = 50 + 25·t + 1.5·t²             // ml of milk at 100% fill
capacity_per_side_ml(t,H)    = base_capacity_per_side_ml(t)·frame_modifier(H)
weight_per_side_full_kg      = weight_per_side_kg + capacity_per_side_ml·1.03/1000   // tissue + milk
```

**Critical structural fact (carried from the prior audit, and decisive here):** **volume is not independent of weight.** `tissue_vol = weight / 0.00095` *exactly*. So "validate volume per cup" collapses into "validate weight per cup" **plus** "validate the density constant." The density `0.95 g/cc` is the **sole free parameter** on the entire volume axis — validating it (──§2) carries the whole volume-axis claim; I do **not** present volume agreement as independent corroboration of weight.

---

## 2. Tissue density `0.95 g/cc` — **KEEP** (primary-source validated)

This single constant converts the (calibrated) weight curve into every volume in the engine. It must be right.

| Tissue | Density (g/cc) | Source |
|---|---|---|
| Adipose (fat) | **0.90 ± 0.02** | Spectral X-ray CT of mastectomy samples [Ding et al., arXiv 2302.06979] |
| Fibroglandular | **0.96 ± 0.02** | same |
| Whole breast (fat-dominant) | **~0.91–0.95** | blend; real breasts are majority adipose |

**Verdict: KEEP.** `0.95` sits at the **upper edge** of the plausible blend — it treats the breast as denser (more glandular) than a typical fat-dominant breast actually is. The practical effect is *conservative for volume*: a slightly **smaller** cc per kg than a pure-fat model would give (a pure-0.90 model would yield ~5.5% more volume per kg). For a fantasy product where breasts trend soft/fatty, if anything density could drift **down** toward 0.92 at high tiers — but the error is sub-6% and well within stylization latitude. No change needed.

> Note the engine uses `0.00095 kg/cm³` for projection and an implicit `1.03 g/ml` for **milk** (`DEFAULT_FLUID_DENSITY`, the density of human milk — correct: real human milk ≈ 1.03 g/ml). Both density constants are physically sound.

---

## 3. Tissue WEIGHT curve — realistic range (A–G) — **KEEP**

Engine output at the baseline frame (`H=165 ⇒ frame_modifier = 1.0`, isolating the quadratic), tissue only:

| tier | label | wt/side (g) | wt total (kg) | wt total (lb) | vol/side (cc) | per-step Δ wt/side (g) |
|---:|:--|--:|--:|--:|--:|--:|
| 0 | A | 180 | 0.36 | 0.8 | 189 | — |
| 2 | B | 298 | 0.60 | 1.3 | 314 | +61 |
| 4 | C | 432 | 0.86 | 1.9 | 455 | +69 |
| 6 | D | 582 | 1.16 | 2.6 | 613 | +77 |
| 8 | E | 748 | 1.50 | 3.3 | 787 | +85 |
| 10 | F | 930 | 1.86 | 4.1 | 979 | +93 |
| 12 | G | 1128 | 2.26 | 5.0 | 1187 | +101 |
| 13 | GG | 1233 | 2.47 | 5.4 | 1298 | +105 |

**Against real per-cup data:**

- **Weight.** Published per-breast weights (mid band): D ≈ 400–680 g, DD/E ≈ 550–680 g, F ≈ 680–820 g, G ≈ 820–1000 g [bra-calculator.com; Ithy summary; OliviaPaisley]. Engine tier 6 "D" = **582 g** → reads as a real **DD–E**, i.e. ~1 cup heavy *by label*. By the per-breast **gram** value alone it is squarely inside the real adult range. The +0.5-cup-to-+1-cup lean is the author's stated calibration, not an error.
- **Volume.** HauteFlair's 34-band cc/cup table: A≈230, B≈290, C≈340, D≈400, DD≈460, E≈510 cc; +~150–250 cc/cup is the implant-industry consensus (every 150–250 cc ≈ one cup) [PubMed 28445356; multiple implant guides]. Engine **per-step Δ volume is +60→+111 cc** across A–GG — i.e. **two engine tiers ≈ one real cup ≈ ~150 cc**, which is exactly the intended half-cup-per-tier resolution. Consistent.
- **Curve shape.** Although written as a quadratic, in A–G the `0.002·t²` term is tiny — per-step increments run a near-linear **+61 → +105 g/side**. This is a smooth, monotonic, gently-accelerating curve, which matches how cups scale (each successive cup adds slightly more volume than the last). **Good design.**

**Verdict: KEEP.** The realistic weight curve is author-calibrated, monotonic, physically a real breast, and only ~1 cup heavy *by label* (a deliberate fantasy lean). This **confirms** the prior audit's weight finding and adds the per-step-increment view: two tiers ≈ one real cup ≈ ~150 cc.

---

## 4. Milk / lactation capacity — realistic range — **KEEP** (with one coupling flag for fantasy, §5)

**Canonical clinical anchor — Kent et al. 2006** (*Pediatrics* 117(3):e387, "Storage capacity of the human breast"): storage capacity ranges **74–382 ml per breast, mean ≈ 180 ml** [Kent 2006; LA Lactation; LKN Breastfeeding]. Storage capacity is **not** tightly correlated with breast size (it tracks ductal/glandular volume, and women "carry more fat, not necessarily more milk lobules") — an important caveat the engine's strict size-coupling ignores, but acceptable for a game.

Engine `capacity_per_side_ml` at 100% fill (baseline frame):

| tier | label | milk/side (ml) | inside Kent 74–382? |
|---:|:--|--:|:--|
| 0 | A | 50 | **below** clinical floor (74) |
| 2 | B | 106 | ✅ |
| 4 | C | 174 | ✅ (≈ mean) |
| 6 | D | 254 | ✅ |
| 8 | E | 346 | ✅ (near ceiling) |
| 10 | F | 450 | just above clinical ceiling (382) |
| 13 | GG | 629 | fantasy zone |

**Verdict (realistic): KEEP.** Tiers **2–8 land squarely inside the measured human range**, with tier 4 "C" (174 ml) essentially on the Kent mean. The only realistic nit: **tier 0 "A" = 50 ml dips ~24 ml under the clinical floor** of 74 ml — a true A-cup lactating mother still stores ~74+ ml. A one-line fix would raise the constant `BASE_CAPACITY_CONST` from 50 → ~75 so even tier 0 starts at the clinical floor; minor, optional. Everything tiers 2–10 is excellent.

---

## 5. The milk-vs-tissue COUPLING problem — **REBUILD (fantasy)**

Tissue and milk are **two independent quadratics with different coefficients**:

```
tissue cc :  189 + ... (from 0.18 + 0.055t + 0.002t², ÷0.00095)
milk  ml  :   50 + 25t + 1.5t²
```

Because their quadratic terms differ (`0.002/0.00095 ≈ 2.1` cc-equivalent vs `1.5` ml), the **ratio of milk to tissue drifts with tier** with no design rationale:

| tier | label | tissue (cc) | milk (ml) | milk / tissue | milk as % of full volume |
|---:|:--|--:|--:|--:|--:|
| 0 | A | 189 | 50 | 0.26 | 21% |
| 6 | D | 613 | 254 | 0.41 | 29% |
| 13 | GG | 1298 | 629 | 0.48 | 33% |
| 20 | K | 2189 | 1150 | 0.53 | 34% |
| 30 | P | 3821 | 2150 | 0.56 | 36% |
| 50 | Z | 8347 | 5050 | 0.60 | 38% |

So a fully-engorged Z-cup is **60% milk by volume** vs an A-cup's 26%. There is no anatomical or narrative reason a larger breast should be *proportionally* more milk — fantasy hyper-lactation could justify *any* fraction, but it should be a **chosen, consistent** fraction, not an artifact of two curves with mismatched coefficients silently diverging.

**Recommendation (fantasy): REBUILD the coupling — make milk a fraction of tissue volume.**
```
capacity_per_side_ml(t,H) = tissue_vol_per_side(t,H) · MILK_FRACTION
//   MILK_FRACTION ≈ 0.40 reproduces the realistic anchor (tier 4–8 ≈ Kent range)
//   and holds the ratio constant into fantasy. For a hyper-lactation genre lean,
//   pick a deliberate higher constant (e.g. 0.6–1.0) — but pick ONE.
```
This keeps milk pinned to size at every scale, removes the silent drift, and still hits Kent in the realistic band (0.40 × 455 cc at tier 4 ≈ 182 ml ≈ the Kent mean; 0.40 × 189 cc at tier 0 ≈ **76 ml — already above the Kent 74 ml floor**, so this REBUILD **subsumes the §4 "raise BASE_CAPACITY_CONST" fix** — adopt one or the other, not both). **The realistic *values* are fine today; the *coupling law* is what should be rebuilt for fantasy consistency.**

**Design tradeoff (state it explicitly):** coupling milk to tissue volume is *less* real-world-faithful — Kent found storage capacity is **size-independent** (driven by ductal count, not fat) — but *more* genre-consistent (a hyper-lactation fantasy wants milk to scale with the breast). This is a deliberate "genre over anthropometry" call, not an oversight.

---

## 6. FANTASY RANGE — the headline analysis (volume in liters vs real objects)

The genre promise is growth "through fantasy and into environmental scale." The only honest test of whether the **weight/volume math delivers that** is to put the computed volume in **liters** and compare to real-object anchors, then cross-reference the **`INTERACTION_MILESTONES`** (weight-fired) and **`COMPARATIVE_DESCRIPTIONS`** (prose) ladders the engine ships. (Engine volume per side, baseline frame, tissue only.)

### 6.1 Volume vs real objects

| tier | label | vol/side (L) | wt/side (kg) | closest real object |
|---:|:--|--:|--:|:--|
| 20 | K | 2.2 | 2.1 | cantaloupe (~2.5 L) |
| 25 | MM | 3.0 | 2.8 | between cantaloupe and a human head |
| 30 | P | 3.8 | 3.6 | ≈ human head (~4–5 L) |
| 40 | U | 5.9 | 5.6 | ≈ basketball (~7 L) |
| 50 | Z | 8.3 | 7.9 | basketball+ (~7 L) |
| 60 | ZE | 11.2 | 10.7 | large watermelon (~12 L) |
| 90 | ZT | 22.5 | 21.3 | beach ball (~30 L) |
| 120 | ZZJ | 37.5 | 35.6 | larger than a beach ball |
| 165 | ZZZGG | 67.1 | 63.7 | **≈ whole adult human (~70 L)** |
| 200 | ZZZY | 96.0 | 91.2 | ~1.4 humans |
| 260 | ZZZZZE | 157.6 | 149.7 | **≈ one bathtub (~160 L)** |

**Object anchors (liters):** human head ~4–5 (whole head; *cranial* cavity alone is only ~1.3 L) · basketball ~7.1 · large watermelon ~12 · whole adult human ~66–75 · bathtub ~160 · refrigerator ~600 · small bedroom (3×3×2.4 m) **~21,600** · two-car garage **~85,000** [Measure of Things; BNID 109718; cranial vol Int J Anat Res 2018].

**Reading:** growth stays *physically coherent and plausibly mapped* all the way to ~tier 50 (basketball-sized, ~8 L) and remains evocative to ~tier 165 (where each breast ≈ a whole person, ~67 L). **The mid-fantasy band is genuinely well-calibrated.** The breakdown is only at the **extreme top**, where the prose claims architectural scale the volume never reaches.

### 6.2 Prose ladder (`COMPARATIVE_DESCRIPTIONS`) vs the volume at that tier

| tier | label | prose claim (verbatim sense) | vol/side (L) | reality check |
|---:|:--|:--|--:|:--|
| 25 | MM | "approaching the size of her own head" | 3.0 | **✅ MATCH** (head ~4–5 L) |
| 31 | PP | "larger than her head" | 4.0 | ✅ ~head |
| 35 | RR | "arms cannot reach around one" | 4.8 | ✅ plausible (~basketball) |
| 49 | YY | "wider than her shoulders" | 8.1 | ✅ basketball+ |
| 74 | ZL | "titanic… wider than shoulders, heavier than her torso" | 16.0 | ✅ heavier-than-torso holds (torso ~25 L/~25 kg) |
| 105 | ZZBB | "each outweighs her torso" | 29.5 | ✅ (≈30 kg > torso) |
| 120 | ZZJ | "a soft mountain of warm flesh" | 37.5 | ⚠ "mountain" is hyperbole at 38 L |
| 140 | ZZT | "fills the space a large chair would occupy" | 49.6 | ⚠ borderline (a chair envelope ~300–500 L) |
| 165 | ZZZGG | "her entire forward horizon" | 67.1 | ⚠ evocative, ≈ a person — OK as metaphor |
| 200 | ZZZY | **"room-filling — press against every wall"** | **96.0** | ❌ **~100–200× short** (room ~21,600 L) |
| 260 | ZZZZZE | **"building-scale — larger than the room she started in"** | **157.6** | ❌ **~100× short** (still just ~2 bathtubs) |

### 6.3 Milestone ladder (`INTERACTION_MILESTONES`) — what weight fires the claim, and the volume there

*(Confirmed by code: milestones fire on **total** breast weight — `check_milestones_crossed(prev_weight_total_kg, new_weight_total_kg)` at line 893 — which is `2 × weight_per_side_at_fill_kg`, i.e. tissue **plus** milk when lactating-and-full. The tiers below are the **empty/non-lactating** reference; a fully-engorged lactator crosses each milestone a few tiers earlier. Either way the top-end conclusion is unchanged.)*

| milestone (kg total) | claim | fires @ tier | total vol (L) | reality check |
|---:|:--|---:|--:|:--|
| 4.0 | "cannot see her own feet" | 20 (K) | 4.4 | ✅ |
| 6.0 | "cannot reach past them to touch her toes" | 27 (NN) | 6.6 | ✅ |
| 14.0 | "must turn sideways through standard doorways" | 47 (XX) | 15.1 | ✅ plausible |
| 20.0 | "cannot reach the ground past them" | 58 (ZD) | 21.3 | ✅ |
| 70.0 | "requires custom-built furniture to sit" | 119 (ZZII) | 73.8 | ✅ (≈ a second body) |
| 130.0 | "requires structural modifications to any room" | 167 (ZZZHH) | 137 | ⚠ 137 L is a bathtub, not "structural mods" |
| 180.0 | **"buildings cannot contain her"** | 199 (ZZZXX) | **190** | ❌ **190 L is a chest freezer, not a building** |

**The decisive internal contradiction (no external data needed, mirroring the prior audit's method):** the engine's *own* weight curve says "buildings cannot contain her" at **180 kg / 190 L total** — an object the size of a chest freezer. Its *own* prose says "room-filling" at tier 200. A room is ~20,000+ L. **The weight/volume model and the qualitative ladders are describing objects ~100× apart in size at the same tier.** Below ~tier 120 they agree beautifully; above it the **words outrun the math** by a growing margin that reaches two orders of magnitude.

### 6.4 Why — and the fix

**Why:** quadratic weight ⇒ `volume ∝ t²` ⇒ **linear dimension ∝ t^(2/3)**. To get from a basketball (~14 L total, t≈45) to a small room (~21,600 L) is ~1,500× in volume ⇒ tier must scale by ~√1,500 ≈ 39× ⇒ roughly **tier ~1,750** for a room and **many thousands** for a building. The ladder only goes to a few hundred. **A quadratic structurally cannot reach environmental scale within a few-hundred-tier ladder** — it would take thousands of tiers. This is the opposite of "blowing up": it is the source of the "falls short" problem. (Exact figure aside, the order of magnitude — thousands of tiers vs the ladder's few hundred — is the load-bearing point.)

**Two clean options — both KEEP the realistic/mid-fantasy curve untouched and only act above ~tier 120:**

- **(A) Accept the prose as hyperbole-by-design (lowest-effort).** Declare that above ~tier 120 the `COMPARATIVE_DESCRIPTIONS` are *poetic*, not literal volume claims, and **soften the top three milestone strings** so the *literal* claims ("buildings cannot contain her") aren't contradicted by the engine's own 190 L. e.g. retune the 180 kg milestone text to "*requires custom architecture — no standard furniture or vehicle can hold her*," which 190 L *does* satisfy. This removes the internal contradiction without touching the math.

- **(B) Add a super-quadratic top regime (if literal environmental scale matters).** Splice a steeper law in above a fantasy threshold so volume actually reaches room scale where the prose says so:
  ```
  if (t <= T_FANTASY)  weight = 0.18 + 0.055t + 0.002t²          // unchanged
  else                 weight = weight(T_FANTASY) · exp(k·(t − T_FANTASY))   // geometric blow-up
  ```
  A geometric (exponential) top regime is the *only* shape that lets a bounded ladder span basketball → room → building. Calibrate `k` so the tier where the prose says "room-filling" actually computes to ~20,000 L. This is more work and changes the high-tier physics by design — only worth it if the user wants the numbers (not just the prose) to deliver environmental scale.

**My recommendation:** **(A) for now** — it is a string-only change, removes the contradiction, and the math is already excellent through tier ~165 (whole-person scale), which is enormous. Reserve **(B)** for if/when the user explicitly wants literal room/building **measurements** rather than literal-person-scale plus poetic prose beyond it.

---

## 7. Frame modifier `(H/165)^1.5` — **KEEP as stylization**

The task flags `frame_modifier` as part of this dimension because it multiplies every weight, volume, and capacity. Two questions: is it *anthropometrically* grounded, and does it behave sanely across ranges?

- **Grounding: weak, by reality's own measure.** Real data shows **height is a poor predictor of breast size**; band circumference and BMI dominate (the UCLA 2025 study found *sister-size + BMI* predict breast weight far better than cup letter, and height is not the lever) [PMC12448591]. So `(H/165)^1.5` is **not** a fitted anthropometric law — it is a designer's "taller frame carries proportionally more" stylization.
- **Behavior: sane.** At H=150 it's 0.87×; at H=180 it's 1.14×; at H=200 it's 1.33×. Monotonic, smooth, modest spread, never negative or explosive. The `^1.5` (super-linear) choice means a tall character's bust grows a touch faster than height alone — a reasonable aesthetic, and it interacts correctly with the rest of the chain (it scales weight, which scales volume and projection consistently).

**Verdict: KEEP, with a one-line doc caveat** that it is an aesthetic frame-scaling lever, not a fitted height↔bust correlation (so nobody later "validates" it against anthropometric tables and finds it wanting — it isn't trying to be that).

---

## 8. Reconciliation with the prior audit (`body-math-audit.md`)

The prior audit and this one **agree** on every shared point and this report **extends + revises one boundary claim**:

1. **Agree — density & volume axis.** Both find `0.95 g/cc` correct and note volume is locked to weight (not independent). I add the **primary-source bracket** (adipose 0.90 / fibroglandular 0.96) that pins `0.95` as a high-but-valid blend.
2. **Agree — realistic weight curve is sound** (KEEP), ~1 cup heavy by label. I add the **per-step increment** view (two tiers ≈ one real cup ≈ ~150 cc) and the implant cc/cup citation.
3. **Agree — milk is fine in the realistic band.** I add the **Kent 2006 hard numbers** (74–382 ml, mean ~180) that confirm it, flag tier 0's 50 ml as just under the clinical floor, and surface a **new** issue the prior audit didn't cover: the **milk/tissue coupling drift** (26%→60%), recommending REBUILD-as-fraction for fantasy.
4. **⚠ REVISE — the reality boundary is NOT "above G."** The prior audit framed "everything from tier ~13 (G+) upward" as fantasy-by-design. By **weight**, that's too low: clinical **gigantomastia resection runs 1,500–7,550 g per breast (mean ~2,554 g, extreme cases to 7+ kg)** [PMC10402957; PMC3807584; PubMed 23542843]. The engine doesn't reach 1,500 g/side until **tier ~16**, mean-gigantomastia (~2,554 g) at **tier ~23**, and the 7+ kg extreme not until **tier ~47**. So the weight axis stays inside **documented (pathological) human reality to ~tier 23, and inside the most extreme recorded human cases to ~tier 40–47** — *far* above "G" (tier 12). "Fantasy-by-design" by **weight** should be dated to roughly **tier 24+ (post-mean-gigantomastia)**, not tier 13. This *strengthens* the engine: its mid-tiers are grounded in real gigantomastia data, not pure invention. (And the boundary is **conservative**: resection weight is *tissue removed*, not the full pre-op breast — the real breasts were heavier than the resected gram figures, so the true human ceiling sits a little above the tiers cited here.)
5. **New — the fantasy *top* fails the other way.** The prior audit's concern was the realistic end (bust_cm too big). This report's concern is the **deep-fantasy end**: the quadratic's t^(2/3) linear growth makes volume **fall ~100× short** of the prose/milestone ladders above ~tier 120 (§6). Same *internal-contradiction* method, opposite direction.

**No conflict with the prior audit's verdict on its own scope.** The only revision is widening the realistic/fantasy boundary from "G" to "~mid-gigantomastia (tier ~24)" on the **weight** axis, backed by clinical resection data the prior audit didn't pull.

---

## 9. Consolidated recommendations

**KEEP unchanged:**
- Tissue density `0.95 g/cc` and milk density `1.03 g/ml` (both primary-source validated).
- The tissue weight quadratic `0.18 + 0.055t + 0.002t²` — realistic *and* mid-fantasy (grounded in gigantomastia data to ~tier 40).
- Milk capacity *values* in the realistic band (tiers 2–10 ≈ Kent).
- `frame_modifier (H/165)^1.5` as an aesthetic lever (add a doc caveat, §7).

**FIX (small, optional):**
- Raise `BASE_CAPACITY_CONST` 50 → ~75 so tier 0 milk meets the Kent clinical floor (§4).
- Soften the top ~3 `INTERACTION_MILESTONES` strings (≥130 kg) so their *literal* claims aren't contradicted by the engine's own ~190 L (§6.4 option A). String-only.

**REBUILD (fantasy consistency):**
- Re-express milk capacity as a **constant fraction of tissue volume** (`MILK_FRACTION ≈ 0.40` reproduces the realistic anchor) so milk tracks size at all scales instead of drifting 26%→60% (§5).

**DECISION FOR THE USER (deep fantasy, >tier ~120):**
- Either **(A)** accept `COMPARATIVE_DESCRIPTIONS` above ~tier 120 as poetic and soften the few literal-scale milestone strings (recommended), **or (B)** add a geometric/exponential top regime so the numbers literally reach room/building scale where the prose says so (§6.4). A quadratic alone *cannot* reach environmental scale within a few-hundred-tier ladder — that is a structural fact, not a tuning nit.

---

## Appendix — sources

- **Tissue density:** Ding et al., "Characterization of breast tissues in density and effective atomic number basis via spectral X-ray CT," arXiv:2302.06979 (adipose 0.90±0.02, fibroglandular 0.96±0.02 g/cm³).
- **Gigantomastia resection weights:** Medial-pedicle Wise-pattern review, PMC10402957 (gigantomastia mean 2554±421 g, range 1500–7050 g/breast); Reduction mammoplasty for gigantomastia, PMC3807584; 12-yr superomedial-pedicle study, PubMed 23542843 (totals 2.2–10 kg, mean 4.71 kg); extreme case 7550 g total / 8.41% body weight; juvenile case 5800 g total. Gigantomastia defined as >1500 g resection per breast.
- **Milk storage capacity:** Kent, Mitoulas, Cregan, Ramsay, Doherty & Hartmann (2006), *Pediatrics* 117(3):e387 ("Storage capacity of the human breast"; 74–382 ml/breast, mean ~180 ml); LA Lactation; LKN Breastfeeding Solutions (storage capacity not size-correlated). Human-milk density ~1.03 g/ml.
- **Per-cup volume / implant cc per cup:** HauteFlair 34-band cc/cup table; PubMed 28445356 + implant-sizing guides (Careaga, Koo, divine cosmetic, the private clinic) — every 150–250 cc ≈ one cup.
- **Per-cup breast weight:** bra-calculator.com breast-weight-volume calculator; Ithy summary; OliviaPaisley; **UCLA 2025, PMC12448591** (sister-size + BMI predict weight far better than cup letter or height).
- **Real-object & body volumes:** Human body mean volume ~66–75 L (BNID 109718, bionumbers.hms.harvard.edu); NBA basketball ~7.1 L, bathtub ~160 L (themeasureofthings.com); cranial volume ~1.13–1.33 L female/male, whole head ~4–5 L (Int J Anat Res 2018, 6(2.2):5181).
- **Engine computations:** verbatim-extracted alpha52/Ambrosia functions run in Node (`/tmp/wv_calc.mjs`, `/tmp/fantasy_check.mjs`; methodology identical to the prior audit's `research/_engine_calc.mjs`).
