# Image-gen identity anchoring + booru quality fixes (inline path)

**Date:** 2026-08-19 · **Status:** Phase 1a/1b/2 shipped (master); dedicated booru prompt-writer +
multi-person / name-strip / growth-render follow-ups IMPLEMENTED on branch
`claude/image-gen-dedicated-prompt-writer-0c314d` (not yet landed) — see the dated sections at the
bottom for the current record.
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

## Dedicated booru prompt-writer (2026-08-19, follow-up) — IMPLEMENTED (worktree, not landed)

**Why:** measured problem — the NARRATION model (`deepseek-v4-pro`) writes PROSE inside the
`<pic prompt="...">` block even with the booru instructions + a populated identity bank in front
of it, and a booru image model (`wai-illustrious-sdxl`) can't follow prose. The LLM-fed approach
(1b) is insufficient for that narration model. Fix (Ben chose the fuller option): stop trusting the
narration model for the tag prompt — add a dedicated, single-purpose LLM call that converts the
scene → a proper Danbooru TAG prompt (copies each present subject's locked `imageTags` verbatim, or
converts their descriptor prose to tags when they have no bank yet; states current clothing +
body-size band; count tag from subject anchors; closes on current-location scene tags).

**Correction to the prior handoff:** it suggested driving the writer off
`imageSettings.promptModel` / `promptProfileId`. Those fields are **inert — read nowhere at
generation time.** Model selection actually flows through the `imageGeneration` **service preset**
(`servicePresetAssignments['imageGeneration']`) — the same preset `extractIdentity` and the tag-bank
generation ride, and the one Ben already repointed to a non-thinking model. The writer uses that
(via `generateStructured({ presetId, schema, system, prompt }, 'imageGeneration')`), so it stays off
the narration model with no new plumbing.

**What shipped:**
- `booruPromptWriter.ts` — `writeBooruScenePrompt` (best-effort structured call rendering the new
  user-editable `image-booru-scene-prompt` template via ContextBuilder; returns `null` on
  no-preset / failure, never throws) + `resolveBooruScenePrompt` (the single gate: setting on +
  booru dialect → writer output, else the original prompt unchanged) + pure `buildSubjectDossier` /
  `buildLocationBlock`. Rides the apparent-tier band phrase so it agrees with `assembleInlineImage`'s
  downstream grounding.
- Template `image-booru-scene-prompt` (prompts/templates/image.ts, grouped under "Image").
- Setting `dedicatedBooruPromptWriter: boolean` on `ImageGenerationServiceSettings`, **default true**;
  kill-switch toggle in Settings → Experimental (Image Identity card). Booru-gated + best-effort, so
  off is never worse than before. Existing configs get it `true` via the defaults-under-loaded merge.
- Wired into **all four** `assembleInlineImage` seams (writer replaces `tagPrompt` before assembly,
  so BE grounding / LoRA / quality prefix / negatives / `pickImageSize` all still run on its output):
  `InlineImageTracker.startGeneration` (live), `InlineImageService.generateImageForTag` (post-hoc),
  `queueAnalyzedImageGeneration` (analyzed; skipped for `generatePortrait`), and
  `assembleInlineRetry` (regenerate; honors an explicit user `promptOverride` verbatim).
- Tests: `booruPromptWriter.test.ts` (19) — dossier assembly, call contract, and every
  gating/fallback path. Suite 781 green, svelte-check 0, eslint 0 errors.

**Adversarial review (fresh-context) found + FIXED one HIGH regression:** the live streaming
tracker fired `startGeneration` fire-and-forget and only flushed when `hasPendingImages` was true at
`phase_complete`. Inserting the writer LLM call *before* the `pendingImages.push` opened a race — a
`<pic>` tag near the end of the narrative could still be resolving the writer when the flush check
ran, so it saw no pending image and dropped it (and a multi-tag flush that emptied `pendingImages`
first would strand a slow late tag). Fix: `InlineImageTracker` now TRACKS each `startGeneration`
promise, and `flushToDatabase` `await Promise.allSettled(startPromises)` before reading
`pendingImages`; the caller (`ActionInput.svelte`) flushes unconditionally (flush no-ops when empty).
Guarded by `InlineImageTracker.test.ts` (3). Two LOW notes: the preset lookup was moved inside the
writer's try (structural "never throws"); si-bridge+booru builds its spec from tag text now (not
Ben's NanoGPT path — heuristic-only, left as-is). The other four seams create their DB record
synchronously after the writer resolves, so they only pay serial latency, not a drop.

**Manual verification pending:** play a fresh turn with Amelia present on `wai-illustrious`, expand
the `<pic>` prompt, confirm it opens with her locked tags in proper booru tag format (not prose);
check a 2-character scene for correct count tag + no feature-bleed; confirm the Experimental toggle
disables it (falls back to the narration prose prompt).

## Live-DB tuning round (2026-08-19) — multi-person + name leaks FIXED

First play-test on `wai-illustrious` confirmed the writer produces proper tags, but the live
`embedded_images` rows exposed two template defects on intimate/multi-person scenes:
1. **Partner dropped → forced solo.** The writer set the count tag from the NAMED subjects only
   (`<pic characters="Amelia">` → 1), added `solo`, and invented self-groping — even though the scene
   text described a man touching her. The unnamed partner / protagonist vanished (hence "just a
   portrait of the one character, no second person"). `solo` is a strong booru tag that actively
   suppresses everyone else.
2. **Names leaked as tags** ("1girl, solo, Amelia, …") — booru models don't know names; the new
   writer template had dropped the old instructions' "never use character names" rule.

Fixes (template + one code backstop, no new seams):
- Template `image-booru-scene-prompt` reworked: SECTION 3 now counts EVERY person the scene
  describes — including the unnamed partner / protagonist / "a man" in the scene text — sets the true
  count tag (`1boy, 1girl`, …), and forbids `solo` in any touching/sex/second-person scene. SECTION 4
  gives unnamed participants their own generic booru clause; new SECTION 4b adds interaction tags
  (hetero, sex, positions) so two people render interacting, not side by side. SECTION 2 biases to
  medium/cowboy/wide shots (scene + everyone visible), reserving close-up/portrait for a true solo
  face. Explicit "NEVER use character names" rule restored. Dossier relabeled "Named subjects with
  locked identity" so `subjectCount` no longer reads as the render total.
- `stripCharacterNames` (booruPromptWriter.ts) — deterministic backstop that drops any standalone
  comma-token equal to a present character's name, applied to the writer output.
- Tests +5 (name strip). Suite 786 green, check 0, lint clean. Requires an app restart to re-refresh
  the default-pack template content (`refreshDefaultPackTemplates` overwrites on baseline-hash change).

## Growth scenes now render the expansion (2026-08-19)

Complaint: an actual growth/expansion beat wasn't reaching the image — no breast-expansion imagery,
and the new size seemed absent. Root cause: growth is extracted from turn N's prose and the BE
reducer LANDS it AFTER narration, so `lastGrowth` (and the new `tier`) surface in turn **N+1** — the
render turn (see `be/context.ts:40` and `growthDirective`; `lastGrowth` is re-initialised to
`undefined` every reduce, so it's a fire-once marker). The new size DID already reach N+1 images
(dossier band word + `assembleInlineImage` grounding both read the current tier), but the image path
never emitted an "expansion happening" cue — `imageStateCues` handled only engorgement + arousal, so
the N+1 image read as a static larger bust, not a transformation. (Turn N itself CANNOT show the new
size — it isn't computed until after N's prose; that N→N+1 split is the system's design, mirrored by
the narration's own growthDirective. `sprite.ts` already keys a shock cell off `lastGrowth`.)

Fix (one choke point): `imageStateCues` (be/measurements.ts) now emits a leading `breast expansion,
…` cue when `state.lastGrowth.delta > 0` (rapid vs gentle by delta). That single function feeds the
booru writer's dossier body line, `assembleInlineImage`'s solo cue-append, and the narration
reinforcement block — so all three render the expansion on the payoff turn, at the already-current
new size. Tests: measurements +1, booruPromptWriter +1 (dossier surfaces the cue). Suite 787 green,
check 0, lint clean.
