# 62 — FF5.2 Phase 4: E2 Chekhov's Gun (narrative-debt engine)

**Date:** 2026-08-21 · **Parent:** research/58 (D3 ruling: E1 → E3+E4 → E2 — this is the last ruled engine) · **Basis:** FF5.2 source block 🔫 "Chekhov's Gun: Secrets / Lies / Plants" (`/prompts/45`) + its CoT line + the two E2 couplings in World Sim (`/prompts/44`) and Internal Agenda (`/prompts/40`), all re-read verbatim from the Downloads JSON this session (full text quoted in §Appendix); research/58 §2 E2 sketch; the shipped Phase-3 worldsim machinery (research/61 incl. §Review outcome); and a full store-mapping sweep this session (story-level state surfaces, rollback coverage, `applyClassificationResult` transaction structure, existing thread trackers).

Translation principle (research/58 §1) governs: FF fakes the tracker in-context — the LLM re-emits the bullet list every turn and `{{roll}}` macros supply five d20s. We port the *language and the threshold math*, and re-home the state: real persisted bullets, deterministic seeded firing, classifier-observed loading/resolution, a rendered one-turn directive block. Never LLM-self-reported state.

## Design

### What a bullet is

A **bullet** is one unit of unresolved narrative debt — a planted object, a promise, a foreshadowed detail, a secret, an appointment — that the engine ages and eventually *fires* as a one-turn `[CALLBACK]` directive telling the narrator to weave it back in. FF's loop, re-homed:

- **Load** (LLM-observed, engine-owned): the classifier — which already reads every narration — reports new narrative debt via a schema extension; the engine sanitizes, clamps, dedupes, and owns the slot.
- **Age** (deterministic): +1 per applied turn; time-locked bullets stay frozen.
- **Fire** (deterministic): a seeded d20 per eligible bullet against an effective threshold (base by weight, −1 per age, proximity/urgency mods). Fired ⇒ one-turn `[CALLBACK]` block.
- **Resolve** (LLM-observed, engine-owned): the classifier reports which listed setups the narration actually paid off — whether because we fired them or because the story got there on its own. Resolved bullets retire. A fired-but-unresolved bullet **re-loads** with a short refractory instead of vanishing (FF: "if no elegant opening exists → VETO and reload into gun").
- **Prune** (deterministic): age ≥ 12 dies; capacity 20 with lowest-weight/oldest eviction.

### State — hosted on the protagonist's character metadata (the open design point, resolved)

Bullets are **story-scoped** state. The store-mapping sweep settled where they live:

- The `stories` row has **no metadata column**, and story-level fields have **no rollback/branch/checkpoint coverage** — the sole exception, `timeTracker`, needed five bespoke coverage surfaces (delta `previousState`, RollbackService step, checkpoint snapshot column, branch-creation restore, retry backups) *and* still leaks across branches, because the stories row is global while branches diverge. Reproducing that template for bullets means a migration plus six new coverage surfaces, and inherits the cross-branch leak wart.
- Character metadata gets **everything for free**: `captureCharacterBeforeState` + `wrapUpdate` + `cowCharacter`, delta `previousState.characters[].metadata`, RollbackService restore, retry backups, checkpoint snapshots, branch COW. It is branch-correct by construction (characters are branch-scoped rows).

**Ruling: `ChekhovState` lives at `metadata.chekhovState` on the story's protagonist character (`relationship === 'self'`)** — a story-scoped slot *hosted* on the one character every story has, purely to inherit the persistence machinery. It is not per-character state (unlike `npcAgenda`); the host is an implementation address, documented at the key. Degrade: no self character ⇒ the engine is inert (no reads, no writes, no blocks) — same class as beMode without tracked girls. Multiple selves (shouldn't exist): lowest id by codepoint compare, deterministic.

```ts
interface ChekhovBullet {
  id: string           // "c<n>" — stable, classifier-referencable
  description: string  // sanitized, ≤160 — renders into classifier prompt AND [CALLBACK]
  weight: 1 | 2 | 3    // minor texture / meaningful / major plot debt
  age: number          // applied turns since load (locked turns don't count)
  subjects: string[]   // ≤3 character names — proximity mods (sanitized, ≤40 each)
  lockTurns?: number   // TIME lock, 1..12: frozen (no age, no fire) until it counts down
  urgent?: boolean     // set when a lock expires — permanent −2 threshold (FF's urgency mod)
  refractory?: number  // fired-but-unresolved cooldown (2): ineligible while > 0
}
interface ChekhovState { bullets: ChekhovBullet[]; nextId: number }
```

Zod: `.passthrough()` + top-level `.catch(undefined)` (the research/60→61 malformed-degrade lineage); every number clamps and every string sanitizes at read AND accept time (reusing `sanitizeAgendaText` — it is already generic `(value, max)`); an empty-after-sanitize description drops the bullet at read.

### Threshold math (FF's, ported near-verbatim)

- **Eligibility:** age ≥ 4 (FF's 4-Age Minimum), not time-locked, refractory 0.
- **Effective threshold:** base 18/13/8 for weight 1/2/3, −1 per age, **−2 if any subject is present** in the scene (FF's −2 speaking / −1 present collapses to one presence mod — we have a presence set, not an addressee signal), **−2 urgent** (expired time lock; FF's deadline mod). **Floor 2** — a roll of 1 never fires, which ports FF's "jam on Nat 1" without a separate jam state.
- **Firing:** candidates ordered by (weight desc, age desc, id asc); per-bullet seeded d20 on `${storyId}:${userActionEntryId}:chekhov:${bulletId}`; the FIRST candidate whose roll ≥ threshold fires. **At most one bullet fires per turn** — a deliberate divergence from FF's up-to-5-seed sweep: Aventuras directive blocks are single-purpose, and competing callbacks in one prompt dilute both.
- **Suppression:** the Phase-3 intimacy signal (any present tracked girl at arousal ≥ 70) suppresses firing exactly as it suppresses world events.
- **Not ported** (documented): location/mood proximity mods (no reliable pre-generation scene-location/VAD signal; subjects carry the proximity load), scene-momentum mod, Coincidence/Calamity nat-20/nat-1 multi-fire cascades, CROWD/CHAR/STATE/DEP/CONDITION lock kinds (TIME only in v1 — the others need signals we don't track), the FIRED archive list (retired bullets are deleted).

### The two-site firing decision (the load-bearing risk)

The fire decision must be identical at two sites, exactly the Phase-3 presence-derivation battlefield:

1. **Pre-generation** (`computeTurnDirectives`): decides + renders the `[CALLBACK]` block. Seed `${storyId}:${userActionEntryId}:chekhov:*` — the CheckPhase contract: regenerate keeps the same callback, a retried turn re-rolls.
2. **Post-classification** (`applyChekhovTurn` in the store): recomputes the SAME decision to mark the fired bullet (refractory or retire). Recompute, not thread-through, because the CR-1 replay path re-applies from persisted state with no pipeline result in hand.

Reproducibility by construction — one shared pure function `decideChekhovFire({storyId, userActionEntryId, bullets, presentNames, suppressed})`, with each input entry-stable:

- **bullets:** pre-turn state; only `applyChekhovTurn` ever writes it, and it reads before it writes.
- **presence:** `readScenePresence` over the entry list **sliced strictly before this turn's narration entry** — which reproduces the pipeline's `ctx.allEntries` (…, userAction] since presence only reads narration entries. The store finds `userActionEntryId` as the nearest `user_action` entry before the narration entry.
- **suppressed + cast filtering:** shared exported helpers (`livingNonSelf`, intimacy check) used by both sites; the store evaluates them over the characters array reference captured at the top of `applyClassificationResult` (pre-turn values — this.characters is reassigned immutably, so the reference is a stable snapshot predating this turn's status/metadata writes).
- Harness test pins both derivations equal on a real store scenario; review lens item.

### Store pass — `applyChekhovTurn` (single writer, one write)

Runs inside `runWrites` **after `applyAgendaTurn`** (consumes its research-completion seeds) **and before `applyBeEvents`** (arousal still pre-turn for the suppression recompute), gated on `settings.chekhovGun === true`. Sequence over the pre-turn state:

1. Recompute the fire decision (above).
2. **Resolve:** validated `resolvedDebts` ids (`^c\d+$`, must match an active bullet) retire their bullets — fired or not.
3. **Re-load:** a fired-but-unresolved bullet gets `refractory = 2`.
4. **Age:** locked bullets decrement `lockTurns` (reaching 0 sets `urgent`); everyone else ages +1 and decrements refractory.
5. **Prune:** unlocked bullets at age ≥ 12 die.
6. **Load:** classifier `narrativeDebt` proposals (sanitize, clamp weight/lockTurns/subjects, drop case-insensitive description dupes vs. active bullets, max 2/turn) + engine-authored agenda research seeds; ids from `nextId`.
7. **Cap:** over 20 ⇒ evict by (weight asc, age desc) until 20.
8. Write once via the established 5-step character-write shape (`captureCharacterBeforeState` → `wrapUpdate` → `cowCharacter` → `database.updateCharacter` → immutable in-memory map), **skipped entirely when the state is value-identical** — a story with the toggle on but no debt writes nothing.

Replay/rollback posture: the write buffers in the CR-1 batch; delta-armed replay is a no-op; rollback/undo/branch restore the metadata via the shared character machinery. With `stateTracking` off a re-applied turn re-ages — the same pre-existing exposure the BE and agenda engines have, no new mechanism.

### Classifier extension (loading + resolution)

Same schema-extension contract as `beEvents`/`agendaProposals`, gated on `settings.chekhovGun === true`; `existingCharacters: Character[]` already carries the self character's metadata, so the service reads active bullets directly:

- `narrativeDebt` (max 2): `{ description ≤160, weight 1–3, subjects string[] ≤3, lockTurns? 1–12 }`.
- `resolvedDebts` (max 8): ids from the rendered active-setups list.

Instructions (appended to `customVariableInstructions`, **dynamic** — they render the active list):

- Debt = concrete, payoff-able setups only: planted objects, explicit promises, secrets, appointments, pointedly-noted details. **Not** quests/plot arcs (story beats track those), **not** relationship shifts (the bond engine tracks those), not vague mood. Most responses add none; max 2.
- `lockTurns` only when the setup names a future moment ("tonight", "at noon") — the estimated story beats until due.
- `ACTIVE SETUPS:` id + description per line (sanitized again at render), or `(none)`. `resolvedDebts` = ids this response clearly paid off or rendered moot.

### Rendering — the `[CALLBACK]` block

Fourth tail block, fixed-string header, computed in `computeTurnDirectives` (extending `TurnDirectives` with `callbackBlock`); placement `[Narrative Directives]` → `[OFF-SCREEN]` → `[WORLD EVENT]` → **`[CALLBACK]`** → `[CHECK RESULT]` dead last (a callback is more plot-authoritative than background texture, so it sits closer to generation; the check keeps the authority slot per research/47).

```
[CALLBACK — an earlier thread resurfaces]
Earlier in this story: {description}
Weave this back into the scene now, naturally and concretely — as a payoff, a return, or a consequence. Let it feel deliberate, never announced. If no elegant opening exists this beat, let it pass unremarked; it will find another moment.
```

### The two Phase-3 hooks, wired

- **CALM → passive environment seed.** `rollWorldEvent` contract tweak: a true CALM band roll now returns the event (empty directive) instead of `null` — target-pool degrades still return `null` (a degraded MOOD_SWING is not FF's "quiet moment"). With chekhov on, `computeTurnDirectives` renders CALM as a `[WORLD EVENT]` carrying `CALM_PLANT_DIRECTIVE`: *"A quiet beat. Plant one small, concrete environmental detail — an object, a sound, a distant figure — that could matter later. Do not explain it or call attention to it."* The loop closes through the normal channel: the classifier's debt scan observes whatever the narrator planted. No LLM-authored state, no new plumbing. With chekhov off, CALM renders nothing, exactly as today (test-pinned).
- **Research agenda completion → seed about what she learned.** `applyAgendaTurn` additionally returns engine-authored seeds for `research`-kind completions: `{ description: "«name» learned something while «goal»", weight 2, subjects: [name] }` — both strings already sanitized (goal at agenda accept/read, name from the character row). `applyChekhovTurn` loads them in step 6. Chekhov off ⇒ seeds dropped; the existing warm-i1 bond effect is untouched either way.

### Reconciliation with the existing thread trackers (the no-three-trackers requirement)

The sweep found three adjacent mechanisms; bullets overlap none of them once the boundary is drawn in the classifier instructions:

| Tracker | Nature | Prompt surface | Boundary vs. bullets |
|---|---|---|---|
| Story beats | Quest/milestone **entities** with status lifecycle | EntryInjector tiers + suggestions (`activeThreads` is literally `StoryBeat[]`) | Beats = arcs and objectives the player pursues. Bullets = concrete payoff-able details with firing mechanics; instructions explicitly exclude quests/arcs. Bullets do NOT enter EntryInjector or suggestions. |
| Chapter `plotThreads` | Memory-summary strings written at chapter boundaries | Retrieval tool output | Backward-looking recall, no mechanics, chapter cadence. No writer overlap (different producer, different cadence); no change needed. |
| Drift `[CONTINUITY]` notes | Per-turn, per-character metadata, one-turn TTL | BE/RPG state blocks | State-consistency repair, not narrative debt. Disjoint by construction. |

PostGenerationPhase "thread tracking" turned out to be a pass-through of `StoryBeat[]` into suggestions — nothing to reconcile beyond the beats row above. Net: beats stay the quest tracker, chapters stay memory, bullets are the payoff engine; one writer each.

### Settings + cache stability

`chekhovGun?: boolean` (`undefined` ≡ off; off→on rollout like `npcAgendas`). UI: switch in story-settings.svelte beside the Phase-3 controls. Off ⇒ no schema extension, no classifier instructions, no store pass, `callbackBlock: ''`, CALM renders nothing ⇒ classifier prompt and narrative prompt **byte-identical** to Phase-3 tip (test-pinned like Phase 3's).

## File-level changes

1. **`src/lib/types/index.ts`** — `StorySettings.chekhovGun?: boolean`.
2. **`src/lib/services/worldsim/constants.ts`** — `CHEKHOV_BASE_THRESHOLDS {1:18, 2:13, 3:8}`, `CHEKHOV_MIN_FIRE_AGE 4`, `CHEKHOV_MAX_AGE 12`, `CHEKHOV_MAX_BULLETS 20`, `CHEKHOV_MAX_LOADS_PER_TURN 2`, `CHEKHOV_REFRACTORY 2`, `CHEKHOV_SUBJECT_PROXIMITY_MOD 2`, `CHEKHOV_URGENCY_MOD 2`, `CHEKHOV_THRESHOLD_FLOOR 2`, `CHEKHOV_DESC_MAX 160`, `CHEKHOV_SUBJECT_MAX 40`, `CHEKHOV_MAX_SUBJECTS 3`, `CHEKHOV_LOCK_MAX 12`, `CALM_PLANT_DIRECTIVE`.
3. **NEW `src/lib/services/worldsim/chekhov.ts`** — types, `CHEKHOV_STATE_KEY`, zod schema, `readChekhovState` / `writeChekhovState` (metadata-sibling discipline, JSON clone), `effectiveThreshold(bullet, subjectPresent)`, `decideChekhovFire(input)`, `advanceChekhovState({state, fired, resolvedIds, loads})` (steps 2–7 as one pure function), `researchSeed(name, goal)`, `buildCallbackBlock(bullet)`, `findSelfCharacter(characters)`.
4. **NEW `src/lib/services/worldsim/chekhov-schema.ts`** — `narrativeDebtSchema`, `extendClassificationSchemaWithChekhov(schema)` (identity no-op contract), `narrativeDebtFromResult`, `resolvedDebtsFromResult` (id-validated), `buildChekhovInstructions(bullets)` (dynamic active list, render-sanitized).
5. **`src/lib/services/worldsim/events.ts`** — CALM returns `{eventId:'CALM', directive:''}` (band rolls only; degrades stay `null`); callers updated.
6. **`src/lib/services/worldsim/directives.ts`** — export shared `livingNonSelf` + suppression helpers; compute `callbackBlock` (self character → bullets → shared decide → block); CALM+chekhov plant directive; `TurnDirectives.callbackBlock`.
7. **`src/lib/services/worldsim/agenda.ts` / store** — research-completion seed handoff from `applyAgendaTurn`.
8. **`src/lib/services/worldsim/index.ts`** — barrel exports.
9. **`src/lib/services/ai/generation/ClassifierService.ts`** — gate on `chekhovGun`: extend schema (warn on no-op) + append `buildChekhovInstructions(readChekhovState(self)?.bullets ?? [])`.
10. **`src/lib/services/ai/sdk/schemas/classifier.ts`** — optional `narrativeDebt?` / `resolvedDebts?` doc-fields.
11. **`src/lib/stores/story.svelte.ts`** — capture pre-turn characters reference; `applyChekhovTurn(result, entryId, trackingEnabled, charactersBefore, createdCharacterIds, agendaSeeds)` between the agenda and BE passes; `applyAgendaTurn` returns seeds alongside bond events.
12. **`src/lib/services/ai/generation/NarrativeService.ts`** — render `callbackBlock` after `worldEventBlock`.
13. **`src/lib/components/settings/tabs/story-settings.svelte`** — `chekhovGun` switch.
14. **Tests** — NEW `worldsim/chekhov.test.ts` (schema round-trip + malformed degrade + clamps/sanitize at read, threshold goldens incl. floor/eligibility/urgency/proximity, fire ordering + determinism + suppression + presence-null, advance lifecycle: resolve/re-load refractory/lock countdown→urgent/prune/cap eviction/dedupe/load cap, block snapshot, `findSelfCharacter`); NEW `worldsim/chekhov-schema.test.ts` (extension no-op contract, tolerant extraction, id validation, dynamic instructions incl. sanitize-at-render); `events.test.ts` (CALM contract change, degrade≠CALM); `directives.test.ts` (callback rendering, CALM plant on/off, block order); harness coverage in `story.harness.svelte.test.ts` (single writer, no-write-when-unchanged, two-site fire-derivation equality pin, replay guard, rollback restores chekhovState, research-seed handoff, resolution retire); NarrativeService byte-identity + block-order updates.

## Explicitly out of scope

- Location/mood proximity mods, non-TIME lock kinds, multi-fire Coincidence/Calamity, FIRED archive (all documented above).
- A bullets UI panel (read-only debt viewer) — none exists for agendas either; playtest first.
- Pack-overridable thresholds; NPC↔NPC or faction-scoped debt.
- E5 GM notebook / E6 NPC thoughts (deferred by D3), E7 titles.

## Risks

- **Two-site decision drift** — the headline risk; mitigated by the shared pure function + entry-stable inputs + harness equality pin. Review lens item #1.
- **Classifier resolution quality:** over-eager `resolvedDebts` deletes debt early (bounded: ids must match, max 8, instructions demand "clearly paid off"); under-reporting leaves bullets until age-12 pruning. Self-healing, D5-tunable.
- **Prompt-tail growth:** +4 lines when a callback fires (≤1/turn); classifier prompt grows by the active-setups list (≤20 short lines). Bounded by caps.
- **Injection surface:** bullet descriptions are LLM-authored, persist, and render into TWO prompts (classifier instructions + narrative tail) — sanitize at accept AND both render sites; review lens item.
- **Self-character coupling:** protagonist deleted/re-rolled ⇒ bullets go with the row (acceptable: their story went with it too); no self ⇒ engine inert (documented).
- Adversarial 3-lens review mandatory before commit (persistence/replay + security/injection + game-logic/prompt-coherence), then the fix-diff round on the fixes.

## Review outcome (3-lens adversarial pass + fix-diff round, 2026-08-21 — all lenses returned)

**Fixed same session (first round):**
- **HIGH (all three lenses, independently): hard `.max()` on the chekhov schema extension could void an entire turn.** Providers that don't enforce maxLength/maxItems fail the WHOLE classification parse on overflow → the ClassifierService catch returns the empty stub → every entity update for the turn silently lost, player-steerable. Fixed: no length/count `.max()` on the extension (caps live in `.describe` + truncation/slicing in the extractors); `subjects` gained `.default([])` (an omitted array had dropped the proposal — the CALM environment-plant case exactly). Sibling BE/agenda extensions keep their shipped `.max()`s (research/61 accepted risk) — spun off as a follow-up task chip.
- **HIGH (lens 1): no signal guard — a failed classify still aged, pruned, and refractory-marked bullets** (losing that turn's resolutions and mis-marking a paid-off callback as vetoed). Fixed: the pass pauses on the failure stub exactly like the agenda pass, via a shared `hasBaseClassifySignal` + the chekhov-specific signals (loads, the defaulted `resolvedDebts` array as a success discriminator, raw presence).
- **HIGH (lens 3, simulated): unthrottled firing — ~0.95 callbacks/turn at a realistic debt load,** with weight-1 texture structurally starved (~84% died unfired) and vetoed bullets re-rendering the identical directive every 3 turns. Fixed three ways: a turn-level `cooldown` (2) after any fire caps cadence at ~1 per 3 turns; near-prune bullets (age ≥ 8) jump the priority queue; a `fires` counter retires a bullet silently after 2 unresolved fires (FF: "Pruned Bullets fire silently").
- **HIGH (lens 3): time-locked "appointments" could never fire near their moment** — lock expiry left age below the 4-age eligibility floor, so "back at noon" fired ~5 beats late. Fixed: expiry sets `age = max(age, 4)` alongside `urgent` — fireable AT the deadline with the −2 urgency mod.
- **MEDIUM-HIGH (lens 3): [CALLBACK]-vs-[OFF-SCREEN] contradiction** — "weave this back in as a return" and "never force an entrance" could name the same character in one prompt. Fixed: the fired bullet's subjects' [OFF-SCREEN] lines are dropped (the ENTER_CHECK treatment).
- **MEDIUM (lenses 1+2+3): `advanceChekhovState` dropped top-level passthrough fields,** which destroyed forward-compat AND made the store's value-identity skip permanently false (a write per turn). Fixed: the advance spreads the input state; key order verified stable through the round trip.
- **MEDIUM (lenses 1+2+3): the `nextId` family** — a corrupt counter could mint duplicate ids (shared fire seed, joint retirement), a missing one wiped every stored bullet (schema-level parse failure), float precision could freeze it. Fixed: per-field `.catch`, floored above the max id suffix actually in use, ceiling-bounded; bullet ids are shape-validated (`^c\d{1,6}$`) at read — a non-conforming id could also spoof extra ACTIVE SETUPS entries.
- **MEDIUM (lens 3): the protagonist counted as a proximity subject** (always present ⇒ permanent −2 on every protagonist-tagged bullet). Fixed: proximity matches living non-self presence only, via `normalizePresenceName`.
- **MEDIUM (lens 3): callbacks about the dead** — subjects were never validated against the cast. Fixed: a bullet whose EVERY subject is deceased/inactive never fires; mixed-subject bullets still do.
- **MEDIUM (lenses 1+2): resolve-then-reload dedupe gap** — a setup resolved this turn could re-load under a fresh id in the same breath, resetting its age past the prune ceiling. Fixed: dedupe includes the pre-resolve list.
- **MEDIUM (lens 2): invisible-Unicode smuggling** (ZWSP, bidi isolates, soft hyphen, the U+E0000 tag block) survived the shared sanitizer, and `[`/`#`/backtick let a description fake a `[CHECK RESULT]` header or a spoofed list entry inline. Fixed: `sanitizeAgendaText` strips the invisible/format ranges (agenda-wide hardening); a second-stage `sanitizeDebtText` ((`[`→`(` etc.) applies at accept, read, AND both render sites.
- **MEDIUM (lens 3): self-less stories paid for the classifier extension every turn** while the engine was inert. Fixed: extension, instructions, CALM plant, and callback all gate on a self character existing.
- **MEDIUM/LOW round-up:** fail-closed (skip + log) when the narration entry or preceding user action can't be located (was: silently widening the recompute window); locked bullets drop a corrupt stored `refractory` at read (would never cool); combined loads capped at 4/turn; `EMPTY_CHEKHOV_STATE` frozen.

**Fix-diff round (mandatory second pass on the fixes) — found and fixed:**
- **MEDIUM (verified by probe): the invisible-Unicode sweep stripped ZWJ/ZWNJ,** corrupting legitimate emoji sequences, Persian, and Indic conjuncts — in the SHARED agenda sanitizer, so shipped Phase-3 surfaces too. Fixed: U+200C/D kept (load-bearing, no breakout risk); the safe extra carriers (U+061C, U+180E, Hangul fillers) added instead. Variation selectors deliberately untouched (legit emoji use outweighs the exotic carrier).
- **MEDIUM: one out-of-range `nextId` permanently disabled new-debt loading** — the first-cut clamp pinned it AT the ceiling, where the load loop stops minting. Fixed: recovers to max-used+1. Test re-pinned.
- **MEDIUM: the "(scheduled — not yet due)" marker was advisory only** — a model ignoring it could delete an appointment before it ever fired. Fixed: time-locked bullets are excluded from the resolvable set.
- **LOW: the `hasBaseClassifySignal` refactor silently broadened the shipped agenda pause predicate** (raw `presentCharacterNames` vs the derived, blank-dropping set). Fixed: the shared method excludes presence; each pass adds its own presence-shaped signal — agenda byte-identical again.
- **LOW: CALM planted seeds into stories where the engine is inert** (chekhov on, no self). Fixed: the directive gate requires the host.
- **LOW: the combined-loads cap could permanently drop research seeds** (one-shot beats) in favor of recurring classifier debt. Fixed: seeds order first.
- **LOW (tests): two harness tests were double-gated** (passing via the fail-closed guard, not the gate they name); the priority test title misdescribed the new comparator; nothing pinned the JSON key-order stability the identity skip depends on. All fixed; a JSON-identity pin added.

**Accepted as designed (documented, not changed):**
- **Skip-path fire bookkeeping:** when the classify fails (or settings toggle off mid-generation), a rendered callback goes unmarked — no refractory/cooldown/fires — so it may re-render while failures persist. Same pause-posture as the agenda pass (whose ticks also stop); self-heals when classify recovers. The two-site residual window (a character/settings edit landing DURING generation shifts the store snapshot) is likewise accepted — bounded to one wrong refractory mark; documented at `computeChekhovFire`.
- **Sibling BE/agenda `.max()`s** stay (research/61 acceptance; follow-up chip spawned). **Type-shape requirements** on the chekhov extension remain — structured-output providers enforce types.
- **Thread-through vs recompute:** lens 1 correctly notes the CR-1 replay path returns before the passes run, so the recompute's stated replay rationale was overdrawn — but recompute also covers any future apply path without a pipeline result in hand, and the shared-function design held; threading the fired id through the pipeline is a documented available simplification (would also let the classifier be told which bullet was just called back — the resolution-reporting upgrade, deferred).
- **Locked+refractory, cap-eviction ordering, lone-surrogate slice, `#`-rewrite cosmetics, duplicated presence recompute (O(entries)·2/turn), duplicated user-action scan** — noted, cosmetic/unreachable/negligible; **classifier debt-rate calibration** ("empty most turns" braking) and the **story-beat boundary** are D5 playtest items — the engine-side throttles (cooldown, caps, retire-after-2) bound the worst case regardless of classifier behavior.

**Verified clean by the lenses:** transaction atomicity (the single character write buffers before the delta, harness-pinned order); rollback/retry/checkpoint/branch coverage inherited via character metadata (all before-state and COW paths traced); the two-site derivation agrees on the production path (all three ActionInput entry flows traced; every `this.characters` assignment in the store is an immutable reassignment); determinism (no Date.now/Math.random/localeCompare; comparators total-ordered on copies; seed namespace collision-free); injection containment (resolved ids pattern+membership checked; every stored/proposed string passes ≥2 sanitize stages before any prompt; newline collapse defeats fake-list entries); byte-identity with `chekhovGun` unset at both the classifier and narrative prompts (test-pinned); CALM contract change invisible to chekhov-off stories; frozen empty state never mutated; research-seed/bond-event no double-count.

Final gate after both rounds: suite **1295** (from 1222), svelte-check 0 errors, eslint 0 errors (200 pre-existing boundary warnings). Commit deliberately left for Ben's explicit go.

**Follow-up (2026-08-21, same day): sibling `.max()` conversion landed.** The agenda (`worldsim/schema.ts`: goal/destination length + proposal count) and BE (`be/schema.ts`: condition-label `.max(200)` + all five array counts) extensions were converted to the chekhov pattern — caps stated in `.describe` text, enforced by truncation/slicing in `agendaProposalsFromResult` / `beConditionsFromResult` (array counts were already sliced in every extractor); in-cap extractor output stays byte-identical. New `BE_CONDITION_LABEL_MAX` names the 200 cap. The "sibling `.max()`s stay" acceptance above is superseded.

The conversion's own 8-angle review + fix-diff round found and fixed four things: **(1)** a sanitize-gate/raw-slice inversion in `agendaProposalsFromResult` — an over-cap goal whose first 120 chars were filler passed the emptiness gate but stored an all-filler prefix that later sanitized to `''`, writing an empty-goal agenda `readNpcAgenda` rejects as malformed (pre-conversion such goals were cleanly dropped); the extractor now stores the `sanitizeAgendaText` output itself, which `agendaFromProposal`'s re-sanitize treats as behavior-neutral. **(2)** BE condition labels now pass `sanitizeDebtText` (shared via the worldsim public API), not a bare slice — labels persist through the reducer and re-render into the BE prompt block every turn, the same `\n[CHECK RESULT]` breakout vector the agenda/chekhov sanitizers exist for, and truncate-not-reject had widened it (over-long injected labels went from rejected to kept). **(3)** `be/presence.ts referencedCharacterNames` bounds its raw-array walk with the extractor caps (it had leaned on the removed `.max()`s) — and the fix-diff round probe-demonstrated that capturing the cap from `be/schema.ts` at module scope was import-order fragile (be↔worldsim cycle via `worldsim/agenda.ts` → `$lib/services/be`: entering through `schema.ts` left the cap `undefined`, silently unbounding the walk), so `MAX_BE_EVENTS_PER_TURN` moved to cycle-free `be/constants.ts` (re-exported from schema for existing importers). **(4)** chekhov's `narrativeDebt` description now interpolates `CHEKHOV_MAX_LOADS_PER_TURN` (was a hardcoded "at most 2" that would silently drift on tuning). Accepted as cosmetic: cap-boundary slices can split a surrogate pair (same accepted status as chekhov's). Tests pin truncate-not-reject, byte-identity for clean in-cap values, the filler-prefix regression, label sanitize, and the presence bound (+10, suite 1305).

**Second follow-up (same day): the deferred review findings applied.** (1) The raw classifier result is now bounded ONCE at the extension seam — new `src/lib/services/ai/generation/classifier-bounds.ts` (`boundClassifierExtensionArrays`, wired into `ClassifierService.classify` right after the structured parse): the eight known extension arrays slice to 4× their engine cap (headroom so extractors can still skip malformed entries), entry strings cap at 256 (above every extractor's own sanitize cap, so extraction is unaffected), nested arrays at 16, base-schema fields untouched — so nothing runaway reaches `worldStateDelta.classificationResult` (story.svelte.ts:3110) or its snapshot/branch copies. It lives in its own light module because `ClassifierService.ts`'s import chain pulls `$state`-rune stores that a plain unit-test environment can't load. (2) Any array over its ENGINE cap logs one `extension arrays over engine caps` line with per-field `received>cap` — restoring the overflow visibility the old loud parse failure provided. (3) `beConditions.note` now sanitizes+caps like the label (`BE_CONDITION_NOTE_MAX` 200; empty-after-sanitize omits the key). (4) All eight `*FromResult` extractor loops now cap VALID entries instead of raw indexes — a run of malformed leading entries no longer starves well-formed ones (safe because the upstream Zod parse already walks the full array, so slice-early saved nothing). (5) chekhov's id-render literal 16 is now `CHEKHOV_ID_RENDER_MAX`; `MAX_RESOLVED_PER_TURN` renamed/exported as `CHEKHOV_MAX_RESOLVED_PER_TURN` (barrel-exported, the bounds table needs it), `CHEKHOV_MAX_LOADS_PER_TURN` + `MAX_BE_EVENTS_PER_TURN` added to their barrels. Still open (re-chipped): read-time sanitize of already-stored condition labels/notes in `be/metadata.ts` (existing saves poisoned before extraction-time sanitizing keep re-rendering). Suite **1313**.

**Third follow-up (same day): the re-chipped item landed.** `readBodyState` now sanitizes stored condition labels/notes at read (`sanitizeConditions` in `be/metadata.ts` — labels that sanitize to empty drop the condition; `note` is overwritten unconditionally, never conditionally spread, per the agenda fix-diff lesson), closing the pre-hardening-save re-render vector. Caps and comments document the be↔worldsim import-cycle constraint (caps live in cycle-free `be/constants.ts`). Suite **1318** at commit; full gate green (svelte-check 0 errors, eslint 0 errors).

## Appendix — FF5.2 source text (verbatim basis)

`/prompts/45` — 🔫 Chekhov's Gun: Secrets / Lies / Plants:

> Format: [BULLET: desc] (weight: 1-3, age: 0/12) [depends: prereq] [secret]
>
> Mechanics:
> - Aging: Age unlocked Bullets +1 per response. Time-locked Bullets remain frozen.
> - Locking: Lock via TIME, CHAR, STATE, DEP, CROWD (secret + >2 NPCs present), CONDITION, or CONTRADICTION (prune if conflicted).
> - Eligibility Rule (4 Age Minimum): Bullets MUST reach an age minimum of 4 (age >= 4) before they are eligible to fire. Unlocked Bullets with age < 4 cannot fire regardless of roll.
> - Firing Threshold: Calculate effective threshold:
>   * Base: Weight 1 = 18 | Weight 2 = 13 | Weight 3 = 8
>   * Age Mod: -1 per Age (older Bullets fire easier)
>   * Proximity Mods: -2 if subject NPC is speaking/addressed; -1 if subject NPC is present; -1 if location matches current scene; -1 if emotional tone matches current mood.
>   * Scene Mod: High Momentum = -2 | Steady = 0 | Slow Burn = +2
>   * Urgency Mod: -2 if deadline is <= 2 minutes or next story beat.
> - Firing: If rollD20 >= effective threshold AND Bullet age >= 4, mark active=1, fire the Bullet, and integrate into the narrative. Skip if no natural, elegant opening exists or if age < 4.
> - Pruning: Jam if rollD20 == 1 (fails, may retry next turn). Prune non-locked Bullets at age >= 12. If active Bullets > 20, prune the oldest/lowest weight. Pruned Bullets fire silently and move to the FIRED list.
> - Loading Logic (Narrative Debt): Scan narrative, check for narrative debt (unresolved setups, active promises, foreshadowed elements, emotional tension, or physical setups in narrative prose). If narrative debt exists, load new Bullets corresponding to the debt (load 1-2 Bullets per turn based on identified debt).
> - Coincidence: If {{roll::1d20}} = Nat 20 and >= 2 unrelated Bullets fire, all active Bullets get a -4 threshold this turn.
> - Calamity: If {{roll::1d20}} = Nat 1 and >= 2 unrelated Bullets fire, all fire under the worst possible interpretation.
>
> Scheduling:
> - If a future time is mentioned (e.g., "in 5 mins", "noon"), load a TIME-LOCKED Bullet `[LOCKED: T:HH:MM]` based on the header time. Apply a -2 threshold for urgency within 2 minutes of the deadline. NPCs return naturally when the Bullet fires (never narrate the locking mechanics).
>
> chekhovD20: Seed1..Seed5: {{roll::1d20}} ×5

CoT line (`chekhovsGunCoT`):

> CHEKHOV_FIRE: Unlock eligible Bullets. Age unlocked Bullets +1; prune if age >= 12. Verify age minimum rule (must be age >= 4 to fire). For up to 5 loaded Bullets with age >= 4, check chekhovD20.Seed# vs effective threshold (base - age - mods). Fire if roll >= threshold, age >= 4, and a natural opening exists (if none → VETO and reload into gun); jam/prune on Nat 1. Convert future time references (e.g., "tonight", "tomorrow") to absolute T:HH:MM locks. Loading Logic: scan narrative, check for narrative debt; if yes, load Bullets into the gun. Prune oldest/least impactful if over capacity (>20).

Couplings: World Sim tables (`/prompts/44`), both CALM bands: "CALM — Quiet moment; plant 1 passive environment Chekhov seed (W1)." · Internal Agenda (`/prompts/40`) completion effects: "research/investigate: Plant Chekhov seed; +1 Sparks with involved NPC."

FF preamble (`/prompts/45` comment): "…automatically records minor details, foreshadowed comments, or scheduled appointments as hidden narrative debt 'Bullets'… Every turn, loaded Bullets age and have a chance of being randomly fired based on d20 rolls, becoming much easier to fire if relevant characters, locations, or emotional moods are present in the current scene… minor elements mentioned earlier in the chat naturally and logically resurface as major plot points later on."
