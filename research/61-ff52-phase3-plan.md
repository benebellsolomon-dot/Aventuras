# 61 — FF5.2 Phase 3: E3 world sim + E4 off-screen NPC agendas

**Date:** 2026-08-21 · **Parent:** research/58 (D3 ruling: E1 → E3+E4 → E2) · **Basis:** FF5.2 source blocks re-read from the Downloads JSON this session (🌎World Sim 🎲 + 📅 Internal Agenda, full text), Phase-2 rel engine as shipped (research/60), and a full integration-point sweep (roll seeds, classifier extension, reducer step 8, prompt tail, settings plumbing).

Translation principle (research/58 §1) governs throughout: FF fakes both systems in-context (LLM re-emits state, `{{roll}}` macros supply dice). We port the *language and tables*, and re-home the state: real seeded rolls, real metadata, deterministic reducers, rendered directive blocks. Never LLM-self-reported state.

## Design

### E3 — World Sim (stateless, pure derivation)

**No persistence at all.** The world event for a turn is a pure function of `(storyId, userActionEntryId, settings, last-known presence, cast)` — recomputable, replay-stable, zero migration surface.

- **Seed contract:** `${storyId}:${entryId}:worldsim` where `entryId` is **`userAction.entryId`** — the pre-generation ID, exactly the contract CheckPhase already uses (`${story.id}:${entryId}:check`). Consequence (same as checks, by design): a *regenerate* keeps the same world event; a *retried turn* (new action entry) re-rolls. Sub-seeds for independent rolls: `:gate` (sparse frequency gate), `:npc` (target NPC pick).
- **Tables as code constants** — FF's two tables verbatim in structure (2-point bands, CALM at 1–2 and 19–20 on both):
  - *Standard* (3+ present NPCs, off-screen cast exists): CALM, ENTER_CHECK, BACKGROUND_INCIDENT, MOOD_SWING, GOSSIP_SURGE, CHANCE_MEETING, OVERHEARD_DETAIL, TASK_SHIFT, MUNDANE_INTERRUPTION.
  - *Duo* (≤2 present NPCs OR no off-screen NPCs): CALM, ENV_SHIFT, MOOD_SWING, PHYSICAL_REACTION, MEMORY_TRIGGER, OBJECT_DISCOVERY, OUTSIDE_INTRUSION, POWER_SHIFT, MUNDANE_INTERRUPTION.
  - Each entry carries an adapted one-line directive template (FF's event description rewritten as an instruction to the narrator, with an optional `{name}` slot).
- **CALM renders nothing** — a quiet turn is the absence of a block. (FF plants a Chekhov seed on CALM; that half waits for E2 in Phase 4 — noted in the constants comment.)
- **Table selection** (task ruling: from classifier presence count): presence read pre-generation via the *prior turn's* classifier signal — `readScenePresence(entries)` (be/presence.ts lookback, the same signal [BODY STATE] scoping uses). `presentNpcCount` = present names ∩ non-self cast; `offScreen` = non-self cast minus present. Standard iff `presentNpcCount ≥ 3 && offScreen.length > 0`, else Duo. **Presence unknown (null) → Duo** — Duo events never invoke off-screen NPCs, so the degrade is safe (also covers turn 1 of every story).
- **Named-NPC picks are engine-side, not LLM-side** (FF lets the model choose; we have ground truth): ENTER_CHECK picks an off-screen NPC — preferring one whose E4 agenda is `done` with kind `travel` (the FF coupling: travel completion "may trigger Enter_Check"), else seeded pick via `:npc`. MOOD_SWING/POWER_SHIFT pick a present NPC via `:npc`; **no present NPC → the event degrades to CALM** (no block) rather than inventing a target. GOSSIP_SURGE/CHANCE_MEETING/OVERHEARD_DETAIL/TASK_SHIFT name off-screen NPCs the same seeded way.
- **`worldSimFrequency` story setting:** `'off' | 'sparse' | 'lively'`, `undefined` = off (off→on rollout like beMode). `lively` = the event roll fires every eligible turn (FF's own cadence); `sparse` = a gate roll on `:gate` must land ≤ `WORLDSIM_SPARSE_GATE` (7 of 20, ~35%) first. The gate is a *separate seed* so sparse/lively agree on *which* event a given turn would produce — the setting only decides whether it fires.
- **Intimate-scene suppression:** engine-side signal — any *present* tracked girl with `bodyState.arousal ≥ WORLDSIM_SUPPRESS_AROUSAL` (70) suppresses the block entirely (FF: "skip the d20 roll if NSFW scene is active"). This signal only exists in beMode; for non-BE stories the block's own advisory framing ("if it cannot fit this beat, let it pass unremarked") is the fallback. `actInProgress` was considered and rejected: it is a post-narration image-pipeline output, not available pre-generation.
- **Rendering:** fixed-string header (rpg/context.ts convention — headers are constants, volatility inside the body only): `[WORLD EVENT — background texture, advisory]`. Body: the directive + standing guidance ("weave it in naturally as background texture; keep it secondary to the player's action; never let it derail the current beat; if it cannot fit, let it pass").

### E4 — Off-screen NPC agendas (per-character metadata + deterministic ticking)

**State** — new sibling key on character metadata, `metadata.npcAgenda`, typed access mirroring be/metadata.ts:

```ts
interface NpcAgenda {
  goal: string          // short human phrase, e.g. "restocking herbs in the lower market"
  kind: 'travel' | 'research' | 'rest' | 'reconcile' | 'confront' | 'mundane'
  step: number          // 0-based progress
  maxSteps: number      // clamped 1..AGENDA_MAX_STEPS (6)
  location?: string     // where she is / doing it (flavor; travel completion rewrites it)
  destination?: string  // travel target
  done?: boolean        // completion effect applied; slot is refillable
}
```

Zod schema: `.passthrough()` (unknown future fields survive an older reader — 31a lesson 3), **`.catch(undefined)` at the top level** (fix-diff MEDIUM-4 lesson: a malformed block degrades to "no agenda", it must never poison the sibling `bodyState` read or throw). Reader clamps at read time (`step ≥ 0`, `maxSteps 1..6`), never trusts stored bounds.

**Universe and bounds.** Agendas apply to every named non-self character, BE or not — but ticking and backfill are bounded to the **active cast**: the union of `presentCharacterNames` over the last `PRESENCE_LOOKBACK` (10) narration entries, plus this turn's effective presence (new pure helper `recentPresenceUnion` in be/presence.ts). A character outside the story's orbit for 10+ turns freezes (no writes, drops out of the block) and rejoins automatically on reappearance. This bounds write amplification to the active cast, not the whole historical dramatis personae.

**Ticking** — deterministic, rides `applyClassificationResult` (inside the existing CR-1 replay guard, so a re-applied turn cannot double-tick), in a new store pass `applyAgendaTurn` that runs **before** `applyBeEvents` (its completion effects feed that call):

1. Compute this turn's presence via the *same* `effectivePresence` derivation the BE pass uses (with `trackedNames` = all non-self active-cast names). The include-when-in-doubt fallback means: **no presence signal → everyone counts as present → no agenda ticks that turn.** A classifier hiccup pauses the off-screen world for a beat; it never fast-forwards it. This is the required non-conflict with reducer step 8's semantics: agenda ticking is exactly the complement of `ticksEnabled` presence, from the same source of truth.
2. For each active-cast, off-screen character *with* an agenda not yet `done`: `step += 1`. On `step ≥ maxSteps`: mark `done`, emit the completion effect (below).
3. **Mundane backfill (deterministic — no LLM needed):** each active-cast, off-screen character with *no* agenda or a `done` one gets a fresh mundane agenda seeded from `MUNDANE_GOALS` (FF's own list: eat, rest, patrol, study, errand/wander — ~8 entries with goal text + step ranges), picked via `seededRoll(`${storyId}:${entryId}:agenda:${characterId}`)`. `entryId` here is the narration entry id (this pass runs post-classification, same id `applyBeEvents` seeds with). Assignment happens once and persists, so per-turn seed entropy is correct (a different turn assigning gets a different pick; replay of the same turn gets the same one).
4. On-screen characters: agenda untouched (FF: verify without advancing). Their `done` agenda is cleared to make the slot proposable once they have been seen on-screen (arrival flavor has fired; see rendering).

**Assignment (the one LLM-needing part)** — classifier schema extension per the be/schema.ts pattern, gated on the `npcAgendas` setting exactly as beMode gates its extension (ClassifierService lines ~101–133):

- New top-level array `agendaProposals`, max 6: `{ character, goal (≤120 chars), kind (enum above minus 'mundane'? — no: full enum, mundane allowed), maxSteps (1–6), destination? }`.
- Instruction block appended to the same `customVariableInstructions` slot: propose an agenda for a named NPC who *left the scene this response*, was *described as pursuing something elsewhere*, or was *newly introduced then departed* — grounded in this response's events; no proposals for characters who stayed on-screen doing nothing notable.
- **The engine owns the slot:** a proposal is accepted only for a character whose agenda is absent or `done`. An active agenda is never overwritten by the classifier (no roster plumbing needed; dedupe is engine-side). Proposals for unknown/self characters are dropped. Accepted proposals clamp `maxSteps` and truncate strings.

**Completion effects** — translated per FF's table, but through Phase-2's earned-only rel machinery (never direct bond writes, never `potent` — that marker stays spell-only):

| FF effect | Aventuras translation |
|---|---|
| travel/move → location updates | `agenda.location = destination`; renders in the block; ENTER_CHECK coupling above |
| research/investigate → Chekhov seed, +1 Sparks | `warm` BondEvent intensity 1 (+1 spark). Seed half deferred to E2 (Phase 4) |
| reconcile → +1 BOND | `warm` BondEvent intensity 2 (+2 sparks; repairs 1 grudge on a strain-free turn — the earned path to FF's intent) |
| confront → BOND shift, plant grudge | `strain` BondEvent intensity 2 (+1 grudge; no direct bond hit — i3 is scene-defining and an off-screen resolution is not) |
| rest/recover → clear injury/self-grudge | **flavor only** — grudge already decays on the rel cadence; writing conditions would bypass the reducer's single-writer discipline |
| repair/build → NPC inventory item | **not ported** (folded into mundane) — NPC inventory is not an engine surface |
| mundane → new mundane agenda | `done` → next off-screen tick backfills a fresh mundane one automatically |

Wiring: `applyAgendaTurn` returns `Map<characterId, BondEvent[]>`; `applyBeEvents` gains an `agendaBondEvents` parameter appended into `bondEventsByCharacterId` **exactly like `spellCast.bondEvents`** (the established non-classifier event channel, story.svelte.ts ~3511). Interplay with reducer step 8, verified against the shipped semantics:
- The events make `relActive` true → sparks/grudge land for the off-screen girl; `ticksEnabled` stays false for her (`isPresent || charEvents.length > 0` is untouched — agenda bond events are not BE growth events), so **`ct` stays frozen and nothing converts off-screen**; the warmth banks and pays out when she is next active. That is the correct FF slow-burn reading, and it is precisely the non-conflict the task requires.
- A never-BE-seeded girl (no `bodyState`) drops the bond event at the existing seed guard — same behavior classifier bondEvents already have for her; documented, not changed.
- Effects only function in beMode (the rel engine lives in `bodyState`); in non-BE stories agendas still assign/tick/render but complete flavor-only. Story-wide rel for non-BE stories stays research/60's explicitly-deferred item.

**Persistence discipline:** agenda writes go through a `writeNpcAgenda(metadata, agenda)` sibling of `writeBodyState` (new-object, sibling-keys preserved), inside the same `wrapUpdate` + `captureCharacterBeforeState` machinery `applyBeEvents` uses — rollback/undo/branch coverage inherited, not re-implemented. One character's BE write and agenda write may both happen in a turn; they are separate metadata keys on separate wrapUpdate calls (bounded: active cast ≤ ~10 writes/turn worst case; risk noted below).

### E4 rendering — the `[OFF-SCREEN]` block

Built at prompt-assembly time from *persisted* agenda state (pre-generation; last turn's ticks are already applied). Fixed header `[OFF-SCREEN — the world keeps moving]`, then up to `MAX_OFFSCREEN_LINES` (6) lines for active-cast off-screen NPCs, priority `done` > in-progress non-mundane > mundane, name-sorted within class. Progress is **quantized to phases** (just started / underway / nearly done / finished) — never step numbers (FF's own "never mention mechanics in prose" rule, and fewer per-turn byte changes). Each line carries the FF arrival coloring so intercepts work without a separate mechanism:

- in progress: `Mira — away: restocking herbs in the lower market (underway). If she enters, she arrives mid-errand — distracted, other obligations on her mind.`
- done, mundane: `…(finished). If she enters, she is present and unhurried.`
- done, significant: `…(finished). If she enters, she arrives energized and wants to share what came of it.` (bond-gated sharing line only when her stance is bonded+ — read through `bondOf`, beMode only)
- done, reconcile: `…If she enters, she is subdued and looking for a chance to repair things.`

Standing block guidance: these are background truths, not stage directions — never force an entrance; the world event / player action decides who actually appears.

### Prompt placement + cache stability

Both blocks are per-turn volatile → **user prompt tail only, never the system prompt** (the Phase-1/2 cache rule). Insertion in `NarrativeService.buildUserPrompt`, in order:

1. `## Recent Story` / `## Current Action` (unchanged)
2. `[Narrative Directives]` (unchanged)
3. **`[OFF-SCREEN …]`** (new — slower-varying of the two)
4. **`[WORLD EVENT …]`** (new)
5. `[CHECK RESULT]` **stays dead last** (research/47 Step 6 — the authority-dominant fact keeps the closest-to-generation slot)
6. `Continue the narrative:`

Threading mirrors `pendingCheck` exactly: computed in `GenerationPipeline.execute` between checkPhase and narrativePhase (pure sync call over `ctx` — story, worldState.characters, visibleEntries, userAction.entryId all present), passed as one optional `turnDirectives?: { offScreenBlock: string; worldEventBlock: string }` through `NarrativeInput` → `streamNarrative` → `buildUserPrompt`. Both settings unset ⇒ both strings empty ⇒ **byte-identical prompts to today** (canary/cache guard; no template edits at all — the blocks are user-prompt string appends like [CHECK RESULT]).

### Settings

- `worldSimFrequency?: 'off' | 'sparse' | 'lively'` (undefined ≡ off)
- `npcAgendas?: boolean` (undefined ≡ off)

UI in story-settings.svelte following the `proseStyle` RadioGroup pattern + a switch, writing through `story.updateStorySettings`.

## File-level changes

1. **`src/lib/types/index.ts`** — `StorySettings`: add `worldSimFrequency?: 'off' | 'sparse' | 'lively'` and `npcAgendas?: boolean`.
2. **NEW `src/lib/services/worldsim/constants.ts`** — `WORLD_EVENT_TABLES` (standard/duo: `{ id, min, max, needs: 'present-npc' | 'offscreen-npc' | null, directive }`), `WORLDSIM_SPARSE_GATE = 7`, `WORLDSIM_SUPPRESS_AROUSAL = 70`, `AGENDA_MAX_STEPS = 6`, `MAX_OFFSCREEN_LINES = 6`, `MAX_AGENDA_PROPOSALS = 6`, `MUNDANE_GOALS` (goal text + maxSteps each).
3. **NEW `src/lib/services/worldsim/events.ts`** — `rollWorldEvent(input): WorldEvent | null` (pure: storyId, entryId, frequency, presentNpcNames, offScreenNpcs `{name, agenda}`, suppressed) — gate roll, table selection, event roll, NPC pick (ENTER_CHECK prefers done-travel agenda), CALM/no-target → null; `buildWorldEventBlock(event): string` with the fixed header.
4. **NEW `src/lib/services/worldsim/agenda.ts`** — `NpcAgenda` type, `NPC_AGENDA_KEY = 'npcAgenda'`, zod schema (passthrough + catch), `readNpcAgenda` / `writeNpcAgenda` / `clearNpcAgenda`, `tickAgenda(agenda): { next, completed }`, `mundaneAgenda(seed): NpcAgenda`, `agendaCompletionBondEvent(agenda, characterName): BondEvent | null` (the effect table), `buildOffScreenBlock(entries: {name, agenda, bondStance?}[]): string` (cap, priority, quantized phases, arrival coloring).
5. **NEW `src/lib/services/worldsim/schema.ts`** — `agendaProposalSchema`, `extendClassificationSchemaWithAgendas(schema)` (identity-return no-op contract like the BE extender), `agendaProposalsFromResult(result)`, `buildAgendaInstructions()`.
6. **NEW `src/lib/services/worldsim/index.ts`** — barrel exports.
7. **`src/lib/services/be/presence.ts`** — add `recentPresenceUnion(entries, lookback = PRESENCE_LOOKBACK): Set<string>` (union of per-entry `presentCharacterNames` over the lookback window; empty set when none found).
8. **`src/lib/services/ai/generation/ClassifierService.ts`** — gate on `settings?.npcAgendas === true`: extend schema via `extendClassificationSchemaWithAgendas` (warn on no-op, like beMode) and append `buildAgendaInstructions()` to `customVariableInstructions`.
9. **`src/lib/services/ai/sdk/schemas/classifier.ts`** — `ClassificationResult` type: add optional `agendaProposals?` doc-field alongside `beEvents?`.
10. **`src/lib/stores/story.svelte.ts`** — new private `applyAgendaTurn(result, entryId, trackingEnabled, charactersBefore, createdCharacterIds): Promise<Map<string, BondEvent[]>>` (accept proposals into empty/done slots; tick off-screen active cast; backfill mundane; clear seen-on-screen done agendas; completion effects; wrapUpdate + captureCharacterBeforeState per write). Called from `applyClassificationResult` right before `applyBeEvents` when `settings?.npcAgendas === true`; `applyBeEvents` gains an `agendaBondEvents` param merged like `spellCast.bondEvents`.
11. **`src/lib/services/generation/GenerationPipeline.ts`** — compute `turnDirectives` between check and narrative phases (reads settings, worldState.characters + their `npcAgenda`/`bodyState.arousal`, `readScenePresence(ctx.visibleEntries)`, `ctx.userAction.entryId`); pass into `narrativePhase.execute`.
12. **`src/lib/services/generation/phases/NarrativePhase.ts`** — thread `turnDirectives` through `NarrativeInput` and the `streamNarrative` dependency signature.
13. **`src/lib/services/ai/generation/NarrativeService.ts`** — `streamNarrative`/`buildUserPrompt`: render the two blocks between `[Narrative Directives]` and `[CHECK RESULT]`.
14. **`src/lib/components/settings/tabs/story-settings.svelte`** — `worldSimFrequency` radio group + `npcAgendas` switch.
15. **Tests** — NEW `worldsim/events.test.ts` (all-20-roll band goldens both tables, table selection incl. presence-null → Duo, sparse gate determinism, suppression, NPC pick incl. done-travel preference and no-target degrade, block snapshot); NEW `worldsim/agenda.test.ts` (schema round-trip + malformed-degrade, tick/complete, clamps, mundane backfill determinism, effect table incl. rest/mundane = null, block cap/priority/phasing); NEW `worldsim/schema.test.ts` (extension identity no-op, proposal coercion tolerance); `presence.test.ts` (recentPresenceUnion); store harness coverage in `story.harness.svelte.test.ts` (tick only off-screen, replay guard no-double-tick, proposal accepted only into empty/done slot, completion bondEvent reaches the reducer with `ticks` false semantics intact, rollback restores agenda); NarrativeService prompt-order test (blocks between directives and check result; absent when settings unset — byte-identity with a golden).

## Explicitly out of scope (Phase 4+)

- Chekhov coupling (CALM seed-planting, research-completion seeds) — E2 is Phase 4; the hooks are comment-marked.
- NPC↔NPC relationship shifts from gossip/faction effects (rel is player↔NPC only, per research/60 scope).
- FF's quest-integration block (time-locked/state-locked quest agenda shifts) — Aventuras story beats are not schedulable quests yet.
- Per-NPC inventory (repair/build effect), NPC injury severity (rest effect halves to flavor).
- Pack-overridable event tables (constants first; packs later if playtests want it).
- An agenda editor panel (none exists for bond either; the block is read-only surface).

## Risks

- **Write amplification:** every active-cast off-screen NPC gets one metadata write per turn while ticking. Bounded by `recentPresenceUnion` (~≤10), but it is new steady-state DB traffic — flag for the adversarial pass and playtest.
- **Presence-fallback freeze:** a run of classifier presence hiccups pauses agenda progress (never fast-forwards). Accepted: same include-when-in-doubt bias as the BE engine (R-9 lineage).
- **[OFF-SCREEN] staleness vs. prose:** the block asserts whereabouts the narrative may have contradicted this very turn (classifier lag is one turn). The block language is advisory ("background truths… never force an entrance") to keep contradictions cheap.
- **Prompt-tail growth:** up to ~6 lines + 3 lines per turn of new volatile tail. Tail tokens are uncached by nature; still bounded by the caps.
- **Determinism audit:** both features must stay Date.now/Math.random-free (seed contracts only) — review lens item.
- Adversarial multi-lens review mandatory before commit (persistence + reducer-adjacent + classifier surface), then the fix-diff round.

## Review outcome (3-lens adversarial pass, 2026-08-21 — all lenses returned)

**Fixed same session (first round):**
- **HIGH (all three lenses, independently): immortal off-screen ghosts.** The rendered `[OFF-SCREEN]` pool was not active-cast bounded, `done` agendas sorted first and never expired, so a character who finished an agenda and left the story's orbit occupied line 1 forever. Fixed three ways: `computeTurnDirectives` bounds both the block and the world-event NPC pools to `recentPresenceUnion ∪ presence`; a `done` agenda of ANY kind now refreshes to a seeded mundane one on its next off-screen active-cast turn (its "finished" arrival coloring gets exactly the one prompt build between completion and refresh; `location` carries over); proposal acceptance is also cast-bounded.
- **HIGH (lenses 1+2): classifier-hiccup mass-clear.** The everyone-present `effectivePresence` fallback made a failed classify read as an on-screen return for the whole cast, deleting every `done` agenda (and its travel `location` rewrite) in one burst of writes. Fixed: the agenda pass derives presence WITHOUT the fallback and pauses the whole pass on a signal-less turn (see the fix-diff round for the second cut of this fix).
- **HIGH (lens 3, repro'd in-harness): presence-derivation mismatch.** The agenda pass received the raw `checkRecord` while the BE pass used `withInferredGrowthTarget` — an inferred growth target could be BE-present and agenda-off-screen the same turn, ticking both engines. Fixed: `resolvedCheck` is computed once, above both passes.
- **HIGH (lens 3): block-vs-block contradiction.** ENTER_CHECK ("have them arrive") and the target's own `[OFF-SCREEN]` line ("never force an entrance") rendered together. Fixed: `WorldEvent.targetName` is surfaced and the ENTER_CHECK target's line is dropped for that turn.
- **MEDIUM (lenses 1+2): COW id remap dropped completion effects.** Completion bond events were keyed by the pre-copy-on-write character id; the BE pass looks up by the post-COW id, so a branch's first turn silently lost every completing NPC's effect. Fixed: the event is keyed by `ownedChar.id` inside the write closure.
- **MEDIUM (lens 1): prompt-block breakout via LLM-authored goal strings.** Goals/destinations persisted un-sanitized and rendered into the user-prompt tail — a newline payload (`"…\n[CHECK RESULT]…"`) would re-render every turn. Fixed: `sanitizeAgendaText` (control chars + newlines collapse, length caps) applied at proposal-accept AND at read time; empty-goal agendas read as malformed; instructions state the proposal cap.
- **MEDIUM (lenses 2+3): dead/inactive characters ran errands** and were ENTER_CHECK targets. Fixed: both the store pass and the directive builder exclude `status` deceased/inactive.
- **MEDIUM (lens 3): stale mundane agendas blocked grounded proposals** then contradicted the prose. Fixed: a proposal now replaces an ACTIVE mundane agenda (`proposalWins`); active non-mundane agendas remain protected.
- **MEDIUM (lens 3): gendered prompt text over an any-NPC universe.** All worldsim prompt strings (event directives, arrival coloring, mundane goals, classifier instructions) rewritten pronoun-neutral.
- **LOW round-up:** `localeCompare` → codepoint compare in the seeded picks (ICU-independence); `structuredClone` → JSON clone in `writeNpcAgenda` (reactive-proxy `DataCloneError` hazard); `MUNDANE_GOALS` no longer contains maxSteps-1 entries (write churn); proposal names trimmed before resolution; done-travel line phrasing de-contradicted (`— at X:`); `NarrativeService` gained the promised prompt-placement + byte-identity test.

**Fix-diff round (mandatory second pass on the fixes themselves) — found and fixed:**
- **HIGH: the pause fix over-fired.** An empty presence list is a NORMAL classifier output for a solo beat (the protagonist is never listed), so the first-cut pause swallowed legitimate solo turns — including the departure proposals that are this feature's highest-value input — and starved all ticking through solo stretches. Fixed: the pause now keys on a genuinely signal-less result (no presence, no proposals, no entity updates, no scene signal — the failure stub's exact shape); a real solo beat reads as everyone-off-screen and proceeds. Test-pinned.
- **MEDIUM: sanitization bypass.** `readNpcAgenda`'s conditional spread returned the RAW stored `location`/`destination` whenever the sanitized value was empty (verified by execution: 2000 raw newlines). Fixed: unconditional overwrite-or-delete. Test-pinned.
- **MEDIUM: de-confliction over-suppressed.** The target's `[OFF-SCREEN]` line was dropped for ALL off-screen-target events; for GOSSIP_SURGE/CHANCE_MEETING/OVERHEARD_DETAIL/TASK_SHIFT the character does not enter and the line is the directive's grounding. Fixed: scoped to ENTER_CHECK. Test-pinned.
- **MEDIUM: the `resolvedCheck` hoist crossed a new COW site.** `checkRecordTargets` is id-only; the agenda pass COWs characters after target inference, so a branch's first turn could void a growth/spell apply. Fixed: the target id re-resolves by name after the agenda pass when stale.
- **MEDIUM: the two active-cast derivations used different entry sets** (`visibleEntries` vs `this.entries`), so a chapter summarization shrank the render window while ticking continued. Fixed: the pipeline now feeds `ctx.allEntries`. (The remaining function-level difference — `readScenePresence` lookback pre-generation vs `effectivePresence` this-turn post-classification — is inherent to when each runs; accepted.)
- **LOW:** sanitize regex extended to the C1 control block (U+0085 NEL survived and `\s` does not match it); dead presence-add removed from the directive builder.

**Accepted as designed (documented, not changed):**
- **Reconcile/confront proposal farming** (lens 1): a misbehaving classifier repeatedly proposing reconcile agendas drains grudge player-independently. Bounded: each cycle needs ≥2 turns (accept + tick), so the drain rate (≤1 grudge/2 turns) is comparable to the engine's natural decay (1/3 active turns), instructions reserve those kinds for evidenced intent, and grudge storage overflow collapses to a single −1 at boil-over (reset to 0). No Phase-2 tracks.ts change without its own review; D5 playtest item.
- **Write cadence:** one metadata write per off-screen active-cast character per turn while agendas tick (incl. the mundane cycle), each carried in the turn delta when state tracking is on. This is the design's cost, bounded by the active cast (~≤10); flagged for playtest. A completion turn writes the same row twice (agenda pass + BE pass) — inherent to the two-pass split.
- **Replay guard scope:** with `stateTracking` off no delta is written, so the CR-1 replay guard cannot arm and a re-applied turn re-ticks — the same pre-existing exposure the BE engine has; agendas add rows to it but not a new mechanism.
- **Never-BE-seeded girls drop completion effects** (bond events need `bodyState`; same fate classifier bondEvents already have) — documented at the merge site.
- **Name-wobble freeze** (classifier alternating "Mira"/"Mira Valen" drops her from the active cast until re-seen) — include-when-in-doubt lineage, self-heals on reappearance.
- **Raw character names in the new blocks are unsanitized** — pre-existing class shared with every prompt block ([BODY STATE] etc.); a codebase-wide name-hygiene pass is out of scope here.
- **Toggle-off orphans agenda state** (re-enabling resumes old agendas); **corrupt agenda on a permanently on-screen character never self-heals** (off-screen backfill is the healer); **arousal 69 is unguarded** (threshold is a D5 tunable); **creative-writing mode is not gated** (opt-in per story); **mundane-goal modulo bias** (first 4 goals 1.5× likelier — cosmetic); **UTF-16 slice can leave a lone surrogate at the cap** (JSON-safe since ES2019, cosmetic).
- **Proposal schema `.max(6)` can fail the whole classification** if the model overflows it — mitigated by stating the cap in the instructions; same pattern as the shipped BE arrays (`.max(16)`). Structured-output providers enforce maxItems; accepted.
- **Future agenda SHAPE changes are replaced, not preserved** (an array-valued `npcAgenda` from a newer build reads as malformed → mundane backfill overwrites). `.passthrough()` covers extra fields only; a shape change needs its own migration, as everywhere else in metadata.

**Verified clean by the lenses:** `potent` unreachable from classifier/agenda paths; proposals land only in empty/done slots; self/unknown targets dropped; steps/intensities clamp at accept and read; agenda events share the reducer's per-turn caps and bank caps; agenda events never imply presence (`ct` frozen off-screen — harness-pinned `sparks 2 / ct 0 / bond 4`); single-writer discipline both directions (agenda pass and BE pass spread each other's keys; no second writer exists); transactional integrity (agenda writes buffer in the CR-1 batch, delta last, crash mid-turn replays byte-identically off the entry-stable seeds); rollback/undo/branch restore covers `npcAgenda` via the shared before-state capture; old saves parse untouched and malformed blocks degrade without poisoning `bodyState`; both event tables tile 1–20 with FF's band layout; sparse/lively agree on which event a turn produces; both settings unset ⇒ classifier schema/prompt and narrative prompt byte-identical (test-pinned at the prompt level).

Final gate after both rounds: suite **1222** (from 1147), svelte-check 0 errors, eslint 0 errors. Commit deliberately left for Ben's explicit go.
