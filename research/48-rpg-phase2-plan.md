# RPG Layer — Phase 2 Implementation Plan (Harem tracks)
Spec: `research/46-rpg-layer-design.md` §6 item 2 · state model §2.3 · classifier/prompt §4 · UI §5 · quirk registry §8
Baseline: Phase 1 as landed (`78f76910`), 395 tests / 27 files green.

## Standing constraints (unchanged from research/47)

Purity (no `Date.now`/`Math.random`/`crypto.*` in `be/` or `rpg/`), single writer, module boundaries (`rpg/` imports BE only via `$lib/services/be`; stores/components import only the folder `index.ts`), testability (`vitest` node env, `src/**/*.test.ts` only — `.svelte` verified by `npm run check` + `eslint .`), and the degrade-gracefully classifier-schema contract (`extendClassificationSchemaWithBeEvents` returns its input unchanged when unextendable; `ClassifierService.ts:103` warns on reference identity).

---

## Rulings to pin (do not leave to implementation discretion)

**R1 — Tracks reduce INSIDE `reduceCharacterBody`, as new pinned pipeline steps.**
Not a sibling reducer called from `applyBeEvents`. Justification, in order of weight: (a) quirk effects mutate *inputs to existing steps* — `fast_metabolizer`/`stubborn_frame` change event intensity before the roll (step 6), `greedy_flesh` changes the cooldown armed by `landGrowth` and the pressure accrual (step 7), `slow_burn` changes the anticipation split (steps 3/6). A sibling reducer would have to either duplicate those gates or write twice; (b) withdrawal is a `BodyCondition` and must be derived inside step 8 with derived-first precedence over classifier conditions, or the classifier can shadow it; (c) dependence pulls `attitude`, which step 4 owns; (d) one reducer call = one `nextState` = one `JSON.stringify` change check = one write — the existing single-writer/rollback discipline in `applyBeEvents` needs no change.
The *implementation* still splits out: all track math lives in new pure `be/tracks.ts` and `be/quirks.ts`, unit-tested standalone; `reducer.ts` only sequences them. `reducer.ts` grows ~60 lines, not 300.

**R2 — New per-turn inputs arrive via `ReducerExtras`, not new positional params.** `extras.bondEvents?: ReadonlyArray<BondEvent>`, `extras.exposureEvents?: ReadonlyArray<ExposureEvent>`. `reduceCharacterBody`'s 7-arg signature is unchanged; every existing call site and test compiles untouched.

**R3 — Quirks are assigned in the store's auto-seed block, keyed on `${storyId}:${characterId}:quirks` only.** Never on `entryId` — a retry creates a new entry id and would otherwise reroll her personality. Pure `assignQuirks(seed): QuirkId[]` (1–3, `seededRoll`-driven, no `Math.random`). A **lazy backfill** covers already-seeded saves: in `applyBeEvents`, when `state.quirks === undefined`, assign with the same seed before reducing and log a `seed`-kind `BeLogRecord`. Assignment is idempotent by construction (same seed → same quirks) and guarded by the `undefined` check, so branch replay cannot re-roll.

**R4 — Every quirk/bond "DC ±N" effect is expressed as a `CheckModifier` on the BONUS with the sign inverted** (`CheckService` adds modifiers to the bonus; it never touches the DC). `skittish` → `{ label: 'skittish (DC +2)', value: -2 }`. Pin this in a comment on the modifier builder, and assert the sign in tests — an inverted sign here silently makes every quirk help the player.

**R5 — A check identifies its target girl by an optional `targetCharacter` name on both `actionChoiceSchema` and `riskAssessResultSchema`**, resolved case-insensitively against `context.worldState.characters`, skipping `relationship === 'self'`. No match, no name, or a target with no `bodyState` → **no modifiers**, check resolves exactly as Phase 1. `CheckRecord` gains `target?: string` (the resolved character *name*, for the roll card and turn log).

**R6 — Velocity caps are named constants in `be/constants.ts`, applied per character per turn** (reference defaults, D5 banner — re-derive from play):
`MAX_BOND_DELTA_PER_TURN = 5` (net absolute, symmetric — caps warming *and* strain), `MAX_DEPENDENCE_GAIN_PER_TURN = 4` (gain only; decay is uncapped but is 1/turn by construction), `BOND_DELTA_PER_INTENSITY = 2`, `DEPENDENCE_GAIN_PER_INTENSITY = 2`, `DEPENDENCE_DECAY_PER_IDLE_BEAT = 1`, `BOND_DEFAULT = 20`, `DEPENDENCE_DEFAULT = 0`, `WITHDRAWAL_DEPENDENCE_THRESHOLD = 60`, `WITHDRAWAL_IDLE_BEATS = 3`, `CRAVING_PULL_DEPENDENCE = 60`.

**R7 — Bands (single source of truth, `be/tracks.ts`, used by prompts, gating, and UI alike).**
Bond: `wary` 0–19 · `warming` 20–44 · `bonded` 45–69 · `deeply bonded` 70–89 · `devoted` 90–100.
Dependence: `none` 0–14 · `curious` 15–34 · `hooked` 35–59 · `craving` 60–84 · `bound` 85–100.
Bond check modifier (intimate/social skills only): wary −2 · warming 0 · bonded +1 · deeply bonded +2 · devoted +3.

**R8 — Withdrawal is a derived `BodyCondition`, front-inserted in step 8 exactly like `Engorged`.** Fires when `dependence >= WITHDRAWAL_DEPENDENCE_THRESHOLD && beatsSinceExposure >= WITHDRAWAL_IDLE_BEATS`; label `'Withdrawal'`, `ttl: 2`, re-upserted every turn the condition holds. `devoted_heart` lowers the threshold by 15 and swaps in a harsher `note`. Front insertion is mandatory — `MAX_BE_CONDITIONS = 6` slices from the tail and would otherwise evict it.

**R9 — No prompt-template file edits.** `[HAREM STATE]` is built by a new `buildHaremStateBlock(entries)` in `be/context.ts` and **concatenated into the existing `beStateBlock` context var** by `context-builder.ts`; gated-action text is **appended into the existing `checkTaggingInstruction` var** by `rpg/context.ts`. Rationale: shipped templates can be overridden by user copies in the vault (the same reason `buildBeEventInstructions` piggybacks on `customVariableInstructions`) — a new `{{ haremStateBlock }}` var would silently render nothing for anyone with a customized narrative template. Header strings stay fixed and snapshotted; the block is appended *after* `[BODY STATE]`, so the cache prefix is unchanged.

**R10 — Lactation-dependent quirks ship as data only.** `early_bloomer` (induction DC −4, supply climbs fast) and `pressure_prone` (engorges at lower fill, bigger temporary swell) are registered in the quirk registry with full metadata, are assignable, render in prompts/UI, and have **zero mechanical wiring** in Phase 2. Their `QuirkDef` carries `phase: 3`, and `quirks.test.ts` asserts that no Phase-2 code path reads them. (Judgment call flagged: `pressure_prone`'s engorge-threshold half *could* be wired today against the existing `ENGORGED_FILL_THRESHOLD`. Recommendation is still to defer — splitting one quirk across two phases makes the balance pass in Phase 3 read against a moving baseline.)

---

## Step 1 — Track state model + banding

**Files:** `src/lib/services/be/types.ts`, `metadata.ts`, `constants.ts`, `index.ts`; new `src/lib/services/be/tracks.ts` + `tracks.test.ts`.

- `types.ts` — `BodyState` gains optional passthrough fields: `bond?: number`, `dependence?: number`, `quirks?: QuirkId[]`, `beatsSinceExposure?: number`. New `BondEvent { character, direction: 'warm' | 'strain', intensity }` and `ExposureEvent { character, intensity }`. `BeLogRecord['kind']` union gains `'bond' | 'exposure' | 'withdrawal'`.
  - `direction` rather than a signed number is deliberate: it makes negative movement a first-class thing the classifier must choose, and it removes a whole class of sign-confusion in coercion.
- `metadata.ts` — `bodyStateSchema` gains `bond: z.number().min(0).max(100).optional()`, `dependence` likewise, `quirks: z.array(z.string()).max(3).optional()`, `beatsSinceExposure: z.number().int().nonnegative().optional()`. `quirks` is `z.string()`, **not** `z.enum(QUIRK_IDS)` — an unknown future quirk id must survive a round-trip through an older reader (31a lesson 3); narrowing happens at read time in `quirks.ts`.
- `constants.ts` — the R6 constants under the existing D5 banner.
- `tracks.ts` (pure, no BodyState writes — it returns values):
  `clampTrack(n)` → 0–100 · `bondOf(state)`/`dependenceOf(state)` (defaults applied) · `bondStance(bond): BondStance` · `dependenceStage(dep): DependenceStage` · `bondCheckModifier(bond): number` · `applyBondEvents(bond, events, quirkBonusPerEvent): { bond, delta, capped }` (cap per R6) · `applyExposure(dep, events): { dependence, gain, capped }` · `decayDependence(dep)` · `withdrawalCondition(dep, beatsSinceExposure, harsher): BodyCondition | null`.

**Verify:** `npx vitest run src/lib/services/be/tracks.test.ts src/lib/services/be/metadata.test.ts` — band boundaries at every edge (19/20, 44/45, 69/70, 89/90; 14/15, 34/35, 59/60, 84/85), cap behavior (3 warm events @i3 = +18 raw → +5), symmetric strain cap, clamp at 0 and 100, withdrawal on/off/harsher boundaries, legacy `bodyState` without any track field round-trips unchanged, unknown quirk id survives the round-trip. `npm run check`.

## Step 2 — Quirk registry

**Files:** new `src/lib/services/be/quirks.ts` + `quirks.test.ts`; `be/index.ts`.

- `QuirkId` union of the 10 ids from spec §8. `QuirkDef { id, label, family: 'growth' | 'lactation' | 'social', phase: 2 | 3, blurb: string }` — `blurb` is the prompt/UI-facing one-liner; mechanics live in code, never in the string.
- `QUIRKS: ReadonlyArray<QuirkDef>` + `QUIRK_BY_ID`, `QUIRK_IDS`.
- `readQuirks(state): QuirkId[]` — narrows the persisted `string[]` to known ids (drops unknown, never throws).
- `hasQuirk(state, id): boolean`.
- `assignQuirks(seed: string): QuirkId[]` — `seededRoll(`${seed}:count`)` → 1/2/3 (weight 50/35/15), then N distinct picks via `seededRoll(`${seed}:${i}`)` over the registry with rejection of duplicates. Pure, deterministic, no `Math.random`.

**Verify:** `quirks.test.ts` — same seed → identical array across 200 seeds; count distribution within 1–3; no duplicates; distinct seeds diverge; every registry id is reachable; `readQuirks` drops `'not_a_quirk'`; assertion that `early_bloomer`/`pressure_prone` are `phase: 3` and that the Step-3 effect tables return the neutral value for both.

## Step 3 — Reducer pipeline integration (the load-bearing step)

**Files:** `src/lib/services/be/reducer.ts`, `reducer.test.ts`, `pipeline.test.ts` (additions only).

Revised pinned order (update the file's header comment):
```
1. decay conditions     2. cooldown tick
3. land pendingGrowth   4. apply softState
5. passive fill tick    6. events loop (quirk-adjusted, anticipation split)
7. tracks: bond + exposure/dependence + attitude pull   ← NEW
8. pressure accrual/pity (quirk-scaled)
9. conditions: derived (Engorged, Withdrawal) + classifier merge
10. drift note
```

Exact quirk hook points — one row per quirk, all Phase-2 rows implemented in this step:

| Quirk | Hook | Rule |
|---|---|---|
| `fast_metabolizer` | step 6, before `clampIntensity` | `event.kind === 'catalyst'` → intensity +1 (clamp still caps at 3) |
| `slow_burn` | step 6 land path + step 3 | any `bandDelta > 0` lands **0 now**, whole delta staged as `pendingGrowth`; at step 3, if the landed mass crosses an `INTERACTION_MILESTONES` threshold (`measurements()` before/after), +1 delta |
| `greedy_flesh` | `landGrowth` closure + step 8 | armed cooldown = `max(0, growthCooldownBeats - 1)`; `PRESSURE_ACCRUAL × 1.5` |
| `stubborn_frame` | step 6, before `clampIntensity` + `landGrowth` | intensity −1 (floor 1); `landGrowth` rejects any `delta < 0` (forward guard — no negative path exists today; comment it as such) |
| `early_bloomer` | — | **data only, Phase 3** (induction DC, supply ramp) |
| `pressure_prone` | — | **data only, Phase 3** (engorge threshold, temporary swell) |
| `skittish` | not the reducer — Step 7 `rpg/modifiers.ts` | social-skill bonus −2 while `bond < 50` |
| `devoted_heart` | step 7 + step 9 | +1 bond per bond event (before the velocity cap, so the cap still binds); withdrawal threshold −15 and harsher note |
| `needy_nipples` | Step 7 modifiers + step 4 | Handling/Milking bonus +2; when `softState.arousal` proposes a value **above** current, add +10 before clamping (only upward — a scene that calms her still calms her) |
| `proud` | Step 7 modifiers | Persuasion bonus −2; Seduction explicitly untouched (assert in test) |

Step 7 body: bond deltas from `extras.bondEvents` (via `applyBondEvents`, `devoted_heart` bonus folded in), dependence from `extras.exposureEvents` (via `applyExposure`), `beatsSinceExposure` incremented when no exposure this turn **and** `ticksEnabled` **and** `dependence > 0` (the last guard prevents write-amplification on every untouched girl), reset to 0 on exposure. Attitude pull: if `dependence >= CRAVING_PULL_DEPENDENCE` **and** the classifier set no `attitude` this turn, `attitude = 'craving'` (log a `mood` record noting the pull). Each track change emits a `bond`/`exposure` `BeLogRecord` with the delta and the post value in `note`; a capped delta says so (`"+5 (capped from +18)"`) — that string is the anti-positivity-bias evidence in the turn log.

Off-screen (`ticksEnabled === false`): bond/exposure events still apply (they are evidenced acts, not ticks), but idle decay and `beatsSinceExposure` do not — same reasoning as the fill tick.

**Verify:** `npx vitest run src/lib/services/be` — every existing reducer/pipeline/canary test passes **unchanged** (no quirks, no track events → byte-identical output; add that as an explicit "neutral passthrough" test). New tests: each Phase-2 quirk's effect in isolation on a fixture state; `slow_burn` + cap interaction; `greedy_flesh` cooldown floor at 0; velocity cap through the full reducer; withdrawal appears at the threshold and survives a 6-condition classifier flood; attitude pull does not override an explicit classifier attitude; `early_bloomer`/`pressure_prone` produce **zero** state difference.

## Step 4 — Classifier extension: `bondEvents` + `exposureEvents`

**Files:** `src/lib/services/be/schema.ts`, new `schema.test.ts` cases, `be/index.ts`. (`ClassifierService.ts` needs **no** edit — both the schema extension and the instruction slot are already wired.)

- `bondEventSchema = z.object({ character, direction: z.enum(['warm','strain']), intensity: z.number() })`, `exposureEventSchema = z.object({ character, intensity })`, both with `.describe()` copy in the existing voice.
- `extendClassificationSchemaWithBeEvents` adds `bondEvents` and `exposureEvents` arrays (`.max(MAX_BE_EVENTS_PER_TURN).default([])`) in the same `.extend()` call. The no-op-on-unextendable early return and the caller's reference-identity warning are untouched.
- `bondEventsFromResult` / `exposureEventsFromResult` — same tolerant coercers as `beEventsFromResult` (slice to max, `safeParse` per item, silently drop malformed).
- `buildBeEventInstructions` gains two sections. Anti-positivity copy is mandatory and explicit: *"Report strain as readily as warmth — a scene where you pushed her past her comfort is a `strain` event, not an omission. Bond events describe what happened between them, never how much she now likes him; the engine owns the number."* Exposure: *"one event per scene in which she took the catalyst into her body, intensity by dose/duration."*

**Verify:** new/extended `src/lib/services/be/schema.test.ts` — legacy result with only `beEvents` still coerces; malformed direction dropped; over-max sliced; extension applied to a `z.string()` returns the input by reference (the degrade path); a classification result missing both arrays yields `[]` from both coercers. `npm run check`.

## Step 5 — Store wiring in `applyBeEvents`

**Files:** `src/lib/stores/story.svelte.ts` (`applyBeEvents` ~:2851–3056).

- Pull `bondEventsFromResult` / `exposureEventsFromResult` beside the existing three, bucket by resolved character with the **same** case-insensitive matcher and the same `relationship === 'self'` skip (copy the `eventsByCharacterId` block verbatim; do not factor it — three near-identical loops already exist and consistency beats cleverness here).
- Auto-seed block (~:2950): after `defaultBodyState(...)`, set `quirks: assignQuirks(`${storyId}:${character.id}:quirks`)` and extend the seed log note. **Lazy backfill** immediately after `readBodyState`: `if (state && state.quirks === undefined) { state = { ...state, quirks: assignQuirks(sameSeed) }; pendingLog.push({ kind: 'seed', note: 'quirks assigned' }) }`.
- Widen the settled-skip guard (~:2967) with `&& bondBucket.length === 0 && exposureBucket.length === 0` — otherwise an absent girl's bond event is silently dropped.
- Pass `bondEvents`/`exposureEvents` into `ReducerExtras`.
- Everything else — `captureCharacterBeforeState`, `wrapUpdate`, log-after-write, `crossings` — is unchanged.

**Verify:** `npm run check` + `eslint .`; new cases in `src/lib/services/be/wiring.test.ts` covering bucketing-skips-self, backfill idempotency across two applies, and the settled-skip widening. Manual: one BE turn with a warm bond event, confirm the `beLog` row and the persisted `bond`.

## Step 6 — `[HAREM STATE]` prompt block

**Files:** `src/lib/services/be/context.ts` + `context.test.ts`; `src/lib/services/context/context-builder.ts` (`loadBeStateContext`, :193).

- `HAREM_STATE_HEADER = '[HAREM STATE — canonical and authoritative]'` (fixed string, snapshotted).
- `buildHaremStateBlock(entries: BeStateEntry[]): string` — one line group per girl carrying any track field: `Name — bond: deeply bonded (she trusts him and shows it). Dependence: craving. Quirks: greedy flesh, proud.` Quirk rendering uses `QuirkDef.blurb`. Withdrawal is already visible via `conditions` in `[BODY STATE]`; the harem block adds the *stance* directive only. Same authority framing as the body block, plus a hard rule: *"These stances are engine-tracked. Prose may express them; it may not advance or reverse them — a girl does not become devoted because the scene wants her to."*
- Returns `''` when no entry carries a track field (a Phase-1 save renders nothing).
- `loadBeStateContext` concatenates: `beStateBlock = [buildBeStateBlock(entries), buildHaremStateBlock(entries)].filter(Boolean).join('\n\n')`. No template edit (R9).

**Verify:** `be/context.test.ts` — exact-string header snapshot; empty-string gate for track-less entries; every band word renders; quirk blurbs render; `[BODY STATE]`'s own snapshot is **unchanged** (cache-prefix guard).

## Step 7 — Target-girl check modifiers

**Files:** new `src/lib/services/rpg/modifiers.ts` + `modifiers.test.ts`; `rpg/constants.ts` (skill sets), `rpg/types.ts` (`CheckRecord.target`), `rpg/index.ts`; `src/lib/services/ai/sdk/schemas/actionchoices.ts`, `riskassess.ts` + their tests; `src/lib/services/rpg/context.ts` (tagging + risk-assess instruction copy); `src/lib/services/prompts/templates/generation.ts` (risk-assess `userContent` only); `src/lib/services/generation/phases/CheckPhase.ts` + `CheckPhase.test.ts`.

- `rpg/constants.ts`: `SOCIAL_SKILLS = ['seduction','persuasion','deception','enchantment']`, `INTIMATE_SKILLS = ['handling','milking','aftercare']`. Bond modifier applies to `SOCIAL_SKILLS ∪ INTIMATE_SKILLS`; quirk modifiers per the R3 table.
- `modifiers.ts`: `buildTargetCheckModifiers(state: BodyState | null, skill: SkillId): CheckModifier[]` — bond stance modifier + `skittish`/`needy_nipples`/`proud` rows, each labeled for display, **sign-inverted per R4**. Imports from `$lib/services/be` only (boundary-clean).
- Schemas: both gain `targetCharacter: z.string().optional()`. Optional, no `.strict()` — legacy persisted choices keep parsing.
- `CheckPhase`: after resolving the sheet, resolve the target (tag's `targetCharacter`, else the assess verdict's; case-insensitive; skip `self`), read her `bodyState` via `readBodyState`, build modifiers, pass them to `resolveCheck`, and stamp `target` on the record. No match → empty modifier array (Phase-1 behavior exactly).
- `rpg/context.ts`: one added bullet in `buildCheckTaggingInstruction` and the risk-assess template — *"When the action targets a specific character, set `targetCharacter` to her exact name."*

**Verify:** `modifiers.test.ts` — sign correctness per quirk (the R4 trap), `skittish` switches off at bond exactly 50, `proud` leaves Seduction at 0 while moving Persuasion, bond stance table, null state → `[]`, stacking order deterministic. `CheckPhase.test.ts` — target resolves case-insensitively; unknown name → no modifiers, same `nat`; targeting the protagonist → no modifiers; the seed is unchanged by targeting. `actionchoices.test.ts`/`riskassess.test.ts` — legacy shapes still parse.

## Step 8 — Gated interactions fed to the choice generator

**Files:** new `src/lib/services/rpg/gating.ts` + `gating.test.ts`; `rpg/context.ts`, `rpg/index.ts`; `src/lib/services/context/context-builder.ts` (`loadRpgSheetContext` gains a `characters` param).

- `gating.ts` (pure, computed — never stored, per spec §2.3): `GateInput { name, bond, dependence, massKg, quirks }`; `availableInteractions(input): { available: string[]; locked: Array<{ id, requirement }> }` over a code-defined `GATED_INTERACTIONS` table — reference defaults: `intimate_handling` (bond ≥ 45), `milking` (bond ≥ 45 **and** carried mass ≥ 2.7 kg), `advanced_catalyst` (bond ≥ 70 or dependence ≥ 35), `deep_ritual` (bond ≥ 70 and dependence ≥ 60). Milestone input comes from `measurements(state).nowTotalKg` at the call site, so `gating.ts` stays BE-internals-free.
- `buildGatedActionsInstruction(inputs)` in `rpg/context.ts` → a short per-girl availability list plus *"Do not offer a gated interaction that is not listed as available for that character."* Appended to `checkTaggingInstruction` (R9); empty when no girl has tracks.
- `loadRpgSheetContext(story, protagonist, characters)` builds the inputs and concatenates. The existing try/catch → all-empty-strings fallback covers it.

**Verify:** `gating.test.ts` — each gate's boundary on both sides; a track-less girl gates everything off; the instruction string is empty when the roster is empty. `npm run check`.

## Step 9 — Harem sidebar tab

**Files:** `src/lib/types/index.ts` (`SidebarTab`); `src/lib/stores/ui.svelte.ts`; `src/lib/components/layout/Sidebar.svelte`; new `src/lib/components/world/HaremPanel.svelte`, `GirlStatusCard.svelte`, `TurnLogList.svelte`; new `src/lib/services/rpg/turnlog.ts` + `turnlog.test.ts`; `be/tracks.ts` presentation helpers.

- `SidebarTab` gains `'harem'`; the derived `tabs` array appends `{ id: 'harem', icon: Heart, label: 'Harem' }` **inside the same `isBeMode` branch as `sheet`** (strip goes to 8). Extend the existing reset `$effect` to also catch `'harem'` when beMode flips off.
- `HaremPanel.svelte`: present girls (from `story.characters` ∩ the latest entry's `presentCharacterNames`) render a `GirlStatusCard`; absent girls with `bodyState` collapse to name rows; below, `TurnLogList`.
- `GirlStatusCard.svelte`: portrait thumb, tier + cup + `lastGrowth` flag, attitude + **bond stance** (bar + word), **dependence stage**, quirk chips (blurb on title), condition chips (Withdrawal tinted), lock state, and a deep-link button that sets `ui.sidebarTab = 'characters'` (the full editor stays in Characters — no duplicate write surface).
- `TurnLogList.svelte` renders `rpg/turnlog.ts`'s output. **Ordering ruling:** entries newest-first by story-entry order; *within* one entry, `checkLog` rows precede `beLog` rows, because the check resolved before narration and the BE events were extracted from it. Neither log carries a timestamp — pin this rule in the function's comment.
- `turnlog.ts` (pure): `buildTurnLog(entries: StoryEntry[], limit): TurnLogRow[]` — discriminated union `{ kind: 'check', record } | { kind: 'be', record }` plus entry id. Labels/tints reuse `rpg/derive.ts` and `be/tracks.ts` band words. `.svelte` files stay markup-only.

**Verify:** `turnlog.test.ts` — interleave ordering, limit truncation, entries with neither log skipped. Components: `npm run check` + `eslint .` + a manual BE-mode turn.

## Step 10 — Balance + regression pass

**Files:** `src/lib/services/be/canary.test.ts` (extend), `research/INDEX.md` (mark Phase 2 implemented).

- Extend the canary with a full-turn fixture exercising all Phase-2 paths: a girl with two quirks, one bond event, one exposure event, a growth event, all in one reduce, asserting the exact `nextState` and `log`.
- Full run: `npx vitest run`, `npm run check`, `eslint .`.

---

## Risks

1. **Classifier positivity bias inflating bond.** Mitigations (ship all three): symmetric `MAX_BOND_DELTA_PER_TURN` cap, explicit report-strain instruction copy, and the capped-delta note in `beLog` making inflation visible in the turn log.
2. **Sign inversion on DC modifiers (R4).** A literal reading of "skittish: social DCs +2" produces `+2` on the bonus and makes the quirk a buff. Test-pinned per quirk.
3. **Quirk reroll on retry.** Key the assignment seed on `${storyId}:${characterId}:quirks`, never `entryId`; guard on `quirks === undefined`.
4. **Write amplification.** `beatsSinceExposure` incrementing on every present girl defeats the no-op-write skip. The `dependence > 0` guard keeps the skip alive for untouched girls.
5. **Withdrawal evicted by the condition cap.** `MAX_BE_CONDITIONS = 6` slices from the tail; front-insert like `Engorged` + six-condition-flood test.
6. **Prompt-cache regression.** `[BODY STATE]` text must not move; `[HAREM STATE]` concatenates after it; unchanged-snapshot assertion is the guard.
7. **Legacy-save mass rewrite.** Never write `bond`/`dependence` defaults eagerly — read through `bondOf`/`dependenceOf` defaults instead, or the first Phase-2 turn rewrites every character's metadata.
8. **Two new classifier arrays = two new degrade paths.** Tolerant coercers + missing-arrays → `[]` tests are the contract.
9. **Gating text drift.** Thresholds live once, in `be/tracks.ts` band functions + `gating.ts` table.

## Trickiest integration points

1. **Step 3, the reducer.** Land the neutral-passthrough test (no quirks → byte-identical output) *before* wiring any individual quirk, so failures localize.
2. **Target resolution across three surfaces** (Step 7): the tag-applies text gate means an edited input drops the target *and* the modifiers — correct, but comment it.
3. **`beLog`/`checkLog` interleave with no timestamps** (Step 9): check-before-be is a ruling, not a derivation — write it in the code.
4. **The settled-skip guard widening** (Step 5): forgetting the two new bucket checks drops bond events for off-screen girls with zero visible error.
5. **Backfill vs. seed timing** (Step 5): quirks must be on the state *before* `reduceCharacterBody` runs, or the first post-upgrade turn applies no quirk effects while the prompt advertises them.
