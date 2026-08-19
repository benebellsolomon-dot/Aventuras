# RPG Layer — Phase 5 Implementation Plan (Polish & hardening)
Spec: `research/46-rpg-layer-design.md` §6 item 5 (cache-order audit · continuity UX · settings · DC/velocity balance pass) + §4 (continuity) + §5 (UI)
Baseline: Phases 1–4 as merged (`739da6f6` on `master` / `be-patches`, the live app), 673 tests green, svelte-check 0.

## The gate: Phase 5's centre is playtest-driven

Phase 5 is the tuning-and-hardening phase, and its headline — the **DC/velocity balance pass** — cannot be done from the armchair: it re-derives four stacked layers of D5 reference defaults (dice DCs, bond/dependence velocity, lactation cadence, spell costs) against **measured play cadence**, which requires Ben to actually play Phases 1–4. So this plan is split:

- **Playtest-GATED (W4):** the balance pass. Waits on Ben's playtest verdicts.
- **Playtest-INDEPENDENT (W1–W3, W5):** cache-order audit, continuity UX, settings, and the deferred-backlog hardening. Can start immediately, in any order.

Recommended sequence: Ben plays Phases 1–4 and reports verdicts (checklist below) → the balance pass executes against that data, while the independent hardening lands in parallel.

## Standing constraints (unchanged from research/47–50)

Purity (no `Date.now`/`Math.random`/`crypto.*` in `be/`, `rpg/`), single writer (reducer owns `bodyState`; `applyRpgTurn` owns the sheet; `applyBeEvents` owns BE persistence), module boundaries, testability (vitest node env; `.svelte` markup-only), degrade-gracefully schema contracts, and no-eager-default-write. **Balance changes are constants-only** — retune the numbers in `be/constants.ts` / `rpg/constants.ts`; do not change pipeline shape during a balance pass (that is what makes a golden-canary regression trustworthy).

---

## Playtest verdicts to collect (spans all four phases — the balance pass consumes these)

Carried forward from the Phase 3 handoff + extended for Phase 4:
- **Checks (P1):** do the DC bands feel right? Are computed success odds honest? Is the resolve-then-narrate latency acceptable?
- **Harem (P2):** bond velocity cap too fast/slow? Dependence gain/withdrawal cadence? Do gated interactions unlock at the right moments?
- **Lactation (P3):** supply adaptation pace (2 milked up / 4 idle down)? The milking-gate flip (a big-but-uninduced girl loses the offer until induced)? Chronic-supply growth cadence (6 beats at heavy+)? The `lactation_drift` milk-suppression rule?
- **Magic (P4, NEW):** spell essence costs vs. the pool size — do casts feel affordable but meaningful? Band→effect scaling (fizzle/partial/success/crit) read right? Is research-then-cast a satisfying loop, or too many taps? Do generated spells come out balanced (the LLM picking sane dc/cost/effects), or do they need tighter schema bounds / prompt guidance? Does the spellbook cast affordance read as discoverable (note the say/think-mode drop, W5-D5)?

---

## W1 — Cache-order audit (playtest-independent)

**Goal:** confirm every prompt block the four phases added preserves the stable-prefix / volatile-last contract, so prompt-cache hit rates don't silently degrade across a long story.

**Files (read/verify, minimal edits):** `rpg/context.ts` (`[PLAYER SHEET]`, `[CHECK RESULT]`), `be/context.ts` (`[BODY STATE]`, `[HAREM STATE]`, lactation lines), `context/context-builder.ts` (assembly order), `NarrativeService.ts` (where `[CHECK RESULT]` appends last).

**Steps:**
- Byte-identity snapshot fixtures for the full assembled system prompt at each capability tier (non-BE / BE-no-harem / harem / lactation / caster), asserting that turning a later capability ON changes ONLY the tail of the volatile region — no header moves, no reordering of a lower tier's lines. (Extends the per-block snapshots each phase already has into a cross-block ordering test.)
- Confirm the Phase 4 known-spells line and cast directive sit after the stable lines (already unit-tested per-block; this audits the *assembled* order).

**Verify:** the new ordering snapshots; existing context tests unchanged.

## W2 — Continuity UX (playtest-independent)

**Goal:** the "continuity corrected" story is player-visible and legible, per spec §4 (findings render as an amber roll-card tag AND keep the `[CONTINUITY]` next-turn path — no silent fudging).

**Files:** `CheckCard.svelte` (drift tag render), `rpg/turnlog.ts` + `TurnLogList` (drift/cast row styling), the drift note surfacing in the sheet block.

**Steps:**
- Verify the drift tag renders on the roll card for all three RPG drift kinds (`check_contradiction`, `stat_invention`, `lactation_drift`) and reads clearly; add a cast/school tint to cast rows in the turn log (the `CheckRecord.spellId` is already carried — component-side only).
- Tighten `stat_invention` spell false-positives if playtest shows NPC-spellcasting prose tripping it (W5-D6 cross-ref).

**Verify:** `turnlog.test.ts` (cast row labeling); manual roll-card check for each drift kind.

## W3 — Settings (playtest-independent)

**Goal:** the two spec'd player settings — roll-card verbosity and turn-log length.

**Files:** `src/lib/types/index.ts` (`StorySettings`), the story-settings UI tab, `CheckCard.svelte` (verbosity), `rpg/turnlog.ts` (`buildTurnLog` limit), Harem panel.

**Steps:**
- `StorySettings` gains `rpgRollCardVerbosity?: 'compact' | 'full'` (default full) and `rpgTurnLogLength?: number` (default 30, the current `buildTurnLog` limit). Both optional → legacy saves unaffected.
- `CheckCard` renders compact (band + total only) vs full (the current math breakdown) per the setting. `buildTurnLog(entries, limit)` reads the setting.
- Settings-tab controls under the existing BE-mode section.

**Verify:** `turnlog.test.ts` (limit honored); a compact-vs-full CheckCard snapshot.

## W4 — DC / velocity balance pass (PLAYTEST-GATED)

**Goal:** re-derive the four stacked layers of D5 reference defaults from Ben's measured play. **Constants-only** — no pipeline changes.

**Instrumentation (can build now, pre-playtest):** a dev-only aggregation over `checkLog` + `beLog` across a story's entries reporting: check success-rate by skill and DC band; actual bond/dependence deltas per turn vs. the caps; lactation supply-move cadence; growth-landing cadence; spell cast frequency + fizzle rate + essence burn. This turns "feels too fast" into a number.

**Tuning targets (adjust from the readout, each its own small commit + canary re-harvest):**
- Check DCs / the `DC_MIN..DC_MAX` rubric wording; crit/partial band widths (`CRIT_MARGIN`, `PARTIAL_MISS_WINDOW`).
- Bond/dependence: `MAX_BOND_DELTA_PER_TURN`, `MAX_DEPENDENCE_GAIN_PER_TURN`, decay rates, withdrawal thresholds.
- Lactation: `SUPPLY_ADAPT_UP_BEATS`, `SUPPLY_EASE_IDLE_BEATS`, `CHRONIC_SUPPLY_BEATS`, engorge thresholds.
- Magic: essence curve (`ESSENCE_BASE`/`ESSENCE_PER_LEVEL`/regen), `SPELL_BAND_INTENSITY_DELTA`, `SUPPLY_SURGE_MAX_DELTA`, spell-schema dc/cost bounds if generated spells skew.

**Verify:** the golden canaries (Phase 2/3/4) will move deliberately with each retune — re-harvest with a note that the change is a tuning decision, not a refactor. Full suite green after each.

## W5 — Deferred-backlog hardening (playtest-independent)

Phase 5 is the home for the hazards deferred across Phases 1–4. Dispositions:
- **D1 — Half-applied delta hazard (pre-existing class, repeatedly flagged).** A multi-write turn (character + item + sheet) that fails midway can leave partially-applied state. No store test harness exists. Step: extract the delta-capture/commit sequence enough to unit-test the rollback contract, or add an integration harness. **Highest-value hardening item.**
- **D2 — `CheckRecord.targetId` (same-name grading collision, Phase 3 deferred).** Milk quality + spell targeting resolve the target by NAME; two same-named girls collide. Carry a resolved `targetId` on the record. Touches milk grading + `computeSpellCast`.
- **D3 — `RiskAssessService` context rebuild (Phase 1 → "Phase 5 perf pass").** Every free-text `do` turn rebuilds the full story context for the assess call. Cache/reuse the turn's already-built context.
- **D4 — `applyRpgTurn` / `applyBeEvents` length (Phase 1/3 deferred).** Both are long; extract cohesive helpers (the spell-cast merge, the milk-yield bottling) without changing behavior — golden canaries guard it.
- **D5 — Phase 4: say/think-mode cast drop.** Casting from the spellbook while the composer is in say/think/story mode silently no-ops the cast. Force `do` when a `spellId` tag is pending, or surface the dropped state.
- **D6 — Phase 4: `stat_invention` spell rule.** Only the zero-known-spells case fires, and it's unanchored (NPC spellcasting prose can false-fire). Tighten from playtest evidence (name-anchor, or per-known-spell-name whitelist) only if it actually trips.
- **D7 — Phase 4: alchemy-milk consumption (O5 deviation).** Ship the *consuming* variant Ben picked (decrement one prime/rich unit on an alchemy cast) on the proven `applyMilkYield` capture pattern — if Ben still wants it after playing the non-consuming version.
- **D8 — Phase 4: LLM-`spellId`-tagging authoritative dc/cost.** If/when the choice generator is taught to tag `castable` actions, `CheckPhase` must resolve the spell Entry to override choice-supplied dc/cost/school (currently trusts the UI-authoritative tag). Ships WITH that feature, not before.

**Verify:** per-item tests; full suite + `npm run check` + `npx eslint .` after each.

---

## Risks

1. **Balance thrash without data.** Tuning numbers by taste instead of the W4 readout reintroduces the exact D5 problem. Build the instrumentation first; change numbers from evidence.
2. **Canary churn masking a real regression.** A balance pass legitimately moves the golden canaries; a pipeline bug ALSO moves them. Rule: W4 commits touch ONLY constants — if a canary moves on a constants-only change, that is expected; if the suite moves on a non-W4 change, it is a bug. Keep the two kinds of change in separate commits.
3. **Settings/verbosity breaking the cache.** A per-story verbosity setting that alters the PROMPT (not just the card) would fragment the prompt cache. Roll-card verbosity is a DISPLAY concern (client-side) — keep it out of the prompt (W3).
4. **Hardening scope creep.** D1–D4 are real refactors; each must be behavior-preserving and canary-guarded, landed as its own reviewed commit — not bundled with the balance pass.

## Ben's open calls

- **Sequence:** confirm — playtest Phases 1–4 first, then the balance pass? The independent hardening (W1–W3, W5 except D7/D8) can start now regardless.
- **D7 (alchemy consumption):** after playing the non-consuming version, do you want the consuming variant wired?
- **Balance authority:** the W4 retunes are yours to sign off — the instrumentation proposes, you dispose.
