# 31a — The BE Engine: Portable Specification

**Purpose.** This is a platform-independent SPEC of what the breast-expansion (BE) genre engine
must DO, distilled from three prior implementations: the NovelAI `.naiscript` era
(`code/be-story-engine/`), the SillyTavern Era-1 hand-coded extension
(`code/ambrosia-st/legacy/extension/`), and the SillyTavern Era-2 MVU-based stack
(`code/ambrosia-st/st-content/be-module/`). It is the input to `research/31`, the design doc for
re-implementing the engine natively inside **Aventuras**, a Tauri/Svelte interactive-fiction app
(source-available; Ben maintains a fork, `be-patches`).

**Tagging convention.** Every element below is tagged:

- **CORE** — the engine is not the engine without this. Port the behavior (not necessarily the code).
- **VALUABLE** — proven to earn its keep across at least one era; port if the new platform makes it cheap.
- **PLATFORM-SPECIFIC** — an artifact of NovelAI's or SillyTavern's mechanics. Do not port the
  mechanism. Each one names the *problem it solved*, because that problem is usually still real and
  the new platform needs its own answer.

**Scope note.** This document describes behavior, not history. Version numbers, changelog entries,
and the sequence of fixes across eras are deliberately excluded from sections 1–10 — they live in
§12 ("Top 10 hard-won lessons") as lessons, not as narrative. Where a concrete number appears
(a threshold, a cap, a formula constant), it is a **reference default** carried over from a
prior implementation, not a locked requirement — §11 flags which of these need Ben's re-derivation
for the new target game before they're trustworthy.

---

## 1. Character body-state model

### 1.1 The central design lesson, stated first

Every prior era's worst bug came from the same root cause: a **derived** display value (a cup
letter, a circumference in cm) was allowed to live as if it were independent, hand-tunable data,
so it drifted out of agreement with the **canonical** scalar that actually defines the character's
size. The NAI era shipped a bust circumference formula that was ~2x too large relative to its own
weight model for a long time because *nothing cross-checked the two against each other* — no
assertion tied bust to weight, prose to mass, or capacity to volume. The fix that mattered was not
any one formula; it was **collapsing the state to one canonical scalar and making everything else a
pure function of it**, then testing the cross-dimension relationships (a "canary" invariant) so a
future edit to one formula can't silently desync another.

**This must be a first-class design constraint in the new implementation, not a lesson learned the
hard way a second time:** exactly one canonical numeric field drives size; every displayed cup
letter, measurement, comparative-prose band, and image size-phrase is a pure, tested derivation
from it. Nothing derived is ever independently stored or independently editable.

### 1.2 CORE canonical fields (the minimal per-character state)

| Field | Type / range | Notes |
|---|---|---|
| `tier` (or equivalent scalar) | integer, unbounded above, 0 floor | **The single canonical size driver.** Everything cup/measurement/prose/image-related derives from this one number. See §2 for the exact ladder question (unresolved between eras — §11). |
| `shape` | enum: `natural` \| `firm` \| `gravity_defying` (+ room for named magical variants) | Drives the projection/hang/cleavage/bounce derivation and the `magical_support` read. CORE — genre prose leans on it constantly ("held high, no sag" vs "hangs, pendulous"). |
| `magical_support` | derived float [0,1], not stored | A genre-appropriate escape hatch: some characters are magically/physically braced against gravity. Computed from `shape` plus active `conditions` (a Buoyancy Charm, a Heaviness Curse), capped at 1 (never *reverses* gravity). VALUABLE — cheap, and it's the thing that lets "gravity-defying at any size" read as consistent instead of contradicting itself at extreme tiers. |
| `fluid_state` | per fluid type: `{ fill_percent: 0-100, fluid_type }` | See §5. CORE — lactation/fullness is definitional to the genre, not optional. |
| `conditions[]` | `{ label, note, ttl? }` | Freeform tags (Lactating, Growth-Suppressed, Outfit-Straining, Aroused, Jealous…). Entries with a `ttl` decay per-turn and expire; entries without one are permanent (body/magical-support conditions) and must **never** be swept by a generic "decay everything with a ttl" pass — use an explicit allow-list of which labels are transient. CORE. |
| `relMech` (relationship-mechanics triple) | see §6 | Attitude/comfort state, relationship-stage state, and a derived consent mode. CORE that a mechanism like this must exist; the *exact shape* is a live cross-era contradiction — §11. |
| `baseline` (height, waist, build) | numeric / enum | Feeds derived-measurement formulas (a taller/curvier frame reads bigger at the same tier). VALUABLE, not CORE — a fixed default per character is an acceptable v1 cut. |
| `pending_growth` / two-beat anticipation state | transient, cleared same-or-next turn | Lets a growth beat be foreshadowed one turn ("she feels a warmth building...") before it lands, instead of a flat surprise-every-time cadence. VALUABLE — genre pacing texture, cheap to keep. |

### 1.3 DERIVED fields — never store, always recompute

Cup letter, bust/band circumference or equivalent measurement, cleavage/hang/bounce/posture
descriptors, the comparative-prose band ("more than a handful" / "gigantic yet still flesh she
carries on her own body"), and the image-generation size phrase are **all** pure functions of
`{tier, shape, fluid_state, magical_support, baseline}`. None of them is ever independently edited,
independently persisted with its own drift risk, or computed by more than one code path. If two
places in the codebase both need "her cup letter," they call the same function.

**Deep body-math (cm/kg/volume, weight-density-projection derivation, ptosis geometry) is
VALUABLE-but-heavy, not CORE.** The NAI era invested very heavily here (a multi-week, multi-agent
research and rebuild effort) and the payoff was real but bounded: narration reads as "honest" once
it matches a coarse band and a lived-in comparative description — it did **not** meaningfully
improve once the underlying physics got more realistic than that. The minimum that keeps narration
honest is: **the canonical tier scalar + a coarse band descriptor (flat/small/medium/large/huge/
gigantic/hyper) + one or two derived "grounding" facts** (does it hang or sit high; can she still
see her feet). Recommendation: keep the full weight/volume/projection/ptosis math **server-side**
(in the image-generation bridge, where it already partly lives per the Aventuras evaluation,
`research/30` §6) rather than porting it into the client/story-app. Only port it client-side if a
concrete complaint about narration dishonesty resurfaces — it was the *only* thing that ever
justified the investment historically (see §12, lesson 10).

### 1.4 PLATFORM-SPECIFIC: the storage/undo wrapper

How canonical state is persisted, versioned, and restored on retry/undo is entirely a function of
the host platform's save model (see §9). It is not part of the body-state model itself.

---

## 2. The tier ladder

### 2.1 What must exist

A **band vocabulary** the narration and the image bridge both key off: flat chest → small → medium →
large → huge → gigantic → hyper (the image bridge already maps phrases like "huge breasts" from
this vocabulary — see §10). This is CORE. A finer **cup-letter ladder** for narrative texture
(A/B/C/D/DD/…/Z/ZZ+) is VALUABLE — it reads better in prose than a bare band name, but the band
vocabulary is what actually has to stay honest; the letter is decoration on top of it.

### 2.2 Exact boundaries — two incompatible ladders exist; this is a live contradiction

Both prior implementations built a full letter ladder, and **they do not agree with each other**
past the DD anchor. Neither is "more correct" — they were separately calibrated for separate
purposes (one calibrated against real bra-size cc-charts, the other calibrated for an MVU
stat-field's clean 0–35 integer range). Reproduced here for the decision in §11:

**NAI/alpha52-derived ladder** (`UK_CUP_LADDER`, 46 letters):
`AA A B C D DD E F FF G GG H HH J JJ K KK L LL M MM N NN O OO P PP Q QQ R RR S SS T TT U UU V VV W WW X XX Y YY Z ZZ`
— anchored at two calibration points, **G = tier 13** and **Z = tier 50** (chosen as the
"real-gigantomastia onset," ≈8 L total volume), with the letters between interpolated off those
anchors (not a flat "2 tiers per cup" rule — the spacing tightens above G). Below G the ladder
runs roughly 1.4 tiers/letter; tier 0 reads as a "C" (not "A" — the engine's own weight floor
already masses a C at tier 0, a deliberately-surfaced product decision, not a bug). Past Z, the
prose hands off to named environmental-scale descriptors rather than more letters.

**Era-2 (MVU stat-field) ladder** (`CUP_LADDER`, 36 entries, index 0–35):
`AAA AA A B C D DD DDD/E F G H I J/K+ L M N O P Q R S T U V W X Y Z ZA ZB ZC ZD ZE ZF ZZ ZZ+`
— a flat integer index with no gigantomastia-volume anchoring; **DD = index 6** (agrees with the
NAI ladder by coincidence at the low end), but **H = index 10**, **Z = index 27**, **ZZ = index 34**,
**ZZ+ = index 35 (hard cap)**. Past index ~11 the image-bridge booru tag saturates ("gigantic
breasts, hyper breasts") and further magnitude is carried by a continuous LoRA-strength ramp, not
by more vocabulary.

**Recommendation:** neither ladder as-is is the right default — reconcile them along two
independent dimensions rather than adopting one wholesale. **Granularity:** the canonical scalar
should stay finer than one-step-per-cup-letter (the NAI ladder's ~2-tiers-per-cup below the G
anchor), not Era-2's one-index-per-letter — a coarse 1:1 scalar collapses exactly the
canonical/derived split §1.1 is built on (if one index *is* one letter, the letter isn't derived
from anything finer, it's just relabeled), and finer granularity is what let the NAI implementation
express a "+1 that holds the current letter but moves the cm" — the slow-burn texture §4's pacing
floor is designed around. **Boundedness:** Era-2's hard cap at index 35 is easier to range-validate
on a schema-first platform, but sits in tension with an explicitly open-ended-growth genre goal;
the NAI ladder's answer (a fixed letter table that hands off to open-ended named/environmental
descriptors past its last letter, riding a scalar that is never capped) is closer to genre-correct.
**Net recommendation:** an unbounded-above (or very generously bounded) canonical scalar at
NAI-like sub-cup granularity, with a bounded *derived* letter-lookup table (saturating into named
tiers past its last letter, exactly as both prior letter ladders already do) — this keeps
validator-friendliness on the derived display value without giving up canonical granularity or the
open-ended ceiling. **This is still Ben's call, not a default to silently take** — see §11.

### 2.3 Deep body-math: what's the minimum that keeps narration honest

Restated from §1.3: the canonical scalar plus a coarse band descriptor plus one or two grounding
facts (does it hang, can she reach past it) is sufficient. Full weight/volume/projection/ptosis
math is VALUABLE-but-heavy and belongs server-side (the image bridge), not in client narrative
state, unless a concrete narration-dishonesty complaint justifies porting it.

---

## 3. Growth resolution

### 3.1 Trigger sources (CORE — all four must exist)

1. **Player action** — an explicit in-fiction action the player takes that plausibly causes growth.
2. **Catalyst events** — a character-specific, card-defined trigger (e.g., "climaxing inside her"
   for one character, a specific ritual for another). Each character declares her own catalyst;
   the resolution mechanism is shared.
3. **Story/world pressure** — a background accumulator that eventually forces a growth beat even
   without a clean trigger, so pacing never fully stalls (see §4).
4. **Oracle/world events** — unpredictable, GM-style events (not player- or catalyst-driven) that
   can *propose* growth but must route through the same gate as everything else (next point).

### 3.2 The single-writer law — CORE as a *behavior*, a spectrum as a *mechanism*

**The invariant that must hold regardless of platform:** there is exactly one code path that is
allowed to actually change canonical body state, and every other system (world actions, oracle
events, background pressure, relationship events) can only **propose or enqueue** a growth intent
that the one path resolves, gates, and caps. This is what makes "no unauthorized growth" a
structural guarantee instead of a hope.

**How strictly this is *enforced* is a spectrum, and it moved every time the platform changed:**

- **NAI/Era-1 (hard single-writer):** literally one function may write growth state; every other
  system calls `enqueueGrowthIntent(...)` into a queue that function drains next turn. No exceptions.
- **Era-2 MVU (schema-validated propose/commit):** the LLM *proposes* a patch every turn; a
  schema validator (Zod) clamps ranges and can reject the patch, but the model itself decides
  *when* and *how much* within legal bounds — softer than hard single-writer.
- **Aventuras native (LLM-inferred + range-clamped classifier):** a per-turn classifier extracts
  and range-clamps runtime-variable values from narrative; there is no engine-level cadence
  control at all — the softest tier, and the one with no built-in resistance to overshoot.

**This is a decision Ben has to make explicitly** (§11, item 3), because Aventuras is a fork with a
real code surface — the hard single-writer / intent-queue pattern from Era-1 is portable *as actual
code* if it's worth the build cost, or the softer native model can be kept and leaned on harder via
the mitigations in §3.4/§8. Do not silently default to the softest tier just because it requires no
new code — that was exactly the failure mode that produced the magnitude-overshoot bug (§12,
lesson 6).

### 3.3 Judging

A growth attempt is resolved by a **check against a locked, formula-derived difficulty**, decided
*before* the roll (never re-rolled, never adjusted after the fact):

- NAI/Era-1: a d100 BRP-style check with an outcome band (critical/strong-success/success/fail).
- Era-2: a D20 check against a locked DC = `base + stage_modifier + pressure_modifier + desire_modifier`.
- Aventuras-native equivalent: no dice concept exists; the nearest analogue is the classifier's
  extraction confidence plus explicit template-authored gating logic (e.g., "do not raise
  CupSizeIndex unless the narrative just depicted a successful growth-triggering event").

**CORE requirement, platform-independent:** the difficulty must be a **deterministic function of
current relationship/pressure state**, computed once, before resolution — not something the LLM is
asked to freely invent per turn. Whatever the platform's dice/check primitive is (or isn't), wire
the DC/threshold formula into it or into the gating instructions given to the model.

### 3.4 Magnitude rules

- Growth per successful beat is **small and capped** (+1 typical, +2 on a critical success), never
  unbounded per-turn.
- The delta should be **outcome-banded** (critical → cap; strong/success → 1; partial/fail → 0),
  not scaled continuously off the roll margin — continuous margin-scaling was tried and produced
  runaway jumps (multiple cup letters in a handful of turns); outcome-banding plus a cooldown was
  the fix that stuck.
- A **cooldown** between growth-eligible beats on the same character prevents back-to-back growth
  even if two triggers land in quick succession.

### 3.5 Anti-overshoot: magnitude-scaled narration directives (CORE, genre-inherent)

A distinct failure mode from "did growth happen at all": **the delta was tracked correctly but
rendered with the same maximal drama language regardless of size** — a same-genre +1 delta got
narrated as "watermelons... beach balls" because the directive gave every delta the identical
"SWELL LARGER, clothing strains, CENTER of the scene" emphasis. **The fix is structural, not a
one-off prompt tweak:** the narration directive must scale its own intensity language by the actual
magnitude of the delta just applied — small deltas get subtle/incremental/exact-and-capped
language; only genuinely large deltas earn dramatic language. This must hold **at every tier**,
including deep-fantasy tiers, via a tier-gated "register" (a top-of-range vocabulary — e.g. room- or
landscape-scale comparisons — reserved for genuinely top-of-range sizes, not unlocked early).

### 3.6 Size locks (CORE — the user-facing anti-overshoot control)

A per-character, player-toggleable **hold** that freezes growth for that character until released.
It must have **two independent enforcement halves**, because a prose-only hold is not reliable
enough on its own:

1. **Mechanical hold** — at the single resolution funnel (wherever §3.2's one legal write path
   lives), a locked character's delta is forced to zero *before* any roll/outcome logic runs, and
   this hold **overrides even an otherwise-guaranteed growth trigger** (an explicit story-critical
   growth event still gets muzzled if the character is locked — the user's hold wins).
2. **Prose hold** — the narration directive independently asserts the character's exact current
   size every turn while locked, so the model doesn't "round up" in prose even when no mechanical
   growth occurred.

This replaces the failure-prone alternative of the player hand-typing counter-prompts ("keep her at
DD, no exceptions") into the input box — those bleed into rendered prose on completions-style
models and are themselves a source of narration contamination (§12, lesson 5's sibling problem).
**A locked character must also be invisible to the pacing floor** (§4) — a deliberate hold means
"the story does not owe this character growth right now," so pressure should not accrue against her
while locked.

---

## 4. Pacing (the pressure floor)

### 4.1 The problem it solves

If growth only happens via a passed check, a character can go many turns without ever landing a
growth beat purely on bad luck (or, on a schema-first platform, purely because the model didn't
happen to narrate a growth-triggering scene) — pacing goes dead and the genre's core promise stalls.
The pressure floor is a **pity-growth mechanism**: it doesn't replace the check-based path, it
guarantees the check-based path isn't the only way growth can happen.

### 4.2 Minimal portable form (CORE)

- A per-character (or per-arc) accumulator, roughly 0–100.
- **Primary accrual channel:** a growth-*attempted*-but-*failed* beat adds to the accumulator (the
  more a player tries and fails, the sooner the floor forces a beat). Passive turns with no growth
  attempt at all should **not** accrue — the floor rewards a thwarted push, not mere elapsed time.
- **Release:** a successful, landed growth beat bleeds the accumulator down substantially (a real
  win resets the pressure that was building toward a forced one).
- **Fire:** at a high threshold, enqueue exactly one **non-guaranteed** (still rolled, still capped,
  still gated) growth intent through the normal resolution path — the floor forces an *attempt*, not
  a guaranteed success, and it must go through the same single-writer/gate as everything else (§3.2).
  On firing, reset the accumulator and arm a cooldown so it can't immediately re-fire.
- **Tier-gated narration intensity (VALUABLE, borrowed from a world/hook-pressure design pattern):**
  as the accumulator climbs through named bands (e.g., calm → a faint undercurrent → openly
  straining), the narration directive can color *how* the tension is described *before* it fires —
  this makes the mechanism feel authored rather than a hidden dice roll suddenly resolving.

### 4.3 Overfill coupling (VALUABLE, optional secondary channel)

If a fluid-fill mechanic exists (§5), an un-drained character sitting at or near full capacity for
several turns can *also* feed the same accumulator (scaled by that fluid type's "growth potency," so
mundane fluids contribute weakly and a genre-specific magical fluid contributes strongly). This
should be a **second input into the same one accumulator/fire path**, not a second independent
firing channel — a discrete second channel that can only ever fire once per fill cycle gives lumpy,
edge-triggered pacing; folding it into the same continuous accumulator gives smoother throttling
through one gate.

### 4.4 Reference defaults (from the NAI implementation — re-tune, don't trust blindly)

Accrual per failed attempt ≈ 12 (of 100); fire threshold ≈ 85; release-on-success ≈ 50; overfill
threshold ≈ 96% fill, contributing ≈ 30/turn scaled by fluid growth-potency; cooldown after firing
≈ 2 beats. These numbers were tuned for one specific solo-character game and were **never
re-validated** against a multi-character/simultaneous-harem target (see §11, item 5) — treat them as
a reasonable starting point for the arithmetic in §4.2, not as a spec requirement.

---

## 5. Fluids / lactation

### 5.1 CORE or VALUABLE? — **CORE**

The genre definition here explicitly includes lactation alongside breast expansion and harem
dynamics — this is not an optional add-on system, it's part of what the engine is for.

### 5.2 Fill / drain mechanics (CORE)

- `fill_percent` (0–100) per fluid-bearing character — "how full she currently is." This is the one
  mutable number; everything else about a fluid (capacity, appearance, effect) derives from type +
  character traits.
- **Capacity must be mostly SIZE-INDEPENDENT.** A real, hard-won correction: coupling storage
  capacity to breast volume (a bigger bust ⇒ proportionally more capacity) is *physically* wrong for
  the mundane case (real lactation capacity is gland-driven, not fat/size-driven) and it creates an
  unwanted feedback loop into the size math when a character is full. Model capacity as a
  **per-character trait**, roughly independent of tier, unless a magical fluid type is deliberately
  designed to scale with size (an explicit genre choice, not an accident).
- **An emptying/drain path is mandatory**, not optional. A fill-only mechanic (some regular "+X% per
  turn" with no release path) monotonically ratchets to 100% and then sits there forever, flattening
  the entire fullness system into a dead binary. Drain can be an explicit action (nursing/milking/
  expression) or a narrative-triggered release; either way, `fill_percent` must be able to go down.
- **Engorgement** (fill at/near capacity, undrained for several turns) is a real, genre-relevant
  state — it should visibly affect description (firmness, sensitivity) and optionally feed the
  pressure floor (§4.3).

### 5.3 Fluid-type registry (VALUABLE)

Generalize beyond a single "milk" type to a small registry: `{ type → density, growth_factor,
fill_rate, drain_trigger }`. `growth_factor` is what separates "she produces a lot of an ordinary
fluid" from "she produces a fluid that itself drives growth" (a mundane type can have
`growth_factor = 0` — copious fluid without runaway growth — while a genre-specific magical fluid
has a high one, feeding §4.3 more strongly). Worth keeping even if only one fluid type ships at
launch, because it costs little and directly supports "harem dynamics" characters with different
genre hooks (mana, arcane essence, etc.) without a schema change later.

---

## 6. Harem / relationship dynamics

### 6.1 Two incompatible designs exist — this needs reconciliation (see §11, item 2)

**NAI/Era-1 model — engine-deterministic state machine, LLM narrates only:**

- A small numeric pressure accumulator per character, always pointed at a specific **target
  attitude** on an **ordered comfort axis**:
  `fearful < reluctant < conflicted < resigned < accepting < proud < eager < desperate < addicted`.
- **Same-direction events accumulate; a contradictory-direction event resets the accumulator to the
  new direction's amount** (not an average, not a fight — a full reset). This is the deliberate
  anti-oscillation mechanism: a character can't be flip-flopped across a threshold by alternating
  push/pull, because every direction-change throws away prior progress.
- **On crossing threshold, step exactly one rung** along the axis toward the target (not a jump
  straight to it) and arm a cooldown before another shift can fire. One rung + cooldown is the
  hysteresis; both exist for the same reason.
- A **separate, simpler ladder** (`stranger → acquaintance → familiar → intimate → devoted →
  bonded`) tracks relationship *stage* independently — attitude and stage are two decoupled
  accumulators that both feed a derived **consent mode** (unaware / non-consenting / reluctant /
  passive / enthusiastic / requesting / begging — read off a lookup table keyed on
  `attitude:stage`).
- **Idle decay is optional and defaults OFF**, because it is very easy to tune wrong (§12, lesson
  4) — the real cadence of relationship-moving events in play was far sparser than any reasonable
  decay grace period, so decay-on starved most arcs before they could ever cross. If decay is
  added, its rate must be checked against real event cadence with actual arithmetic, not intuition.
- A **derived** (never persisted, always recomputed) size/favor hierarchy across the harem, used
  only to emit occasional flavor notes ("she's just surpassed her rival"), never as canonical state.

**Era-2 model — continuous two-axis space, four settled endings:**

- Two signed, model-written axes per character (roughly "warmth" and "autonomy").
- A derived, continuous outcome classification into five named regions: a central `Forming`, and
  four settled quadrants — **Devotion, Partnership, Defiance, Usurpation** — crossing at tuned
  thresholds. Usurpation is explicitly a *playable outcome* (the character comes to dominate the
  relationship), not a failure state.
- Per-character **friction** and **autonomy ceiling** are *derived from a trait sheet*, not
  hand-authored per character — the same treatment nudges different characters differently for
  free, which is what makes a harem of several characters replayable without per-character tuning.
- Explicit **co-presence jealousy**: characters who witness favor being shown to someone else while
  present accrue a jealousy value on their own banded scale (calm → mild → jealous → strong →
  consumed), which above a threshold triggers open conflict, and which **feeds back into the
  two-axis space** (a witnessed slight nudges the witnessing character's own warmth/autonomy).

### 6.2 What's CORE regardless of which shape wins

1. **The state must be engine-owned and LLM-narrated, never LLM-decided.** The literature-and-practice
   consensus across every reference design studied (including designs that *do* let an LLM freely
   rewrite relationship text) is the same: the LLM renders the *felt* texture of a shift the engine
   has already decided happened; it does not get to decide *whether* a shift happens. This is the
   line that must hold on any platform, including a schema-first one — a validator that only range-
   clamps numbers is not the same guarantee as an engine deciding transitions.
2. **Some hysteresis mechanism against oscillation is mandatory** — partial-credit-reset,
   cooldown-after-shift, or both. Without it, alternating small events flip-flop a relationship state
   in a way that reads as mechanical and arbitrary.
3. **Multi-character independence:** all of this state must be per-character with zero cross-
   character coupling in the base accumulation logic — a shift for character A must never touch
   character B's numbers directly. Cross-character *effects* (jealousy, favoritism feedback) are a
   deliberate, narrow, named coupling on top of that independence, not a byproduct of shared state.
4. **A consent-relevant derived read** (however it's framed — a consent mode, a comfort label) that
   the narration directive can consult, so intimacy-adjacent content is gated by *tracked*
   relationship state rather than left entirely to model judgment.

### 6.3 Co-presence / jealousy is genuinely new and worth keeping (VALUABLE)

The NAI-era design was single-partner-at-a-time in practice; the co-presence jealousy mechanic is an
Era-2 addition driven by a "simultaneous harem" target that the NAI era never built for. It is
worth porting regardless of which relationship-state shape wins in §11 item 2, because "multiple
partners present in the same scene, with differential treatment producing visible drama" is a
target-game requirement independent of the attitude-axis-vs-two-axis question.

---

## 7. Canon persistence (the Chronicler)

### 7.1 What it guaranteed (CORE behavior, not CORE mechanism)

A subsystem that keeps a long campaign's "world bible" accurate and bounded without either (a)
silently losing facts the player already committed to, or (b) burning an LLM call on every single
turn to figure out what's new. The design that got this right had two ideas worth keeping
regardless of platform:

1. **Source facts from structured game state first, blind narrative-scanning second.** Growth
   milestones, quest-state changes, and discovered locations are *already known* to the engine —
   formatting them into a canon fact costs zero model calls. Reserve any LLM pass for genuinely
   unstructured material (social/flavor beats that only exist in prose), and treat that pass as
   secondary, not primary.
2. **Commit exactly at the point the user actually commits, not at the point review opens.** A
   structural fact (a growth milestone, a quest resolution) must **re-offer** if the review is
   dismissed without an explicit accept — advancing the "already canonized" bookkeeping at
   review-open time (rather than accept time) silently drops facts every time a review gets
   dismissed, which is the common case, not the rare one. Flavor/social facts can be treated as
   best-effort (committed at review time) since they're lower-stakes and the source log naturally
   re-surfaces recent events anyway.

Supporting mechanics worth keeping conceptually: **deduping** a proposed fact against *all* of a
character's existing canon text (not just the destination entry) so the same fact isn't re-added in
a different category; **compaction** of an overlong canon entry that is itself review-gated (an
automatic, silent rewrite risks quietly dropping a fact a compaction pass judged non-essential); and
a **skip/force** per-subject override so the player can mute a chatty subject or force-include one
the automatic dedup keeps suppressing.

### 7.2 What Aventuras already covers (PLATFORM-SPECIFIC / largely superseded)

Aventuras ships a **native chapter-summarization system** and an **agentic lore-management loop**
(an LLM tool-loop, default multiple iterations, that reads the narrative and auto-approves its own
lorebook entry creates/updates) — per `research/30` §3.2/§8, this is a genuine native analogue to
the Chronicler's *job*, and it should be the default mechanism rather than reimplementing a
watermark/fingerprint/word-interval trigger system, which was built specifically around NovelAI's
lack of any native equivalent (no chapters, no agentic lore loop) and SillyTavern's similarly
missing one.

**The gap to watch:** Aventuras's native lore agent is narrative-text-driven by default, not
structured-state-driven — it doesn't automatically know that a runtime variable just crossed a
growth milestone unless that fact is visible in the prose it reads or explicitly wired in. **The
one thing worth actively porting is the *instruction*, not the mechanism:** author the lore-
management template/prompt to prioritize structured runtime-variable diffs (a growth-tier increase,
a quest-state change) as canon-worthy facts it should record deterministically, and let its own
narrative-reading judgment handle flavor/social facts — this reproduces the "structured-state-first,
narrative-scan-second" priority (§7.1 point 1) using the native agent instead of a bespoke
watermark/fingerprint system.

---

## 8. Narration control

### 8.1 The genre rules (VALUABLE — port the content, not the mechanism)

The leanest working expression of "what makes prose read as BE-genre and not just generic
romance/erotica" is six short, always-injected rules. Reproduced verbatim (they are short and are
exactly the kind of content that should port near-unchanged into whatever lorebook/always-inject
mechanism the new platform offers):

> **Body_Schema.** Each partner carries BE fields on `Partner.<Name>`: `CupSizeIndex` (0–35 →
> AAA…ZZ+; DD=6, H=10, Z=27, ZZ=34, ZZ+=35 cap), `Cup_Size` (display string), `Body_Measurements`
> (bust-waist-hip), `TransformationStage` (Latent→Awakening→Active→Accelerating→Peak→Stabilized),
> `PressureClock` (0–10), `TransformationDesire` (0–100), and a capped `TransformationLog`. You may
> PROPOSE changes via `<UpdateVariable>`; the engine validates and commits them. Never restate the
> numbers in prose — describe what the body *feels/looks* like at its current values.

> **PressureClock_Rules.** `PressureClock` accumulates pressure toward the next growth. Increment
> it on the partner's **catalyst event** (see her card) and on sustained BE-themed contact: +1
> minor, +2 strong, +3 on a successful TransformationAttempt. At **8+** a TransformationStage
> advance becomes *eligible*; at **10** an advance check is *mandatory this reply*. On any stage
> advance, reset `PressureClock` to 0. Clamp 0–10. Clocks are per-partner and do not bleed between
> partners.

> **TransformationStage_Gates.** Advance `TransformationStage` only when its gate is met (engine
> confirms): Latent→Awakening: PressureClock ≥8 AND TransformationDesire ≥30 AND a first
> expansion-themed scene is acknowledged. Awakening→Active: PressureClock ≥8 AND
> TransformationDesire ≥50 AND a successful TransformationAttempt. Active→Accelerating: PressureClock
> ≥8 AND TransformationDesire ≥65 AND CupSizeIndex ≥ (value at stage entry)+2. Accelerating→Peak:
> PressureClock ≥9 AND an explicit peak-expansion scene. Peak→Stabilized: a deliberate stabilization
> scene only. On advance: append a TransformationLog entry, reset PressureClock to 0, update
> Cup_Size to match CupSizeIndex.

> **CupSize_Progression.** On a successful TransformationAttempt while stage is Active or higher,
> increment `CupSizeIndex` by 1 (max +1 per session; +2 allowed at Peak). Map index→cup via the full
> A→ZZ+ ladder and update `Cup_Size`. Adjust `Body_Measurements` bust upward to stay consistent
> (≈+3–5 cm per cup). Growth is always gradual and felt.

> **TransformationAttempt_DC.** A BE growth beat is a D20 check (reuse the Social_Check /
> `<combat_calculation>` system). Lock the DC before the roll: **Base 14** + Stage mod (Latent +6,
> Awakening +3, Active 0, Accelerating −2, Peak −4) + Clock mod (−1 per 2 points above 4, min −3) +
> Desire mod (−1 per 10 above 50, min −3). Failures stay failed — no re-rolls. **Crit success
> (≥18):** append a TransformationLog entry. **Crit fail (≤3):** PressureClock +2,
> TransformationDesire −10, write a NegativeMemory.

> **Stage_Decay_Exclusion.** A `TransformationStage` advance MUST NOT trigger a relationship-stage
> promotion-decay (a Trust/Comfort/Respect/Attraction reduction). That decay applies to relationship
> stage only. Body progression never resets relationship dispositions.

These six rules are almost entirely platform-agnostic prose + formulas; two phrasings are
MVU/SillyTavern-specific and should be swapped for whatever the new platform offers: the
`<UpdateVariable>` propose/validate framing in rule 1 (§3.2), and rule 5's "D20 check (reuse the
Social_Check / `<combat_calculation>` system)" — the locked-DC-before-roll *formula* is
platform-agnostic; only the specific check primitive it names is MVU-card-specific.

### 8.2 The four-part directive concept (CORE concept; exact internal phase names not load-bearing)

Rather than a second LLM call deciding *how* to narrate a resolved growth beat, the engine should
assemble **one deterministic, zero-additional-LLM-call directive block** per beat, combining: an
explicit magnitude/cap assertion (§3.5), the current comparative-prose band, the derived consent
framing (§6.2 point 4), and — on a foreshadowed beat — an anticipation cue one turn ahead of the
event landing. What matters is that this assembly is **plain string-building from already-known
state**, never a second generation call that could itself drift or hallucinate; the specific
internal phase breakdown used historically is an implementation detail, not a portable requirement.

### 8.3 PLATFORM-SPECIFIC items — do not port the mechanism, note the problem

- **The size-cap "late-block" context splice** (re-asserting a binding size cap as the very last
  message before generation, on completions-style models only). **Problem it solved:** an
  injected directive positioned earlier in context was empirically out-prompted by (a) a strongly
  primed, off-genre system/memory block and (b) an explicit player instruction closer to
  generation — proximity to the actual completion point beat channel "authority." **Why it doesn't
  port as-is:** it exists to fight a specific NovelAI/SillyTavern pathology (a separate "Memory"
  sync block silently overwriting itself with an off-genre prime on every load) that has no
  equivalent on a platform without that separate synced-memory concept. **What still matters:** if
  live-testing on the new platform shows tracked state being out-prompted by player input or a
  stale system prompt, the fix pattern (reinforce state as close to the generation point as the
  platform allows) is worth reaching for — but don't pre-build it speculatively.
- **Verbatim-bleed scrubbing** (stripping a leading fragment of injected directive text that a
  completions-style model echoed into visible prose). **Problem it solved:** injected bracketed
  context bleeding into the persisted story text. **Why it doesn't port as-is:** it's a
  completions-endpoint-specific failure mode tied to how that specific model class continues from
  its context window; a chat/instruct-tuned model or a platform with a cleaner
  system/instruction-vs-completion boundary may not exhibit it at all. **Watch-item, not a build
  item:** check for bleed during first live tests; only build a scrubber if it actually appears.

### 8.4 Genre-inherent, not platform-specific (VALUABLE — port regardless of platform)

- **A post-generation sanity pass** that flags oversized-simile overshoot (tier-relative, so a
  genuinely cosmic-scale character never false-flags) and off-target growth (the invariant that
  only the intended body part should be growing unless the character/genre explicitly allows more).
  Feed a flag into a next-turn continuity nudge rather than trying to edit the just-generated text.
  This is a real, recurring LLM failure mode (over-dramatizing a small event; growing the wrong
  thing) independent of which platform is hosting the model.
- **A scene-scope cue** ("stay within this moment; do not time-skip or end the scene") in the
  narration directive. Models auto-completing an entire day or a full relationship escalation in
  one generation is a general long-completion tendency, not something specific to any one platform.

---

## 9. Retry / undo safety

### 9.1 The invariants that must hold (CORE, as behavior)

- **R1 — the growth-resolution formula is a single, centralized, documented function of canonical
  state.** Any place a new implementation *intentionally* diverges from a previously-validated
  formula (a different growth-magnitude curve, a different relationship-stepping rule) should be a
  deliberate, scoped, single-purpose, dated decision — not incidental drift introduced while
  touching nearby code for an unrelated reason. This discipline is what made a later full rebuild of
  the body-math formulas safe to do without regressing everything else.
- **R3 — every piece of mutable state is covered by whatever persistence/undo mechanism the
  platform provides, with no exceptions, enforced by a test.** The concrete failure mode this
  guards against: a developer adds a new mutable field (a new condition type, a new relationship
  sub-field) and forgets to wire it into the save/restore path, so it silently fails to revert on
  undo/retry while everything else does. The mitigation is a **completeness test**, not code review
  discipline alone (see 9.3).
- **Single-writer isolation is independently testable.** Any subsystem that is *not* supposed to
  touch canonical body state (a relationship tick, a canon-writing pass) should have a test that
  deep-snapshots body state before the subsystem runs and asserts byte-identical after — this is
  cheap insurance against a subsystem "just this once" reaching into state it doesn't own.

### 9.2 PLATFORM-SPECIFIC: the snapshot/undo *mechanism* itself

Both prior platforms had **no native save-state primitive** — undo meant "hand-roll a versioned
blob that enumerates every mutable storage key, push it before generation, restore it atomically on
navigate-back." That entire mechanism is NAI/SillyTavern-plumbing-specific and should **not** be
ported. Aventuras already has a strictly better native answer: **checkpoints** (deep, named
snapshots of entries/characters/locations/items/beats/chapters/time/lorebook) plus **copy-on-write
branches** (cheap alternate timelines) — per `research/30` §3.1, this is already "the R3/undo story
... but native and first-class." Use it directly; do not rebuild a manual snapshot enumerator on top
of it.

### 9.3 What IS worth recreating: the test patterns, not the plumbing

- **Enumeration/completeness gate:** a test that mutates *every known domain* of state in one go,
  triggers one checkpoint/restore (or branch) cycle, and asserts every domain reverted together.
  Re-run this test whenever a new stat/field/domain is added — this is the single highest-leverage
  regression test available and should exist from the start, not be added as an afterthought late
  in a build (see §12, lesson 9).
- **Multi-level undo staircase:** several sequential growth beats, then several sequential
  undos/checkpoint-restores in reverse, asserting state peels back one step at a time and matches
  what was actually saved at each step (not just "eventually returns to the original").
  **A documented, acceptable semantic to explicitly test for, not treat as a bug:** if an
  intent/queue-style resolution consumes something *before* the save point for that turn, undoing
  that turn correctly reverts the growth but does not un-consume the intent — that is
  "the dice roll is spent on undo," a deliberate, testable semantic, not a defect.
- **Idempotency on retry:** re-firing a turn-resolution hook (simulating a retry) should not
  double-apply anything (double-count fluid fill, double-fire a pacing accumulator). Whatever
  re-entry guard the platform needs, cover it with a test that deliberately double-fires the hook.

---

## 10. The engine ↔ image contract

Kept thin deliberately — this is already substantially wired for the new platform.

- The canonical **tier scalar** (§2) is the only thing the narrative/state layer needs to hand to
  image generation. It should map, server-side, to a banded size phrase for moderate tiers and to a
  continuous strength ramp beyond the vocabulary's saturation point (the point past which more
  words don't mean more size — a continuous slider parameter must take over). **This mapping
  belongs entirely to the image-generation service**, not the narrative engine — the narrative layer
  only ever needs to expose the current tier value somewhere the image-prompting step can read it
  (a runtime variable, a template interpolation).
- Per `research/30`, wiring the image backend into Aventuras is already solved at the
  transport/provider level (a zero-code A1111-compatible provider pointed at the existing bridge).
  The one integration detail specific to BE content is getting the canonical tier value to reach
  the image-prompt-assembly step (via a runtime variable the prompt template can interpolate, or a
  marker token convention like the bridge's existing `__betier_<N>__` pattern) — a small, scoped
  wiring task, not a design question this spec needs to resolve further.

---

## 11. Cross-era contradictions requiring Ben's ruling

These are not spec gaps to fill in unilaterally — each is a place two validated prior
implementations disagree on substance, not just detail.

1. **Which tier ladder is canonical** (§2.2) — really two separable decisions. **(a) Granularity:**
   one canonical step per cup-letter (Era-2's shape, already wired to the live image bridge's
   marker convention) vs. several canonical steps per cup-letter with the letter derived (the NAI
   shape, ~2 tiers/cup below its G anchor). Not cosmetic — it determines whether the canonical/
   derived split in §1.1 actually holds (a 1:1 scalar-to-letter mapping means the letter isn't
   derived from anything finer, it's just relabeled) and whether sub-cup growth steps are
   expressible at all. **(b) Boundedness:** a hard cap (Era-2's 35/ZZ+) vs. an unbounded-above
   scalar with a bounded letter table that hands off to named descriptors past its last entry (the
   NAI shape, anchored to real gigantomastia volume data at its Z breakpoint) — the latter sits
   better with the genre's stated open-ended-growth goal. Recommendation stated in §2.2 (NAI-like
   granularity and open-endedness on the canonical scalar; a bounded, derived letter table for
   display and validator range-checks) — needs sign-off before it's load-bearing for the image
   contract's marker convention.
2. **Which relationship-state shape is canonical** (§6.1): the ordered 9-rung attitude axis +
   consent-matrix lookup, or the continuous two-axis ArcTrack space with four settled endings. These
   are not just different numbers, they're different *player-facing framings* (consent-gating vs.
   "which ending is this arc settling into"). A hybrid is plausible (consent-mode as a read *on top
   of* the two-axis space) but has not been designed — needs a decision before §6 can be built, not
   just ported.
3. **How strict the single-writer enforcement should be on the new platform** (§3.2). Aventuras is
   forked (`be-patches`) and has a real code surface, unlike stock Aventuras or a pure-pack
   integration — so the hard single-writer/intent-queue pattern is genuinely portable as code if
   it's worth building, versus accepting the platform-native LLM-proposes/classifier-clamps model
   (softest of the three tiers seen) and leaning harder on the mitigations in §3.5/§8.4 instead.
   This determines how much of §3/§4's mechanism is CORE-as-code vs. CORE-as-prompt-instruction.
4. **Whether to port deep body-math client-side at all**, and if so, where. Recommendation (§1.3,
   §2.3) is bridge-side-only, matching the Aventuras evaluation's own conclusion — but this discards
   a large, genuinely-validated piece of prior work, so it's a real call, not a default.
5. **Every specific numeric constant in §4's pacing floor (and the Era-2 pressure/DC constants in
   §8.1) is an untrusted reference default**, tuned for a single-character game that no longer
   matches the target (simultaneous harem, catalyst-mastery). Treat every threshold/cooldown/cap
   number in this document as a starting point for re-derivation against real event cadence in the
   new target game, not as something to carry forward unexamined (this is the same arithmetic
   discipline flagged in §12, lesson 4).

---

## 12. Top 10 hard-won lessons

1. **Canonical vs. derived confusion is the single most expensive bug class.** A derived
   circumference formula disagreed with the canonical weight model by roughly 2x, undetected, for
   an extended period, because nothing cross-checked the two. Fix: one canonical scalar, everything
   else a pure tested function of it, plus a cross-dimension "canary" invariant test that would
   catch exactly this class of drift (§1.1).
2. **There is a recurring "silent-loss at the point of least attention" class of bug.** Several
   independent instances: committing a review's progress at the moment it *opens* rather than the
   moment the user *accepts* silently drops content on the far-more-common "dismissed without
   accepting" path; an automatic entry-shortening pass judged only by a header format (not by fact
   preservation) can silently drop an accepted fact; an either/or read of "does this write path
   apply" can silently drop a case that should have gone to a default path instead. The common
   thread: identify the exact moment a user action should be treated as durable commitment, and
   audit every accept/decline/dismiss flow for a path where "nothing happens" quietly means "your
   progress was dropped" (§7.1).
3. **A model-readable schema description is not the same thing as the actual validator.** A field
   was documented in every human/model-facing schema description and appeared to work — until it
   turned out a separate, non-obvious validator object (missing a "pass unknown fields through"
   flag) was silently stripping it the entire time. Lesson: when adding a new stat/field on any
   schema-validated platform, verify against the actual runtime validator live, not against the
   documentation describing it.
4. **Naive idle-decay starves real event cadence more often than it prevents staleness.** A decay
   design that looks reasonable on paper (some grace period, then linear decay) can starve every
   real arc if the actual frequency of qualifying events in play is sparser than the grace period
   assumed. Always do the cadence arithmetic (how often does a real trigger actually fire in play)
   before shipping decay on by default; when in doubt, ship it off and revisit only if staleness is
   an observed problem, not a hypothetical one (§6.1, §11 item 5).
5. **A model can be out-prompted by proximity, not just by "channel authority."** An injected
   directive that should have taken precedence lost to (a) a strongly-primed off-genre context block
   and (b) an explicit player instruction, both of which sat closer to the actual point of
   generation. The general lesson (independent of the specific platform mechanism that fixed it):
   position matters as much as content, and you cannot diagnose "did our injection lose" vs. "did
   our injection not fire at all" without an observability channel that shows what actually reached
   the model — don't debug drift blind (§8.3).
6. **Magnitude overshoot is a distinct failure from genre drift, with a distinct fix.** Growth being
   tracked correctly but *narrated* with uniformly maximal drama regardless of actual delta size is
   not the same bug as growth being suppressed or genre-derailed, and doesn't share a fix. The fix
   is scaling narration intensity language to actual magnitude at every tier, including reserving
   top-of-register vocabulary for genuinely top-of-range sizes (§3.5).
7. **Log every deliberate divergence from a previously-validated formula as a single, scoped,
   dated decision.** Not as a discipline for its own sake — it's what made a much larger, later
   rebuild of the core measurement formulas safe to execute without also having to re-verify every
   incidental drift that had crept in unrelated to that rebuild (§9.1).
8. **Single-writer strictness is a spectrum every platform migration silently re-negotiates.** Hard
   single-writer (one function may write) → schema-validated propose/commit (model proposes, a
   validator clamps) → LLM-inferred and range-clamped with no cadence control at all: each step
   trades engine-certainty for lower build cost. Moving down this spectrum without deliberately
   choosing to, and without correspondingly strengthening the mitigations that compensate for the
   lost certainty (§3.5, §8.4), reliably reproduces the same overshoot/drift bugs in a new guise
   (§3.2, §11 item 3).
9. **An undo/retry completeness test is the highest-leverage test in the whole system and should
   exist from day one.** It is cheap to add a new mutable field and forget to wire it into whatever
   the platform's save/restore mechanism is; a test that mutates every known domain and asserts one
   restore reverts all of them catches this immediately. Historically this test was the *literal
   last thing built* in a multi-month effort — build it first, not last (§9.3).
10. **Deep body-math has a real but bounded payoff, and the bound was reached early.** A large,
    multi-agent research and rebuild investment into weight/volume/projection/ptosis realism paid
    off exactly once — when narration needed to stop contradicting a coarse, honest read of the
    tracked size — and did not keep paying off as it got more physically detailed beyond that
    point. Keep the deep math optional and server-side (§1.3); don't re-litigate this on a new
    platform without a concrete, current complaint driving it, because narration-honesty was the
    *only* complaint that ever justified the investment in the first place.
