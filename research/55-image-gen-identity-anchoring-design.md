# Image-gen identity anchoring + booru quality fixes (inline path)

**Date:** 2026-08-19 · **Status:** approved design, pre-implementation
**Worktree:** `aventuras-image-gen-quality-372ac2` (base `master`/`5ff5bbb7`)

## Problem

Generated images show bad anatomy, feature-bleed / positioning failures with more
than one person, wrong state of dress, missing scene, inaccurate characters, and
hallucinated details.

**Root cause (investigation, 2026-08-19):** the app's structured per-character image
machinery — locked identity tags, regional multi-subject separation, clothing tags,
curated location — is gated to the `si-bridge` provider (`bridgeSpec.ts:372`
`maybeBuildBridgeSpec` returns `undefined` for any non-bridge provider). The user's
provider is **NanoGPT + wai-illustrious-sdxl → `booru` dialect, not si-bridge**, so all
of it is inert. For this user the image is driven **entirely by (a) the LLM-authored
`<pic>` prompt and (b) the negative prompt**.

The booru `<pic>` authoring instructions (`NarrativeService.ts:111-162`) are already
strong (count tags, per-character spatial-anchor sentences, scene tags, size bands,
clothing-state cues, a "copy identity tags verbatim" block). But:

- **The identity block only fires when a character has an `imageTags` bank — 0 of the
  user's 13 characters do** (verified against the live DB). The locked-identity mechanism
  is dormant.
- Characters have `visualDescriptors` (baseline) + often `currentVisualDescriptors`, but
  **none of that appearance data is fed into the image path** (only the BE size block is).
  The LLM re-invents each character's look every image → drift, omission, feature-bleed.
- The `visualDescriptors` are **rich free-text prose, not booru tags**, and the baseline is
  **polluted with transient scene state**: the classifier schema's `face` field explicitly
  invites "expression" (`classifier.ts:18`), and character *creation* dumps the classifier's
  scene-time description straight into the canonical baseline (`story.svelte.ts` newCharacter
  path) with no stable/current split. (Live example: Amelia's baseline `face` carries
  "post-orgasm … semen on chin".) The *update* path is correct (routes to
  `currentVisualDescriptors`); the pollution enters at creation.

## Confirmed environment

- Image mode **inline** for all stories; `beMode` on; provider NanoGPT + wai-illustrious
  → `booru`. Live path = `InlineImageTracker` → `assembleInlineImage` (`inlineAssembly.ts`).
- 0/13 characters have an `imageTags` bank; most have `visualDescriptors` (prose), several
  have `currentVisualDescriptors` (good current-clothing data: "torn work dress…", "naked").
- NanoGPT: `negative_prompt` works; `aspect_ratio` supported; A1111 `(tag:1.2)` weighting
  undocumented/model-specific → assume unsupported.

## Approach (approved)

Activate the intended LLM-fed design (feed real inputs, don't add deterministic assembly
injection), and fix the identity DATA at its source. Identity anchor = **hybrid**:
persistent stable identity bank + live current-state.

The backbone is a **unified LLM identity-extraction utility** that turns free-text
descriptors into `{ stable identity danbooru tags, clean stable baseline descriptors,
transient current-state }` — the same mechanism serves the tag bank, creation-time
hygiene, and backfill. Size is never extracted (the BE engine owns size).

## Design

### A. Identity-extraction utility (LLM) — the backbone

- Input: a character's free-text `visualDescriptors` (possibly polluted prose).
- Output: `{ identityTags: string[] (plain danbooru — species/race, hair, eyes, skin,
  permanent distinguishing; NO size, NO clothing, NO transient state), cleanBaseline:
  VisualDescriptors (stable identity only), currentState: partial VisualDescriptors
  (expression/pose/condition + current clothing) }`.
- Uses the existing AI service (a small structured call). **Best-effort:** on no configured
  text model / failure, skip — leaving today's behavior (empty bank, raw descriptors).
- Pure/testable seam: the prompt + schema live in one module; the parse/split is unit-tested
  against fixture prose.

### B. Persistent identity bank (`imageTags`)

- Populate `Character.imageTags` from the extraction's `identityTags` (plain tags — portable;
  no A1111 weights). Non-clobber: write only when empty; re-derive on a baseline change
  **only if the bank still equals the last auto-derivation** (stored content-hash guard, same
  pattern as pack templates). User-editable.
- Effect: activates `buildCharacterIdentityTagBlock` (`NarrativeService.ts:170`) — the LLM
  copies real locked tags verbatim in solo and (spatially-anchored) multi-subject prompts.

### C. Creation-time hygiene

- At new-character creation (`applyClassificationResult` newCharacter path), run the
  extraction on the classifier's descriptors → set **baseline = cleanBaseline**, **current =
  currentState** (incl. current clothing), **imageTags = identityTags**. Baseline is now
  canonical; transient state is captured separately for the current image.
- Timing: **deferred/background** (create with raw descriptors immediately, extract-and-update
  shortly after, like sprite/portrait generation) to avoid adding turn latency; the first
  image of a brand-new character may predate the bank, subsequent ones use it. (Inline is the
  simpler fallback if deferral proves fiddly.)

### D. Backfill (existing characters) — propose, apply on approval

- One-time pass over characters with descriptors: run the extraction and produce per-character
  `{ tag bank, cleaned baseline, extracted current-state }`.
- **Tag banks** (additive, safe) may auto-apply. **Baseline rewrites** (mutating narrative
  data) are **presented for the user's review and applied only on approval** — never silent.

### E. Current clothing + location reinforcement (LLM-fed)

- Add a block to the booru image instructions stating each present character's **current
  outfit** (`currentVisualDescriptors.clothing ?? visualDescriptors.clothing`) and the
  **current location** (name + description, from the classifier scene) — parallel to the
  existing body-state block. Precedence fix: current wins over baseline for clothing wherever
  surfaced (also fix the bridge baseline-clothing read at `bridgeSpec.ts:247`).

### F. Negative-prompt hardening

- `nanogpt.ts:46-53` (and identical `comfy.ts`): **merge** a configured negative *with*
  `BOORU_DEFAULT_NEGATIVE` (deduped, order-stable) instead of replacing it;
  `sizeNegativeForPrompt` still stacks. Anatomy/hand/finger/proportion negatives always present.

### G. Emphasis safety + per-provider capability flag

- Derived bank is plain (B). Add a per-provider `parsesPromptWeighting` capability: **true**
  for ComfyUI / si-bridge / a1111, **false** for the NanoGPT endpoint. Gate the BE within-band
  size emphasis (`inlineAssembly.ts:147-156`) on it — off for NanoGPT so no literal
  `(large breasts:1.20)` tokens leak. Flippable if the user confirms backend support.

### H. Testing

- Unit: extraction split shape (stable vs transient vs tags; size excluded; clothing excluded
  from bank); bank non-clobber hash guard (manual edit preserved, auto value re-derived);
  clothing + location precedence (current over baseline, fallback); negative merge/dedupe;
  emphasis gating by provider.
- Manual before/after: a solo scene (Lucy — holstaur ears/horns/tail) and a 2-character scene,
  eyeballed for identity consistency, correct dress, and no feature-bleed.

## Phasing

- **Phase 1a (quick, independent, low-risk):** F (negatives) + G (emphasis flag) + E (current
  clothing/location reinforcement). Immediate image improvement; ships without the subsystem.
- **Phase 1b (the subsystem):** A (extraction) → B (bank) → C (creation hygiene) → D (backfill
  with review) → H tests.
- **Phase 2 (fast-follow):** aspect-ratio by shot type / subject count (NanoGPT `aspect_ratio`).

## Symptom → fix traceability

| Symptom | Addressed by |
|---|---|
| 1 bad anatomy | F (always-on anatomy negatives); phase 2 (aspect) |
| 2 multi-subject positioning | B/C (real per-character identity for the spatial-anchor sentences) |
| 3 state of dress | E (current-clothing reinforcement + precedence); C (current captured at creation) |
| 4 scene/setting | E (current-location reinforcement); existing scene-tag instructions |
| 5 inaccurate people | A/B/C (clean locked identity finally reaches the prompt) |
| 6 hallucination | B (specified identity), G (no garbage emphasis tokens) |

## Risks / open items

- **Extraction quality** depends on the LLM tagger; it's the whole point and is unit-tested on
  fixtures + eyeballed on backfill. Bank is editable; hash-guard preserves curation.
- **Extra LLM call** at creation — mitigated by deferring to background.
- **Weight parsing** assumed unsupported on NanoGPT (conservative); flip the flag if confirmed.
- **Baseline rewrites** touch narrative data — gated behind user review (D).
- **Measurement-driven:** if the LLM still omits identity with a populated bank, revisit a
  narrow deterministic backstop.

## Implementation status (2026-08-19) — Phase 1a + 1b SHIPPED (worktree branch, not landed)

Nine commits on `aventuras-image-gen-quality-372ac2`, orchestrated across subagents; full
suite green (750), svelte-check 0, eslint clean.
- **F/G/E** (Phase 1a): negatives merge; `parsesPromptWeighting` emphasis gate; current
  clothing + location reinforcement + precedence.
- **A+B**: `extractIdentity` (the unified identity call — folded in the old dossier
  `image-tag-bank-generation` tag rules; `ImageTagBankService.generateTagBank` now delegates
  to it) + `computeIdentityUpdates` non-clobber bank guard.
- **C**: creation-time hygiene, deferred/best-effort (`identityHygiene.ts`, `newlyCreatedCharacterIds`).
- **D**: review-gated backfill — `identityBackfill.ts` + `IdentityBackfillModal.svelte`,
  triggered from Settings → Experimental.
- **Adversarial review** on the data-mutating pieces (C+D) found and FIXED two ship-blockers
  (baseline wipe from thin extraction → `mergeIdentityBaseline` field-merge; D clobbering live
  `currentVisualDescriptors` with stale extracted state → D writes baseline only) plus MEDIUM
  fixes (C re-resolve-after-extraction; sprite-anchor + COW-branch warnings; backfill cancel).

**Phase 2 SHIPPED** (`aspectRatio.ts` `pickImageSize`): inline booru images now pick an SDXL
bucket from shot-type tags + `<pic>` subject count — 2+ subjects / wide → `1216x832` landscape;
full-body / close-up / portrait → `832x1216` tall; no cue → configured size. Wired into
`InlineImageTracker` + `InlineImageService`; prose models keep the fallback.

**Follow-ups (not done):** the `image-tag-bank-generation` template is now orphaned (service
delegates to extractIdentity's inline prompt) — repoint extraction at a template to keep it
user-editable, or drop it from the Prompts UI. Manual verification (rebuild app, run backfill,
generate solo + 2-char scene) pending.
