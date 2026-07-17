# Build #17 — Harem Dynamics: design recommendation

*Research doc. Not production code. Studies the mature reference engines we port from + how
LLM-driven RPGs model evolving NPC attitudes, then recommends a concrete design for #17.*

Scope of #17 (from the brief):

1. **Drift/decay** of `attitude_pressure` (and the sticky conditions) over turns.
2. **Threshold-crossing**: when `accumulated ≥ threshold`, the member's `transformation_attitude`
   (and/or `relationship_stage` progress) actually **shifts** toward the goal. The payoff.
3. **Multi-member** handling (Phase 1 exercised one member; a harem is several).
4. Fired by the **Oracle social-event channel** (existing) + the per-turn tick.

---

## 0. The load-bearing bug #17 must fix first

`attitude_pressure` is *structurally broken* in #14 — this is **why crossing the threshold does
nothing today**, and it is the spine of the whole build.

`makeRelMech` (src ~1436) seeds `attitude_pressure: { toward: null, accumulated: 0, threshold: 5 }`.
The contract (inherited from alpha52) is that `toward` is an **attitude string** — one of
`accepting | eager | resigned | addicted | fearful | …` — because the threshold-cross does
`transformation_attitude = toward`. But `applySocialMutation` (src ~2820) violates this:

- **jealousy** does `ap.toward = b.id` — it stores a **member id**, not an attitude. If a cross
  ever fired, `transformation_attitude` would become a garbage UUID with no row in `CONSENT_MATRIX`
  (→ `deriveConsentMode` falls through to `'passive_consent'`). Wrong type, wrong payoff.
- **rivalry / hierarchy / spectator** never touch `attitude_pressure` at all — they only add a
  sticky condition (`Rivalrous` / `Asserting` / `Aroused`), bump `relationship_stage_progress`, or
  push a web link. So three of the four social events accrue **no attitude pressure whatsoever**.

So #14 left `attitude_pressure` half-wired: one event populates it with the wrong type, the rest
ignore it, and nothing reads it. **#17's first job is to make every social event map to an attitude
*direction* (`toward` = a valid attitude), keep the *who* (member id) in the condition note / web
link, and then wire the cross.** Everything below assumes this fix.

---

## 1. How the reference engines structure this

### 1a. alpha52 BE — the canonical prior art (deterministic state machine)

`attitude_pressure`, `transformation_attitude`, the 60-cell `CONSENT_MATRIX`, `relationship_stage`,
and the resistance tables in Ambrosia are **verbatim ports of alpha52** (confirmed byte-identical on
the matrix). So alpha52's `applyAttitudePressure` is the design we are re-implementing, and it is
worth following closely.

**`applyAttitudePressure(characterId, toward, amount)` (alpha52 ~4741):**

- `toward` is **always an attitude string**, `amount` is a small int (1–2).
- **Same-direction → accumulate:** if `pressure.toward === toward`, add `amount` to `accumulated`.
- **Direction change → reset with partial credit:** if a *different* `toward` arrives, the pressure
  object is **reset** to the new direction and `accumulated = amount` (the new event's weight only).
  This is the built-in **anti-oscillation / conflicting-pressure** mechanism — a contradictory push
  doesn't average or fight; it *replaces* the accumulator, so you can't ping-pong across the
  threshold. It throws away progress toward the old goal, which is the intended cost of indecision.
- **Cross → jump to target:** when `accumulated ≥ threshold`, set
  `transformation_attitude = toward`, then **clear** the accumulator (`toward = null`,
  `accumulated = 0`). alpha52 jumps **straight to the target attitude** in one cross. The *curriculum*
  (which target is sane from the current state) is enforced by the **caller**, not by stepping.
- Early-out `if (rec.transformation_attitude === toward) return` — no self-pressure once arrived.
- On cross it fires a toast + an event marker + a journal trigger, then rewrites the lorebook block.

**What drives `toward` / `amount` (alpha52 ~5870) — the "curriculum":** the caller picks the target
attitude from `(current attitude, stage, what happened)`. The mapping is the design's real content:

| Trigger | Current attitude | → `toward` | amount |
|---|---|---|---|
| gentle growth (Δ≤2) | reluctant/fearful/unknown | `accepting` | 1 |
| gentle growth (Δ≤2) | accepting & stage ≥ intimate | `eager` | 1 |
| large growth (Δ≥4) | reluctant/fearful | `resigned` | 2 |
| large growth (Δ≥4) | eager/proud | `addicted` | 1 |
| critical failure | (any) | `fearful` | 2 |
| critical success & stage ≥ intimate | eager/proud/desperate | `addicted` | 1 |
| critical success & stage ≥ intimate | (else) | `eager` | 1 |

The shift is always **contextual and bounded** — fearful→accepting, accepting→eager, eager→addicted
— never an arbitrary leap, because the *caller* only ever names an adjacent/plausible target. This is
how alpha52 keeps a pure "jump to target" semantic from feeling random.

**Relationship stage (alpha52 ~4702):** a *separate, simpler* accumulator. `relationship_stage_progress`
+= 1 (crit = +2) on a seduction/persuasion success; at `STAGE_ADVANCE_THRESHOLD` (3) the stage steps
**one rung** along the ordered ladder `stranger→…→bonded` and progress resets to 0. So **stage is a
single-step ordered ladder; attitude is a jump-to-target with a curriculum.** Two different shapes.

**Decay — alpha52 does NOT decay `attitude_pressure`.** It decays a *different* structure:
`consequences` (alpha52 ~4000, `decayConsequences`). Each consequence carries `gens_remaining`; once
per generation it does `gens_remaining-- ; keep if > 0`, dropping expired ones and rewriting the
lorebook block. **This countdown is the model for our condition lifecycle** (Jealous/Rivalrous/etc.),
NOT for the pressure scalar. Attitude pressure in alpha52 never decays because the *partial-credit
reset on direction change* already prevents stale single-direction accumulation from being a problem
in their always-driven combat loop. In our Oracle-gated loop it can stall, so we add gentle decay
(§3) — but the conceptual home of "things expire over time" is alpha52's per-gen countdown.

**Multi-member (alpha52 `recomputeHierarchy` ~4097):** the harem-level relational state is **derived,
not stored as canonical mutable state**. Each recompute sorts members into `size_ranking`,
`seniority_ranking`, `favor_ranking` (favor = count of growth events the protagonist caused for her),
detects pairwise **rivalries** (`detectRivalries` ~4041: adjacent-in-size pairs with gap ≤ 3 where
either has a *competitive* attitude — eager/desperate/addicted/proud), and diffs against the previous
snapshot (`detectHierarchyShifts`) to emit `[HAREM]` scene notes ("X has surpassed Y", "they're now
the same size — tension is electric"). The whole thing lives in **tempStorage** (not snapshotted):
it's a pure function of the per-member canonical state, so it never needs undo coverage.

### 1b. Adventure Engine — the hook-pressure escalator (structural accumulate→threshold→fire)

AE's per-character `hooks[0].pressureLevel` (0–100, AE ~5273) is the structural twin of our #16
growth-pressure escalator and a good model for #17's fire path. Three named tiers — **Latent (0–59) /
Urgent (60–84) / Critical (85–100)** — and the *prose tone is gated by tier* (observational →
demands action → do-or-die). Two ideas worth stealing:

- **Tier-gated narration.** The pressure level doesn't just gate a mechanical fire; it **colors how
  the engine asks the LLM to narrate** the building tension. Below threshold = a faint undercurrent;
  near threshold = openly straining. We can map our `accumulated/threshold` ratio to a similar
  intensity band for the social directive.
- **Surface-detection before resolve (AE ~5308).** A Critical hook is only *cleared* after its
  keywords actually appear in the generated prose for **two consecutive generations**
  (`surfacedCount` 0→1→clear). This is the antidote to *"the engine flipped a flag but the story
  never showed it."* AE refuses to mark a tension resolved until the narration has *demonstrably*
  paid it off. Powerful, but it adds state + an extra scan. **Recommended as an option (§5), not the
  baseline** — it's more machinery than #17 needs for a first cut.

Note AE's hook *content* is LLM-rewritten each interval (a GLM call adjusts `pressureLevel` and
rewrites the one-line description). Our social channel deliberately spends **zero GLM** (only Oracle
*world* events do). We keep that: the attitude shift stays engine-deterministic.

### 1c. Character Engine — fully LLM-narrated relationships (the other pole)

CE models the primary relationship as **three scoped free-text fields, regenerated by the LLM on a
token-interval cadence** — no numeric meter at all:

- `currentStatus` — how they treat each other *right now*, behavioral, no history (20–30 words).
- `trajectory` — the *direction/vector* of movement, not the current state, not the destination
  (10–15 words).
- `summary` — the only field allowed to look back *and* forward; synthesis of origin/change/tension.

The key craft move is **explicit scope walls**: each field's prompt forbids the others' content, so
the LLM can't collapse all three into one mush. Plus discrete `milestones` (a list with an `achieved`
boolean) and free-text `threads` ("undeniable attraction"). CE is the **maximally-LLM-judged** end of
the spectrum: no engine-computed state, the model *is* the relationship tracker, and the scope-walls +
short word caps are what keep it from drifting. Lesson for us: **the `trajectory` framing** ("name the
*direction*, not the state") is exactly how we should phrase the *narration* directive once the engine
has decided a shift is underway — let the LLM render the felt vector while the engine owns the discrete
state.

### 1d. Mythic GM Emulator — terse, LLM-curated threads

Mythic keeps **threads** as extremely short, single-line objectives ("Kill the dragon", "Find out who
lied") and characters as `Name: short description`, split into *scene* vs *global* lists. An LLM pass
promotes/demotes/removes them based on recent context (move to scene if present, to global if offstage
but important, delete if obsolete). The discipline — **terse, goal-shaped, list-curated, never
paragraphs** — is the model for how a harem-social *event* should surface to the player: a one-line
`[HAREM]` beat, not a numeric dump. Ambrosia already feeds `oracle_threads` into the Oracle context;
#17's shifts should *also* register as short thread-shaped notes the player can read.

### Synthesis of the four engines (the deterministic ↔ LLM spectrum)

| Engine | State shape | Who decides transitions | Decay/lifecycle | Multi-member |
|---|---|---|---|---|
| **alpha52** | numeric pressure → discrete attitude | **engine** (deterministic, caller-curated) | per-gen countdown on *consequences* (not pressure) | derived rankings + rivalry detection, tempStorage |
| **AE** | numeric pressure 0–100, one-line hook | **LLM** rewrites pressure + text | surface-detection clears after 2 gens shown | per-character, independent |
| **CE** | 3 free-text fields + milestones | **LLM** regenerates on token interval | interval overwrite (no explicit decay) | per-character `primaryRelationship` |
| **Mythic** | terse thread/character lists | **LLM** curates lists | LLM removes obsolete | scene vs global split |

**#17 should sit where alpha52 sits — engine-deterministic state, LLM narrates** — because (a) we are
already a verbatim port of alpha52's data model, (b) the single-writer law + determinism-where-it-
matters principle want the *state* engine-owned, and (c) the social channel must stay GLM-free.
We borrow AE's *tier-gated narration intensity*, CE's *trajectory framing* for the directive, and
Mythic's *terse one-line surfacing* — but the transition logic itself stays deterministic.

---

## 2. LLM-usecase best practices for evolving NPC attitudes (mapped to our constraints)

The four engines above already span the **deterministic ↔ hybrid ↔ fully-LLM-judged** axis, so they
*are* our case studies. The literature confirms the failure modes and names one useful lever:

**Established failure modes (and which engine's mechanism addresses each):**

- **Instantaneous affective reversal / flip-flopping** — agents abruptly swing tone within a scene
  (the affective-dynamics literature treats this explicitly; "affective inertia is a controllable
  parameter" — first-order vs second-order momentum, tunable hysteresis AUC). *Addressed by:*
  alpha52's **partial-credit reset on direction change** + a **cooldown** = our deliberate hysteresis.
- **Sticky states that never resolve** — flags set and never cleared (exactly #14's conditions
  today). *Addressed by:* alpha52's **per-gen countdown** lifecycle → our condition decay (§3).
- **Over-determinism feeling mechanical** — a meter the player can feel ticking. *Addressed by:* AE's
  **tier-gated narration** (the engine owns the number; the LLM only ever sees a *band* + a verb) and
  CE's **trajectory framing** (narrate the vector, not the integer).
- **Context bloat from too many tracked stats** — Mythic's "terse, never paragraphs" + CE's hard word
  caps. *Our lever:* we surface only the *consent_mode label* + at most a one-line shift note, never
  the raw `accumulated/threshold`.
- **LLM ignoring/contradicting tracked state** — the classic. *Addressed by:* alpha52 re-asserts the
  attitude into the lorebook on cross; Ambrosia already has the AN directive + the **size late-block**
  splice for exactly this (an attitude/consent late-line is the natural extension, §3) and AE's
  surface-detection (only resolve once the prose *shows* it).
- **LLMs circumventing structured flows** (the trading-NPC papers): the model "wants" to free-narrate
  past the mechanics. *Our guardrail:* the engine computes the discrete attitude; the LLM is told the
  *result* and asked to render it, not to decide it.

**The right division of labor for us (engine-computed vs LLM-judged):**

- **Engine computes (deterministic, source of truth):** `accumulated`, `threshold`, decay, the
  threshold-cross, the new `transformation_attitude` / `relationship_stage`, condition lifecycle, the
  derived `consent_mode`, multi-member rankings/rivalries.
- **LLM judges/narrates (never writes state):** the *felt* texture of the shift — the moment Lucy's
  reluctance tips into acceptance — rendered from a directive the engine hands it. The LLM may also,
  via the existing Oracle *world* channel (which already spends a GLM call), color *why* a social
  tension exists, but it does **not** decide the attitude.
- **Deliberately NOT given to the LLM:** the decision of *whether/when* an attitude shifts. That's
  the determinism-where-it-matters line. (An LLM-judged variant — "did the prose actually show the
  shift?" à la AE surface-detection — is a §5 option, not the baseline.)

Net: a **deterministic core with LLM narration** (alpha52's posture), with AE's tier-gated intensity
and CE's trajectory framing layered onto the *narration*, not the state.

---

## 3. Recommended design for #17

### 3.0 Principle

The engine owns a small numeric pressure per member and the discrete attitude/stage it derives; the
LLM only ever narrates the result. **No new mutable storage key** — everything rides the entity record
(already snapshot-enumerated). Single-writer law: #17 writes `relMech` + `conditions` only, **never
`bodyState`**.

### 3.1 Fix the `toward` type + map every social event to an attitude direction

Replace `applySocialMutation`'s ad-hoc writes with a single helper
`accrueAttitudePressure(member, toward, amount)` — a near-verbatim re-implementation of alpha52's
`applyAttitudePressure`, but it only *mutates the in-memory record* (the caller saves; matches the
existing `fireOracleSocialEvent` → `saveEntity(a)` flow). `toward` is **always an attitude string**.
The *who* lives in the condition note / web link, never in `toward`.

Proposed event → direction map (the curriculum, contextual on current attitude where it matters):

| Social event (kind / condition) | `toward` (attitude) | amount | notes |
|---|---|---|---|
| **jealousy** / `Jealous` | `conflicted` (if currently positive: accepting+) else `fearful` | 1 | jealousy destabilizes; member id → condition note, NOT `toward` |
| **rivalry** / `Rivalrous` | competitive cluster: `proud` if stage ≥ familiar else `eager` | 1 | rivalry pushes toward competitive self-assertion; web link holds the rival |
| **hierarchy** / `Asserting` | `proud` (asserter) | 1 | the one asserting trends proud; *also* keep the existing `relationship_stage_progress += 1` |
| **spectator** / `Aroused` | `eager` | 1 | voyeur-arousal nudges toward eagerness |

These are *suggested* targets — see Open Questions §5 for the values to confirm. The point of #17 is
the **mechanism**; the exact curriculum is tunable data, like alpha52's table.

### 3.2 Threshold-crossing semantics (the payoff)

Re-use alpha52's shape, with **one deliberate change for anti-oscillation**:

- **Accumulate:** same-direction events add `amount`; a *different* direction triggers
  **partial-credit reset** (`toward = new`, `accumulated = amount`). [alpha52, kept verbatim — this is
  the conflicting-pressure guard.]
- **Cross (`accumulated ≥ threshold`):** instead of alpha52's jump-straight-to-`toward`, take **a
  single ordered step** along an attitude axis *in the direction of* `toward`, then clear the
  accumulator and **stamp a cooldown**. Rationale: our curriculum is coarser than alpha52's
  combat-driven one (Oracle events are sparse and not always adjacent), so a raw jump could skip
  fearful→…→addicted in one social beat. A single ordered step keeps shifts believable and bounds
  drift. Define an **ordered comfort axis** for stepping:

  ```
  fearful < reluctant < conflicted < resigned < accepting < proud < eager < desperate < addicted
  ```
  (`unknown` resolves to the nearest of accepting/conflicted on first real pressure.) Step the
  current attitude **one rung toward** `toward` along this axis. If already at/past `toward`, no-op
  (alpha52's early-out). `desperate`/`addicted` are terminal-ish (high consent); stepping stops there.

  *Alternative considered:* jump-to-`toward` (pure alpha52). Documented as a toggle in §5 —
  single-step is the recommended default for our sparse-event loop; jump is closer to the port.

- **Stage progress, kept separate (alpha52's two-shape split):** the **hierarchy** event keeps
  bumping `relationship_stage_progress`; when it reaches `STAGE_ADVANCE_THRESHOLD` (3) step the stage
  **one rung** along `stranger→…→bonded` and reset progress. *Attitude and stage are independent
  accumulators* — do not couple them. Both feed `deriveConsentMode`, so a shift in *either* moves the
  consent mode (the real player-visible payoff).

- **Cooldown (the oscillation guard):** on any attitude shift, stamp `attitude_pressure.last_shift_turn
  = <turn>` (or a small countdown `shift_cooldown`). While within `SHIFT_COOLDOWN` turns
  (recommend **3**), pressure may still *accumulate* but a cross is *deferred* (don't fire a second
  shift). This + partial-credit reset = our deliberate hysteresis (the literature's "affective
  inertia"). `last_shift_turn` lives **on the `attitude_pressure` object inside the entity record** —
  already snapshotted, no new key.

### 3.3 Decay / drift model

Two things decay, on the **per-turn tick** (`endOfTurnTicks`, which already runs post-snapshot so undo
reverts it — see §3.5):

**(a) `attitude_pressure.accumulated` — idle decay, slower than reinforcement.** The decay-vs-accrual
balance is make-or-break: too fast and nothing ever crosses (starvation); too slow and it never
resolves (sticky). Recommended:

- Decay only on **idle turns** *toward that direction* — i.e. a turn where no social event reinforced
  the *current* `toward`. Track idleness with a per-member counter on the pressure object
  (`idle_turns`, reset to 0 whenever an event accrues toward the current direction). This rides the
  entity record (no new key).
- After `DECAY_GRACE` idle turns (recommend **4**), subtract `DECAY_STEP` (recommend **1** per turn)
  from `accumulated`, floored at 0. When `accumulated` hits 0, clear `toward = null`.
- **Linear, not half-life.** Our magnitudes are tiny (threshold 5, amounts 1–2); a half-life is
  over-engineering at this scale and harder to reason about for undo. Linear is transparent and
  trivially testable.

  *Worked trajectory proving it still crosses (anti-starvation):* social events fire at most every
  `ORACLE_FREQ` (3) turns × `ORACLE_SOCIAL_PCT` share × chance, so a *sustained* push toward one
  direction lands ≈ every 6–9 turns. With `DECAY_GRACE = 4` and `DECAY_STEP = 1`: an event at turn 0
  (accum 1), idle 1–4 (no decay — within grace, counter 1..4), decay begins turn 5 (accum 0). But a
  *second* aligned event at turn ~6–9 resets `idle_turns` to 0 **and** adds +1 before grace expires on
  the first, so accumulation **outpaces decay whenever events are actually aligned and recurring**.
  Decay only wins when the push *stops* — which is the intended "the tension faded" semantics. With
  threshold 5 and amounts 1–2, a member under sustained same-direction pressure crosses in ~3–5 events
  (~20–40 turns) — slow enough to feel earned, fast enough to pay off in a session. Decay never
  starves an *active* arc; it only garbage-collects an *abandoned* one. **(These three numbers —
  threshold, DECAY_GRACE, DECAY_STEP — are the dials to confirm in §5; the *shape* is the
  recommendation.)**

**(b) Sticky conditions — per-condition countdown (alpha52's `decayConsequences` model).** Today
`Jealous/Rivalrous/Asserting/Aroused` are added and **never removed**. Give *transient social*
conditions a TTL and expire them on the tick:

- Extend the condition shape minimally: `addCondition(rec, label, note, ttl)` writes
  `{ label, note, gens: ttl }` for transient ones; permanent/body conditions (Lactating,
  Growth-Suppressed, magical support conditions) omit `gens` and are **never** decayed.
- On `endOfTurnTicks`, for each condition with a numeric `gens`: `gens-- ; drop if ≤ 0`. Recommend
  TTLs: `Jealous` 6, `Rivalrous` 8, `Asserting` 5, `Aroused` 4 (mirrors alpha52's `decay_gens` per
  consequence-type spirit). This is **backward-compatible** — existing conditions without `gens` are
  untouched, so the body-DB magical-support conditions (`featherlight`, etc.) and Lactating are safe.
- **Guard:** the `SUPPORT_FROM_CONDITIONS` / body conditions must NOT get a TTL. Decay only the four
  social labels (an explicit allow-list set, e.g. `SOCIAL_CONDITION_TTL = {Jealous:6, …}`), never a
  blanket "decay everything with gens." This keeps the single-writer law clean (we're not silently
  expiring something the Judge or body-DB relies on).

### 3.4 Multi-member handling

Phase 1 exercised one member; the design is **already multi-member-safe by construction** because all
state is per-entity:

- **Independence:** `attitude_pressure`, `idle_turns`, `last_shift_turn`, conditions all nest on each
  member's entity record. The tick iterates `getHaremMembers()` (already does, for body ticks) and
  processes each independently. No cross-member coupling in the core loop — member A crossing a
  threshold never touches member B's pressure.
- **Pairwise events:** `fireOracleSocialEvent` already picks `a` and (if ≥2 members) `b`. Keep that;
  just make sure the accrual lands on the *right* member (the asserter trends proud; the *watched* one
  isn't pressured by being watched — only the spectator `a` is). The brief's "Phase 1 only one member"
  gap is closed simply by the tick + Oracle already looping over all members.
- **Derived harem hierarchy (alpha52 `recomputeHierarchy`, optional for #17):** a pure function over
  per-member canonical state → `size_ranking` / `favor_ranking` / pairwise rivalries → terse `[HAREM]`
  scene notes on a *change* (X surpasses Y; they're now tied). Store in **tempStorage** (Mythic/
  alpha52 pattern) so it needs **no snapshot coverage** (it's recomputable). **Recommend this as a
  thin v1**: compute size-ranking + tied/near rivalries and emit a one-line `[HAREM]` note via the
  existing Oracle/AN channel when the top of a ranking changes. It's cheap, it makes the harem feel
  like a system, and it adds no persistent state. (Favor-ranking needs a `growth_caused` tally per
  protagonist — defer if that isn't already tracked; size-ranking is free from `tier_index`.)

### 3.5 Exact integration points in the current code

All of this hangs off **existing hooks** — no new hook, no new storage key:

1. **`accrueAttitudePressure(member, toward, amount)`** — new helper near `makeRelMech` (~1430) or
   beside `applySocialMutation` (~2820). Re-implements alpha52 §1a (accumulate / partial-credit reset
   / single-step cross / cooldown stamp). Mutates the in-memory record only.
2. **`applySocialMutation` (src ~2820)** — rewrite each branch to call `accrueAttitudePressure` with
   the §3.1 direction map, and to add conditions with a TTL (the `who` goes in the note). Stop writing
   `ap.toward = b.id`. Keep the hierarchy `relationship_stage_progress += 1` and the rivalry web link.
   `fireOracleSocialEvent` already calls `applySocialMutation` then `saveEntity(a)` — unchanged.
3. **`endOfTurnTicks(pd)` (src ~3533)** — add, *after* the existing body loop and *before/independent
   of* `applyGrowthPressure`: (a) the per-member `attitude_pressure` idle-decay + deferred-cross
   resolution, and (b) the per-condition TTL countdown. Both run **post-snapshot** (this fn is invoked
   from `onGenerationEnd` after `pushSnapshot` already ran in `onGenerationRequested`) ⇒ **undo reverts
   attitude shifts and condition expiry for free** — same R3 guarantee the #16 escalator relies on.
   This is the single most important integration fact: *attitude drift/cross must live in
   `endOfTurnTicks`, exactly like #16's pressure*, so it inherits R3 correctness.
4. **Stage advance** — when hierarchy pushes `relationship_stage_progress` to threshold, step the
   stage (a `stepRelationshipStage(member)` helper mirroring alpha52 ~4702). Can live in the tick or
   at accrual time; tick is cleaner (keeps all "resolution" logic in one post-snapshot place).
5. **Narration of the shift** — when a cross happens, set a one-line note that surfaces next turn via
   the **existing AN directive** (`onBeforeContextBuild`, ~3626) and/or the **size-late-block sibling**
   (`buildLateBlock`, ~3267 — add a consent/attitude-late-line on a shift turn for completions-endpoint
   models). Use CE's *trajectory* framing ("she is tipping from reluctance toward acceptance — render
   the felt change, not a declaration") and AE's *tier-gated intensity* (faint when `accumulated`
   is low, openly straining near threshold). A `safeToast` + event-log entry mirrors alpha52's UX.
6. **Multi-member hierarchy (optional)** — a `recomputeHaremHierarchy()` reading `getHaremMembers()`,
   writing tempStorage, emitting a `[HAREM]` note on change. Call from `maybeRunOracle` or the tick.

### 3.6 New mutable storage key? **No.**

Everything #17 writes is **inside the entity record** (`be:entity:<id>`), which is snapshot-enumerated
as a collection via `entity_index` (src ~2052). The fields added are all *nested on `relMech`/
`conditions`*:

- `attitude_pressure.last_shift_turn` (or `shift_cooldown`) — new sub-field, inside relMech → covered.
- `attitude_pressure.idle_turns` — same.
- condition `gens` — new sub-field on existing condition objects → covered.

The derived harem hierarchy goes in **tempStorage** (never snapshotted, recomputable). So **#17 adds
zero singleton keys and zero collections** to the snapshot — strictly better than #16 (which needed
the existing `arc_index` ride). The build rule ("adding a mutable key requires adding it to
`SNAPSHOT_SINGLETONS/COLLECTIONS` in the same commit") is **not triggered**. *Flag for the
implementer:* confirm `restoreMutableSnapshot` round-trips the new nested fields — it should, since it
restores whole entity records verbatim, but the undo test (§4) proves it.

### 3.7 Edge cases

- **Oscillation / flip-flop:** partial-credit reset (a contradictory event wipes progress, doesn't
  average) + `SHIFT_COOLDOWN` (no second shift within N turns). Belt and suspenders. This is the
  literature's tunable hysteresis, made discrete.
- **Starvation / never-crossing:** decay is gated behind `DECAY_GRACE` idle turns and is *slower than
  the aligned-event cadence* (§3.3 worked trajectory). An *active* arc always outpaces decay; only an
  *abandoned* one is GC'd. Confirm the three dials in §5.
- **Conflicting pressures (two members push her opposite ways same turn):** the *last* aligned event
  wins the `toward` slot via partial-credit reset; the loser's push is discarded that turn. Acceptable
  — matches "she can't be pulled two ways at once." If both pushes are the *same* direction, they
  stack (good).
- **Decay vs accumulation balance:** see §3.3; the `idle_turns` reset-on-reinforcement is the
  load-bearing piece (without it, decay competes with accrual every turn and starves).
- **Condition lifecycle:** TTL allow-list (only the four social labels), permanent/body conditions
  never decayed. Re-adding a still-present condition should *refresh* its `gens` (so repeated jealousy
  keeps Jealous alive) — `addCondition` should bump `gens` to the max of current/new rather than
  no-op when the label already exists.
- **Already at target:** alpha52's early-out (`if attitude === toward return`) — no self-pressure, no
  wasted accumulation once arrived.
- **`unknown` attitude:** on first real pressure, resolve `unknown` onto the comfort axis (nearest of
  conflicted/accepting) before stepping, so the ordered-step has a defined origin.
- **Member removed mid-arc:** pressure dies with the entity record (nested) — no dangling state.
- **Single-writer law:** none of this reads or writes `bodyState`. The derived hierarchy reads
  `tier_index` *read-only* for ranking — never writes it. Assert this in tests (§4).

---

## 4. Proposed test plan (node harness, `harness_17.js`)

Follow the existing harness conventions (prelude installs the `api` mock; assert against
module-scoped fns directly; `T.captured.onGenerationEnd({})` drives the real post-snapshot path).
Mirror `harness_16a.js`'s structure (real path + synthetic-branch coverage + R3 undo).

1. **`toward` is an attitude, not an id** *(catches the #0 bug):* fire each social event; assert
   `member.relMech.attitude_pressure.toward` is one of the valid attitude strings (or null), **never**
   equal to any member id. The regression test for the whole build.
2. **Accrual stacks same-direction:** two same-`toward` events → `accumulated` increments by the
   amounts; `idle_turns` resets to 0 on each.
3. **Partial-credit reset on direction flip:** push `accepting` to accum 3, then a `fearful` event →
   `toward === 'fearful'`, `accumulated === <fearful amount>` (NOT 3+amount, NOT averaged).
4. **Threshold fires a single ordered step, once:** drive `accumulated ≥ threshold` toward `eager`
   from `accepting`; assert attitude steps exactly **one rung** (`accepting → proud`, *not* a jump to
   `eager`) — or, if the jump-toggle is chosen, to `eager`; accumulator clears; `consent_mode`
   recomputes; `last_shift_turn` stamped.
5. **Cooldown prevents flip-flop:** immediately after a shift, push the threshold again within
   `SHIFT_COOLDOWN` turns → assert **no second shift** (deferred); after the cooldown elapses (advance
   turns through the tick) → the deferred cross now fires.
6. **Idle decay & anti-starvation:** with `toward` set and accum at e.g. 3, run `DECAY_GRACE` idle
   ticks → no change; one more idle tick → `accumulated` drops by `DECAY_STEP`; continue → reaches 0 →
   `toward` clears. Then the *worked-trajectory* test: interleave aligned events every 6–7 turns and
   assert it **crosses** (proves decay doesn't starve an active arc).
7. **Condition TTL lifecycle:** add `Jealous` (ttl 6); tick 6× → it's gone; assert a permanent
   condition (e.g. Lactating / a `SUPPORT_FROM_CONDITIONS` label) added alongside is **untouched**.
   Re-adding `Jealous` while present refreshes its `gens`.
8. **Multi-member independence:** two members; an event/cross on A leaves B's `attitude_pressure`,
   `idle_turns`, conditions **bit-for-bit unchanged**.
9. **Single-writer law held:** snapshot each member's `bodyState` (deep) before a full social
   tick+cross; assert `bodyState` is **identical** after (tier_index, fill_percent, everything).
   The hierarchy recompute reads `tier_index` but must not write it.
10. **R3 undo reverts attitude changes:** capture entity records, run a turn that crosses a threshold
    (event → `onGenerationEnd` → `endOfTurnTicks`, all post-snapshot), then `restoreMutableSnapshot()`
    and assert `transformation_attitude`, `attitude_pressure`, `relationship_stage`, and conditions
    all revert to pre-turn values — the same R3 guarantee `harness_16a` proves for pressure+queue.
11. **Stage advance is independent:** hierarchy events push `relationship_stage_progress` to threshold
    → stage steps one rung, progress resets; assert this does **not** also move `transformation_attitude`
    (the two accumulators are decoupled).
12. **Derived hierarchy (if built):** set tiers so A>B, recompute, then grow B past A (via the Judge,
    not #17) and recompute → assert a `[HAREM]` "surpassed" note is emitted and the ranking flips;
    assert the hierarchy lives in tempStorage and is **not** in the snapshot.

---

## 5. Open questions / decisions to confirm before implementation

1. **Cross semantics: single ordered step (recommended) vs alpha52 jump-to-`toward`.** Single-step
   suits our sparse Oracle cadence and bounds drift; jump is the closer port. *Confirm which* — it
   changes test #4. (Recommendation: single-step, with a config toggle defaulting to it.)
2. **The event→attitude curriculum (§3.1 table).** Are jealousy→`conflicted/fearful`,
   rivalry→`proud/eager`, hierarchy→`proud`, spectator→`eager` the right *directions*? This is the
   build's *content* and the most subjective call — it sets where the harem's social pressure pushes
   each woman emotionally. Easy to tune (it's a data table), but worth a human eye before coding.
3. **The three balance dials:** `threshold` (5?), `DECAY_GRACE` (4?), `DECAY_STEP` (1?), and
   `SHIFT_COOLDOWN` (3?). §3.3 argues these don't starve an active arc, but the *feel* (how many
   sessions to tip a woman from reluctant to eager) is a playtest question. Recommend shipping the
   §3.3 values and tuning live (LIVE_TEST).
4. **Condition TTLs** (Jealous 6 / Rivalrous 8 / Asserting 5 / Aroused 4) — confirm the allow-list and
   that no body-DB / Judge condition is accidentally in it.
5. **Build the derived harem-hierarchy v1 now, or defer?** It's optional to the core #17 (attitude
   drift/cross is the mandate). Size-ranking + tied-rivalry notes are cheap and add no persistent
   state; favor-ranking needs a `growth_caused` tally that may not exist yet. *Recommendation: ship
   size-ranking `[HAREM]` notes; defer favor-ranking.* Confirm whether the protagonist already tracks
   per-member growth-caused counts.
6. **Attitude-shift late-block line** — extend `buildLateBlock` (the completions-endpoint splice) with
   a consent/attitude line on a shift turn, or keep the shift to the AN channel only? (The size
   late-block exists because the AN loses to off-genre Memory; an attitude shift may need the same
   reinforcement. Recommend: AN first; add the late-line only if live-test shows the LLM ignoring the
   shift — don't pre-build machinery.)
7. **AE-style surface-detection (defer):** should a cross only *commit* after the prose actually shows
   it (two-generation confirm)? Elegant anti-"engine-flipped-a-flag-the-story-ignored," but adds state
   + a response scan. *Recommendation: not in v1* — the AN re-assertion + late-block already push the
   narration; revisit only if live-test shows shifts that never land in prose.

---

### One-line summary of the recommendation

Re-implement alpha52's deterministic `applyAttitudePressure` (fixing #14's `toward`-is-an-id bug so
every social event maps to a real attitude *direction*); cross the threshold with a **single ordered
step + cooldown + partial-credit reset** as deliberate hysteresis; decay `accumulated` linearly only
after idle-grace turns (slower than the aligned-event cadence, so active arcs never starve) and expire
*social-only* conditions via an alpha52-style per-turn `gens` countdown; run all of it in
`endOfTurnTicks` (post-snapshot ⇒ R3 undo for free) writing **only nested `relMech`/`conditions`**
(no new storage key, single-writer law intact); keep multi-member trivially independent because all
state is per-entity, with an optional tempStorage-only derived size-ranking emitting terse `[HAREM]`
notes. Engine owns the state; the LLM narrates the felt shift via the existing AN/late-block channel.
