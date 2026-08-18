# 35 — D4 research: body-math depth for honest prose (in-app)

**Date:** 2026-07-17 · **Status:** RESEARCH COMPLETE — recommendation for Ben's D4 re-ruling.
**Question (research/31 status header):** Ben re-opened D4 because body math serves PROSE as well as
image gen — math living only in the si-animator-bridge "wouldn't benefit any of the generated prose"
(the app never calls the bridge during narrative turns). What derivation depth does honest narration
require inside the fork (`Projects/gaming/Aventuras`, `src/lib/services/be/`)?
**Candidates:** **(a)** thin tier→label tables (what Phase A ships) · **(b)** banded measurement
tables (approximate weight/capacity/size class per tier, no continuous physics) · **(c)** full port
of the NAI body-math spine (volume/weight/ptosis formulas).
**Verdict:** **(b), implemented as build-time baking of the validated NAI spine into generated
tables + two 1-D curves — not a runtime physics port.** Phase A's seam (`GroundingFacts` + pure
derivations) holds; it gains ~6 derivations and ONE new canonical input (`baseline.bandIn`).
**Evidence mined:** `be-story-engine/src/ambrosia.naiscript` v0.4.7 (the shipped emitter
`buildBodyEntryProse` + the full math spine, read at source) · the four live `[BE]` rules
(`_inbox/lucys-milk-migration/aventuras-import/lucy-s-milk.worldinfo.json`, extracted in
research/34 §6a) · body-database-spec.md · extreme-bust-realism.md · ladder-reanchor-proposal.md ·
31a §1.3/§2.3/lesson 10 · the fork's shipped `be/` module · the bridge's `src/prompt_builder.py`.

---

## 1. The decisive evidence: what prose ACTUALLY consumed

### 1.1 The shipped NAI block, field by field

The `<be-body-state>` authority the four `[BE]` rules command obedience to was, in the shipped
v0.4.7 engine, the `[BE] <name> — Body` lorebook entry written by `buildBodyEntryProse`
(ambrosia.naiscript:5948). Its complete output, with each field's true source:

| Line | Content | Source depth |
|---|---|---|
| Header | `{name} — current body: {letter}-cup (tier {n}), {bust_cm}cm bust, {kg}kg breast tissue.` | letter = table · **bust_cm + kg = the only continuous measurements emitted** |
| Size | the 51-band comparative description | **pure tier-band table** (ported to the fork verbatim) |
| Shape | `ptosis_descriptor(p_eff)` + `droopRef(droop, p_eff)` | **6-rung + 6-rung label ladders**, selected by the ptosis geometry |
| Posture | `posture_label; mobility_label` (+ clothing in the snapshot) | **9-rung label ladder** (`POSTURE_THRESHOLDS`), selected by the moment model |
| Lactation | `{fill}% full ({ml}ml capacity)` | fill = state · **capacity = 1-D curve** (`tissue_vol × 0.40`) |
| Weight feel | `weightRef(kg/side)` | **7-rung label ladder** keyed on kg |
| Proportion | `bodyPctNote(breast/body %)` | **6-rung label ladder** keyed on % |
| Approaching | `nextMilestone(snap)` teaser | 13-row milestone table, near-gated |
| Span | `widthRef(2×base_width)` | **4-rung label ladder** |
| Detail | `areolaRef(diameter)` | **3-rung label ladder** |

**The load-bearing observation:** with the entire validated spine live underneath it, the model
never saw the spine. It saw **band labels selected from ≤9-rung ladders, plus exactly three raw
numbers** (bust cm, tissue kg, capacity ml). The volume/ptosis/projection/moment machinery was a
*selector function into small quantized tables* — an information bottleneck. Any implementation
that lands each label in the same rung produces **byte-equivalent prose input** to the full spine.
That is what makes depth (b) sufficient *in principle*, not just cheaper: honesty at the prose
boundary is defined at rung resolution, because that is the only resolution the prose layer was
ever given.

### 1.2 Which inputs (besides tier) ever moved a rung

The spine's extra inputs matter to prose only where they can push a label across a rung boundary:

1. **`shape`/support** — the big one. It gates the entire hang channel (`droopRef` returns `''`
   below ptosis 0.30: a gravity-defying bust *never* reads "hangs", at any size; natural crosses
   around F-cup; firm only when truly large) and eases posture (moment model). Two-axis effect,
   fully representable as a (tier-band × shape) table.
2. **`fill_percent`** — full at `MILK_FRACTION 0.40`, density 1.03, adds **≈ +43% mass**
   (`fluid ≈ 0.434 × dry`), which moves `weightRef`/`bodyPctNote` about one rung and drives
   `skin_tension` → `engorged`. One multiplicative term on the 1-D mass curve.
3. **`height`/`build` (frame)** — `(H/165)^1.5` and build offsets. Static per character; folds
   into per-character constants at seed time. Second-order for rung selection.
4. **Conditions-driven support** (Featherlight Charm, Heaviness Curse) — shifts support ±0.3–0.8,
   i.e. can move a character between shape *columns* mid-story. The only genuinely dynamic input
   the table form can't interpolate — it can only snap to the nearest shape column. (Accepted
   cost; see §6 triggers.)

Nothing else in the spine (cleavage cm, bounce cm, projection cm, circumference composition) ever
reached narrative context as a number.

### 1.3 What the four `[BE]` rules demand, mapped

The rules (research/34 §6a; verbatim in the Lucy worldinfo) name their required fields explicitly.
Mapping each demand to the depth that satisfies it:

| Rule demand (verbatim fragment) | Satisfied by |
|---|---|
| "posture labels, mobility labels, and comparative descriptions are the ground truth" (R1) | **(a)** — Phase A ships all three |
| "render the scale change with mathematical honesty using the measurements … D-cup to an L-cup" (R2) | letter ladder **(a)** + before/after mass **(b)** |
| "If her mobility is 'mostly stationary unless supported'…" (R3) | **(a)** (the quoted string is derive.ts's tier-47 row) |
| "Characters with 'pronounced forward arch' posture cannot stand straight" (R3) | **(a)**-class label — but the quoted string is from NAI `POSTURE_THRESHOLDS`, *not* Phase A's distilled wording (see §3.4 calibration note) |
| "Characters whose breast mass exceeds their body weight cannot move without support" (R3) | **(b)** — needs mass + body-weight comparison (`bodyPctNote`'s upper rungs) |
| "the clothing label … 'requires custom' or 'impractical'" (R3) | **(a)** — shipped |
| "All bust measurements use US bra sizing (band 28-44, letter cups A–Z+). Never … 95E or centimeter cup measurements" (R3) | **(b)** — needs a stored US band + the derived letter → `"38X"`. **Notably: this rule makes cm circumference display-DEAD for prose** — the one continuous measurement the NAI header emitted in cm is the one the sizing convention forbids prose from using |
| "Bust circumference, breast tissue weight, posture labels, mobility labels, lactation state, and comparative descriptions are all computed from real math" (R4) | tissue weight + capacity = **(b)** 1-D curves; the rest = (a). "Real math" here is an authority claim (don't invent numbers), not a runtime-physics requirement — the block satisfied it with baked outputs |
| "Transformation attitude (craving/accepting/…)" (R4) | **out of D4 scope** — that's relMech (D2, Phase C) |

**No demand in the four rules requires depth (c).** Every named field is either a label ladder or a
1-D-in-tier quantity. The rules never ask for projection, hang *in cm*, cleavage, bounce, or
circumference-as-number — and their own sizing convention bans the metric form of the one
continuous size measurement.

### 1.4 The lesson-10 bound, and why the corpus already decoupled prose from literal math

31a lesson 10: the deep-math investment "paid off exactly once — when narration needed to stop
contradicting a coarse, honest read of the tracked size — and did not keep paying off as it got
more physically detailed beyond that point." This research confirms the mechanism behind that
bound: the payoff saturated **because prose consumption is quantized** (§1.1). More decimal places
never reached the model.

Two further corpus facts cap the value of literal in-app numbers:

- **body-database-spec §3.2 (ruled, Option A):** above ~tier 120 the prose was deliberately
  recalibrated **down to meet the physics** rather than the physics inflated to chase the prose —
  i.e. the top of the ladder is *authored register*, not measurement readout.
- **A residual, live inconsistency worth knowing about:** even inside v0.4.7's validated channels,
  the far-fantasy comparative bands make mass claims the weight quadratic doesn't literally support
  (`t92: "each outweighs her torso now"` = 22 kg/side vs a ~28 kg torso; `weightRef`'s own
  "outweighs her entire torso" rung fires at ≥60 kg/side ≈ tier 160). The harness pinned
  substrings, never cross-channel mass claims. Consequence for D4: **surfacing MORE raw numbers at
  high tiers would put the block in visible self-contradiction with its own comparative text.**
  Fewer, banded numbers are the *safer* honesty posture up there. (Flagged for the C6 register
  pass; a cross-channel canary is proposed in §3.5.)

---

## 2. The gap: Phase A (a) vs the honest-narration set

What Phase A ships (`ladder.ts` + `derive.ts`): cup letter (42-row table, C→ZZ+) · band word
(7 rungs) · the 51-band comparative · `groundingFacts(tier, shape)` = posture/mobility/clothing
(9 rows, gravity-defying escape hatch) · `tierForCupLetter` seeding. That already covers more than
half of §1.1's block.

**What (a) cannot produce, that the rules and the NAI block both carried:**

1. **Tissue weight** (raw kg + the `weightRef` feel-label) — R4 names it; R1's "weight pulls on
   posture" register leans on it; it's the before/after substance of R2's "mathematical honesty."
2. **Proportion** (`bodyPctNote`) — R3's mass-vs-body physics check has no carrier without it.
3. **The US sizing string** ("38X") — R3's convention; Lucy's canon size IS this string. Phase A
   can emit `X` but not `38X` (no band stored anywhere).
4. **The hang channel** (`droopRef`-equivalent) — the fork's comparative bands are **deliberately
   posture/hang-neutral** (ladder-data.ts's own P6c note: hang was split into the shape-sensitive
   `shape_descriptor`/`droopRef` channels so a supported bust at the same tier doesn't contradict
   the size text). Phase A ported the neutralized size text but **neither channel that was designed
   to carry what it deliberately omits.** Today a natural 38X and a gravity-defying 38X differ only
   in the static grounding-facts escape hatch — "hangs to her lap" vs "held impossibly high" is
   the single most genre-visible shape distinction and it has no *size-graded* carrier. This is
   the likeliest concrete narration-dishonesty complaint Phase A would have generated.
5. **Lactation capacity** (ml) — fill% is stored but "62% full" is unanchored without "of ~6 L";
   engorgement mass (+43% full) is invisible to the weight feel.

Items the NAI block carried that are **texture, not honesty** (defer, don't drop into Phase A):
the "Approaching:" milestone teaser (pacing candy — pairs naturally with Phase B's two-beat
anticipation), span/areola lines (flavor), sensitivity/skin-tension (event-driven state machines —
skin-tension rides Phase B fluids naturally, and its `engorged` rung is the one honesty-adjacent
piece).

---

## 3. Recommendation: depth (b) as build-time baking of the validated spine

**One sentence: run the depth-(c) spine ONCE, offline, at table-generation time — ship its
quantized outputs as data; runtime stays pure table lookups + two 1-D curves.** This is already the
fork's established pattern: `ladder-data.ts` is a generated snapshot whose header says exactly
"cup letters were baked by executing the NAI tier_index_to_letter (which rides the validated body
math)." D4-(b) extends that pattern to the remaining honest-narration channels instead of porting
the physics that computes them.

### 3.1 The derivation set (exact fields)

Additions to `be/` (all pure, all behind the existing seam; callers still only ever see derived
values):

```ts
// ── two 1-D curves (exact NAI constants — 5 numbers, not "the spine") ──
massKg(tier, fillPercent?): { dryTotalKg: number; nowTotalKg: number }
//   dry/side = (0.18 + 0.055·t + 0.002·t²) · frameMod   (frameMod = 1 at v1)
//   now = dry · (1 + 0.434 · fill/100)                  (fluid ≈ 43% of tissue mass at full)
capacityMlTotal(tier): number       // 2 × (dry_side_kg / 0.00095) × 0.40   (Kent-calibrated)

// ── label ladders keyed on the curves (ported rung tables, verbatim text) ──
massLabel(nowPerSideKg): string     // NAI weightRef, 7 rungs
proportionLabel(nowTotalKg, bodyWeightKg): string  // NAI bodyPctNote, 6 rungs
//   bodyWeightKg: per-character baseline (seeded once; NAI estimate formula's 2 constants + build mods come along)

// ── generated (tier-band × shape) table — the hang channel ──
hangPhrase(tier, shape): string     // droopRef text, '' for gravity_defying at every tier,
                                    // natural from ~tier 9, firm from ~tier 25 (baked p_eff gates)

// ── string assembly ──
sizingString(tier, baseline): string  // `${baseline.bandIn}${cupLetter(tier)}` → "38X"; US convention per rule 3
```

**The one canonical-state addition:** `baseline.bandIn?: number` (US band, e.g. 38) — a static
per-character *input* like `heightCm`, seeded from the card, never derived. Plus
`baseline.bodyWeightKg?: number` (or derive from height/build at seed). Everything else stays
derived-never-stored (31a §1.1 holds).

### 3.2 Example table rows (reference frame H=165; generated values, rounded)

Mass/capacity curve outputs at three anchor tiers (these are the *baked truth* the tables carry —
mass reproduces body-database-spec §1.1/§1.2 by construction; capacity follows the shipped P3
`MILK_FRACTION` formula, deliberately NOT spec §1.3's pre-fix quadratic table):

| tier | letter | sizing | band word | dry total | massLabel (per-side) | proportion (59 kg body) | capacity |
|---:|:--|:--|:--|--:|:--|:--|--:|
| 13 | G | 38G* | medium breasts | 2.5 kg | "heavy enough to ache when unsupported" | 4.0% → "a noticeable presence on her frame" | ~1.0 L |
| 31 | O | 38O | gigantic breasts | 7.6 kg | "too heavy to hold up with one hand" | 11.4% → "they are becoming more of her" | ~3.2 L |
| 47 | X | 38X | hyper breasts | 14.4 kg | "heavier than she can comfortably lift" | 19.6% → "she carries as much breast as body" | ~6.0 L |

*\* band stays the character's stored `bandIn`; shown with Lucy's 38 throughout.*

Fill moving a rung (the reason `now` exists): Lucy at tier 47, 100% full → 20.6 kg total → 25.9% →
proportion crosses into "she is more breast than woman now."

`hangPhrase` rows (generated from the v0.4.7 partition at reference frame; natural column shown —
firm shifts ~+15 tiers, gravity_defying is `''` everywhere):

| tier band (natural) | phrase |
|:--|:--|
| 0–8 | *(none — below the ptosis gate; p_eff crosses 0.30 at ~tier 9)* |
| 9–22 | "their lowest curve resting against her upper belly" |
| 23–42 | "hanging to her navel, their soft weight against her belly" |
| 43–75 | "hanging to her lap, their undersides meeting her thighs when she sits" |
| 76–124 | "hanging past her lap toward her knees when she sits" |
| 125–205 | "hanging to her knees, filling her lap when she is seated" |
| 206+ | "hanging past her knees, their undersides reaching the floor when she kneels" |

*(Boundaries interpolated from the §5.5 partition droop values — t20≈12 cm, t35≈20, t50≈28,
t82≈44, t120≈59, t165≈76 — against the droopRef rungs at 14/24/40/60/90 cm; the generation script
computes them exactly.)*

### 3.3 The assembled context block (what `beState_characters` renders per character)

```
Lucy — 38X (tier 47), hyper breasts.
Size: each a tower of warm flesh past any solo lifting, broader than her torso — less a part
  of her than the bulk she carries before her.
Carried mass: ~14 kg of breast tissue — heavier than she can comfortably lift; she carries as
  much breast as body.
Shape: natural — hanging past her lap toward her knees when she sits.
Posture: bowed beneath their mass; mobility: mostly stationary unless supported;
  clothing: impractical.
Lactating: 60% full (~3.6 L of ~6.0 L capacity) — swollen to ~18 kg with milk.
```

Every line is a lookup or a 1-D curve. This is field-for-field the honest subset of the NAI block
(§1.1) minus texture lines (span/areola/approaching), restated in the four rules' own vocabulary.
Locked characters additionally get the size-lock assertion (31 §2.3, unchanged).

### 3.4 Calibration notes (do these during the port, they're cheap)

- **Posture vocabulary parity:** rule 3 quotes `"pronounced forward arch"` — a NAI
  `POSTURE_THRESHOLDS` string that Phase A's hand-distilled rows don't contain (they say
  "permanent forward bow" etc.), while rule 3's mobility quote matches Phase A exactly. Pick ONE
  canonical label set when baking: recommend re-baking posture/mobility/clothing rows from
  `POSTURE_THRESHOLDS` via the moment model at reference frame (rung parity with the rules'
  quoted strings), and letting the C6 pack rewrite quote whatever the baked set says. The point is
  that the pack's quoted examples and the block's emitted labels must be the same strings.
- **Band-word calibration:** ladder-data.ts already flags that the NAI band-word boundaries differ
  from the bridge's `_KREA_TIER_NOUNS` by ~one band up high. D4 adds no new coupling — but the
  cross-calibration ruling it defers to should happen before the image seam switches from band
  words to `__betier__`-only.
- **Cross-channel mass-claim canary (new):** assert that no comparative band's literal mass claim
  contradicts `massKg` by more than the accepted poetic factor at that tier (encode the §1.4
  finding instead of rediscovering it). Also port the existing canary pattern to the new tables:
  monotonicity of `massKg`/`capacityMlTotal`, Kent floor at tier 0 (~76 ml/side), every
  `massLabel`/`proportionLabel`/`hangPhrase` rung reachable, `hangPhrase('gravity_defying') === ''`
  at every tier.

### 3.5 Effort

One session: constants + two curves (~40 lines), three rung tables (verbatim NAI text), the
hangPhrase generation added to the existing `extract-ladder.mjs` scratchpad script, `bandIn`
seeding in `metadata.ts`, block assembly in the context builder, canaries. No new architecture; no
touch outside `be/` + the already-planned context-builder method.

---

## 4. Why not (a); why not (c)

**(a) fails the rules it must serve.** §2's five gaps are not stylistic: tissue weight and the
mass-vs-body check are named by rules 3/4; the sizing convention needs a band; the hang channel is
the *designed carrier* of the shape distinction the comparative was deliberately stripped of.
Shipping (a) alone re-creates the pre-P6c NAI failure mode — size text that can't say whether she
hangs or floats — which is precisely a "concrete narration-dishonesty complaint" waiting to be
filed, and D4's original ruling said that complaint is the one thing that reopens the question.
It reopened before the app even shipped; resolve it now rather than in play.

**(c) buys nothing prose can see, and costs real things.**
- *No visible benefit:* every (c)-only output (projection cm, droop cm, p_eff, circumference
  composition, cleavage/bounce cm, moment ratio) reached prose only through the rungs (b) bakes —
  at rung resolution the two depths are **indistinguishable at the model boundary** (§1.1).
- *The banned number:* the single continuous size measurement prose could have used (bust cm) is
  forbidden by the corpus's own sizing rule (§1.3).
- *Register safety:* at far-fantasy tiers, literal numbers put the block in self-contradiction
  with the authored comparative register (§1.4) — the corpus already ruled prose-tracks-register,
  not raw measurements, up there (spec §3.2 Option A).
- *A third implementation:* the spine already exists twice (naiscript; the bridge's Python port —
  `prompt_builder.py` carries `_mass_per_side_kg`/`_bust_projection_cm`/`_bust_circumference_cm`/
  `derive_measurements` for its own beyond-ZZ image phrases). A live TS port makes a third copy to
  keep cross-calibrated forever; a *generated-table* copy is cross-calibrated once, at bake time,
  by construction.
- *Lesson 10 stands:* the payoff bound was reached early, and the bound's mechanism (quantized
  consumption) is now demonstrated, not just remembered.

---

## 5. What stays bridge-side (unchanged by this ruling)

The engine↔image contract does not move: the app emits band vocabulary (and the
`__betier_<N>__` marker via `sizeBandMarker.ts`); the bridge owns everything that turns tier into
pixels — `tier_to_cup_tag` noun banding, `tier_to_slider_weight`/`tier_to_hyper_concept_weight`
LoRA ramps, rebal thresholds/weights (research/32), and its own measurement derivations for the
beyond-ZZ image size phrase. The bridge's Python math port stays the *image-side* authority; the
app's baked tables are the *prose-side* authority; both are generated from the same v0.4.7 spine,
and the band-word ladder is the shared calibration surface (§3.4 note). Nothing in this ruling
adds an app→bridge call on narrative turns.

---

## 6. Migration cost if the seam later needs thickening (b → c)

The seam is exactly where 31 put it: callers see only derived values through `be/` pure functions.
ladder-data.ts's own header already documents the swap ("if the D4 research rules 'port the
physics', replace this table with the live functions"). Thickening later means: port ~250 lines of
pure functions + ~30 constants from the naiscript (already plain JS, hoisting-free, testable),
regenerate today's tables as golden fixtures, and swap table lookups for function calls **behind
unchanged signatures** — the context block, templates, panel, and image seam don't change at all.
Estimate: one focused session + a canary/golden session. Nothing shipped under (b) is throwaway:
the rung tables become the (c) port's golden tests.

**Triggers that would actually justify it** (absent these, don't):
1. Condition-driven support becomes a live mechanic (charms/curses re-shaping the same tier
   mid-story) and snapping to the nearest shape column reads visibly wrong in play.
2. Non-reference frames start mattering (a petite or very tall character whose rung selections
   read off by more than one band — check with the frame-modifier arithmetic before believing it).
3. A real narration-dishonesty complaint lands at a *rung boundary* the tables can't split.

---

## 7. Out of scope / adjacent, noted for sequencing

- **Transformation attitude** (rule 4's field) → relMech, D2/Phase C. The block gains that line
  when relMech exists; nothing in D4 blocks on it.
- **"Approaching:" milestone teaser + skin-tension** → Phase B (anticipation + fluids land there;
  skin-tension's `engorged` rung is the honesty-adjacent piece and is fill-driven).
- **Span/areola texture lines** → optional flavor whenever; not honesty-load-bearing.
- **C6 pack rewrite** (research/34 §6a) must quote the baked label vocabulary (§3.4) and carry
  the register discipline; the §1.4 cross-channel finding feeds its top-register wording.
