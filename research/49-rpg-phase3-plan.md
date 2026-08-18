# RPG Layer — Phase 3 Implementation Plan (Lactation axis)
Spec: `research/46-rpg-layer-design.md` §6 item 3 · state model §2.4 · milk-as-inventory ruling §8 · quirks §8 (`early_bloomer`, `pressure_prone`)
Baseline: Phases 1–2 as merged (`1edea2db`), 477 tests green.

## Standing constraints (unchanged from research/47/48)

Purity (no `Date.now`/`Math.random`/`crypto.*` in `be/` or `rpg/`), single writer (reducer owns `bodyState`; store methods own persistence), module boundaries (`rpg/` imports BE only via `$lib/services/be`; stores/components import folder `index.ts` only), testability (vitest node env, `src/**/*.test.ts`; `.svelte` markup-only, verified by `npm run check` + `eslint .`), degrade-gracefully classifier-schema contract, and the no-eager-default-write rule (research/48 risk 7).

⚠ **D5 banner applies to every number in this plan** — reference defaults, re-derive from play. Phase 1–2 numbers are themselves still untuned (no play-test yet).

---

## Rulings to pin (do not leave to implementation discretion)

**R1 — Lactation state is ONE optional block; counters live inside it.**
```ts
lactation?: {
  active: boolean
  supplyTier: number          // 0..3 = light / steady / heavy / torrential
  beatsSinceMilked?: number   // neglect clock (supply ease + engorgement relief)
  demandBeats?: number        // consecutive recently-milked beats driving supply up
  chronicBeats?: number       // sustained high-supply beats toward a growth proposal
}
```
No sibling `BodyState` fields — the block materializes only on activation, so an untouched girl's state stays key-identical (the store's stringify no-op-write skip, same reasoning as Phase 2's conditional track spread). Schema: nested `.passthrough()` object, all counters optional (31a lesson 3). A save with no `lactation` key behaves exactly as today — that is the neutral-passthrough contract.

**R2 — Activation is classifier-evidenced: new `BeEventKind` `'induction'`.**
Same contract as every other event: the LLM proposes what the scene evidenced; the engine applies. The reducer activates on the first `induction` event (`active: true, supplyTier: 0`); repeat inductions while active are logged `'none'` and ignored. The *dice* side is the player-facing offer: an `induce_lactation` gated interaction whose tagged choice uses the **`milking`** skill (it is the expression-and-handling craft skill; `transmutation` stays the spell school). A failed check narrates a failed attempt and the classifier should report no induction — but if it does anyway, the engine still applies it (evidence beats intent, the same posture as growth events; the check's job was the narrative, not the gate). Manual escape hatch: a lactation toggle in `BeStatePanel` (user-initiated write, the `locked` pattern).

**R3 — Demand adapts supply; neglect eases it (spec §2.4, all in the reducer).**
Milked this turn (≥1 milking event) → `beatsSinceMilked = 0`, `demandBeats += 1`; at `demandBeats >= SUPPLY_ADAPT_UP_BEATS` and `supplyTier < SUPPLY_TIER_MAX` → tier +1, counter resets. No milking this turn (ticks enabled) → `beatsSinceMilked += 1`, `demandBeats = 0`; at `beatsSinceMilked >= SUPPLY_EASE_IDLE_BEATS` and `supplyTier > 0` → tier −1, clock resets (supply never deactivates on its own — `active` flips off only by editor toggle; weaning as a story beat is not a Phase 3 mechanic). `early_bloomer`: adapt-up threshold is halved (min 1). Off-screen (`ticksEnabled === false`): milking events still count (evidenced acts), but the neglect clock holds — the same off-screen reasoning as dependence decay.

**R4 — Supply feeds the existing FIL loop through the passive fill tick only.**
Step 5's tick becomes `profile.fillRate * (1 + profile.growthFactor) * supplyFillMultiplier(state)` where the multiplier is `1 + supplyTier * SUPPLY_FILL_RATE_BONUS` when `lactation.active`, else exactly `1`. No second fill path, no change to overfill pressure coupling (review ruling B1 stands: growth coupling stays `growthFactor`-gated — a milk-fluid story saturates faster but still converges).

**R5 — Chronic high supply proposes growth through `landGrowth`, under every existing gate.**
New reducer step (after the events loop, before tracks): when `active && supplyTier >= CHRONIC_SUPPLY_TIER && ticksEnabled`, `chronicBeats += 1`; below the tier, reset to 0. At `chronicBeats >= CHRONIC_SUPPLY_BEATS`: one seeded roll (`${seed}:chronic`, intensity 1) → on success/critical, `landGrowth(1)`; reset `chronicBeats` regardless (fire-once-then-reset, the pressure-escalator pattern). Lock, cooldown, and size cap all apply because `landGrowth` and the surrounding guards enforce them — assert each in tests. Log kind `'supply'`, note `chronic supply roll N`.

**R6 — Engorgement stays the step-9 derived condition; Phase 3 parameterizes it and derives APPARENT size only.**
Threshold becomes per-girl: `engorgeThreshold(state)` = `ENGORGED_FILL_THRESHOLD` (75), or `ENGORGED_FILL_THRESHOLD_PRESSURE_PRONE` (60) with the quirk. Bust feedback is **presentation-only, never a tier write**: new pure `apparentTierBonus(state): number` in `be/lactation.ts` — `0` unless Engorged is active, else `1` (`pressure_prone`: `2`). Consumers: the `[BODY STATE]` character lines (an "engorgement swell" sentence), `imageStateCues` (cue text already exists; add the swell magnitude), and `imageSizeAnchor`/`__betier__` tier pass-through (`tier + apparentTierBonus` for rendering only). `selectSprite` is deliberately NOT changed — the engorged cell already is the swollen look; feeding a bumped tier into `bandIndex` would double-count. `measurements()` is NOT changed — mass/BWH stay honest (fill already widens the tape); apparent size is a narration/render concept.

**R7 — Milk is an inventory item, created by the store, quantity-stacked per (girl, quality).**
Creation site: `applyBeEvents`, immediately after a character's reduce lands, when this turn had ≥1 milking event on a girl with `lactation.active`. Yield: `drainedPercent × capacityTotalMl / 100`, converted to whole 100 ml units (`Math.floor`; a sub-100 ml expression yields nothing and logs why). Item identity: name `` `${name}'s ${fluidType}` `` + metadata `{ milkOf: characterId, quality }`; matching on `metadata.milkOf + quality` (never the display name — names are translatable/editable). Stack = `quantity += units` on the existing row via the classifier-update path (capture `ItemBeforeState` first); create = new row with `location: 'inventory'`, id pushed into `createdEntities.itemIds`. Both paths ride the existing delta machinery, so rollback is inherited — no new rollback code.

**R8 — Milk quality comes from this turn's Milking check, else `plain`.**
Grades: `crit → prime`, `success → rich`, `partial → thin`, `fail → none` (a failed check that still evidenced a milking event yields nothing — the classifier saw expression, the dice say it was botched; log it). The check record reaches `applyBeEvents` as a new optional param (`checkRecord: CheckRecord | null` — it is already in scope at the call site, `story.svelte.ts:2746` region) and applies only when `record.skill === 'milking'` and `record.target` resolves to the same character. No check this turn → `plain`.

**R9 — Alchemy consumption of milk is DEFERRED to Phase 4.** The spec ruling says Alchemy *may* consume milk for stronger catalysts; the essence-cost/crafting surface it modifies is the spell system. Wiring a consumption path now would build against a system that doesn't exist yet. Phase 3 ships creation, stacking, and display; the item metadata (`quality`) is the Phase 4 hook. **Flagged as a judgment call for Ben** — if he wants a Phase 3 taste, the smallest version is a flat `+1 alchemy check modifier while any prime/rich milk is in inventory` with no decrement, but the recommendation is to defer.

**R10 — The Phase-3 quirks wire up now, and the Phase-2 guard test inverts.**
`early_bloomer`: +`EARLY_BLOOMER_INDUCTION_BONUS` (4) on `milking`-skill checks targeting her **while not active** (induction attempts — expressed per R4 of research/48: a DC −4 is a bonus +4, sign asserted in tests), and the R3 adapt-up threshold halving. `pressure_prone`: the R6 lower engorge threshold + bigger apparent swell. `quirks.test.ts`'s "phase-3 quirks produce zero state difference" assertion is **deleted and replaced** by positive assertions of each effect; `QuirkDef.phase` values stay as data (the field documents when each shipped).

**R11 — Prompt additions ride existing blocks; no template edits (R9 of research/48 carries over).**
Per-girl lactation line inside `characterLines` in `be/context.ts`, gated on `lactation.active` (a non-lactating save renders byte-identically — cache guard). Harem block gains a milk stance phrase for active girls. The classifier instruction for `induction` events goes through `buildBeEventInstructions` (the `customVariableInstructions` slot, already wired). `[BODY STATE]` header and every existing line stay untouched.

---

## Step 1 — Lactation state model + pure supply math

**Files:** `src/lib/services/be/types.ts`, `metadata.ts`, `constants.ts`, `index.ts`; new `src/lib/services/be/lactation.ts` + `lactation.test.ts`.

- `types.ts` — `BodyState` gains the R1 `lactation?` block (new `LactationState` interface). `BeEventKind` gains `'induction'`. `BeLogRecord['kind']` gains `'induction' | 'supply' | 'yield'`.
- `metadata.ts` — `bodyStateSchema` gains the nested optional lactation object (`.passthrough()`, all counters optional, `supplyTier` `z.number().int().min(0)` — no max: an unknown future tier survives an older reader).
- `constants.ts` (D5 banner): `SUPPLY_TIER_MAX = 3`, `SUPPLY_LABELS = ['light', 'steady', 'heavy', 'torrential']`, `SUPPLY_ADAPT_UP_BEATS = 2`, `SUPPLY_EASE_IDLE_BEATS = 4`, `SUPPLY_FILL_RATE_BONUS = 0.5`, `CHRONIC_SUPPLY_TIER = 2`, `CHRONIC_SUPPLY_BEATS = 6`, `ENGORGED_FILL_THRESHOLD_PRESSURE_PRONE = 60`, `EARLY_BLOOMER_INDUCTION_BONUS = 4`, `MILK_UNIT_ML = 100`, `APPARENT_TIER_ENGORGED = 1`, `APPARENT_TIER_PRESSURE_PRONE = 2`.
- `lactation.ts` (pure, returns values — the tracks.ts pattern): `lactationOf(state): LactationState | null` (read-through, no default write) · `supplyLabel(tier): string` · `supplyFillMultiplier(state): number` (R4) · `adaptSupply(lactation, milkedThisTurn, ticksEnabled, isEarlyBloomer): { next, raised, eased }` (R3) · `tickChronic(lactation, ticksEnabled): { next, fires }` (R5 counter half) · `engorgeThreshold(state): number` (R6) · `apparentTierBonus(state, isEngorged): number` (R6) · `milkYieldUnits(drainedPercent, capacityMl): number` (R7 floor math) · `qualityFromBand(band | null): MilkQuality | null` (R8).

**Verify:** `npx vitest run src/lib/services/be/lactation.test.ts src/lib/services/be/metadata.test.ts` — adapt-up at exactly the threshold and not before; early_bloomer halving (and the min-1 floor); ease clock holds off-screen; chronic fires-and-resets; multiplier is exactly 1 when inactive; yield floor at 99 ml → 0 units; every quality band; legacy `bodyState` without `lactation` round-trips unchanged; a `supplyTier: 7` from the future survives. `npm run check`.

## Step 2 — Reducer pipeline integration

**Files:** `src/lib/services/be/reducer.ts`, `reducer.test.ts`, `pipeline.test.ts` (additions only).

Revised pinned order (update the header comment):
```
1. decay conditions      2. cooldown tick
3. land pendingGrowth    4. apply softState
5. passive fill tick (supply-scaled)
6. events loop (induction activates; milking marks demand)
7. lactation: supply adapt + chronic-supply growth roll   ← NEW
8. tracks: bond + exposure/dependence + attitude pull
9. pressure accrual/pity
10. conditions: derive (Engorged @ per-girl threshold, Withdrawal) + merge
11. drift note
```

- Step 5: multiply the tick by `supplyFillMultiplier` (reads the PRIOR turn's supplyTier — deterministic, and the natural physics: this beat fills at the supply she woke with).
- Step 6: `induction` event → activate per R2 (log kind `'induction'`; repeat-while-active logs `outcome: 'none'`, note `already lactating`). Milking events additionally set a local `milkedThisTurn = true` and accumulate `drainedPercent` (the existing drain math already computes it — capture the before/after diff, clamped at the 0 floor: a drain from 30% yields 30 points, not 40).
- Step 7 (new): `adaptSupply` + `tickChronic`; a chronic fire rolls `${seed}:chronic` at intensity 1 and lands through `landGrowth` (cooldown/lock/cap all bind — the same guard row as the pity fire: `!state.locked && cooldown === 0`, plus `ticksEnabled`). Log `'supply'` rows for tier moves (`supply → heavy`) and the chronic roll.
- Step 10: `fillPercent >= engorgeThreshold(state)` replaces the flat constant.
- Return spread: `...(lactation !== undefined ? { lactation } : {})` — write the block only when it exists or was created this turn.
- **Reducer output additions for the store:** `ReducerResult` gains `milkYield?: { units: number; drainedPercent: number }` (computed here where the drain diff lives; the store owns turning it into an item). Only set when `active` and units > 0 — or when units are 0 with a log row saying why (sub-unit expression).

**Verify:** `npx vitest run src/lib/services/be` — every existing reducer/pipeline/canary test passes **unchanged**, plus an explicit neutral-passthrough test (no `lactation` key, no induction events → byte-identical output including key order). New: activation on induction; repeat induction no-op; demand→raise at threshold; neglect→ease; chronic fire lands +1 and resets, is blocked by lock / cooldown / size cap severally; fill tick scaled at each supplyTier; engorge threshold shifts with `pressure_prone`; `early_bloomer` halved adapt; milkYield math incl. the 0-floor drain clamp.

## Step 3 — Classifier extension: `induction` events

**Files:** `src/lib/services/be/schema.ts`, `schema.test.ts` cases, `be/index.ts`. (No `ClassifierService.ts` edit — the extension + instruction slots are wired.)

- `beEventSchema`'s kind enum gains `'induction'`; the tolerant coercer already drops unknown kinds for older shapes, and the enum addition is additive for new ones.
- `buildBeEventInstructions` gains an induction section: *"Report `induction` once for a scene in which her body begins producing — a first letdown, a successful induction working, milk arriving. Report the event only when the prose evidences it happening, never because it was attempted."* Anti-positivity copy mirrors the bond pattern: a failed attempt is NOT an induction event.

**Verify:** `schema.test.ts` — an `induction` event parses; a legacy result with growth kinds only still coerces; instruction copy renders once. `npm run check`.

## Step 4 — Store wiring: activation, milk items, gating input

**Files:** `src/lib/stores/story.svelte.ts` (`applyBeEvents` + its call site), `src/lib/services/be/wiring.test.ts`, `src/lib/services/rpg/gating.ts` + `gating.test.ts`, `src/lib/services/context/context-builder.ts` (gate input assembly).

- `applyBeEvents` gains the optional `checkRecord` param (R8) threaded from the caller (the record is already in scope at `:2746`). Bucketing: `induction` events flow through the existing event bucket untouched (they are `BeEvent`s). Widen the settled-skip guard with the induction/milking presence — a milking event on an otherwise-settled girl must not be skipped (the Phase 2 lesson, research/48 tricky point 4).
- After a girl's reduce: when `result.milkYield` is set, resolve quality per R8, then stack-or-create per R7 — `ItemBeforeState` capture before a quantity bump; `createdEntities.itemIds.push` on create. One `beLog` row kind `'yield'` (`+3 units of milk (rich)`), pushed after the write lands (log-after-write discipline).
- `gating.ts`: `GateInput` gains `lactationActive: boolean` and `supplyTier: number`. New gate `induce_lactation` — available when `bond >= 45 && !lactationActive`; the existing `milking` gate adds `&& lactationActive` to its condition and its mass floor drops to rely on supply instead (`bond >= 45 && lactationActive` — capacity is now the meaningful gate, carried mass was a pre-lactation proxy). Requirement strings updated to match. Context-builder assembles the two new inputs from `readBodyState`.

**Verify:** `wiring.test.ts` — induction activates through the full apply; yield creates an item with rollback capture (assert `createdEntities`), second yield same quality stacks (assert `ItemBeforeState` captured once), different quality creates a second row, fail-band check yields nothing; settled-skip widening. `gating.test.ts` — both new gates at their boundaries; a lactating girl loses `induce_lactation` and gains `milking`. `npm run check`.

## Step 5 — Check surface: induction action + early_bloomer modifier

**Files:** `src/lib/services/rpg/modifiers.ts` + `modifiers.test.ts`, `rpg/context.ts`.

- `buildTargetCheckModifiers`: when `skill === 'milking'` and the target has no active lactation, `early_bloomer` adds `{ label: 'early bloomer (DC −4)', value: +4 }` (sign per research/48 R4 — asserted). While active, the row is absent (induction is done; expression checks are unmodified).
- `rpg/context.ts`: the gated-actions instruction already carries availability; add one tagging bullet — *"`induce_lactation` and `milking` actions use the milking skill and must set `targetCharacter`."*

**Verify:** `modifiers.test.ts` — sign correctness; the modifier disappears once active; stacking with bond stance unchanged elsewhere.

## Step 6 — Prompt blocks + image cues

**Files:** `src/lib/services/be/context.ts` + `context.test.ts`, `measurements.ts` (`imageStateCues`), image anchor tier pass-through (`imageSizeAnchor` / `__betier__` call sites in `ai/image/`).

- `characterLines`: when active, one line after the fluid-fullness line: `Lactation: active — ${supplyLabel} supply; regular expression sustains it, neglect will ease it.` When Engorged with an apparent bonus: `Engorgement swell: she presently looks a full cup larger than her letter (temporary — do not treat as growth).` (two cups for pressure_prone).
- Harem block: active girls append `milk: ${supplyLabel}` to their stance parts.
- `imageStateCues`: engorged-with-bonus adds the swell magnitude to the existing cue text. Image anchor: pass `tier + apparentTierBonus` where the render tier is computed — narration-facing only per R6; find the `__betier__` assembly sites via `imageSizeAnchor` and bump there, never in `measurements`.
- Cache guards: exact-string snapshot of a NON-lactating girl's full `[BODY STATE]` output asserting byte-identity with the pre-Phase-3 fixture.

**Verify:** `context.test.ts` — the non-lactating snapshot; each supply label renders; the apparent-swell line appears only while Engorged; harem milk phrase. Existing image tests still green.

## Step 7 — `lactation_drift` detector

**Files:** `src/lib/services/be/drift.ts` + `drift.test.ts`, `types.ts` (`DriftFinding['kind']` gains `'lactation_drift'`).

Two conservative lexical rules (attribution-window style, both directions):
- Prose has her nursing/leaking/expressing milk (`\b(nurs(?:e|ing|ed)|leak(?:ing|ed)?\b[^.!?]{0,40}\bmilk|milk\s+(?:beads|drips|sprays|flows)|lets?\s+down)\b`, name-attributed) while `lactation` is absent or inactive → note: *"she is not lactating — render fullness or arousal, not milk, until induction actually happens"*.
- `active && supplyTier >= 1` and prose asserts she is dry / has no milk (name-attributed `\b(dry|no milk|nothing came)\b` family) → note: *"her supply is engine-tracked at ${label} — do not write her dry"*. (Shipped at steady, not the heavy sketch: once the engine tracks steady supply, "she is dry" contradicts tracked state — which is exactly what the detector exists for; the negative fixtures carry the false-positive risk.)
Negative fixtures are mandatory: "milk" as groceries/ingredient prose must not fire (require the verb-adjacent patterns above, never the bare noun).

**Verify:** `drift.test.ts` fixtures per direction + the negative fixtures; wire-through asserted in the reducer step-11 test (finding lands in `driftNote`).

## Step 8 — UI: milk meter, editor toggle, turn log kinds

**Files:** `src/lib/components/world/GirlStatusCard.svelte`, `BeStatePanel.svelte`, `src/lib/services/rpg/turnlog.ts` + `turnlog.test.ts`, `be/tracks.ts`-style presentation helpers in `lactation.ts` (band→tint).

- `GirlStatusCard`: milk meter row for active girls — supply band word + fill bar, engorgement tint when the condition is live (spec §5 wording). Inactive girls show nothing (no "not lactating" noise).
- `BeStatePanel`: lactation section — active toggle + supplyTier stepper (user-initiated write path, the `locked` pattern; this is also the Amelia-class backfill tool for pre-Phase-3 saves).
- `turnlog.ts`: map the three new log kinds to rows (`induction`/`supply`/`yield` labels + tints); `TurnLogList` renders them with zero component logic added.

**Verify:** `turnlog.test.ts` — new kinds label correctly, unknown future kinds still fall back safely. `npm run check` + `eslint .` + one manual BE-mode turn (induce → milk → see item + meter + log rows).

## Step 9 — Canary, full regression, index

**Files:** `src/lib/services/be/canary.test.ts` (extend), `research/INDEX.md`.

- Extend the canary with a full-turn lactation fixture: an active heavy-supply `pressure_prone` girl, one milking event, a milking-crit check record, high fill — assert exact `nextState`, `log`, and `milkYield`.
- Full run: `npx vitest run`, `npm run check`, `npx eslint .`. Mark Phase 3 implemented in `research/INDEX.md`.

---

## Risks

1. **Neutral passthrough breaks.** Any unconditional `lactation` write (or key-order change) rewrites every character's metadata on the first Phase-3 turn and floods rollback capture. The byte-identity test in Step 2 is the guard — land it before any wiring.
2. **Milk-item rollback gap.** Item creation outside the classifier path is new; a missed `createdEntities`/`ItemBeforeState` capture makes undo leave phantom milk. Step 4's assertions on the delta are the contract, and this is the step that most wants review attention.
3. **Apparent size leaking into real math.** If `apparentTierBonus` ever feeds `measurements`, `landGrowth`, or `selectSprite`, engorgement becomes real growth (or double-rendered sprites). It feeds prose lines and the image tier pass-through only — grep-assert the import sites in review.
4. **Double-drain accounting.** `drainedPercent` must come from the actual before/after fill diff (0-floor clamped), not `MILKING_DRAIN_PER_INTENSITY × intensity`, or a near-empty girl yields phantom milk.
5. **Chronic growth bypassing gates.** The chronic roll must sit behind the same lock/cooldown/cap wall as the pity fire; each gate gets its own test.
6. **Prompt-cache regression.** The lactation line and swell line are per-girl volatile additions inside an already-volatile block — fine; what must not move is the block header or any existing line for non-lactating girls. Snapshot per Step 6.
7. **Classifier over-reporting induction.** Positivity bias may report induction on failed attempts. Instruction copy is explicit (Step 3); the velocity analogue here is that repeat inductions are no-ops, so the blast radius of one false positive is one activation — visible in the turn log and reversible in the editor.
8. **Gating flip regression.** The `milking` gate's condition changes (mass proxy → lactationActive). A pre-Phase-3 save with a big-but-uninduced girl LOSES the milking offer until induction — intended (expression without supply was the old fiction), but say it in the changelog line so play-testing doesn't read it as a bug.

## Trickiest integration points

1. **`checkRecord` threading into `applyBeEvents`** (Step 4): the record currently flows only to `applyRpgTurn`. Passing it to `applyBeEvents` too creates two readers — keep `applyBeEvents` read-only on it (quality lookup), never spending essence there, or the single-writer split between the two methods blurs.
2. **Drain-diff capture inside the events loop** (Step 2): milking's drain applies mid-loop per event; the yield wants the summed diff. Accumulate per event at the drain site, don't recompute after the loop.
3. **The Phase-2 guard-test inversion** (R10): `quirks.test.ts` currently asserts the Phase-3 quirks do nothing. Delete that assertion in the same commit that wires them, or the suite goes red mid-step.
4. **Engorged threshold is now stateful** (Step 2): `sprite.ts` imports the flat `ENGORGED_FILL_THRESHOLD` for the engorged cell. Decide once: sprite selection also goes per-girl via `engorgeThreshold` (recommended — the sprite should match the condition), and both read the same function so they can never disagree.

## Ben's open calls (non-blocking; reference defaults ship either way)

- **R9**: Alchemy milk consumption deferred to Phase 4 — confirm, or ask for the minimal no-decrement modifier version.
- **Milking gate flip** (risk 8): confirm that expression-before-induction disappearing from offers is the intended fiction.
- All supply/chronic numbers are D5 reference defaults stacked on top of still-untuned Phase 1–2 numbers.
