# 63 — D5 calibration playtest, round 1: findings + fixes

**Date:** 2026-08-21 · **Parent:** research/58 D5 (playtest calibration, all FF5.2 phases live) · **Baseline:** Kimi K3 (narrative/wizard/image-prompt), GLM 5.2→minimax (suggestions — see finding 2), `wai-illustrious-sdxl` on NanoGPT (images), commit a28feb23 + this round's fixes.

## Fixed this round (all shipped in the round-1 commit)

1. **Images ignored the story's setting** — the booru writer's context had scene/subjects/location but nothing about the story. Both image LLM prompts now get a `## Story setting` block (genre + description + era-fidelity instruction); template sync v9.
2. **Action choices silently vanished** — three stacked causes, peeled in order:
   a. `ActionChoicesService`/`SuggestionsService` swallowed every error and returned `[]`, so failures were indistinguishable from "no choices" (no toast could ever fire). Removed; failures propagate to the post-phase error event.
   b. Surfacing was toast-only and unreadable; now a persistent amber "Choices unavailable: <error>" panel renders in the choices slot (`ui.actionChoicesError`), plus a 12s toast.
   c. The real failures, per the now-visible errors: hard schema gates (`.min(1).max(4)`, strict enums, ranged dc/essence) voided whole responses on constraint-ignoring providers — softened to coerce-not-reject (`.catch`) with slicing caps and hand-declared TS types; AND minimax returned markdown because its provider claims structured-output support while ignoring `response_format` — `generateStructured` now does ONE corrective retry with the schema forced into the prompt, and its error message carries the model id + cause + a 180-char raw-response snippet.
3. **Scene images rendered without the scene** (bare wall instead of castle/rain/night) — **measured**: replayed the app's real ~120-token prompt and a ~40-token control on `wai-illustrious-sdxl`/NanoGPT; the long prompt lost its entire scene tail, the control rendered everything. NanoGPT truncates at the first 77-token CLIP window (recorded in `providerCapabilities.chunksLongPrompts`, alongside the earlier weighting measurement). Fix: provider-aware tag budget — `BOORU_MAX_TAGS_SINGLE_WINDOW` 36 with per-run identity cap 13 for single-window endpoints; local chunking backends (a1111/comfy/si-bridge) keep 60. The old 60-tag "fits the window" comment's arithmetic was simply wrong (~2 CLIP tokens per tag+comma, not 1.5 loose).
4. **Dagger rendered as a rifle** — the writer emitted `holding dagger, weapon`; with the scene truncated away, the generic `weapon` tag freewheeled into a firearm. Writer instruction: name held items specifically, never bare `weapon`. (Identity banks verified clean of weapon terms via DB query first.)
5. **NSFW image on a SFW scene** — the writer's rating instruction had no scene grounding and its dossier is full of arousal/body stats. `rating` and `action` describes now hard-scope to THIS beat: no act/nudity in scene intent + narrative beat ⇒ general/sensitive, no invented acts, regardless of stats or story rating.
6. **Camera/POV** — new `{{ povGuidance }}`: first/second/hybrid-person stories get protagonist-as-camera framing, third person gets observed-scene framing; template sync v10.
7. Suggestions preset baseline note: GLM 5.2 and minimax both hit the schema gates (2c) before the fixes; with the retry + soft schemas, either should work — re-verify next round.

## Open for next session (found late this round — classifier entity routing)

The classifier is misrouting entities across arrays, badly enough to muddy every world panel:
- **Characters** gained a quest ("Camping trip with Amelia") and a plot point ("Lady Elswyth's loaf").
- **Locations** gained the literal string "minutes" as CURRENT LOCATION (a time fragment landing in `currentLocationName`) and a full four-sentence event narrative as a location "name".
- **Inventory** holds locations and events, no items.
- **Story beats** carry no context.

Suspects, in likelihood order: (a) the classification-preset model mis-filling the arrays (model was swapped this round; a weaker structured-output model scrambles field routing even when parses succeed); (b) missing engine-side TYPE plausibility guards — nothing rejects a sentence-length location name, a "minutes" location, or a quest-shaped character at accept time; (c) interaction with the new tolerant bounds (classifier-bounds.ts) making scrambled output parse where it previously failed loudly. Fix shape: entity-accept validation (name length/shape caps per type, currentLocationName sanity, drop-with-log), classifier instruction sharpening, and a model-quality check on the classification preset. Chip spawned with full context.

## D5 knobs still uncalibrated (carry to round 2)

Chekhov cooldown/thresholds, rel pacing (~4× slower by design), world-sim gate frequencies, arousal-suppression threshold 70, single-window budget richness (36/13), narrative model memory quality (short-term-recall complaint from early round — likely provider/context config; engine windowing audited clean: 16k threshold, 10-message buffer).
