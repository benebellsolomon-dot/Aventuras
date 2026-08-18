# RPG Layer + BE Tracking Improvements — Design

**Date:** 2026-08-18 · **Status:** approved pending Ben's spec review
**Scope:** PC attribute/skill sheet, catalyst essence pool, dice-check system, spell system, per-girl progression tracks, lactation axis, anti-drift hardening, and player-facing display — all gated by `beMode`.

## 0. Ruling changes vs prior research

- **Revises research/37 §R** ("the body is the character sheet"): the PC now gets a classic D&D six-attribute sheet + theme-bound skills. The *girls'* sheets remain their bodies.
- **Rules in the deferred D2 relationship model** (research/31) as the `bond` track.
- Confirms research/37's dice direction: deterministic seeded checks extending the BE roll core, not LLM-adjudicated outcomes.

## 1. Core architectural decisions

| Decision | Ruling |
|---|---|
| Dice ownership | App code only. Shared seeded-d20 core (FNV-1a, replay-safe) extracted from the BE reducer; `CheckService` is the sole roller. The LLM never generates or adjudicates rolls. |
| Check timing | **Resolve-then-narrate** for PC action checks: roll before the narrative call, inject the resolved outcome as immutable fact. BE growth rolls keep their existing post-hoc (N → N+1 anticipation) timing. Mid-generation tool calling rejected (provider variance, positivity-bias reentry). |
| Check triggers | Both surfaces: action choices come pre-tagged with skill+DC by the choice generator; free-text actions get a small structured assess pass (`{risky, skill?, dc?}`) — non-risky skips with no latency. |
| Player experience | Full transparency: DC chips on choices, visible roll math, degree-of-success labels, turn log. |
| Gating | Part of `beMode`. No separate rpgMode toggle. |
| State ownership | Engine is single writer, classifier proposes events — identical to the BE growth contract. All new state rides `character.metadata` (snapshot/branch/rollback coverage for free; no new tables for state). |

## 2. State model

### 2.1 PC sheet — `character.metadata.rpgSheet` (protagonist row only)

```ts
RpgSheet {
  level: number
  unspentPoints: { attribute: number; skill: number }
  attributes: { str, dex, con, int, wis, cha }   // scores; mod = floor((score-10)/2), derived, never stored
  skills: Record<SkillId, number>                 // ranks; check bonus = attr mod + ranks
  essence: { current: number; max: number; regen: number }  // catalyst pool
  knownSpells: string[]                           // spell lorebook entry ids
}
```

- **Essence** is the innate catalyst power pool (no crafted-item inventory economy). Spending powers catalytic actions/spells; spend amount maps to growth-event intensity 1–3. `max` scales with level; regen on rest/time advancement.
- **Progression: milestone leveling.** Levels granted at story milestones the engine already recognizes (harem growth thresholds, quest beats, first-time events); level-up grants attribute/skill points spent in the Sheet tab. No XP bookkeeping.

### 2.2 Skill list (18, code-defined constants)

| Attr | BE-themed | Standard |
|---|---|---|
| STR | — | Athletics |
| DEX | Handling, Milking | Stealth |
| CON | — | Fortitude |
| INT | Alchemy, Anatomy, Transmutation | Investigation, Arcana |
| WIS | Channeling, Aftercare, Ritualism | Perception |
| CHA | Seduction, Enchantment | Persuasion, Deception |

Magic schools map to skills: Transmutation (body-altering, the BE school), Enchantment (charm/desire), Arcana (knowledge/identification/research), Ritualism (prepared/multi-target workings).

### 2.3 Per-girl tracks — new optional fields on `BodyState` (zod `.passthrough()` keeps old saves valid)

- `bond: 0–100` — trust/relationship; modifies the PC's DCs with her (banded stances rendered to prompts: wary/warming/bonded/deeply bonded/devoted).
- `dependence: 0–100` — catalyst addiction, banded into stages; raises growth intensity, pulls attitude toward `craving`, derives withdrawal conditions when neglected.
- `quirks: QuirkId[]` — 1–3 traits from a code-defined registry (e.g. `fast_metabolizer` +1 growth intensity; `skittish` social DC +2), assigned deterministically at first BE contact.
- **Unlockable interactions are computed, not stored**: the choice generator receives which gated actions (milking, advanced catalysts, intimate handling, certain spells) are available given milestones/bond/dependence.

### 2.4 Lactation axis — new `lactation` block on `BodyState` (existing `fluids` untouched)

```ts
lactation? { active: boolean; supplyTier: number /* 0..N: light/steady/heavy/torrential */ }
```

- Capacity stays derived from bust tier (`measurements.ts`).
- Reducer steps (pinned pipeline additions): **demand adapts supply** (regular milking raises `supplyTier`, neglect eases it); **engorgement** condition after sustained high fill (pressure, sensitivity, engorged sprite, DC effects); **bust feedback** — engorgement grants temporary apparent size (no tier write); chronic high supply proposes +1-tier growth events every N sustained beats through normal gates (cooldown/cap/lock apply).
- **Milk as resource**: milking yield (quality scaled by Milking check) logs to `checkLog`, may land as inventory item usable as an Alchemy ingredient (her milk → stronger catalysts).

### 2.5 Spells — structured lorebook entries + effect vocabulary

New lorebook entry type: `{ name, school: SkillId, essenceCost, dc, effects: EffectTag[], description }`.

- **Engine-wired effects**: `EffectTag` is a fixed vocabulary executed by the engine — growth event (with intensity), induction, supply surge, condition application, bond/dependence shift, fill change, check buff/debuff. Cast → check → effects applied mechanically + narrated.
- **In-game spell generation**: research/discover actions have the LLM generate into the schema (validated; effect tags restricted to the vocabulary), saved to the lorebook and added to `knownSpells`. Spells inherit lorebook relevance-injection.

## 3. Check pipeline

1. **Choice tagging**: `actionChoiceSchema` grows optional `{ skill, dc, essenceCost?, spellId? }`; generator receives sheet summary + available gated/spell actions. Safe choices stay untagged.
2. **Free-text assess**: small structured call pre-narration; non-risky → straight to narration.
3. **Resolution**: `CheckService.resolve(seed, skill, dc, modifiers)`; seed = `storyId:entryId:check` (FNV-1a, same contract as growth rolls — retry/undo replay identically). Modifiers = attribute mod + ranks + bond modifier ± quirk/condition effects. Bands: **crit** (margin ≥ 8 or nat ≥ 18) / **success** / **partial** (miss by ≤ 4 — success with cost) / **fail**. Essence deducts immediately; spell effects queue through the reducer (as catalyst-family events with the spell's intensity).
4. **Injection**: `[CHECK RESULT — already resolved, immutable]` block into the narrative prompt: action, roll math, band, effect directives.
5. **Record**: `checkLog` (mirroring `beLog`) rides `worldStateDelta` — powers the stream roll card, Harem-tab turn log, and rollback.

Both growth rolls and checks resolve through one shared core; identical math and display everywhere.

## 4. Prompts & anti-drift

**New blocks** (stable order, fixed headers, volatile numbers last — for prompt-cache hits):
- `[PLAYER SHEET]` — level, attribute mods, notable skills, essence, known spells (compact; no math invited).
- `[CHECK RESULT — immutable]` — checked turns only; carries the hard rule: outcomes are resolved facts; softening a failure or granting unearned success is a continuity error.
- `[HAREM STATE]` additions — bond stance, dependence stage, quirks, lactation line per girl, same authority header as body state.

**Classifier extensions**: `bondEvents` + `exposureEvents` proposals (intensity 1–3) beside `beEvents`; reducer applies under **velocity caps** (max bond delta/turn, max dependence gain/exposure) — anti-positivity-bias enforced in code.

**Drift detectors added to `detectDrift`**: `check_contradiction` (prose disagrees with resolved band), `stat_invention` (abilities/spells not on the sheet), `lactation_drift` (prose vs tracked milk state). Findings keep the `[CONTINUITY]` next-turn path **and** render as an amber "continuity corrected" tag on the roll card — player-visible, no silent fudging.

## 5. UI

**Sidebar gains two tabs** (strip goes to 8 icons, `beMode` only):
- **Sheet** (d20 icon): `SheetPanel.svelte` — attributes grid, essence bar with next-spend hint, 18-skill list (top-6 summary + drill-in), full spellbook with research/craft actions, level-up point spend (inline tap-to-allocate; tab icon badges when points are unspent).
- **Harem**: `HaremPanel.svelte` — `GirlStatusCard` per present girl (portrait thumb, tier + cup + `lastGrowth` flag, attitude + bond stance, milk meter with supply band + engorgement tint, dependence stage, quirk/condition chips, lock state; absent girls collapse to name rows; deep-link to full `BeStatePanel` in Characters) + `TurnLogList` (interleaved `checkLog` dice rows and `beLog` BE rows, newest first).

**Story column**:
- `CheckCard.svelte` — roll card rendered in `StoryEntry`/`StreamingEntry` from the entry's delta, shown instantly on resolution before narration streams; monospace math, outcome-tinted border, BE consequence chain, continuity tag slot.
- `ActionChoices.svelte` — right-edge DC chip per tagged choice (skill + DC, tinted by computed success odds); essence cost on spell choices.

No always-on ribbon/strip: the sidebar is effectively always open in play, so the dedicated tabs are the visibility story (Ben's ruling).

## 6. Phasing

1. **Dice core + PC sheet** — shared roll-core extraction (pure refactor, output-identical tests), `CheckService`, choice tagging + assess pass, `[PLAYER SHEET]`/`[CHECK RESULT]`, `checkLog`, `CheckCard`, DC chips, Sheet tab v1 (no spells), milestone leveling, `check_contradiction` + `stat_invention` detectors.
2. **Harem tracks** — bond/dependence/quirks, classifier proposals + velocity caps, bond DC modifier, quirk registry, gated choices, Harem tab (finally renders `beLog`).
3. **Lactation axis** — state block, induction/supply/engorgement steps, bust feedback, milk resource + Milking checks, `lactation_drift`, milk UI.
4. **Magic** — spell entry type + effect vocabulary, `knownSpells`, casting via check pipeline with wired effects, in-game generation/research, spellbook UI.
5. **Polish & hardening** — cache-order audit, continuity UX, settings (roll-card verbosity, log length), DC/velocity balance pass from play.

Each phase ships with vitest coverage extending the existing suite (272 tests); reducer/check helpers stay pure (no `Date.now`/`Math.random`).

## 7. Testing focus

- Roll-core extraction: golden tests proving pre/post-refactor output identity on existing seeds.
- `CheckService`: band boundaries, modifier stacking, seed determinism across retry/undo.
- Reducer additions: velocity caps, dependence/bond application, lactation pipeline steps, spell effect execution through gates (cooldown/cap/lock).
- Schema round-trips: `rpgSheet` + extended `BodyState` through zod passthrough with legacy saves.
- Drift detectors: fixture narratives per detector.

## 8. Open items — RESOLVED (2026-08-18, same session)

- **Essence curve/regen:** `max = 6 + 2×level`; +2 whenever story time advances a period (TimePanel-driven); full restore on explicit rest/sleep scenes. Numbers remain balance-tunable constants.
- **Quirk registry v1 (10, ship all in Phase 2):** growth — `fast_metabolizer` (+1 catalyst intensity), `slow_burn` (growth lands a beat late, +1 tier at milestones), `greedy_flesh` (cooldown −1, pressure builds faster), `stubborn_frame` (intensity −1, tier never drifts down); lactation — `early_bloomer` (induction DC −4, supply climbs fast), `pressure_prone` (engorges at lower fill, bigger temporary swell); social/mental — `skittish` (social DCs +2 until bond ≥ 50), `devoted_heart` (bond +1/event, harsher withdrawal), `needy_nipples` (Handling/Milking DCs −2, arousal climbs faster), `proud` (Persuasion +2 harder, Seduction unaffected).
- **Milk = inventory item** (Phase 3): quantity-stacked item with quality grade from the Milking check, via the existing inventory system; Alchemy checks may consume it for +1 intensity or reduced essence cost.
- **Non-protagonist male NPCs:** out of scope; `rpgSheet` is protagonist-only. (Confirmed.)
- **Combat: stays parked.** Physical conflict resolves as ordinary checks (Athletics/Fortitude/spells) with conditions as consequences; no HP/initiative subsystem.
