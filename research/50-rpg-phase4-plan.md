# RPG Layer — Phase 4 Implementation Plan (Magic / spells)
Spec: `research/46-rpg-layer-design.md` §6 item 4 · spell model §2.5 · sheet `knownSpells` §2.1 · check pipeline §3 · prompts §4 · SheetPanel spellbook §5 · essence curve + alchemy-milk ruling §8
Baseline: Phases 1–3 as merged (`ed946fc4` on `master` / `be-patches`), 634 tests green, svelte-check 0 errors.

## Standing constraints (unchanged from research/47/48/49)

Purity (no `Date.now`/`Math.random`/`crypto.*` in `be/` or `rpg/`; all randomness via `seededRoll`), single writer (reducer owns `bodyState`; `StoryStore.applyRpgTurn` owns the sheet; `StoryStore.applyBeEvents` owns BE persistence), module boundaries (`rpg/` imports BE only via `$lib/services/be`; stores/components import folder `index.ts` only), testability (vitest node env, `src/**/*.test.ts`; `.svelte` markup-only, verified by `npm run check` + `eslint .`), degrade-gracefully classifier/generation schema contracts (no `.strict()` on shapes older saves/results must keep parsing), and the no-eager-default-write rule (research/48 risk 7 — a non-caster save must round-trip byte-identically).

⚠ **D5 banner applies to every number in this plan** — essence costs, DCs, band-intensity deltas, supply-surge magnitudes are reference defaults, re-derive from play. Phases 1–3 numbers are themselves still untuned (no play-test yet — see the handoff's open decisions).

---

## What already exists (grounded in the landed code — do NOT rebuild)

- **`knownSpells: string[]`** on `RpgSheet` (`rpg/types.ts:48`), zod-validated `z.array(z.string()).default([])` (`rpg/metadata.ts:36`), defaulted in `defaultRpgSheet()` (`rpg/derive.ts:91`). It is designed to hold `Entry.id` values, round-trips today, and **has no reader or writer at runtime yet** — Phase 4 is its first use.
- **Essence fuel is fully built.** `essenceCost` is already on `actionChoiceSchema` (`ai/sdk/schemas/actionchoices.ts:45`, `0..ESSENCE_COST_MAX`) and `riskAssessResultSchema` (`ai/sdk/schemas/riskassess.ts`). `resolveCheck` already refuses to roll when `essenceCost > essence.current` (fail-band, `essenceSpent:0`, `insufficientEssence:true` — `CheckService.ts:42`). The spend itself lands in `applyRpgTurn` (`story.svelte.ts:3382`). A cast that sets `essenceCost` inherits spend + insufficient-essence handling **for free**.
- **The check pipeline is one shared core.** Casting reuses `resolveCheck` (`CheckService.ts:29`) verbatim — the spell's stored `dc` and `school` (a `SkillId`) feed straight in. `CheckPhase` (`generation/phases/CheckPhase.ts:49`) orchestrates assess→resolve; `CheckCard.svelte` already renders the resulting `CheckRecord` including `⬡ −essenceSpent` and the continuity tag. **No CheckCard edit needed.**
- **The reducer is the single effect executor** (`be/reducer.ts`, pinned 11-step order, pure, deterministic via `seededRoll`). Growth, induction, condition-merge, bond, dependence-gain, and fill-drain **already have channels** (see the EffectTag map below). Production caller: `StoryStore.applyBeEvents` (`story.svelte.ts:2869`), which passes per-character `charEvents` into `reduceCharacterBody` at `story.svelte.ts:3073`.
- **Lorebook entries carry relevance injection for free.** An `Entry` (`types/index.ts:507`) with a `type`, `injection`, and `aliases` flows through `EntryRetrievalService` Tier 1/2/3 automatically. The `entries.type` column has **no CHECK constraint** — a new `'spell'` type needs no migration.

## The EffectTag → existing-channel map (the engine-wiring crux)

There is **no unified "effect list"** in the reducer. A spell's `EffectTag[]` must fan out across three input channels of one `reduceCharacterBody` call, each applied at its own pinned step. This table is the contract Step 2 implements:

| EffectTag kind (v1) | Reducer channel | Step | Status |
|---|---|---|---|
| `growth` (intensity 1–3) | `BeEvent{kind:'catalyst', character, intensity}` in `events[]` | 6 | **exists**, full gates (eligibility/lock/cooldown/cap) |
| `induction` | `BeEvent{kind:'induction', character, intensity}` | 6 | **exists** (idempotent if already lactating) |
| `condition` (`label`, `ttl`) | `extras.softConditions: BodyCondition[]` | 10 | **exists** (free-form label+ttl, cap 6, derived-first wins) |
| `bond` (`direction:'warm'\|'strain'`, intensity) | `extras.bondEvents: BondEvent[]` | 8 | **exists**, ±5/turn velocity cap |
| `dependence` (gain, intensity) | `extras.exposureEvents: ExposureEvent[]` | 8 | **exists**, +4/turn cap (gain only) |
| `fill` (drain \| set) | `BeEvent{kind:'milking'}` (drain) or `softState.fluidFill` (absolute set) | 6 / 4 | **exists** |
| `check_debuff` (target-girl DC penalty) | `extras.softConditions` label + a new `CHECK_MOD_FROM_CONDITIONS` map read by `buildTargetCheckModifiers` | 10 + rpg | **mostly reuse** — mirrors the existing `SUPPORT_FROM_CONDITIONS` pattern (`be/constants.ts:92`) |
| `supply_surge` (raise supplyTier) | **new** step-7 `supplyDelta` applied before `adaptSupply`, clamped to `SUPPLY_TIER_MAX` | 7 | **NEW reducer work** (the only genuinely-new path) |

**Scoped OUT of v1** (the two true gaps with no clean path, flagged as Ben's open call O1):
- `dependence` **decrease** — `exposureEvents` are gain-only by design; decay is deliberately idle-only anti-positivity. A "cleanse/wean" spell fights that architecture. Model as a condition (`Withdrawal`-adjacent) later, or defer.
- check **self-buff** on the PC — the protagonist has no tracked BE conditions the modifier layer can read (`rpgSheet` is protagonist-only; `buildTargetCheckModifiers` reads the *target girl's* state). Target-girl **debuff** ships (above); PC self-buff defers.

---

## Rulings to pin (do not leave to implementation discretion)

**R1 — A spell IS a lorebook `Entry` of a new `'spell'` type; no new table.**
Add `'spell'` to the `EntryType` union (`types/index.ts:498`) and a `SpellEntryState` variant to the `EntryState` union (`types/index.ts:~621`) carrying the mechanical block:
```ts
interface SpellEntryState {
  type: 'spell'
  school: SkillId              // Transmutation / Enchantment / Arcana / Ritualism (§2.2 mapping); any SkillId is legal but the schema *recommends* the four
  essenceCost: number          // 0..ESSENCE_COST_MAX
  dc: number                   // DC_MIN..DC_MAX — feeds resolveCheck directly (R4)
  effects: EffectTag[]          // restricted to the v1 vocabulary enum (R2)
  revealed?: boolean
}
```
The narrative-facing `description` is the Entry body/content (what gets injected). `knownSpells` holds the `Entry.id`. This inherits persistence, snapshot/branch/rollback, and relevance injection with zero new infrastructure. `STICKINESS_BY_TYPE` (`EntryRetrievalService.ts:41`) is a compile-time-exhaustive `Record<EntryType, number>` — adding `'spell'` forces a stickiness value there (pick concept-like `5`). Grep every `EntryType` `switch`/`Record` site before implementing (UI icon/label maps in the lorebook panels will also force a `'spell'` arm). `VaultLorebookEntry`'s separate enum (`ai/sdk/schemas/lorebook.ts:12`) is the vault/import path — **not** touched in v1 (spells are in-game-generated, not vault-portable yet; note as O2).

**R2 — `EffectTag` is a closed, zod-validated vocabulary (v1 = the 8 mapped kinds).**
New `rpg/effects.ts` (or `be/effects.ts` — see R5 placement) defines:
```ts
type EffectKind = 'growth' | 'induction' | 'condition' | 'bond' | 'dependence' | 'fill' | 'check_debuff' | 'supply_surge'
interface EffectTag {
  kind: EffectKind
  intensity?: number            // 1..3, clamped; default 1
  label?: string; ttl?: number  // condition / check_debuff
  direction?: 'warm' | 'strain' // bond
  fillMode?: 'drain' | 'set'; fillValue?: number  // fill
}
```
`effectTagSchema` (zod) restricts `kind` to the enum — an LLM-generated spell (R6) with an out-of-vocabulary tag **fails validation and is rejected/retried**, never persisted. This is the "effect tags restricted to the vocabulary" guarantee from §2.5. Unknown future kinds are dropped by a tolerant coercer on read (same posture as `beEventSchema`), so a spell authored by a newer client survives an older reader minus the unknown effect.

**R3 — `spellId` threads through the whole check surface.**
Add optional `spellId?: string` to: `actionChoiceSchema` (`actionchoices.ts:19`), `riskAssessResultSchema` (`riskassess.ts:13`), the `CheckPhase` tag/assess branches (`CheckPhase.ts:75-93` — both currently forward only skill/dc/essenceCost/target), and `CheckRecord` (`rpg/types.ts:68`). A cast choice sets `{skill: <school>, dc: <spell.dc>, essenceCost: <spell.essenceCost>, spellId, targetCharacter?}`. `spellId` on `CheckRecord` is how the store knows which spell's effects to queue, and how the turn log / drift know a cast happened. Non-cast checks leave it unset (byte-identical to today).

**R4 — Casting reuses `resolveCheck`; the band gates and scales effects.** No parallel resolution path.
Before resolving, validate `spellId ∈ sheet.knownSpells` and that the entry resolves to a `type:'spell'` Entry — an unknown spellId is refused (fail-band, no spend, logged; it is also a `stat_invention` signal, R7). The spell's `dc`/`school`/`essenceCost` feed `resolveCheck`. Band → effect disposition:
- **fail** — no effects applied; essence **still spent** (a miscast burns the channel). `beLog`-adjacent note "spell fizzled". A fail from `insufficientEssence` spends nothing (existing gate).
- **partial** — effects apply at `intensity − 1` (floor 1). ("Success with a cost" — the cost is the weaker working; no extra drawback condition in v1.)
- **success** — effects at declared `intensity`.
- **crit** — effects at `intensity + 1` (cap 3).
Band adjusts the *emitted* intensity only. `growth` effects then resolve through the reducer's **normal growth roll and gates** — a "success" cast can still roll a partial *landing* (the spell empowered the attempt; the body's response is its own seeded roll). This honors §2.5 "queue through the reducer as catalyst-family events … through normal gates (cooldown/cap/lock)".

**R5 — Effect translation is a pure function; effects apply through `applyBeEvents`, never `applyRpgTurn`.**
New pure `translateSpellEffects(effects, band, targetCharacter, casterSeed): { events: BeEvent[]; extras: Pick<ReducerExtras,'bondEvents'|'exposureEvents'|'softConditions'>; softState?: BeSoftState; supplyDelta?: number }` maps the R2 vocabulary onto the R2-map channels, applying the R4 band scaling. Placement: `be/effects.ts` (it constructs `BeEvent`/`ReducerExtras`/`BodyState` shapes that live in `be/types.ts`; keeping it in `be/` avoids `rpg/`→`be/` type leakage and lets `applyBeEvents` consume it without a new import edge). Growth-effect seeds are `${checkSeed}:spell:${effectIndex}` (`checkSeed = ${storyId}:${entryId}:check`) — deterministic, replays identically on retry/undo. **Single-writer split (document it, like Phase 3's `checkRecord` threading):** a cast turn touches BOTH writers — `applyRpgTurn` spends essence + records the check (sheet writer); the translated effect events join the target's `charEvents` inside `applyBeEvents` (BE writer). `applyBeEvents` stays read-only on the sheet; `applyRpgTurn` never constructs BE events. The effects ride the existing per-character reduce → existing delta/rollback machinery, so undo is inherited.

**R6 — In-game spell generation = `generateStructured` → validate → `addEntry` → `knownSpells.push`, one guarded flow.**
Pattern copied from `ClassifierService` (`ai/generation/ClassifierService.ts:68` → `generateStructured` `ai/sdk/generate.ts:446`), NOT the heavier `LoreManagementService` tool-loop/approval agent (overkill; O3 if Ben wants research to go through the lore-approval UX instead). New `SpellResearchService`: renders a research template, calls `generateStructured({ schema: spellSchema, ... }, 'spellResearch')` (effects zod-restricted per R2), constructs an `Entry{type:'spell', createdBy:'ai', injection:{mode:'keyword', keywords:[name,...aliases], priority}, state: SpellEntryState}`, calls `database.addEntry` (`database.ts:2230`), and pushes the id into `knownSpells` via the sheet writer. Trigger: a **check-gated `research_spell` action in the SheetPanel spellbook** (Arcana or Ritualism check; on success/crit generate-and-learn, on partial generate a weaker spell or a flawed one, on fail nothing) — kept in the panel, not the story-choice generator, so v1 does not entangle spell-*generation* with choice-tagging (casting tagging is separate, R3). **Rollback hazard (adversarial-review target):** the Entry write (entries table) and the `knownSpells` write (sheet metadata) are two persistence surfaces in one action; both must be captured in the turn delta / `createdEntities.entryIds` so undo removes the learned spell AND the entry together. No orphaned entry, no phantom knownSpell.

**R7 — `stat_invention` learns about spells; a cast of a known spell is legitimate.**
The existing `stat_invention` detector (`rpg/drift.ts`, §4) currently flags abilities/spells not on the sheet. Phase 4 gives it the `knownSpells` list (resolved to spell names) as valid vocabulary: prose invoking a **known** spell is fine; prose casting a spell **not** in `knownSpells` (and not just-generated this turn) fires `stat_invention` with the amber roll-card tag. Casting an unknown `spellId` (R4 refusal) is the mechanical mirror of the same rule.

**R8 — Prompt: `[PLAYER SHEET]` must list known spells, or the narrator refuses casts.**
`buildPlayerSheetBlock` (`rpg/context.ts:35`) line 46 currently tells the narrator *"Do not invent … spells"*. Add a compact known-spells line (name · school · cost, no effect math — the engine owns effects) gated on `knownSpells.length > 0`, so a non-caster's block renders byte-identically (cache guard). Casting-tagging guidance extends `buildCheckTaggingInstruction` (`rpg/context.ts:103`): *"A `castable` action names a known spell — set `skill` to its school, `dc`/`essenceCost` from the spell, and `spellId`; set `targetCharacter` when it acts on a girl."* Known-spell availability rides the same slot as gated actions (`buildGatedActionsInstruction`, assembled in `context-builder.ts:362-401`). `[CHECK RESULT]` per-band directives already carry the anti-fudge rule; a cast's directive names the applied effects so narration matches the mechanics.

**R9 — Anti-double-application: on a cast turn, the spell's effects are authoritative for the target; the classifier's duplicate same-kind events for that target are dropped.**
A cast that grows the target also produces growth *prose*; the classifier will re-propose a growth event → double growth. Ruling: when a spell effect of kind K fired against target T this turn, classifier-proposed events of the corresponding kind for T are de-duplicated in `applyBeEvents` before the reduce (growth↔catalyst/contact/attempt, induction↔induction, bond↔bondEvents, etc.). This mirrors the induction-idempotency and velocity-cap posture — engine mechanics win over classifier prose. Scope the dedupe narrowly (same kind, same target, only when a spell effect of that kind fired) so unrelated legitimate events survive. **This is the single trickiest correctness point in the phase** (risk 1, trickiest #1).

**R10 — Single-target v1; Ritualism multi-target is deferred.** A spell acts on `targetCharacter` (a girl) or is untargeted/narrative (self/area effects that only change PC-facing narration, no BE writes). True multi-target ritual working (one cast, N girls) is deferred (O4) — the effect-translation and dedupe (R9) are written single-target and would need per-target fan-out to generalize.

**R11 — Alchemy-milk consumption (Phase 3 R9 hook) ships minimally, or defers (Ben's call O5).** Phase 3 built the hook (milk items carry `quality` metadata). Now that essence costs exist, the spec §8 ruling ("Alchemy checks may consume milk for +1 intensity or reduced essence cost") is wireable. **Recommended minimal version:** an `alchemy`-school cast may consume one `prime`/`rich` milk unit from inventory for **either** −1 essence cost **or** +1 effect intensity (pick one, config-flagged), decrementing the item stack through the existing inventory-update/rollback path. Kept as its own small step (Step 8) so it can be cut without touching the core. If Ben prefers, defer entirely and leave `quality` as the still-unused hook.

---

## Step 1 — Types, `EffectTag` vocabulary, spell schema

**Files:** `src/lib/types/index.ts` (`EntryType`, `EntryState`), `src/lib/services/be/types.ts` (nothing new unless `supply_surge` needs a field), `src/lib/services/rpg/types.ts` (`CheckRecord.spellId?`), new `src/lib/services/be/effects.ts` + `effects.test.ts`, new/edited `src/lib/services/ai/sdk/schemas/lorebook.ts` (or a new `spell.ts` schema file), `src/lib/services/rpg/constants.ts`.

- `EntryType` gains `'spell'`; `EntryState` gains `SpellEntryState` (R1). Resolve every forced exhaustive site (`STICKINESS_BY_TYPE`, lorebook UI type maps) — grep `EntryType` first and fix each arm in this step so the tree compiles.
- `EffectTag` + `EffectKind` + `effectTagSchema` (R2) in `be/effects.ts`; `spellSchema` (zod) = base lore fields + `{school, essenceCost, dc, effects}` (R1), effects `z.array(effectTagSchema)`.
- `CheckRecord.spellId?: string` (R3). `actionChoiceSchema` + `riskAssessResultSchema` gain `spellId?` (R3) — additive, no `.strict()`.
- `constants.ts` (D5 banner): `SPELL_BAND_INTENSITY_DELTA = { crit: +1, success: 0, partial: -1, fail: null }`, `SUPPLY_SURGE_MAX_DELTA = 2`, `CHECK_DEBUFF_DC_PENALTY = 2` (per `check_debuff` condition), `ALCHEMY_MILK_BONUS_INTENSITY = 1` / `ALCHEMY_MILK_COST_REDUCTION = 1` (Step 8).

**Verify:** `npx vitest run src/lib/services/be/effects.test.ts` — `effectTagSchema` accepts each v1 kind and rejects an out-of-vocabulary kind; `spellSchema` round-trips; a spell with an invalid effect tag fails `.parse`; `CheckRecord` without `spellId` still validates. `npm run check` (the `EntryType` exhaustiveness compiles green).

## Step 2 — Effect translation layer (pure)

**Files:** `src/lib/services/be/effects.ts` (+ `effects.test.ts`).

- `translateSpellEffects(effects, band, targetCharacter, casterSeed)` per R5: fan out each `EffectTag` to its R2-map channel with R4 band scaling. `fail` → empty translation (caller still spends essence). `growth` → `BeEvent{kind:'catalyst', character:target, intensity}`. `induction` → induction `BeEvent`. `condition`/`check_debuff` → `softConditions` entry (`check_debuff` uses a recognized label, e.g. `arcane snare`). `bond` → `BondEvent`. `dependence` → `ExposureEvent`. `fill` → milking `BeEvent` (drain) or `softState.fluidFill` (set). `supply_surge` → `supplyDelta` (clamped `SUPPLY_SURGE_MAX_DELTA`).
- Growth seed suffixing `${casterSeed}:spell:${i}`; the function is pure (takes the seed, does not roll — the reducer rolls).

**Verify:** `effects.test.ts` — each kind maps to the right channel/shape; band scaling (crit +1 cap 3, partial −1 floor 1, success unchanged, fail empty); a multi-effect spell fans out to all channels in one result; supplyDelta clamps; determinism (same inputs → identical output, no clock/rand).

## Step 3 — Reducer: `supply_surge` path (the only new reducer channel)

**Files:** `src/lib/services/be/reducer.ts`, `reducer.test.ts`, `pipeline.test.ts`.

- `reduceCharacterBody` accepts a `supplyDelta` (via `extras`, additive to `ReducerExtras`). Step 7 (lactation): before `adaptSupply`, if `supplyDelta` and `lactation.active`, bump `supplyTier` by the delta clamped to `[0, SUPPLY_TIER_MAX]`; log a `'supply'` row (`supply surge → heavy`). A surge on an inactive girl is a no-op (log why) — surge raises an existing supply, it does not induce (induction is its own effect).
- No change to any other step. Neutral passthrough: a reduce with no `supplyDelta` is byte-identical to today (assert).

**Verify:** `npx vitest run src/lib/services/be` — every existing reducer/pipeline/canary test passes **unchanged**; supply surge raises tier and clamps at max; surge on inactive lactation no-ops; a surge + a same-turn `milking` still runs `adaptSupply` correctly after the bump.

## Step 4 — Casting: `spellId` plumbing + store wiring

**Files:** `src/lib/services/generation/phases/CheckPhase.ts`, `CheckPhase.test.ts`, `src/lib/services/rpg/CheckService.ts` (validate `spellId ∈ knownSpells`) + `CheckService.test.ts`, `src/lib/stores/story.svelte.ts` (`applyRpgTurn` call site + `applyBeEvents`), `src/lib/services/be/wiring.test.ts`.

- `CheckPhase` forwards `spellId` from both the tag branch and the assess branch (R3). It resolves the spell Entry (dependency-injected reader) to supply `skill/dc/essenceCost` when a `spellId` is present but the choice under-specifies them (a cast choice may carry only `spellId` + `targetCharacter`).
- `CheckService.resolveCheck` (or a thin `resolveCast` wrapper): when `spellId` set, require it in `sheet.knownSpells`; unknown → fail-band, no spend, `insufficientEssence:false`, a drift-flagging marker (R7). Keep `resolveCheck` pure.
- Store turn handling (`story.svelte.ts` ~:2768 `applyRpgTurn`, ~:2869 `applyBeEvents`): when the resolved `CheckRecord` has a `spellId` and a non-fail band, resolve the spell Entry, `translateSpellEffects(...)`, and merge the translated `events`/`extras`/`softState`/`supplyDelta` into the **target's** reduce inside `applyBeEvents` (R5). Apply the R9 dedupe against classifier events for that target. Essence spend stays in `applyRpgTurn` (unchanged). Widen any settled-skip guard so a cast on an otherwise-settled girl is not skipped (the Phase 2/3 lesson).

**Verify:** `CheckService.test.ts` — known spellId resolves and rolls; unknown spellId → fail, no spend, drift marker; insufficient essence still gated. `wiring.test.ts` — a success cast applies growth to the target through the full reduce (assert delta + rollback capture); a fail cast spends essence and applies nothing; band scaling reaches the reducer; **R9 dedupe** — a cast-grew target plus a classifier-proposed growth for that target lands ONE growth, not two; a classifier growth for a DIFFERENT girl survives. `CheckPhase.test.ts` — spellId forwarded from tag and assess branches.

## Step 5 — Prompt blocks: known spells + casting tagging + drift

**Files:** `src/lib/services/rpg/context.ts` + `context.test.ts`, `src/lib/services/rpg/drift.ts` + `drift.test.ts`, `src/lib/services/context/context-builder.ts` (pass `knownSpells`-resolved names into the gate/tagging assembly).

- `buildPlayerSheetBlock`: known-spells line gated on `knownSpells.length > 0` (R8); non-caster block byte-identical (snapshot guard).
- `buildCheckTaggingInstruction`: casting bullet (R8); known-spell availability listed alongside gated actions.
- `stat_invention` detector (R7): receives resolved known-spell names; a known spell in prose is legitimate, an unknown spell fires the finding. Negative fixtures: a known spell name must NOT fire; a common word that happens to be a spell name is name/context-anchored to avoid false positives.

**Verify:** `context.test.ts` — non-caster snapshot byte-identity; the spells line renders once with names only (no effect math). `drift.test.ts` — unknown-spell prose fires `stat_invention`; known-spell prose does not; the negative fixtures.

## Step 6 — In-game spell generation / research

**Files:** new `src/lib/services/ai/generation/SpellResearchService.ts` + test, prompt template (`spell-research`), `src/lib/stores/story.svelte.ts` (learn-and-persist path with rollback capture), `src/lib/services/rpg/metadata.ts` (a `learnSpell(sheet, entryId)` helper appending to `knownSpells` immutably).

- `SpellResearchService` per R6: `generateStructured({ schema: spellSchema }, 'spellResearch')`; effects zod-restricted (invalid → retry/reject). Research is check-gated (Arcana/Ritualism): success/crit → learn; partial → a weaker/flawed spell (lower intensity or an extra `essenceCost`); fail → nothing.
- Persist path: `database.addEntry(spellEntry)` + `learnSpell(...)` through the sheet writer, **both captured in the turn delta** (`createdEntities.entryIds` + the sheet write) so undo removes entry AND knownSpell together (R6 rollback hazard).

**Verify:** unit — the service validates and rejects an out-of-vocabulary effect; a partial research yields the weakened shape. `wiring.test.ts` — a learned spell appears in `knownSpells` AND as a `type:'spell'` Entry; undo removes both (assert `createdEntities.entryIds` captured); a second research does not duplicate. `npm run check`.

## Step 7 — Spellbook UI

**Files:** new `src/lib/components/world/SpellbookSection.svelte`, `src/lib/components/world/SheetPanel.svelte` (mount after the skills block, ~:148), `src/lib/components/story/ActionChoices.svelte` (optional spell-cast affordance), `src/lib/components/layout/Sidebar.svelte` (optional spellbook badge), `src/lib/services/rpg/turnlog.ts` + `turnlog.test.ts` (cast rows).

- `SpellbookSection`: list each known spell (name · school · essence cost · DC · effect summary chips), a **Research** action (triggers Step 6, check-gated), reusing the panel's `persist()`/`writeRpgSheet` pattern. Empty state when `knownSpells` is empty.
- `ActionChoices`: essence cost already renders (`⬡cost`); a spell choice needs no new field, but add a subtle cast affordance (e.g. a ⬡/school tint) if a spellId is present — optional, mark as polish.
- `turnlog.ts`: cast rows read from `checkLog` (spellId present) with a school tint; fizzle rows labeled. `TurnLogList` renders with no new component logic.

**Verify:** `turnlog.test.ts` — a cast check row labels with the spell/school; a fizzle labels correctly; unknown future kinds fall back safely. `npm run check` + `eslint .` + one manual BE-mode turn (learn a spell → cast it → see the CheckCard, the effect land in Harem state, and the turn-log row).

## Step 8 — (Optional, R11) Alchemy consumes milk

**Files:** `src/lib/services/be/effects.ts` (or the cast wiring in `story.svelte.ts`), `wiring.test.ts`, `constants.ts`.

- On an `alchemy`-school cast, if a `prime`/`rich` milk unit is in inventory, consume one (decrement the stack via the existing inventory-update/rollback path) for either −1 essence cost or +1 effect intensity (config-flagged, R11). No milk → cast proceeds unmodified.

**Verify:** `wiring.test.ts` — consumption decrements exactly one unit with rollback capture; no eligible milk → no change; the bonus reaches the effect/essence math. **This step is cut cleanly if Ben defers (O5).**

## Step 9 — Canary, full regression, index

**Files:** `src/lib/services/be/canary.test.ts` (extend), `research/INDEX.md`.

- Extend the canary with a full cast turn: a known growth spell cast at `success` against an active-lactation `pressure_prone` girl with a same-turn classifier growth proposal — assert exact `nextState`, `checkLog`, `beLog`, essence spend, and that R9 dedupe left ONE growth.
- Full run: `npx vitest run`, `npm run check`, `npx eslint .`. Mark Phase 4 implemented in `research/INDEX.md`.

---

## Risks

1. **Double-application (R9).** The highest-consequence correctness bug: a cast-grew girl growing twice (spell event + classifier prose event). The dedupe must be narrow (same kind, same target, only when a spell effect fired) or it eats legitimate events. Step 4's dedupe test + the Step 9 canary are the contract; this is the top adversarial-review target.
2. **Two-surface learn rollback (R6).** Learning a spell writes an Entry (entries table) AND `knownSpells` (sheet metadata). A missed capture on either side leaves an orphaned entry or a phantom knownSpell after undo. Step 6's rollback assertions are mandatory; second-highest review attention.
3. **Neutral passthrough breaks.** Any unconditional `spellId`/spells-line/`supplyDelta` write rewrites non-caster metadata or non-caster prompt bytes on the first Phase-4 turn. The Step 3 (reducer) and Step 5 (prompt) byte-identity tests are the guards — land them before wiring.
4. **`EntryType` exhaustiveness fan-out.** Adding `'spell'` forces arms in `STICKINESS_BY_TYPE` and every lorebook UI type map; a missed non-exhaustive `switch` (no `default`) is a runtime `undefined`, not a compile error. Grep `EntryType` in Step 1 and fix each site before proceeding.
5. **Effect intensity vs. growth roll double-randomness (R4).** Band scales the emitted intensity, then the reducer rolls the growth landing. Correct and thematic, but a test must prove a "success" cast can still land a partial growth and that both rolls are seeded/replayable — otherwise it reads as a bug in play.
6. **Classifier re-proposing a fizzled cast.** On a `fail` cast the prose may still describe an attempt; the classifier could propose events the mechanics denied. The `[CHECK RESULT]` fizzle directive (R8) plus R9's dedupe (which fires only when a spell effect *landed*) must not accidentally suppress a legitimately-classified unrelated event on a fizzle turn.
7. **Prompt-cache regression.** The known-spells line is a new `[PLAYER SHEET]` addition; it must render only when `knownSpells.length > 0` and after the stable lines, or every non-caster's cached sheet block invalidates. Snapshot in Step 5.
8. **Generation validation escape.** An LLM-generated spell with a plausible-but-invalid effect (out-of-vocab kind, DC/cost out of range, `school` not a `SkillId`) must be rejected by `spellSchema`/`effectTagSchema` before `addEntry`, never persisted half-valid. Step 1 + Step 6 tests assert rejection.

## Trickiest integration points

1. **The R9 dedupe seam in `applyBeEvents`.** The spell's engine-authored events and the classifier's prose-derived events meet in the same per-character reduce. The dedupe must run after bucketing, before the reduce, keyed on (kind-family, target), and only when a spell effect of that family fired this turn. Get the kind-family mapping right (growth ↔ catalyst/contact/attempt is many-to-one).
2. **Two writers in one cast turn (R5).** `applyRpgTurn` (essence + check record) and `applyBeEvents` (effects) both run for a cast. Keep the split clean: essence never spent in `applyBeEvents`, BE events never built in `applyRpgTurn`. Thread the resolved spell Entry to the BE side without giving it the sheet.
3. **`spellId`-only choices.** A cast choice may carry only `spellId` + `targetCharacter` (the generator need not restate the spell's dc/cost). `CheckPhase` must resolve the Entry to fill skill/dc/essenceCost — decide the precedence when a choice *does* restate them (spell Entry wins, or explicit choice wins — recommend spell Entry as source of truth to prevent drift).
4. **`stat_invention` vocabulary timing (R7).** The detector needs the known-spell names as-of this turn, including a spell learned *this same turn* (Step 6) — resolve the list after the learn write, or a just-researched spell mentioned in the same narration false-fires.
5. **Effect module placement (R5).** `be/effects.ts` constructs BE types; `rpg/` must not gain a reverse import edge. If any effect needs `SkillId` (school), that type already lives in `rpg/types.ts` — pass the resolved school as a plain string into `be/effects.ts`, don't import `rpg/` from `be/`.

## Adversarial review outcomes (2026-08-18) — 3-lens + fix-diff refutation

Three parallel Opus lenses (security/bypass · rollback/determinism · correctness/edge-case) + a fix-diff refutation pass. The core contracts were confirmed **correct**: R9 dedupe (narrow, growth-family-aware), determinism (pure translation, index-seeded rolls replay on undo, differ on retry), the two-writer split (essence in `applyRpgTurn`, effects in `applyBeEvents`), `supply_surge` purity + neutral passthrough, unknown-spell double-guarding, rollback capture for spell-only casts, and the **UI→engine cast seam end-to-end** (`SpellbookSection` tag text matches `CheckPhase.tagApplies`).

**Fixed this session:**
- **`check_debuff` was inert** (a shipped vocabulary member did nothing — the `hex:` condition had no reader). Wired `buildTargetCheckModifiers` to grant the caster +`CHECK_DEBUFF_DC_PENALTY` against a hexed girl (any skill), test-pinned.
- **Event-less spell effects were dropped against a never-seeded girl** (bond/dependence/condition/check_debuff/supply_surge/fill:set): the seeding gate keyed only on `charEvents`. Now the spell's target girl seeds even with no events.
- **Fizzled casts emitted a self-contradicting narration directive** ("narrate the effects" on a fail that applied none). Gated on non-fail band.
- **Bond/exposure spell effects replaced (dropped) the classifier's same-turn shifts** for the target; changed to append (both apply, velocity-capped).
- **Per-turn `getEntries` for non-casters** — now gated on the protagonist actually knowing spells.
- **`learnSpell` orphan-cleanup** now logs on a double-failure instead of swallowing.

**Documented, not fixed (deliberate):**
- **Spell `dc`/`essenceCost` are authoritative only via the UI cast path** (v1 — `SpellbookSection` fills them from the entry). When the deferred LLM-`spellId`-tagging path ships, `CheckPhase` must resolve the spell Entry to override choice-supplied `dc`/`cost`/`school` (trickiest #3) — it currently trusts the tag. Latent, not reachable in v1.
- **Casting from the spellbook while the composer is in say/think/story mode silently drops the cast** (becomes a plain narrated action) — same as any tagged action choice in those modes; a UX footgun worsened by the Cast button living in a different panel from the mode toggle. Consider forcing `do` when a `spellId` tag is pending.
- **`stat_invention` spell rule catches only the zero-known-spells case** (a one-spell caster inventing a *second* spell is uncaught) and is unanchored (NPC spellcasting prose can false-fire for a spell-less protagonist) — both consistent with the existing skill-mastery detector's posture; drift findings are non-destructive (a visible `[CONTINUITY]` note, never a silent state change).

## Ben's open calls — RESOLVED (2026-08-18, Ben)

- **O1 — Gap tags → RECOMMENDED V1 (confirmed).** v1 ships `supply_surge` (new step-7 path) and `check_debuff` (target-girl condition). `dependence`-decrease and PC self-buff are **deferred** (no clean path; both fight existing anti-positivity design).
- **O2 — Vault portability → DEFER (default stands).** v1 spells are in-game-generated only; `VaultLorebookEntry` is not touched.
- **O3 — Research UX → LIGHT FLOW (confirmed).** The `generateStructured` SheetPanel research action (R6), not the `LoreManagementService` tool-loop/approval UI.
- **O4 — Multi-target ritual → DEFER (default stands).** Single-target v1; Ritualism one-cast-N-girls deferred (R10).
- **O5 — Alchemy-milk consumption → SHIP MINIMAL (confirmed); SHIPPED AS NON-CONSUMING (deviation, flagged).** Implemented as a **passive**: an `alchemy`-school cast gets +1 effect intensity while any `prime`/`rich` milk unit sits in inventory — but the unit is **not decremented** in v1. Rationale: the consuming variant needs an inventory decrement-with-rollback path (incl. delete-on-zero) that would expand the persistence-review surface late in the build; the plan itself floated the no-decrement version as "the smallest version". The felt mechanic (milk empowers alchemy) ships; unit-consumption is a clean, well-scoped follow-up. **Needs Ben's ack** — say the word and consumption gets wired onto the proven `applyMilkYield` capture pattern.
- **Casting-choice authority (trickiest #3) → spell Entry is source of truth** for dc/cost/school over a choice that restates them (default recommendation stands).
- All essence costs, DCs, band-intensity deltas, and surge magnitudes are D5 reference defaults stacked on still-untuned Phase 1–3 numbers.
