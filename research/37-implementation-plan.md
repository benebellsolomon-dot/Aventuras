# 37 — Aventuras BE implementation plan (roadmap + file-level specs)

**Date:** 2026-07-17 · **Basis:** research/36 (cross-era gap analysis) + Ben's rulings. This is
the active build plan. Part I is the phased roadmap; Part II holds the three full file-level
specs (Phases 2–4) produced by the design pass. Phases 5–6 are design briefs (spec at build time).

---

# PART I — Roadmap

## Ben's rulings (2026-07-17)

1. **Archive scope:** moved the untracked Aventuras-era docs/scripts into this fork; COPIED the
   committed BE domain corpus (ambrosia-st keeps its archive); ST/NAI-era docs stay put.
2. **Bundles:** commit-safe docs/presets/corpus moved into `research/bundles/`; the ~335 MB of
   image corpora stay in `_inbox/` (see `_inbox/CLEANUP.md`).
3. **Order:** Lucy playtest FIRST, then build.
4. **Big systems:** Chronicler-lite ✓ and D2 relationship assembly ✓ enter the roadmap.
   **Oracle + Skills are parked** — "should be rebuilt in a different way, will require its own
   brainstorm session." Wardrobe machine unruled, parked.

## Triage verdict

- **Valuable — build:** quick-wins batch (Phase 2) · C6 pack + per-story BE definition (Phase 3)
  · si-bridge provider (Phase 4) · Chronicler-lite (Phase 5) · D2 (Phase 6).
- **Do better than the old eras:** deterministic reducer enforcement (ST was advisory-only) ·
  Chronicler from beLog (no watermark machinery) · complete fluid loop (NAI had fill w/o drain,
  Era-2 dropped fluids) · identity via bridge FaceID (no phantom-PNG hacks) · drift correction
  via context block (no leaked [CONTINUITY] tags in prose) · per-subject regional image prompts.
- **Cannot / should not:** NAI transport + late-block splice (obsolete) · VectFox blind-text
  chronicler (taxonomy collapse) · AGPL code ports (reimplement only; Megumin text = CC BY-NC
  attribution) · ST 3d20 RNG (non-uniform) · idle-decay defaults ON (starves cadence) · "fixing"
  the FIL positive-feedback inversion (deliberate genre physics) · video in v1 (parked for v2).

## Phase 0 — Consolidation ✅ DONE 2026-07-17

Moved the 10 Aventuras-era docs + INDEX + 2 scripts + era-start handoff into the fork; copied the
24-file domain corpus; rescued `extract-ladder*.mjs` from the session scratchpad into `scripts/`
and fixed the `ladder-data.ts` header; moved commit-safe bundle material into `research/bundles/`;
rewrote `research/INDEX.md`; wrote this doc; noted retained image corpora in `_inbox/CLEANUP.md`.
ambrosia-st: reverted the msgpackr package.json diff, left a `research/MOVED.md` pointer.

## Phase 1 — Lucy playtest (acceptance gate; Ben plays, Claude instruments)

E14 checklist (research/34), metric-updated: seed Lucy in the panel (Ben rules the tier — canon
X-cup = spine 47 vs established render marker 39; ⚠ live DB shows her seeded at tier 6 = her
ORIGINAL DD, must be raised before real play) + waist/hips cm; verify the [BODY STATE] block
renders metric in a live turn; drive a growth beat end-to-end (classifier event → reducer roll →
next-turn GROWTH directive); verify `__betier_N__` reaches the bridge on an inline image; C7
probe (agentic image path renders markerless — confirm + log); pacing notes for D5 constant
re-derivation. Findings feed Phase 2 ordering; nothing ships here.

**Classifier schema-compliance probe (folds the queued C8 preflight, research/34 §C8):** over
≥10 BE turns, log for the extended classifier schema (base + runtime-vars + beEvents/beStates):
(a) schema-valid-JSON rate, (b) refusal/non-JSON count (must be 0), (c) per-field drop rate on
beEvents/beStates. Run on the current `x-ai/grok-4.3` first; if either gate fails, swap the
`classification` preset to GLM-5.2 (reasoning-off, `structuredOutputOverride:'on'`) and re-run.
**Acceptance: 100% parseable, 0 refusals, no systematic field drops.** This probe picks the
classifier model — do not hard-code a choice before it runs. Also confirm during play: narrator
honors the [BODY STATE] metric block verbatim (the GLM-vs-Claude tiebreaker), and narrator
maxTokens raised above 8192 doesn't truncate Peak scenes.

## Roadmap revision (2026-07-19): the BE VN game-engine track

**Ben's ruling:** Aventuras evolves into a VN-style game engine focused on BE RPG
adventures. The VN research (research/42 + `bundles/pixelsaga/MECHANICS.md`) folds
into this plan as Part III; engine phases and VN phases interleave as below. This
table is the live ordering — the per-phase sections elsewhere in this doc remain the
detail source.

| # | Phase | Status / gate |
|---|---|---|
| P0 | Consolidation | ✅ 2026-07-17 |
| P1 | Lucy playtest (acceptance gate) | ✅ PASSED (research/41) — classifier ruled: keep grok-4.3 |
| P2 | Spec 1 quick-wins batch | ✅ SHIPPED 0.7.6-be.8 (+ the be.7 cosmology/precedence package pulled forward from Spec 3) |
| **V1** | **VN presentation MVP** (Part III) | **Buildable NOW** — no gates, parallel to P3 |
| **P3** | **Spec 2 si-bridge native provider** (Part II) | Next engine phase — now ALSO the VN-v2 prerequisite (FaceID anchors, regional, /animate) |
| P4 | Spec 3 remainder (Part II) | cosmology/pacing/eligible-kinds shipped in be.7; remaining: beSizeCapTier/beGrowthCooldownBeats + full wizard chain + dedicated BE step + retire the imported [BE] rules |
| **V2** | **BE sprite engine** (Part III) | Gated on P3 + the transparency ruling (research/42 OD#1) |
| V3 | Multi-character stage + regional CGs (Part III) | After V2 |
| V4 | Growth media: transitions + /animate/growth clips (Part III) | After V2 |
| R | RPG layer (Part III §R — design brief) | Own ruling session, like Chronicler/D2 |
| P5 | Chronicler-lite (design brief, unchanged) | After the VN core stabilizes |
| P6 | D2 relationship assembly (design brief, unchanged) | Own session |

Riding sub-items: sensitivity/bounce/cleavage ladder bake (extract-ladder2 extension)
· D5 constant re-derivation once be.8 cadence data accumulates · omission-detector
tuning against live play.

## Phases 2–4 — see Part II (full specs).

⚠ **GATE (2026-07-17): research/38 body-math rulings must land before Phase 2's
measurement-dependent tasks ship** (Task 8 ladders + all BWH surfaces build on the corrected
bust curves; Ben confirmed the shipped bust channel under-reads at volume). The
math-independent Phase 2 tasks (conditions writer, anticipation, pressure, drift detectors)
may proceed in parallel if ruled.

## Phase 5 — Chronicler-lite (design brief)

Deterministic milestone ledger from what already exists: band/letter crossings detected in the
reducer's beLog → per-character growth ledger ("AA→DD→G", dated by entry) stored in story data →
(a) one compact ledger line in the BE context block, (b) canon writes into Aventuras' native
lorebook (per-character entry, append + overlap-dedup port from research/36 §4), (c) the D9
legible surface: Δ-chips on story entries from `world_state_delta.beLog` + a milestone feed.
Zero-LLM (state-diff principle — VectFox's blind-text failure is the counter-evidence).
Undo-safety free: beLog rides world_state_delta.

## Phase 6 — D2 relationship assembly (design brief; own session, → research/38)

ArcTrack canonical (Warmth×Autonomy, four endings, trait-derived friction/ceiling,
emotStabMultiplier volatility law) + consent-mode as a derived read (60-cell matrix) +
co-presence jealousy (ground truth from scene presence). Classifier proposes axis deltas
(beStates-style), reducer clamps/applies through the friction shaping — deterministic where ST
was advisory. Both blueprints recovered in research/36 §4.

## Parked (explicit non-goals)

Oracle + Skills (Ben-ruled: dedicated redesign brainstorm before any build) · wardrobe state
machine (unruled) · video growth reels (`/animate/growth`, v2) · B1 identity anchors (extension
point left in Phase 4) · D10 auto-checkpoint on milestones (fold into Phase 5 if wanted) ·
B5 portrait lifecycle.

## Verification (roadmap-wide)

Every code phase gates on `npm test && npm run check && npm run lint` (Node 22 PATH), then the
proven deploy chain: backup `aventura.db` → graceful quit via osascript → `npx tauri build
--bundles app` → `ditto` to /Applications → relaunch → live smoke turn. Fork commits per phase
(conventional format, no attribution trailers); **never push** without Ben's say-so.

## Model routing (researched 2026-07-17; app-global — no per-story override exists)

Aventuras routes models **per role** via "Agent Profiles" (`GenerationPreset`, Settings →
Generation): `servicePresetAssignments` maps ~29 service roles → presets
(`settings.svelte.ts:1139`); each preset carries profileId/model/temperature/maxTokens/
reasoningEffort/`structuredOutputOverride`. The **narrator is OUTSIDE this system** — global
Main Narrative profile + `apiSettings.defaultModel` (`generate.ts:322`), always free-form.
**No per-story routing** (`StorySettings.model` is vestigial, unread by generation) — a
per-story override would be a new fork feature; NOT building for v1 (one BE campaign at a time,
the global switch suffices).

- **Deterministic steps make NO LLM call — assign nothing:** reducer, `drift.ts`,
  `genre-rules.ts`, `measurements.ts`, `context.ts`, `milestones.ts`, the store wiring.
- **Classifier** (`classification` preset; currently `x-ai/grok-4.3`): structured-JSON
  reliability AND content-permissiveness are BOTH hard gates — a refusal returns non-JSON and
  breaks the whole event→reducer pipeline. Candidate set: GLM-5.2 (reasoning off +
  `structuredOutputOverride:'on'`) · grok-4.3 (current; the C8 concern was grok-**fast**, not
  4.3) · Haiku 4.5 (gold-standard JSON, ONLY if non-refusal on BE content is confirmed).
  **BAN:** DeepSeek v4 (dead for structured work, ST-era) + all Grok-fast tiers. Winner is
  picked by the Phase-1 probe, not upfront.
- **Narrator** (Main Narrative; currently `z-ai/glm-5.2`): keep GLM-5.2 — confirm reasoning
  OFF and **raise maxTokens above 8192** (ST-era lesson: GLM wants ≥24k headroom; long Peak
  scenes may truncate). Challenger if metric-block adherence drifts in play: Sonnet 5 / Fable 5
  (permissiveness on explicit BE content UNVERIFIED — validate before adopting).
- **actionChoices** ⚠ ACTIVE RISK (independent of BE): emits a structured schema but rides the
  DeepSeek-v4-pro-backed `suggestions` preset — move it to a reliable structured model
  (Haiku 4.5 / GLM-5.2 / Gemini 3 Flash).
- **imageGeneration/bgImageGeneration** (`Images` preset): any cheap structured model; model
  choice does NOT fix the C7 markerless bug (code gap — `ImageAnalysisService` never calls
  `sizeBandMarker`).
- **Config bug (live-DB-verified):** the `memory` AND `Images` presets carry the slug
  `~x-ai/grok-latest` — the `~` prefix matches nothing, no `grok-latest` alias exists on
  OpenRouter → both presets likely 404 silently. Fix in Settings → Generation (repoint to real
  models).
- Reaching Claude models: either OpenRouter passthrough IDs (`anthropic/claude-sonnet-5`,
  `anthropic/claude-haiku-4.5`) on the existing profile, or a dedicated Anthropic APIProfile.

---

# PART II — File-level specs (Phases 2–4)

Engine lives at `src/lib/services/be/` (types/constants/ladder/ladder-data[GENERATED]/
measurements/metadata/schema/reducer/context/derive + tests, 83 passing). Wired: classifier
schema-extension proposes beEvents/beStates (`schema.ts`), `applyBeEvents` in
`src/lib/stores/story.svelte.ts` resolves through the pure seeded reducer, state in
`character.metadata.bodyState` (zod `.passthrough()`), context block in `context.ts`, panel
`src/lib/components/world/BeStatePanel.svelte`, per-story `beMode`/`beFluidType` threaded through
`WritingStyleFields.svelte`, wizard steps, `ScenarioService`, `story-settings.svelte`.

## Spec 1 — "Phase A+" quick-wins batch (pure engine + small UI)

### Design invariants (every task)
- Reducer stays pure/deterministic/immutable. No `Date.now`/`Math.random`. Fill/pressure ticks
  are turn-count/seed-driven: fill is a deterministic per-turn increment; the pity-growth roll
  uses `seededRoll` with a pressure-specific seed suffix.
- Every new `BodyState` field is optional so pre-existing saved states parse. Every new zod
  object keeps `.passthrough()`.
- All new global tuning lives in `constants.ts` tagged D5 "re-derive"; per-story choices ride
  `BeStoryConfig`.

### Pinned reducer pipeline order (the load-bearing decision)
Rewrite `reduceCharacterBody` (`reducer.ts`) so one turn resolves in this fixed order (each step
reads the prior step's output):
1. decay conditions (existing `decayConditions`)
2. cooldown tick down (existing)
3. resolve `pendingGrowth` (NEW — anticipation two-beat land)
4. apply `softState` (existing block: attitude/arousal/fluidFill)
5. passive fill tick (NEW — registry-driven, gated by `config.passiveFillEnabled`)
6. events loop (existing roll → capped delta), but on delta ≥ `ANTICIPATION_THRESHOLD` split:
   land `floor(delta/2)` now, store remainder in `pendingGrowth`
7. growth-pressure accrual/pity-fire (NEW — accrue on dry growth kinds, release on landed growth,
   overfill coupling from post-tick fill)
8. derive auto-conditions from **end-of-turn** fill (NEW — fill≥75 → `Engorged` w/ TTL); then
   merge capped classifier `beConditions` (NEW)
9. drift note: clear previous, set from `driftFindings` param (NEW — feature 6, Task 6)

Auto-conditions MUST read post-tick fill (step 5 before step 8) or `Engorged` lags a turn.

### Task 1 — Types + constants scaffolding
Files: `types.ts`, `constants.ts`
- `BodyState` additions (all optional): `growthPressure?: number` (escalator accumulator);
  `driftNote?: { note: string }` (lastGrowth-style one-turn carrier). `pendingGrowth`,
  `conditions`, `fluids` already exist.
- `BeStoryConfig` additions: `fluidType: string` (registry key, mirrors settings.beFluidType);
  `passiveFillEnabled: boolean`. Update `DEFAULT_BE_STORY_CONFIG` (`fluidType: 'milk'`,
  `passiveFillEnabled: true`).
- `constants.ts` fluid registry + tuning:
```ts
export interface FluidProfile { density: number; growthFactor: number; fillRate: number }
export const FLUID_REGISTRY: Readonly<Record<string, FluidProfile>> = {
  milk:     { density: 1.03, growthFactor: 0.0, fillRate: 8 },
  mana:     { density: 1.00, growthFactor: 0.3, fillRate: 5 },
  arcane:   { density: 1.10, growthFactor: 0.6, fillRate: 8 },
  ambrosia: { density: 1.25, growthFactor: 1.0, fillRate: 12 },
}
export const DEFAULT_FLUID_PROFILE = FLUID_REGISTRY.milk
export function fluidProfile(type: string): FluidProfile
export const ANTICIPATION_THRESHOLD = 2
export const PRESSURE_FIRE = 85, PRESSURE_ACCRUAL = 12, PRESSURE_RELEASE = 50
export const OVERFILL_FILL_THRESHOLD = 96, OVERFILL_ADD_BASE = 30
export const ENGORGED_FILL_THRESHOLD = 75, ENGORGED_TTL = 2
export const MAX_BE_CONDITIONS = 6
```
D5 comment: every number is an inherited reference default — re-derive against cadence data.

### Task 2 — Passive fill + fluid registry
File: `reducer.ts` (+ `measurements.ts`)
- Step 5: when `config.passiveFillEnabled` and `fillPercent < 100`,
  `fillPercent = clampPercent(fillPercent + profile.fillRate * (1 + profile.growthFactor))` where
  `profile = fluidProfile(config.fluidType)`. Keep the existing milking drain path (drain still
  nets against fill). Log a `fill` record noting `+N% passive`.
- **FIL inversion** (full→pressure→growth→capacity→refill) is intentional positive feedback —
  comment it so nobody "fixes" it.
- `measurements.ts` `nowKgPerSide` currently hardcodes `K.milkDensity`; thread `profile.density`
  (optional param, default milk) so swollen mass reflects the fluid.

### Task 3 — Anticipation two-beat
Files: `reducer.ts`, `context.ts`
- Step 3: if `state.pendingGrowth` present and not locked, land it as growth this turn (set
  `lastGrowth`, bump tier, respect `sizeCapTier`), clear `pendingGrowth`. (`stabilize` already
  clears it.)
- Step 6: when an event's banded delta ≥ `ANTICIPATION_THRESHOLD`, land `Math.floor(delta/2)` now
  and set `pendingGrowth = { delta: delta - floor, source: kind }`.
- `context.ts`: ONSET line when `state.pendingGrowth`: "ONSET: {name}'s body is mid-surge —
  tension building toward a further change next beat. Render anticipation/early strain, not the
  full result yet."

### Task 4 — Conditions writer
Files: `schema.ts`, `reducer.ts`, `metadata.ts`
- `schema.ts`: add `beConditionSchema` (`character`, `label`, optional `note`, optional `ttl`)
  mirroring `beEventSchema`; extend `extendClassificationSchemaWithBeEvents` with
  `beConditions: z.array(...).max(MAX_BE_CONDITIONS).default([])`; add
  `buildBeConditionInstructions` appended to the same instruction block; add
  `beConditionsFromResult(result)`. Update `index.ts` exports.
- `reducer.ts`: new `softConditions?: BodyCondition[]` param. Step 8 merges: derived
  auto-conditions first (dedupe by label), then classifier conditions, cap `MAX_BE_CONDITIONS`,
  clamp `ttl ≥ 0`. Auto-condition: `fillPercent ≥ ENGORGED_FILL_THRESHOLD` → upsert
  `{ label: 'Engorged', ttl: ENGORGED_TTL }`.
- `metadata.ts`: add optional `growthPressure` + `driftNote` to `bodyStateSchema` (`.optional()`),
  keep top-level `.passthrough()`.

### Task 5 — Growth-pressure escalator
File: `reducer.ts`
- Step 7: for each dry growth beat (growth kind rolling `fail`/`partial`/`cooldown`/`muzzled`),
  `growthPressure += PRESSURE_ACCRUAL`. Overfill coupling: if post-tick
  `fillPercent ≥ OVERFILL_FILL_THRESHOLD`, `growthPressure += OVERFILL_ADD_BASE*(1+profile.growthFactor)`.
- If `growthPressure ≥ PRESSURE_FIRE` and not locked and cooldown==0: fire ONE non-guaranteed
  pity roll (`seededRoll(\`${seed}:pressure\`)`); on success land +1, then reset pressure to 0
  regardless (fire-once-then-reset). On any landed growth this turn (event or pity),
  `growthPressure = max(0, growthPressure - PRESSURE_RELEASE)`.
- Lock muzzles the pity-fire (recommended). Pressure is per-character → cross-member misfire is
  structurally impossible.

### Task 6 — Output-side drift detection
New file: `src/lib/services/be/drift.ts` (pure regex/string, no store deps):
```ts
export interface DriftFinding { kind: 'cup_contradiction'|'size_overshoot'|'non_breast_growth'; note: string }
export function detectDrift(narrative: string, name: string, state: BodyState): DriftFinding[]
```
Port the three Era-1 detectors (research/36 §3, ambrosia-st `legacy/extension/modules/narration.js`):
monotonic cup-rank contradiction with ≤240-char name attribution; tier-gated simile-overshoot
registry (beach/exercise balls ≥120, basketballs ≥95, pumpkins ≥75, watermelons ≥60, 12-tier
margin); non-breast-growth invariant. Compare against the **pre-reduce `state`** (what the
narrator was shown), never `nextState`.
- `reducer.ts`: new `driftFindings?: DriftFinding[]` param; step 9 clears prior `driftNote`, sets
  `driftNote = { note: findings.map(f=>f.note).join('; ') }` when non-empty.
- `context.ts`: render as `[CONTINUITY] Keep tracked sizes exact — {note}. Correct this silently.`
- Store wiring (`story.svelte.ts` `applyBeEvents`): read the finalized narrative from
  `this.entries.find(e => e.id === entryId)?.content`, run `detectDrift` per character before
  calling `reduceCharacterBody`, pass findings in. Single-writer preserved (reducer owns the write).

### Task 7 — Support/buoyancy axis
Files: `measurements.ts`, `context.ts`
- `SHAPE_SUPPORT` base by shape (`natural 0, firm .4, gravity_defying .9`) + `SUPPORT_FROM_CONDITIONS`
  label deltas (`featherlight +.8`, `buoyancy charm +.5`, `heaviness curse −.5`), clamp [0,1].
  Effective support = shape + active condition labels; when support ≥ hard gate (`0.30`) suppress
  the `hang` rung in the posture/hang row choice. No new stored field — derived from shape +
  conditions.

### Task 8 — Milestones + sensitivity/bounce/cleavage ladders
- New `src/lib/services/be/milestones.ts`: `INTERACTION_MILESTONES` (driver-keyed rows on carried
  mass kg), `nextMilestone(massKg)` → `{ label, remaining }`. `context.ts` renders one
  `Approaching: {label} (about {remaining} kg away).` line; optional panel line.
- Sensitivity/bounce/cleavage: `[GENERATED]` ladder tables. **Regen scripts now live at
  `scripts/extract-ladder2.mjs`** (Phase 0 rescued them). Extend that script to bake
  `SENSITIVITY_LABELS`/`BOUNCE_SCALE`/`CLEAVAGE_SCALE`, re-run, expose lookups in `ladder.ts`.
  (Phase 0 unblocked this — no longer the hand-bake-vs-port dilemma the design pass flagged.)

### Task 9 — Store tick-path + config seam
File: `story.svelte.ts` (`applyBeEvents`, ~L2802-2939)
- Replace hardcoded `config = { ...DEFAULT_BE_STORY_CONFIG, enabled: true }` with a config built
  from `this.currentStory.settings`: `fluidType: settings.beFluidType ?? 'milk'`,
  `sizeCapTier`/`growthCooldownBeats` defaulted (Spec 3 adds the UI that populates them).
- ⚠ **Settled-skip → rollback consequence**: the skip must no longer short-circuit seeded
  characters (a per-turn fill/pressure tick changes state every turn). Narrow to: skip only when
  the character has no `bodyState` AND no events. For every seeded present character, run the
  reducer each turn → the widened before-state capture fires every turn (rollback correctness,
  not a perf regression). `stateChanged` (JSON compare) stays the write gate; once fill saturates
  at 100 and pressure idles, `stateChanged` goes false and writes stop.
- Keep the tick turn-count-driven; do NOT couple to `applyTimeProgression` (non-determinism).

### Test plan (Spec 1)
- `reducer.test.ts`: pipeline-order determinism; passive fill increments by rate×(1+gf) + clamps;
  drain still nets; anticipation split lands half + stores pending, next reduce lands remainder;
  `stabilize` clears pending; pressure accrues on dry beats, fires once at threshold then resets,
  releases on landed growth, overfill adds at fill≥96; auto-`Engorged` at fill≥75 + TTL decay;
  classifier `beConditions` cap; lock muzzles pity-fire.
- New `drift.test.ts`: three detectors on fixture prose; compares against pre-reduce state; no
  false-positive on legit same-turn growth.
- New `milestones.test.ts`: boundary rows + `nextMilestone` remaining math.
- `metadata.test.ts`: saved state lacking new fields round-trips (backward compat).
- `wiring.test.ts`: `applyBeEvents` ticks fill for a seeded untargeted character + captures
  before-state; unseeded still skipped; config reads `settings.beFluidType`.
- `beConditionsFromResult` tolerates absence + drops malformed.

### Risks / open decisions (Spec 1)
- **Pressure/fill tick on present-only vs all seeded** — recommend gating on
  `result.scene.presentCharacterNames` (adds a name-resolution branch). Adopted: present-only.
- **`beConditions` vs auto-condition collision** — derived-first then classifier upsert.
- **`pendingGrowth.delta` under `sizeCapTier`** — re-clamp at land time.

## Spec 2 — si-bridge image provider

### Approach
New `si-bridge` provider speaking the bridge's modern `/image` + `StructuredImageSpec` API. The
A1111 shim path stays untouched as fallback. The crux: extend the provider interface with an
optional structured `spec`, built at the one call site with characters + bodyState +
visualDescriptors together.

### Task 1 — Interface extension
File: `providers/types.ts`
```ts
export interface BridgeSpecCharacter {
  sex?: 'female'|'male'; tier_index: number; build?: string; breast_shape?: string
  hair_color?: string; hair_style?: string; eye_color?: string; skin_tone?: string
  be_moments?: string[]
}
export interface StructuredImageSpecInput {
  register?: 'color'|'manga'; intimacy?: 'clean'|'suggestive'|'nude'|'explicit'
  characters: BridgeSpecCharacter[]; scene_tags?: string[]
  location?: string|null; lighting_tag?: string|null
  be_moments?: string[]; intimate_moments?: string[]; regional?: boolean
  extra_tags?: string[]; style_preset?: 'clean_premium'|'painterly_glow'|'semireal'|'none'
}
// add to ImageGenerateOptions: spec?: StructuredImageSpecInput
```
`ImageProvider.generate` signature unchanged (spec rides in options). Other providers ignore it.

### Task 2 — Provider file
New `providers/si-bridge.ts` (`createSiBridgeProvider(config)`, pattern: `a1111.ts`):
- `generate(options)`: if `options.spec` → `POST {baseUrl}/image` with
  `{ spec, seed?, workflow: 'illustrious_image', campaign_id: 'aventuras' }` + `X-API-Key`; else
  fall back to `{ prompt: options.prompt }`. Parse `{ job_id }`.
- Poll `GET /image/{job_id}` until `status ∈ {complete,failed}` (~2-3s, ceiling
  `config.timeoutMs`, abort on `options.signal`). On `failed` throw the bridge `error` string.
- Fetch `GET /image/{job_id}/result?format=png` → **binary → base64** (NOT JSON `data.images[0]`).
- `listModels`: `GET /models` → `ImageModelInfo[]`, tolerate failure → `[]`.
- Use `imageFetch`/`imageGetFetch` from `fetchAdapter.ts` for proxy/CORS parity.

### Task 3 — Registry + type union + UI enumeration
- `src/lib/types/index.ts`: add `'si-bridge'` to `ImageProviderType`.
- `providers/registry.ts`: import `createSiBridgeProvider`; add to `PROVIDER_FACTORIES`; thread
  `spec` through the final `provider.generate({...})`; add `spec?` to `generateImage` options.
- `settings/tabs/images.svelte` (provider list ~L73-74): add `{ value: 'si-bridge', label: 'SI
  Bridge' }`; needs X-API-Key + base-URL fields; skip A1111 sampler/scheduler UI.

### Task 4 — Spec construction at the call site
File: `InlineImageService.ts` (`generateImageForTag`, beMode-gated block ~L178-189)
- When the profile's `providerType === 'si-bridge'` and `context.beMode`, build a
  `StructuredImageSpecInput` and pass as `spec`. Per present tagged character:
  - `tier_index`: from `readBodyState(metadata).tier` at send (engine sole writer; derived at
    send, never stored image-side) — via `bridgeTierIndex(tier)` (Task 5).
  - `breast_shape`: `state.shape` (already the bridge's vocabulary).
  - build/hair/eye/skin: parse from `character.visualDescriptors`; null on absence.
  - `be_moments`: from `state.lastGrowth` — growth-just-landed → cluster
    (`button_pop`/`shirt_rip`/`strain`/`shock`). `lastGrowth` is still live on the render turn
    (cleared only by this turn's later reduce) → fires correctly.
- Spec-level: `intimacy` from `inferSceneIntimacy(context.narrativeContent)` (Task 6);
  `location`/`lighting_tag` from a free-text→curated-key mapper (Task 6); `regional: true` when
  >1 subject; `style_preset: 'semireal'`; `register: 'color'`. Keep the existing
  `groundImagePromptSize`/`imageStateCues`/`sizeBandMarker` path as the fallback `prompt`.

### Task 5 — tier_index calibration (open decision — do NOT invent a formula)
New helper `bridgeTierIndex(tier: number): number`. App `state.tier` is the 51-band ZZ-saturating
scalar; the bridge ladder is `0=flat … 14=large … 24=huge … 32=gigantic … 40+=hyper`. **Verify
alignment with `POST /image/build`** (dry-run, no render) before trusting 1:1. If aligned → round;
if not → band-map through the `sizeBandMarker.ts` anchors (`hyper 45/gigantic 39/huge 29/large 21/
medium 13/small 3/flat 0`), noting those were tuned for the shim path (research/34 §2 B2
cross-calibration). `bridgeTierIndex` is the single swap point.

### Task 6 — intimacy gate + location mapper (both new)
New `src/lib/services/ai/image/sceneInference.ts`:
- `inferSceneIntimacy(text): 'clean'|'suggestive'|'nude'|'explicit'` — keyword gate (no existing
  helper). Default `clean`.
- `inferBridgeLocation(currentLocationName): string|null` — map free-text location names to the
  bridge's 14 curated keys; `null` on no-match (bridge ignores null; don't force a wrong key).

### Task 7 — Profile/settings fields
`ImageProfile` already carries `baseUrl` + `apiKey` (reused as bridge URL + X-API-Key — no new
fields). `images.svelte` surfaces both inputs for `si-bridge`. X-API-Key sent as the header, not
`Authorization: Bearer`.

### B1 (identity anchor) — later, extension point only
Bridge exposes `pose_face_anchor_b64` + OpenPose strength + FaceID weights on `POST /image`
(server half done). B1 = caller-side: per-character base render as anchor so identity holds across
tiers. Requires storing a per-character anchor image + routing to the openpose_faceid workflow.
Leave a marked extension point in `si-bridge.ts`.

### Test plan (Spec 2)
- New `si-bridge.test.ts`: spec assembly maps tier/shape/visualDescriptors/be_moments; POST body +
  X-API-Key header; poll loop terminates on complete/failed + honors abort; binary→base64;
  prompt-fallback when no spec; `bridgeTierIndex` boundary rows.
- New `sceneInference.test.ts`: intimacy tiers; location map hits + null on miss.
- registry/wiring: `supportsImageGeneration('si-bridge')` true; `generateImage` forwards `spec`;
  A1111 unchanged when spec present but provider is a1111 (spec ignored).

### Risks (Spec 2)
tier_index ladder alignment must be verified via `/image/build` first (primary open decision) ·
async provider inside a sync-looking generate (cap at `config.timeoutMs`) · visualDescriptors are
free-text (recommend passing raw strings + best-effort flat fields) · multi-character regional
per-subject tier is authoritative (strictly better than the shared-prompt `uniformBodyStateTier`
fallback) — confirm tag→character resolution matches the `presentCharacters` name matching.

## Spec 3 — C6 agnostic BE pack + per-story BE definition wizard step

### Approach
Extend `StorySettings` with the per-story BE definition; thread the new fields through the full
wizard chain; consume `sizeCapTier`/`growthCooldownBeats` in the `BeStoryConfig` built in Spec 1
Task 9; inject the agnostic genre-rules pack as a static template variable (the `beStateBlock`
precedent). **Reuse existing `beFluidType`** as the Spec 1 registry key — do NOT add a second
`fluidType` field.

### Task 1 — Extend StorySettings
File: `src/lib/types/index.ts` (`StorySettings`)
```ts
beSizeCapTier?: number | null       // story ceiling; null/undefined = open-ended (D1)
beGrowthCooldownBeats?: number      // beats between growth-eligible beats
// beFluidType already exists — the registry key
beGrowthCosmology?: string          // free-text: what growth IS in this world
bePacingFlavor?: string             // free-text pacing note
```
All optional so existing stories parse.

### Task 2 — Consume config at the Phase-2 seam
File: `story.svelte.ts` (`applyBeEvents`)
```ts
const s = this.currentStory?.settings
const config: BeStoryConfig = {
  enabled: true,
  sizeCapTier: s?.beSizeCapTier ?? DEFAULT_BE_STORY_CONFIG.sizeCapTier,
  growthCooldownBeats: s?.beGrowthCooldownBeats ?? DEFAULT_BE_STORY_CONFIG.growthCooldownBeats,
  fluidType: s?.beFluidType ?? 'milk',
  passiveFillEnabled: true,
}
```
(Spec 1 lands the config-read plumbing with defaults; Spec 3 lands the settings fields + UI.)

### Task 3 — Thread the full wizard chain (every hop)
1. `stores/wizard/narrativeStore.svelte.ts` (has only `beMode`): add the five fields.
2. `components/shared/WritingStyleFields.svelte` (has `beFluidType` + callback): add props+callbacks
   for the four new fields (shown when `beMode`).
3. `components/wizard/steps/Step7WritingStyle.svelte` (does NOT pass `beFluidType` today): add it +
   the new fields/callbacks — OR route to a dedicated step (see decision).
4. `components/wizard/SetupWizard.svelte`: wire the `wizard.narrative.*` bindings.
5. `stores/wizard/wizard.svelte.ts` (`writingStyle` object): add the five BE fields.
6. `services/ai/wizard/ScenarioService.ts`: `WizardData.writingStyle` type + `prepareStoryData`
   settings build write them into `settings`.
7. `components/wizard/st-import-steps/StepImportStyle.svelte` + `stores/wizard/stImportWizard.svelte.ts`:
   mirror for the ST-import path.
**Decision adopted:** a dedicated beMode-gated wizard step (five fields is too much for the shared
style panel); settings tab reuses the same field component.

### Task 4 — Settings tab UI
File: `components/settings/tabs/story-settings.svelte` (binds `beMode`/`beFluidType` today) — add
the four new fields via `story.updateStorySettings({...})`, shown when `beMode`. Reuse the
`WritingStyleFields` inputs so wizard + settings share one component.

### Task 5 — Agnostic genre-rules pack (research/36 §6)
Genre rules are **static prose guidance** → prompt/template layer, NOT `be/context.ts` (dynamic
per-character state). Follow the `beStateBlock` precedent:
- New `src/lib/services/be/genre-rules.ts` `buildBeGenreRules(settings): string` — four-phase
  scaffold (Anticipation→Onset→Peak→Aftermath) + POV layering; commit discipline; METRIC
  anti-patterns (US-sizing clause dead per Ben's ruling); growth-authorization gate rewritten
  against OUR `[BODY STATE]` directive (replaces the NAI `[JUDGE DIRECTIVE]` language);
  narrator/character voice separation + BE carve-out; one-sensory-channel-per-beat rotation +
  scene-scope limiter. Interpolate `beGrowthCosmology`/`bePacingFlavor` when present.
- `services/context/context-builder.ts`: `loadBeGenreRules(story)` beside `loadBeStateContext`:
  `this.add({ beGenreRules: story.settings?.beMode ? buildBeGenreRules(story.settings) : '' })`.
- `services/prompts/templates/narrative.ts`: `{% if beGenreRules != '' %}{{ beGenreRules }}{% endif %}`
  alongside the existing `beStateBlock` gates (both templates).
- **Auto-refresh is automatic**: `pack-service.refreshDefaultPackTemplates` content-hashes each
  `PROMPT_TEMPLATES` entry and re-seeds the `default-pack` DB row when the code baseline changes —
  editing `narrative.ts` propagates on next `ensureDefaultPack`. No migration.
- **Megumin CC BY-NC 4.0**: any verbatim-ported §6 text (denylists, RAW VOCALIZATION, entry-point
  rotation) carries a file-header attribution in `genre-rules.ts` + a Credits note.

### Task 6 — Retire the imported [BE] rules
Rewrite/retire the four imported `[BE]` story rules in the Lucy story (they carry the dead NAI
machinery [JUDGE DIRECTIVE]/`<be-body-state>` + US-sizing text) to match the metric engine.

### Test plan (Spec 3)
New `genre-rules.test.ts` (scaffold + commit-discipline present; interpolates cosmology/pacing;
text only when beMode; attribution header). `context-builder`: `beGenreRules` empty when beMode
off, populated on. `ScenarioService`: `prepareStoryData` writes the five BE settings. Manual:
wizard round-trip persists all five; settings tab edits; a pre-change story still loads.

### Risks (Spec 3)
Dedicated wizard step vs cramming Step7 (adopted: dedicated) · confirm no code assumes a separate
`fluidType` · template bloat (consider the style-inject-twice pattern or trim to highest-value
rules) · licensing (Megumin CC BY-NC header; AGPL material reimplement-only).

---

# PART III — VN game-engine track (added 2026-07-19)

Full research and architecture: [42-visual-novel-mode.md](42-visual-novel-mode.md)
(the seams, effort estimates, and open decisions) + `bundles/pixelsaga/MECHANICS.md`
(the reference implementation, source-verified). This part holds the build-plan
level only: what each phase ships and its gates. Design invariant: **VN mode is a
client-side presentation layer** (an `ActivePanel` screen), never a third StoryMode —
it composes over the existing generation pipeline and consumes engine state the BE
reducer already emits.

## V1 — VN presentation MVP (no gates; parallel to P3)

✅ **SHIPPED 0.7.6-be.9 (2026-07-19).** New `ActivePanel: 'vn'` + AppShell branch +
Header toggle · sharp `currentBgImage` background layer · present-NPC portrait
standees (protagonist excluded — the camera in second person; dedup + overflow badge
+ in-slot generating placeholders) · ADV click-through textbox with the pixelsaga
streaming hold-back, DOM-based block splitting (no dropped interstitial text),
markdown rendering, translation support, selection-guarded advance, and reading
position preserved across the stream→finalized transition · visual-prose streams
render live (single growing block — no seams to split) · `ActionChoices`/
`ActionInput` reused with the story column width respected · Android back returns
to the feed. *Moved to V2 (need speaker attribution):* speaking/dimmed highlighting,
typewriter reveal. **Acceptance: a full Lucy session played in VN view — Ben's
smoke test.**

## V2 — the BE sprite engine (gates: P3 shipped + transparency ruling)

**Provider-agnostic by design (Ben's ruling 2026-07-19):** sprite generation binds to
a configurable ImageProfile slot (`spriteProfileId`, following the existing
portrait/background/reference slot pattern) — si-bridge is the preferred provider
(FaceID identity, regional, /animate extras) but external services (e.g. NanoGPT,
OpenRouter image models — the "Nano Banana" profile precedent) must work for basic
banded sprite generation. An external provider with native transparent-PNG output
would also satisfy the transparency gate without the bridge matting node.

Per-character FaceID anchor (portrait-reuse vs dedicated approved anchor — OD#3) ·
new `character_sprites` cache table `(character_id, appearance_hash, band_index,
expression, engorged, status)` mirroring the background_images CRUD/GC pattern ·
lazy per-band batch generation through the P3 provider (solo renders, shared
anchor/conditioning/seed — independent panels, never crowded batches) · pure
`bodyState → (bandIndex, expressionCluster, engorged)` selection function (expression
cut: positive/neutral/distressed + arousal ≥ 70 flush override + engorged @ fill ≥ 75,
matching imageStateCues; conditions stay prose-only) · crossfade sprite swaps ·
**the VN dialogue format**: `VN_DIALOGUE_INSTRUCTIONS` on the proven pixelsaga
`NARR:` / `DIALOG[Name]:` grammar + tolerant parser + feed-view tag stripping (drift
detectors keep their name-attribution windows) · resolve the inline-vs-background
mutual exclusivity (`BackgroundImagePhase` gate).

## V3 — the stage (after V2)

Multi-character client-side compositing (z-order by recency) · `regional:true`
multi-character interaction CGs through the `embedded_images` channel, rendered
full-bleed in VN view · location-keyed background cache layered over the existing
Visual Director (revisits don't regenerate).

## V4 — growth media (after V2; the BE payoff)

Band-crossing sprite transitions always-on (cheap floor) · `/animate/growth` event
clips gated to significant crossings (`lastGrowth.delta ≥ 2`, milestone crossings,
the SURGING two-beat), fire-and-forget with the embedded_images status/retry pattern
and the static swap as fallback · MP4 filesystem storage + `<video>` playback surface
(the one genuinely new storage channel).

## R — the RPG layer (design brief; needs its own ruling session)

"BE RPG adventures" means **choices that interact with the body engine — the body IS
the character sheet**, not a parallel STR/DEX system duplicating what prose already
does. Raw material on the table: pixelsaga's stat-check/training choice grammar
(`[STR:5]` / `[STR+]` tags parsed off choice lines — proven parseable) · Aventuras'
`pack_runtime_variables` (typed per-character stats, classifier-maintained — the
native stat substrate if generic stats are ever wanted) · the BE engine's derived
surfaces (band, mobility/posture rungs, carried mass, fill, conditions, milestones,
growth pressure). Candidate mechanics to rule on in the brainstorm:

1. **Body-gated choices** — options that require or are blocked by body state
   ("Squeeze through the gap — *blocked: gigantic*", "Carry the crate [needs
   mobility ≥ unhindered]"). The actionChoices service already sees present-character
   state; the tag grammar is the pixelsaga pattern.
2. **Fill/capacity as an economy** — milking as a resource loop (sell, relieve,
   trade), engorgement as a cost/pressure the player manages.
3. **Milestone progression** — the interaction-milestone ladder as unlock tiers
   (options, dialogue, events that only exist past a mass threshold).
4. **Growth pressure as a visible risk meter** — the escalator surfaced in the VN
   HUD; players can court or avoid pity-fires.
5. **Deterministic checks** — the reducer's `seededRoll` precedent extended to
   choice resolution (seeded d20 vs body-derived difficulty), keeping the
   single-writer/replay-safety discipline; vs LLM-adjudicated outcomes.

Explicitly parked until ruled: generic attribute sheets, XP/levels, combat. The
brainstorm should also rule how RPG state renders in VN view (stats bar precedent:
pixelsaga's `stats-bar`; ours would be a body-state HUD).

---

## Provenance

Specs produced by an Opus design pass 2026-07-17 against the fork at `0.7.6-be.4` (`4d088568`).
Gap analysis: [36-cross-era-feature-gap-analysis.md](36-cross-era-feature-gap-analysis.md).
Engine design lineage: [31](31-aventuras-be-engine-design.md) → [31a](31a-be-engine-portable-spec.md)
→ [31b](31b-aventuras-integration-surface.md).
