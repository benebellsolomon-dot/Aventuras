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
`<pic>` prompt and (b) the negative prompt** (`nanogpt.ts` builds the request from
`prompt + negative_prompt + size`).

The booru `<pic>` authoring instructions (`NarrativeService.ts:111-162`) are already
strong: count tags, per-character spatial-anchor sentences (anti-feature-bleed), scene
tags, size bands, clothing-state cues, and a "copy identity tags verbatim" block. But:

- **The identity block only fires when a character has an `imageTags` bank — and none
  of the user's 13 characters do** (verified against the live DB). So the locked-identity
  mechanism is dormant.
- Characters **do** have `visualDescriptors` (baseline look) and often
  `currentVisualDescriptors` (tracked current look + clothing), but **none of that
  appearance data is fed into the image path** — only the BE size/body-state block is.
  The LLM re-invents each character's face/hair/clothing from story memory every image
  → drift, omission, feature-bleed, hallucination.

## Confirmed environment

- Image mode: **inline** for all stories (live path = `InlineImageTracker` →
  `assembleInlineImage` in `inlineAssembly.ts`; the analyzed/agentic path is not used).
- `beMode` on; provider NanoGPT + wai-illustrious-sdxl → `booru` dialect.
- 0/13 characters have an `imageTags` bank; most have `visualDescriptors`, several have
  `currentVisualDescriptors`.
- NanoGPT: `negative_prompt` works; `aspect_ratio` is a supported param; A1111 `(tag:1.2)`
  weighting is undocumented and model-backend-specific (assume unsupported for now).

## Approach (approved)

**Activate the intended design (LLM-fed), don't add deterministic assembly injection.**
The machinery exists; the gap is empty inputs. Feed the LLM real inputs (a populated
identity bank + current clothing), fix the provider-level safety issues, measure, and only
add deterministic enforcement later if generations still show non-compliance.

**Identity anchor = hybrid:** a persistent auto-derived identity bank (stable appearance,
also what the sprite appearance-hash keys on) + live current-state (transient clothing/body
state, deliberately excluded from the identity hash).

## Goals

1. Each character has a stable, reusable identity that reaches the image prompt (fixes
   inaccurate people (5), reduces feature-bleed (2) and hallucination (6)).
2. Current clothing/undress reaches the image prompt (fixes state of dress (3)).
3. Anatomy negatives are always applied (fixes anatomy (1)).
4. No unparsed emphasis tokens leak to endpoint providers (fixes noise (6)).

## Non-goals (this pass)

- Aspect-ratio-by-shot-type / subject-count (**phase 2 fast-follow** — NanoGPT supports
  `aspect_ratio`; needs shot-type parsing + model-supported-size resolution).
- Deterministic assembly-time tag injection (revisit only if measurement shows the LLM
  omits identity even with a populated bank).
- Analyzed/agentic-mode parity (user is inline-only).

## Design

### Component 1 — Persistent identity bank (auto-derive `imageTags`)

- **Derivation:** produce a **plain** danbooru identity string from `visualDescriptors`
  (face, hair, eyes, distinguishing/species — **not** clothing; clothing is excluded from
  identity so cached sprite sets don't thrash per scene). Adapt the existing
  `identityTagsFromDescriptors` (`bridgeSpec.ts:73`) into a plain-tag variant (no A1111
  `(tag:1.15)` weights) so the bank is portable to any provider. Keep the existing weighted
  variant for the bridge path.
- **Persistence & non-clobber:** populate `Character.imageTags` (`image_tags` column,
  already plumbed in `database.ts` add/update) **only when empty**. Re-derive on a
  `visualDescriptors` edit **only if the current bank still equals the last auto-derivation**
  — guard with a stored content-hash (same pattern as the pack-template system) so manual
  edits are never overwritten. The field stays user-editable.
- **Backfill:** one-time derivation for existing characters with descriptors and no bank
  (on story load, idempotent via the non-clobber rule; no destructive migration).
- **Effect:** activates `buildCharacterIdentityTagBlock` (`NarrativeService.ts:170`) — the
  LLM now copies real locked tags verbatim, in both solo and (spatially-anchored)
  multi-subject prompts.

### Component 2 — Current clothing/state reinforcement (LLM-fed)

- Add each present character's **current** outfit to the booru image instructions (a new
  block, or extend `buildBodyStateReinforcementBlock` at `NarrativeService.ts:189`), read
  as `currentVisualDescriptors.clothing ?? visualDescriptors.clothing`. Instruct: "depict
  this outfit and its current state (torn/open/removed) — match to body size."
- **Precedence fix (Fix D):** prefer `currentVisualDescriptors` over baseline for clothing
  wherever clothing is surfaced (the bridge path reads baseline at `bridgeSpec.ts:247` —
  fix there too for consistency even though it's si-bridge-only).

### Component 3 — Negative-prompt hardening (Fix A)

- In `nanogpt.ts:46-53` (and the identical `comfy.ts` path), **merge** a user's configured
  negative *with* `BOORU_DEFAULT_NEGATIVE` (deduped, order-stable) instead of letting a
  configured negative replace it. `sizeNegativeForPrompt` continues to stack. Anatomy /
  hand / finger / proportion negatives are then always present.

### Component 4 — Emphasis safety + per-provider capability flag (Fix E)

- The derived identity bank is plain (Component 1), so it carries no weights to copy.
- Introduce a per-provider `parsesPromptWeighting` capability: **true** for ComfyUI /
  si-bridge / a1111 (which parse `(tag:weight)`), **false** for the NanoGPT endpoint.
- Gate the BE within-band size emphasis (`inlineAssembly.ts:147-156`) on that flag — off
  for NanoGPT so no literal `(large breasts:1.20)` tokens reach the model. Default
  conservative; flippable if the user confirms their NanoGPT backend parses weighting.

### Component 6 — Testing

- Unit tests:
  - identity-bank derivation: descriptors → plain tags; clothing excluded; empty on empty
    descriptors; non-clobber hash guard (manual edit preserved; auto value re-derived).
  - clothing precedence: current wins over baseline; falls back when current absent.
  - negative merge: configured + default deduped; default present when unconfigured;
    size-negative still stacks.
  - emphasis gating: weighted for weight-parsing providers, plain for NanoGPT.
- Manual before/after: one solo scene and one 2-character scene, eyeballed for identity
  consistency, correct dress, and no feature-bleed.

## Symptom → fix traceability

| Symptom | Addressed by |
|---|---|
| 1 bad anatomy | C3 (always-on anatomy negatives); C5/phase-2 (aspect) |
| 2 multi-subject positioning | C1 (real per-character identity for the spatial-anchor sentences) |
| 3 state of dress | C2 (current-clothing reinforcement + precedence) |
| 4 scene/setting | existing scene-tag instructions (already present); revisit if still weak |
| 5 inaccurate people | C1 (locked identity finally reaches the prompt) |
| 6 hallucination | C1 (specified identity), C4 (no garbage emphasis tokens) |

Note symptom 4 is largely already instructed; it improves indirectly once the prompt is
less crowded by re-invented identity. If it persists after this pass, add a scene/location
backstop in phase 2.

## Risks / open items

- **Derivation quality:** auto-derived tags are only as good as the free-text descriptors.
  Acceptable — the bank is editable and the hash-guard lets the user curate.
- **Weight parsing** is assumed unsupported on NanoGPT (conservative). If confirmed
  supported, flip the capability flag.
- **Measurement-driven:** if the LLM still omits identity with a populated bank, revisit a
  narrow deterministic backstop (originally "Both, solo-only" option).

## Out of scope / phase 2

Aspect-ratio-by-shot-type + subject count (map the LLM's shot tag + character count to a
model-supported `aspect_ratio`), and any analyzed-mode parity.
