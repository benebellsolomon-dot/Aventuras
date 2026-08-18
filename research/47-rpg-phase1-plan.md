# RPG Layer — Phase 1 Implementation Plan
Spec: `research/46-rpg-layer-design.md` §6 item 1 (architecture in §1–§4, resolved numbers in §8)

## Standing constraints (apply to every step)

- **Purity contract.** No `Date.now`/`Math.random`/`crypto.randomUUID` anywhere in `be/` or the new `rpg/` engine modules. Same inputs → same outputs. Time and ids enter only from the store layer.
- **Single writer.** `CheckService` never writes. It returns a value. All `rpgSheet` writes happen in exactly two places: (a) `StoryStore.applyRpgChecks()` (new, sibling of `applyBeEvents`) inside `applyClassificationResult`, and (b) explicit user actions in `SheetPanel.svelte` (point spend, manual rest) — the same user-initiated pattern `BeStatePanel.svelte:43` already uses.
- **Module boundaries.** `eslint.config.js:87` (warn) forbids cross-service imports of internals. Roll core lives at `src/lib/services/be/roll.ts`, re-exported from `src/lib/services/be/index.ts`. New service folder `src/lib/services/rpg/` gets its own `index.ts`; it imports BE only via `$lib/services/be`. Stores/components/context-builder import only `$lib/services/rpg`.
- **Testability.** `vitest.config.ts` is `include: ['src/**/*.test.ts']`, `environment: 'node'` — **Svelte components cannot be unit-tested**. Every derivation behind the UI (attribute mod, essence max, band→tint, success-odds for DC chips, log ordering) goes in a pure `.ts` with a `.test.ts`; `.svelte` files hold markup only, and their verification is `npm run check` + `eslint .`.
- **Classifier schema.** *Phase 1 touches the classifier schema nowhere.* No `bondEvents`/`exposureEvents` (Phase 2), no rest-detection event. If a later change is added, it must go through an `extendClassificationSchemaWithBeEvents`-style extension (`src/lib/services/be/schema.ts:70`) that returns the input unchanged when the schema isn't extendable, with the caller warning on reference identity (`ClassifierService.ts:103-108`). Flagged here so no step silently regresses it.

## Rulings to pin (do not leave to implementation discretion)

1. **Crit band:** crit = `success && (margin >= 8 || nat >= 18)`. A nat 18 that still misses the DC is a **fail**, not a crit. Rationale: a crit is a degree of success; unconditional nat-crit makes DC meaningless at high DCs. Both boundary cases go in the band table test.
2. **Shared core = `seededRoll` only.** BE's `resolveOutcome(roll, intensity)` is absolute-band (`ROLL_BANDS` 18/11/6 in `constants.ts:24`); the check resolver is DC-relative. They stay two exports in one pure module and are never merged — merging them breaks the golden-identity deliverable.
3. **Seed:** `${storyId}:${userActionEntryId}:check`. Retry creates a **new** `user_action` entry (`ActionInput.svelte:999`, `:1141`) so a retry re-rolls — identical to `applyBeEvents`' documented behavior (`story.svelte.ts:2828-2833`). Undo/branch replay of a preserved entry replays identically. Comment this and test it; don't repeat the spec's looser "retry/undo replay identically" claim.
4. **Time period:** `TimeTracker` is `{years, days, hours, minutes}` — there is no period field. Define pure `periodIndex(tracker)` = `floor(totalHours / 6)`; grant `+2` essence when it increments between `timeTrackerBefore` and the post-progression tracker.
5. **Rest:** manual "Rest" button in `SheetPanel.svelte` (full essence restore). Automatic rest detection needs a classifier field → deferred.
6. **Essence spend timing:** the check *resolves* before narration (immutable-fact injection) but the sheet *write* happens at classification time, in the same delta as `beLog`. Abort after narration = no spend, no `checkLog` — accepted, mirrors BE.

---

## Step 1 — Extract the roll core

**Files:** new `src/lib/services/be/roll.ts`; edit `src/lib/services/be/reducer.ts`, `src/lib/services/be/index.ts`; new `src/lib/services/be/roll.test.ts`.

- Move `seededRoll` (`reducer.ts:57`) and `resolveOutcome` (`:66`) verbatim into `roll.ts` as `seededRoll` and `resolveGrowthOutcome` (keeping `clampIntensity` + the `INTENSITY_ROLL_BONUS`/`ROLL_BANDS` imports with it). Add the check-band resolver here too: `resolveCheckBand(nat: number, total: number, dc: number): CheckBand` with `crit | success | partial | fail` per ruling 1 and `partial` = miss by ≤ 4.
- `reducer.ts` re-imports both from `./roll`; its two call sites (`:312`, `:355`) are untouched. `be/index.ts:74` keeps exporting `seededRoll` under the same name (it is imported by `reducer.test.ts:4` and `pipeline.test.ts:25`) and adds `resolveCheckBand`, `resolveGrowthOutcome`, `type CheckBand`.
- `roll.test.ts`: golden table of ~24 fixed seed strings → exact roll values (harvest them by running the current `seededRoll` before the move), plus the growth-band table across intensities 1–3 at roll 5/6/10/11/17/18, plus the check-band boundary table including nat-18-vs-high-DC and margin exactly 8 / miss exactly 4.

**Verify:** `npx vitest run src/lib/services/be` — `reducer.test.ts`, `pipeline.test.ts`, `canary.test.ts` pass **unchanged**; total suite ≥ 272 + new. `npm run check`, `eslint .`.

## Step 2 — RPG state model, skill registry, metadata persistence

**Files (all new):** `src/lib/services/rpg/types.ts`, `constants.ts` (skills + tuning), `derive.ts`, `metadata.ts`, `index.ts`, `metadata.test.ts`, `derive.test.ts`.

- `types.ts`: `RpgSheet` exactly as spec §2.1 minus spells wiring (`knownSpells: string[]` declared but unused in Phase 1), `AttributeId`, `SkillId`, `CheckBand` re-export, `CheckRecord` (the `checkLog` row: `{ action, skill, dc, nat, bonusBreakdown, total, margin, band, essenceSpent, drift? }`), `RpgDriftFinding`.
- `constants.ts`: the 18-skill registry from spec §2.2 as `SKILLS: ReadonlyArray<{ id: SkillId; attribute: AttributeId; label: string; beThemed: boolean }>` plus `SKILL_BY_ID`; `ESSENCE_BASE = 6`, `ESSENCE_PER_LEVEL = 2`, `ESSENCE_REGEN_PER_PERIOD = 2`, `HOURS_PER_PERIOD = 6`, `POINTS_PER_LEVEL = { attribute: 1, skill: 2 }`, `PARTIAL_MISS_WINDOW = 4`, `CRIT_MARGIN = 8`, `CRIT_NAT = 18`. Carry the D5-style "reference default, re-derive from play" banner comment.
- `derive.ts` (pure): `attributeMod(score) = Math.floor((score-10)/2)`, `checkBonus(sheet, skillId)`, `essenceMax(level) = 6 + 2*level`, `periodIndex(tracker)`, `successOdds(bonus, dc)` (for DC chips), `defaultRpgSheet()` (level 1, all attributes 10, all skills 0, essence full).
- `metadata.ts`: mirror `be/metadata.ts` exactly — `RPG_SHEET_KEY = 'rpgSheet'`, `rpgSheetSchema` with `.passthrough()` at every object level (the 31a lesson-3 rule), `readRpgSheet(metadata)`, `writeRpgSheet(metadata, sheet)` (structuredClone, preserves siblings including `bodyState` and `runtimeVars`).
- `index.ts`: public surface only.

**Verify:** `metadata.test.ts` mirrors `be/metadata.test.ts` — round-trip identity, deep-copy isolation, sibling `bodyState`/`runtimeVars` preservation, unknown-future-field passthrough, legacy protagonist metadata (no `rpgSheet`) → `null`. `derive.test.ts` covers the mod table, `essenceMax` at levels 1/3/10, `periodIndex` boundaries at 5h59/6h00 and across a day rollover.

## Step 3 — CheckService

**Files:** new `src/lib/services/rpg/CheckService.ts`, `CheckService.test.ts`; export from `rpg/index.ts`.

- Pure module (a namespace of functions, not a `BaseAIService` subclass — it makes no model call): `resolveCheck({ seed, sheet, skill, dc, essenceCost, modifiers })` → `CheckRecord`. Internals: `seededRoll(seed)` from `$lib/services/be`, bonus = `attributeMod + ranks + Σ modifiers`, total = nat + bonus, band from `resolveCheckBand`. Essence: returns `essenceSpent` and `insufficientEssence: boolean`; when insufficient, the check does not roll (returns a `fail`-band record with a `reason`), never a negative pool.
- No state mutation, no clock, no i/o.

**Verify:** `CheckService.test.ts` — band boundaries (margin 7/8, miss 4/5, nat 17/18/20, nat 18 vs unreachable DC), modifier stacking order, seed determinism (same seed → identical record; `:check` suffix isolates from BE's `:0`/`:pressure` seeds — assert a shared prefix yields different rolls), insufficient-essence path, and that `resolveCheck` never mutates its input sheet (frozen-input test).

## Step 4 — Choice schema extension + generator prompt

**Files:** `src/lib/services/ai/sdk/schemas/actionchoices.ts`, `src/lib/services/prompts/templates/generation.ts` (`action-choices`, `:3`), `src/lib/services/ai/generation/ActionChoicesService.ts`, `src/lib/stores/ui.svelte.ts` (`:178-180`, `:859`, `:894-910`, `:925`, `:1032`), `src/lib/components/story/ActionInput.svelte` (`~:216`).

- `actionChoiceSchema` grows **optional** `skill: z.enum(SKILL_IDS).optional()`, `dc: z.number().int().min(1).max(40).optional()`, `essenceCost: z.number().int().min(0).max(6).optional()`. Optional + no `.strict()` keeps legacy persisted `{text,type}` choices parsing (the restore paths at `ui.svelte.ts:894-910` and `:1032` must be checked to confirm they don't strip the new fields; they currently assign the parsed array wholesale, so widen the type only).
- `ActionChoicesService.generateChoices` gains an optional `playerSheetSummary` + `beMode` on `ActionChoicesContext`, adds `ctx.add({ playerSheetSummary, checkTaggingInstruction })`, where `checkTaggingInstruction` is empty string when beMode is off. Template gets a `{% if checkTaggingInstruction != '' %}` section: tag only choices with real risk; skill from the 18-name list; DC 8–24 with a short rubric; leave safe choices untagged. Keeps non-BE stories byte-identical (cache-safe).
- `ui.setPendingActionChoice(text, storyId)` widens to carry the whole `ActionChoice`; `pendingActionChoice` becomes `ActionChoice | null` (keep `.text` accessors working). `ActionInput.svelte`'s `$effect` stores the tag alongside `inputValue` in a new local `pendingChoiceTag`, cleared with the input.

**Verify:** new `src/lib/services/ai/sdk/schemas/actionchoices.test.ts` — legacy bare `{text,type}` parses; tagged choice parses; unknown skill id rejected; `dc` out of range rejected. Then `npm run check` + `eslint .`.

## Step 5 — Free-text risky-assess pre-pass

**Files:** new `src/lib/services/ai/sdk/schemas/riskassess.ts`, new `src/lib/services/ai/generation/RiskAssessService.ts`; edit `src/lib/services/ai/core/factory.ts`, `src/lib/services/ai/generation/index.ts`, `src/lib/services/ai/index.ts`, `src/lib/stores/settings.svelte.ts` (`DEFAULT_SERVICE_PRESET_ASSIGNMENTS`, `:1141`), `src/lib/services/prompts/templates/generation.ts`, `src/lib/components/vault/prompts/templateGroups.ts` (`:38` neighbourhood).

- Schema: `{ risky: boolean, skill?: SkillId, dc?: number, rationale?: string }`, tiny prompt (`risk-assess` template, category `service`), model sees the action text + a compact sheet summary + present-character names.
- `RiskAssessService extends BaseAIService`, `serviceId: 'riskAssess'`, preset assignment `'classification'` (cheap/fast tier, matching `classifier`). Registration checklist — all five sites: service class, `ServiceFactory.createRiskAssessService()`, `DEFAULT_SERVICE_PRESET_ASSIGNMENTS.riskAssess`, template in `generation.ts` (already spread into `PROMPT_TEMPLATES` via `templates/index.ts`), `templateGroups.ts` label. `getServicePresetId` (`settings.svelte.ts:3139`) is a bare map lookup — an unregistered id returns `undefined`, so the assignment entry is mandatory, not optional.
- Skip entirely when: beMode off, the action came from a **tagged** choice (tag wins), or the action is a `say`/`think`/`story` type. Non-risky → `{risky:false}` → zero further latency.

**Verify:** `riskassess.test.ts` for schema tolerance (missing skill/dc when `risky:false`; clamped dc). Service wiring by `npm run check` + a grep-confirmed five-site checklist.

## Step 6 — Resolve-then-narrate: pipeline plumbing

**Files:** `src/lib/services/generation/types.ts`, new `src/lib/services/generation/phases/CheckPhase.ts`, `phases/index.ts`, `GenerationPipeline.ts`, `phases/NarrativePhase.ts`, `src/lib/services/ai/index.ts` (`:203`), `src/lib/services/ai/generation/NarrativeService.ts`, `src/lib/components/story/ActionInput.svelte`.

- `types.ts`: add `'check'` to `GenerationPhase`; add `PendingCheck` (the resolved `CheckRecord` + the action text) to `GenerationContext` as `pendingCheck?`; add a `CheckResolvedEvent` to the `GenerationEvent` union so the UI can render the card **before** narration streams.
- New `CheckPhase` runs between `pre` and `retrieval` in `GenerationPipeline.execute` (`:127-140`). It: reads the tag (from the choice) or calls `RiskAssessService`; when a check is warranted, calls the pure `resolveCheck` with seed `${story.id}:${ctx.userAction.entryId}:check`; yields `phase_start`/`check_resolved`/`phase_complete`; returns the `CheckRecord`. Untagged/non-risky → returns `null` with no model call. **No writes.**
- **Plumb the block through every link** (recommended: append one optional positional param to `AIService.streamNarrative`'s 8 — smaller diff than an options-object conversion):
  `NarrativeDependencies.streamNarrative` (`NarrativePhase.ts:29`) → `AIService.streamNarrative` (`ai/index.ts:203`) → `NarrativeService.stream/generate` `NarrativeOptions` (`:243`) → `buildPrompts` → `buildUserPrompt` (`:508`).
- **Block placement (cache order):** `[PLAYER SHEET]` is stable → rendered in the *system* template via a new `playerSheetBlock` context var, immediately after `beStateBlock` (Step 7). `[CHECK RESULT — already resolved, immutable]` is volatile and authority-dominant → appended in `buildUserPrompt` after `postHistoryBlock` (`:553`), i.e. dead last in the user prompt. Do **not** hide it inside `story.settings.postHistoryInstructions`, which only renders when the user authored one (`NarrativeService.ts:483`).
- `ActionInput.svelte` handles the new `check_resolved` event: stashes the record in a store field the streaming entry reads (Step 10), and passes it into `applyClassificationResult` at `classification_complete`.

**Verify:** new `src/lib/services/generation/phases/CheckPhase.test.ts` with injected fake deps — untagged action makes no assess call and returns null; tagged action resolves with the exact expected seed; abort before resolve returns null. Block ordering asserted in Step 7's test. `npm run check`, `eslint .`.

## Step 7 — Prompt blocks: `[PLAYER SHEET]` and `[CHECK RESULT]`

**Files:** new `src/lib/services/rpg/context.ts` + `context.test.ts`; `src/lib/services/context/context-builder.ts` (new `loadRpgSheetContext`, mirroring `loadBeStateContext:193`); `src/lib/services/prompts/templates/narrative.ts` (both render sites, `:128` adventure and `:304` creative-writing); `NarrativeService.buildUserPrompt`.

- `buildPlayerSheetBlock(sheet, protagonistName)` → `[PLAYER SHEET]` with level, the six attribute mods (signed), essence `cur/max`, the notable skills (ranks > 0, top 6), and an explicit "these are the only abilities that exist; do not invent stats, skills, or spells" line. Empty string when beMode off or the protagonist carries no sheet.
- `buildCheckResultBlock(record)` → `[CHECK RESULT — already resolved, immutable]` with the action, the visible math (`d20 nat X + bonus Y = Z vs DC N → BAND`), a band-specific directive (crit/success/partial-with-cost/fail), any essence spent, and the hard rule from spec §4: *the outcome is resolved fact; softening a failure or granting unearned success is a continuity error.* Empty string when no check ran.
- `context-builder.ts` `loadRpgSheetContext(story, characters)` reads the `relationship === 'self'` row, guards with `story.settings?.beMode === true`, try/catch → `''` on failure (identical shape to `loadBeStateContext`), `this.add({ playerSheetBlock })`. Both narrative templates gain `{% if playerSheetBlock != '' %}` immediately after the `beStateBlock` gate.

**Verify:** `context.test.ts` — empty-string gates (no sheet / beMode off), block header stability (exact-string snapshot so cache-prefix drift is caught), mod signs, band directives per band, and that no volatile number appears in `[PLAYER SHEET]` before the stable prefix.

## Step 8 — Store apply: essence, checkLog, regen, milestone leveling

**Files:** `src/lib/stores/story.svelte.ts` (`applyClassificationResult` ~:1947, delta build ~:2733, `hasChanges` ~:2787, `applyBeEvents` :2818), `src/lib/types/index.ts` (`WorldStateDelta`, `:1043`), `src/lib/services/rpg/leveling.ts` + `leveling.test.ts`.

- `WorldStateDelta` gains `checkLog?: import('$lib/services/rpg/types').CheckRecord[]` using the same type-only import pattern as `beLog:1044`. Add `checkLog.length > 0` to the `hasChanges` condition. **No rollback code of its own** — `checkLog` is instrumentation; the rollback guarantee comes from protagonist metadata capture below (`rollbackService.ts:202-209` restores `metadata`).
- New private `applyRpgTurn(record, entryId, trackingEnabled, charactersBefore, timeTrackerBefore)`, called right after `applyBeEvents` and before the delta build. It:
  1. Resolves the protagonist (`relationship === 'self'`) — note `applyBeEvents` explicitly *skips* self (`:2900`), so this method owns that row exclusively.
  2. Pushes the protagonist's before-state into `charactersBefore` with the same not-already-present / not-in-`createdCharacterIds` guard used at `:2984-2996`.
  3. Applies, in order: essence spend from the check record → period regen (`periodIndex(timeTrackerBefore)` vs `periodIndex(this.currentStory.timeTracker)`; `applyTimeProgression` already ran at `:2713`, so both sides are available) clamped to `essenceMax(level)` → milestone level grants.
  4. Writes once via `writeRpgSheet` inside `wrapUpdate`, and pushes the `CheckRecord` into the returned log **only after the write lands** (same discipline as `:2977`).
- **Milestone leveling** (`leveling.ts`, pure): `levelGrantsFromCrossings(sheet, crossings)` where a crossing is an `INTERACTION_MILESTONES` (`be/milestones.ts:18`) threshold that a tracked girl's `measurements().nowTotalKg` crossed this turn. Widen `applyBeEvents`' return from `BeLogRecord[]` to `{ beLog, crossings }` and compute mass before/after from the pre/post `BodyState`. **Idempotency is mandatory:** record awarded crossing keys (`${characterId}:${massKg}`) on the sheet as `awardedMilestones: string[]`; a retry or branch replay that re-crosses must not double-grant. Each grant: `level += 1`, `unspentPoints.attribute += 1`, `unspentPoints.skill += 2`, `essence.max` recomputed.

**Verify:** `leveling.test.ts` — single crossing grants once; the same crossing replayed grants zero; two crossings in one turn grant two; unspent points accumulate; `essence.current` clamps to the new max, never above. Also add a `rpg/metadata.test.ts` case proving a sheet round-trips through `writeRpgSheet(writeBodyState(...))` with both keys intact.

## Step 9 — Drift detectors: `check_contradiction` + `stat_invention`

**Files:** new `src/lib/services/rpg/drift.ts` + `drift.test.ts`; `src/lib/stores/story.svelte.ts` (call site inside `applyRpgTurn`); `src/lib/services/rpg/context.ts` (continuity line).

- `detectDrift` in `be/drift.ts:64` is per-girl and carries findings through `BodyState.driftNote` — the new detectors are about the *player* and fit neither signature nor carrier. Write a separate pure `detectRpgDrift(narrative, sheet, record | null): RpgDriftFinding[]`:
  - `check_contradiction` — prose asserts an outcome opposite to the resolved band (fail/partial narrated as clean success, or crit/success narrated as failure). Lexical and conservative, in the style of `be/drift.ts`'s attribution-window approach; require both an outcome-word match and name/action attribution (the bare-"grew" false-positive lesson).
  - `stat_invention` — prose credits the PC with a named skill/ability/spell not in `SKILLS` or at rank 0, or claims a level the sheet doesn't have. Phase 1 has no spells, so restrict the vocabulary to the 18 skill names, the six attributes, and level claims.
- **Dual carrier**: the finding is stamped onto the `CheckRecord.drift` field (drives the amber "continuity corrected" tag on `CheckCard`) **and** onto `rpgSheet.driftNote = { note }` (a one-turn carrier, cleared on the next `applyRpgTurn`, rendered by `buildPlayerSheetBlock` as a `[CONTINUITY]` line exactly like `be/context.ts:141`).

**Verify:** `rpg/drift.test.ts` with fixture narratives per detector in the existing `be/drift.test.ts` style, plus explicit negative fixtures (prose that mentions "perception" as a common noun; a partial success narrated *with* its cost — must not fire).

## Step 10 — `CheckCard.svelte` in the story stream

**Files:** new `src/lib/components/story/CheckCard.svelte`; `src/lib/components/story/StoryEntry.svelte`, `StreamingEntry.svelte`; `src/lib/services/rpg/derive.ts` (presentation helpers); `src/lib/stores/ui.svelte.ts` (transient `pendingCheckRecord`).

- Card renders: monospace math line, band label, outcome-tinted border, essence spent, the BE consequence chain (matching `beLog` rows from the same delta), and a continuity-tag slot fed by `record.drift`.
- Two sources, one component: `StreamingEntry.svelte` reads `ui.pendingCheckRecord` (set by the `check_resolved` event in Step 6) so the card appears **before** narration streams; `StoryEntry.svelte` reads `entry.worldStateDelta?.checkLog` for persisted turns. Clear `pendingCheckRecord` when the narration entry is added, so the card doesn't double-render.
- Presentation-only logic (`bandLabel`, `bandTint`, `formatMath`) lives in `rpg/derive.ts` so it is unit-testable.

**Verify:** derive helpers covered in `derive.test.ts`; component itself by `npm run check` + `eslint .` and a manual BE-mode turn.

## Step 11 — DC chips in `ActionChoices.svelte`

**Files:** `src/lib/components/story/ActionChoices.svelte`.

- Right-edge chip per tagged choice: `SKILL DC N`, tinted by `successOdds(checkBonus(sheet, skill), dc)` banded (comfortable / even / long shot); essence cost pill when `essenceCost > 0`; untagged choices render exactly as today. Gate the whole chip on beMode + a present sheet so non-BE stories are visually unchanged.

**Verify:** `successOdds` banding table in `derive.test.ts`; `npm run check` + `eslint .`.

## Step 12 — Sheet sidebar tab v1

**Files:** `src/lib/types/index.ts` (`SidebarTab`, `:699`), `src/lib/stores/ui.svelte.ts` (`:101`, `:301`), `src/lib/components/layout/Sidebar.svelte` (`:28` tabs array, content section `:96-114`), new `src/lib/components/world/SheetPanel.svelte`.

- `SidebarTab` union gains `'sheet'`. The `tabs` array becomes `$derived` on `story.currentStory?.settings?.beMode` (the Sheet entry appended only in beMode) — **note the swipe handlers (`:38-54`) index into `tabs`, so they must read the derived array**, and add a guard that resets `ui.sidebarTab` to `'characters'` if it is `'sheet'` when beMode flips off.
- `SheetPanel.svelte` v1 (explicitly **no spells**): attributes grid with derived mods, essence bar (`current/max` + next-spend hint), 18-skill list (top-6 summary + drill-in), tap-to-allocate point spend writing through `story.updateCharacter(protagonist.id, { metadata: writeRpgSheet(...) })` (the `BeStatePanel.svelte:43` pattern), a manual **Rest** button (full essence restore, ruling 5), and a badge on the tab icon when `unspentPoints` is non-zero.

**Verify:** allocation validity rules (can't spend more than unspent; attribute cap) live in `rpg/leveling.ts` as pure `spendPoint(sheet, target)` with tests; the panel is `npm run check` + `eslint .` + manual.

---

## Risks

- **Crit-band ambiguity** (ruling 1). Unresolved, it silently produces free crits at high DCs and invalidates the DC-chip odds. Pin it in a code comment on `resolveCheckBand` plus the boundary tests.
- **Milestone double-grant.** Retries and branch replays re-cross the same mass thresholds. Without the `awardedMilestones` key set the PC levels on every retry. The single highest-severity correctness risk in the phase.
- **Abort after narration.** The check resolved and was narrated as fact, but classification never ran → no essence spend, no `checkLog`, no card in the persisted entry. Accepted (mirrors BE's no-entryId skip); document it at the `applyRpgTurn` call site so it isn't "fixed" into a pre-narration write that breaks rollback.
- **Prompt-cache regression.** `[PLAYER SHEET]` in the system body must sit at a stable position with no per-turn volatile text beyond the sheet numbers; `[CHECK RESULT]` must stay last in the user prompt. Snapshot test on block headers is the cheap guard.
- **Choice-schema round-trip.** Persisted legacy choices (`ui.svelte.ts:894-910`, `:1032`) must keep parsing; a `.strict()` or required field there breaks saved sessions.
- **Positional-parameter creep.** `AIService.streamNarrative` already takes 8 positional args; adding a 9th is the small diff but raises mis-ordered-call-site odds. If the diff is comfortable, converting to an options object in the same step is the safer long-term move.

## Trickiest integration points

1. **The check-result plumbing chain** (Step 6): `CheckPhase` → `NarrativeDependencies` → `AIService.streamNarrative` → `NarrativeOptions` → `buildPrompts` → `buildUserPrompt`, plus the two template render sites. Five signatures and two templates; dropping any link silently produces narration that ignores the roll — and the failure looks like model disobedience, not a wiring bug. Land this step with a `CheckPhase` test *and* an eyeball of the final assembled prompt.
2. **Resolve-before-narration vs. write-at-classification** (Steps 6 + 8). The record must survive from `CheckPhase` through streaming to `applyClassificationResult` (in `ActionInput.svelte`'s event loop) without being written to the DB in between, or rollback coverage and the single-writer rule both break.
3. **RPG drift carrier duality** (Step 9). One finding, two destinations with different lifetimes: the `CheckRecord` (immutable, persisted in the delta) and `rpgSheet.driftNote` (one-turn, cleared next turn). Getting the clear-timing wrong either strands a stale `[CONTINUITY]` line in the prompt forever or drops it before it renders.
