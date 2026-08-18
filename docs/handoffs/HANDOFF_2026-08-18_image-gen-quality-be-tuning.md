---
generated_at: 2026-08-18T13:00:00Z
goal: "Image-gen quality overhaul: Megumin prompt structure, booru dialect, BE tier accuracy for online providers, ComfyUI IPAdapter identity groundwork"
---

# Handoff — 2026-08-18

> A fresh agent reads this to continue the work.
> Do not duplicate artifacts (PRDs, plans, ADRs, commits, diffs).
> Reference them by path or URL.

## Goal of next session

Playtest-driven tuning of the new image pipeline (Ben is testing tier 29/45/80
renders + the tag-bank generator), then whichever lands first:
direct-ComfyUI expansion (OpenPose/ControlNet stage, FaceID-v2 loader) or
si-bridge retirement. Comfy work is explicitly deferred — online path first.

## State of play

- Branch: `claude/aventuras-image-gen-quality-372ac2`, merged to `master` and
  pushed this session (Ben authorized the push).
- 9 commits, `5656e732..c973637d` — read the commit messages; they are the
  spec. All 289 tests + svelte-check clean at merge.

**Done (this session):**

- **Megumin prompt build order** in all three prompt-writing surfaces (inline
  `<pic>` instructions in `NarrativeService.ts`, both analysis templates in
  `prompts/templates/image.ts`): rating → camera → count → isolated
  per-character descriptions → environment last. Fictional 500-char cap
  removed (was never enforced; caused sparse prompts). `currentLocation`
  wired into analysis templates.
- **Cadence regression + fix**: the structured spec initially collapsed tag
  emission (5/6 responses imageless) — cured by an explicit one-image-per-
  response cadence rule (`40f0c7cb`). Lesson: pair any demanding prompt spec
  with an explicit emission-rate instruction.
- **Prompt dialect layer** (`ai/image/dialect.ts`): booru-family model
  detection → tag dialect, quality prefix instead of prose style block,
  default + size-aware negative prompts (NanoGPT + ComfyUI providers).
  Prose dialect for LLM-encoder models unchanged.
- **Classic Anime style** (`image-style-classic-anime`) is the new default;
  fallback style constant aligned.
- **Identity**: per-character locked tag banks inject into inline
  instructions; `ImageTagBankService` + panel Generate button auto-drafts
  banks from descriptions (Megumin dossier rule).
- **BE tier accuracy**: `__betier__` marker now carries the exact engine
  tier (si-bridge/a1111 only; leak to other providers fixed incl. portrait
  path); within-band A1111 emphasis; `imageSizeAnchor` body-relative anchors
  above band saturation (tier 30+); graduated fill cues (40/75/90%);
  per-character CURRENT BODY STATE block in inline instructions;
  size-aware negative suppresses smaller bands.
- **Frame math**: `be/baseline.ts` parses height/build from descriptors at
  bodyState seeding → `frameEstimateKg`/`bandCm` use real frames. A/B cups
  clamp to genre floor. Dead `estimatedBodyWeightKg` removed.
- **Sprites online**: tag bank + booru prefix + anchor/portrait as img2img
  reference (`SPRITE_FACEID_WEIGHT` 0.55 for all providers with a ref).
- **ComfyUI IPAdapter identity workflow** (`ipadapter-txt2img-workflow.json`,
  auto-routed on reference images; needs ComfyUI_IPAdapter_plus). Deterministic
  seed + negative default fixed in the comfy provider. Further comfy work
  DEFERRED by Ben's ruling this session.

## Known gaps / next candidates

- Regenerate/retry path bypasses `assembleInlineImage` (spawned task chip
  exists; `StoryEntry.svelte:607-620,702-745` + `imageUtils.ts:95-161`).
- Off-screen characters' body blocks enter every narrative prompt (token
  bloat, `context-builder.ts:196-203`).
- si-bridge B1: portrait references still log-dropped.
- Cup-letter derivative bulge across tiers 14–18 (documented, not fixed —
  curve spine is audit-pinned; see `be/curves.ts` header).
- Amelia (active story) predates baseline auto-seed — Ben should set
  height/build in the BE panel baseline editor once.

## Environment notes

- Worktrees: vite dev needs the `server.fs.allow` entry in `vite.config.js`
  (added this session) to serve the parent checkout's shared node_modules.
  `.claude/launch.json` runs `npm run dev` on port 1420; the full app needs
  `npm run tauri dev` (browser-only hits a Tauri `invoke` init error).
- Ben's live profile: NanoGPT / `wai-illustrious-sdxl` (booru dialect).
- Project memory (`aventuras-architecture.md`) updated with the dialect
  layer; `nsfw-preset-research.md` has the Megumin/Kazuma source extraction.
