# 31 — BE engine on Aventuras: design + decisions

**Date:** 2026-07-16 · **Status:** BUILD-AUTHORIZED — **all decisions ruled by Ben** (D1/D3/D6 on
2026-07-16; D2/D5/D7 on 2026-07-17 as recommended: defer relMech to Phase C · re-derive constants
in Phase B · fix the retry-metadata gap in Phase A). **EXCEPTION — D4 RE-OPENED 2026-07-17:** Ben:
body math serves PROSE as well as image gen, so bridge-only math "wouldn't benefit any of the
generated prose" — needs deeper research (what derivation depth does honest narration require
in-app: thin tier→label tables vs banded measurement tables vs the full NAI spine?). Phase A
proceeds with the thin derivation set behind a pure-function seam; the D4 research task decides
whether to thicken it. *Research delivered 2026-07-17:
[35](35-d4-prose-body-math.md) — recommends depth (b) as build-time baking of the spine
(≈6 added derivations + `baseline.bandIn`); awaiting Ben's re-ruling.* **Phase A GO given 2026-07-17** (engine-first priority — see research/34).
**Inputs:** [31a — portable BE-engine spec](31a-be-engine-portable-spec.md) (what the engine must do,
distilled from all three prior eras) · [31b — Aventuras integration surface](31b-aventuras-integration-surface.md)
(where it plugs in, file-and-line-verified) · [30 — platform evaluation](30-aventuras-evaluation.md) ·
`st-content/be-module/BE-MODULE.md` (the leanest prior expression) · the STATUS.md decision register.
**Target:** the Aventuras fork (`Projects/gaming/Aventuras`, branch `be-patches`, currently
`0.7.6-be.1` deployed as Ben's live app).

---

## 1. Goal and binding constraints

Build the fourth-generation BE engine — native to Aventuras — carrying forward the validated
mechanics of the NAI engine and the ST/MVU BE module, on the platform primitives Aventuras
actually offers.

**Binding constraints (already decided, not re-opened here):**
- Ben's locked game decisions (STATUS register): per-character friction dial · player-steered
  ArcTrack tone · **simultaneous harem** (co-presence + jealousy) · full catalyst-mastery
  protagonist · pure sandbox · Setting Packs · legible/semi-transparent RPG.
- Deterministic body/tier **image** math stays in the si-animator-bridge (standing decision,
  reaffirmed by 31a §1.3/§2.3). The app sends size-band vocabulary; the bridge renders.
- Aventuras has **no plugin surface** (31b §8.1) — this is a fork-and-patch feature. We already
  run a patched build; the design minimizes core-file touch points to keep upstream rebases sane.

**The platform gives us (31b):** per-character `metadata` JSON that automatically survives
checkpoints, world-state snapshots, and CoW branches; a per-turn Classifier with a proven Zod
schema-extension mechanism; one function where ALL world-state mutation + undo bookkeeping
already happens; template/context builders; an editable character panel; per-story settings.

## 2. Architecture (recommended)

One sentence: **a self-contained `src/lib/services/be/` module owning a deterministic reducer over
`character.metadata.bodyState`, fed by classifier-extracted EVENTS, invoked from the single
existing world-state apply site, and read (never written) by templates, image prompts, and UI.**

### 2.1 State: `character.metadata.bodyState`

Per 31b's verdict (§3.2, high confidence): no new column, no migration, automatic
snapshot/branch/rollback coverage. Holds 31a's CORE fields:

```ts
type BodyState = {
  tier: number            // THE canonical size scalar (ladder per D1)
  shape: 'natural' | 'firm' | 'gravity_defying'
  fluids: { fillPercent: number; fluidType: string }
  conditions: { label: string; note?: string; ttl?: number }[]  // explicit transient allow-list
  locked: boolean         // the P4 size-lock, first-class
  baseline?: { heightCm?: number; build?: string }
  pendingGrowth?: { delta: number; source: string }   // two-beat anticipation (Phase B)
  // relMech deferred to Phase C pending D2
}
```

Cup letter, measurements, band words, grounding facts ("held high" / "hangs past her navel"),
and the image size phrase are **derived by one pure function each** — never stored (31a §1.1,
lesson 1). A cross-check canary test guards the derivations.

### 2.2 Writer: the reducer, at the one legal write site

- **Single-writer as code** (D3 recommendation): the ONLY code path that mutates `bodyState` is
  `be/reducer.ts`, and its only caller is `StoryStore.applyClassificationResult()`
  (story.svelte.ts:1925) — inserted after the existing entity loops and **before** the
  `WorldStateDelta` build/save (:2688) so BE changes are rollback-visible (31b §2.3).
- **The LLM proposes EVENTS, not values.** The classifier schema is extended (via the same
  mechanism as runtime variables — Zod strips ad-hoc keys, 31b risk 1) to extract
  `beEvents: [{character, kind: catalyst|contact|milking|attempt|stabilize, intensity}]`.
  The reducer turns events into state: locked-difficulty check, outcome-banded capped delta,
  size-lock muzzle, clamps, condition TTL decay, fluid tick. This is deliberately HARDER than
  the platform-native "LLM sets the value" (which runtime variables use) and softer than NAI's
  full intent queue — the middle of 31a's single-writer spectrum (lesson 8), chosen because the
  fork gives us a real code surface.
- The undo before-state capture is widened to cover every character the reducer touches, not
  just classifier-flagged ones (31b §3.3 gap) — needed once ambient effects (fluids, pity
  growth) exist.

### 2.3 Readers

- **Narrative templates:** a `beState_characters` context block (ContextBuilder method mirroring
  `loadRuntimeVariableContext`) + **edits to the shipped `adventure`/`creative-writing` template
  bodies** — 31b found the existing `runtimeVars_characters` variable is referenced by ZERO
  shipped templates; default exposure requires touching the defaults, not just providing the
  hook. The block carries: band descriptor + grounding facts + magnitude-scaled narration
  directive for any growth that just landed (31a §3.5 — overshoot is a distinct failure from
  drift) + the size-lock assertion for locked characters.
- **Image prompts:** programmatic grounding at `InlineImageService.ts:163-165` (and the tracker
  twin): for each character named in a `<pic>` tag, replace/append the CANONICAL size-band words
  derived from `bodyState.tier` — the model's own words become a fallback, not the source of
  truth. (The bridge's `__betier_<N>__` marker remains available for exact-tier control later;
  band words are equivalent today since the deployed Krea shim maps the marker to the same
  vocabulary. Pending research/32's accuracy findings.)
- **UI:** a BE section in `CharacterPanel.svelte` following the RuntimeVariableDisplay pattern —
  tier/band readout, fluid bar, conditions, and the 🔒 lock toggle. Editable per the legible-RPG
  decision (manual edits go through a `be/` helper that re-derives, preserving single-writer in
  spirit: the helper IS the writer).
- **Per-story toggle:** `beMode: 'off' | 'on'` in StorySettings following `imageGenerationMode`'s
  exact wiring pattern (type + story-settings tab + both wizards; 31b §7.2). Default off —
  non-BE stories pay zero cost.

### 2.4 What explicitly does NOT port

The manual snapshot enumerator and R3 undo plumbing (platform-native now) · the late-block
context splice + bleed scrubbing (NAI-specific pathology) · Chronicler trigger machinery (native
chapter/lore agents cover it; port only the "trust structured state over narrative-scanning"
instruction into the lore-management template) · deep body-math client-side (bridge keeps it).

## 3. Phased build plan

**Phase A — the core loop** (the vertical slice; Lucy as proving ground):
`be/` module (types, ladder + derivations + canary tests, reducer, metadata helpers) · classifier
schema extension (events) · apply-site hook + widened before-state capture · template context
block + shipped-template edits · image-prompt grounding · CharacterPanel BE section w/ lock ·
per-story toggle · seed-from-card (read `extensions.ambrosia_be` when importing; Lucy's canon
38X ≈ its tier equivalent) · **vitest** as the fork's first test infra (vite-native, zero-config;
reducer/ladder/canary/undo tests — the 31a §9.3 test patterns).

**Phase B — pacing + fluids:** pressure floor (pity-growth accumulator; ALL constants re-derived
against real Aventuras turn cadence per D5 — never trust the NAI numbers) · fluid fill/drain
per-turn tick + overfill coupling · two-beat anticipation · magnitude-banded narration
directives tuned in play.

**Phase C — harem + polish (gated on D2):** relMech (attitude/stage/consent OR ArcTrack hybrid)
· catalyst-mastery hooks · jealousy/co-presence effects on pressure · lore-agent prompt
hardening · cadence-calibration playtest as the acceptance gate (the P1 pattern).

## 4. Ben's decisions (build-gating)

| # | Question | Recommendation |
|---|---|---|
| **D1** | **Tier ladder shape** (31a §2.2/§11.1): (a) granularity — sub-cup canonical steps (NAI, ~2/cup, enables "+1 that doesn't flip the letter" slow-burn) vs 1-step-per-letter (Era-2, simpler, but collapses canonical/derived); (b) bounded — hard cap at ZZ+ (Era-2) vs unbounded scalar with a bounded derived letter table saturating into named descriptors (NAI) | Unbounded scalar, sub-cup granularity, derived bounded letter table → named descriptors past Z. Genre-correct open-endedness + keeps the canonical/derived split real. |
| **D2** | **Relationship model** (31a §11.2): 9-rung attitude axis + consent matrix (NAI #17) vs continuous ArcTrack axes w/ four endings (P1, and a LOCKED game decision) vs hybrid | Defer to Phase C; design the hybrid then (ArcTrack axes canonical, consent-mode a derived read). ArcTrack is locked as the player-facing framing, so the NAI axis can't win outright. |
| **D3** | **Single-writer strictness** (31a §11.3): full intent queue (NAI) vs events→deterministic-reducer (middle) vs platform-native LLM-sets-values | The middle tier (§2.2). Code-enforced single writer without the queue ceremony. |
| **D4** | **Deep body-math client-side?** (31a §11.4) | No — bridge-side only; port band + grounding facts. Revisit only on a concrete narration-dishonesty complaint. (Both agents + research/30 converge here.) |
| **D5** | **Pacing/DC constants** (31a §11.5) | All reference-only; re-derive in Phase B against measured turn cadence, harem-aware. |
| **D6** | **Enable `stateTracking` by default in the fork?** (31b risk 2: rollback/deltas are OFF app-wide, including Ben's live DB — most undo-safety is conditional on it) | Yes — default ON in the fork (deltas + snapshots are the R3 story). `lightweightBranches` stays opt-in. |
| **D7** | **Fix the pre-existing `PersistentCharacterSnapshot` metadata gap** (31b §3.4 — cross-session retry snapshots never carried metadata, so a retry-after-restart loses runtimeVars today and would lose bodyState) | Fix in Phase A while in the file — it's also an upstream-worthy fix. |

## 5. Risks

1. **Zod strips unknown keys** — all classifier additions go through the schema-extension
   builder, verified against the RUNTIME validator (31a lesson 3), never ad-hoc.
2. **`story.svelte.ts` rebase friction** (4,350 lines, upstream-active): keep the apply-site
   diff to a single guarded call into `be/`; everything computational stays in the module
   (31b §8.2).
3. **Template defaults vs packs:** editing shipped templates changes ALL stories; the per-story
   `beMode` gate wraps every BE block (`{% if beMode %}`) so non-BE stories are untouched.
4. **Constants tuned for the wrong game** — D5; Phase B ships with instrumentation (per-turn BE
   event log in the world-state delta) so re-derivation is measured, not vibed.
5. **No test infra in the fork** — vitest lands with Phase A; the canary/undo test patterns from
   31a §9.3 are the priority suite.

## 6. Cross-links

Image accuracy work (research/32, in flight) is independent but adjacent: once bodyState exists,
the image grounding in §2.3 switches from "model-remembered words" to "engine-derived words" —
the last step of size-fidelity. The Lucy import bundle (research/30 §7) becomes the Phase-A
acceptance fixture: import → seed bodyState from card → play a catalyst beat → watch the reducer,
panel, template block, and image band all agree.
