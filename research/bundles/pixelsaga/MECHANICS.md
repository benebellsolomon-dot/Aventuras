# pixelsaga — extracted mechanics reference

Source: full generator code provided by Ben 2026-07-19 (perchance.org/pixelsaga, "Mazohyst's
PixelSaga"). This file is the load-bearing distillation; the verbatim source lives in the
session transcript of the VN-mode research session. Analysis in research/42.

## Stack

`ai-text-plugin` (streamed, `onChunk` with `fullTextSoFar`) + `text-to-image-plugin`
(**`removeBackground: true`** for character sprites — plugin-side matting is their
transparency answer) + `kv-plugin` (saves, gallery). All state client-side JS.

## The narrator turn format (their speaker-attribution solution)

One LLM call per turn emits a machine-parseable structured response:

```
[TIME: Morning|Afternoon|Evening|Night]        (sandbox mode only)
[SCENE: Name1, Name2]                          present NPCs ('none' if alone)
[MENTIONS: Name3]                              referenced-but-absent NPCs
OUTFIT[Name]: <new outfit w/ colors>           only when an outfit changed
ITEM[Name]: <desc>                             sandbox item pickups
NARR: <1-3 sentences narration>
DIALOG[Name]: <line>
NARR: ...
>>> choice one            (sandbox variants: "[DEX:5]" stat-check, "[STR+]" training)
>>> choice two
>>> choice three
```

Regex-parsed (`parseStoryResponse`) into typed segments; malformed lines fall through
into the current segment's text. Choices parsed off `\n>>> `.

## Display loop (ADV click-through with streaming hold-back)

- Segments display ONE at a time (dialogue box w/ nameplate, or narration box), click /
  ▼ to advance. During streaming, `streamProcessText` finalizes a segment as soon as
  the NEXT header appears (last partial segment held back); if the reader has caught
  up, new segments auto-show. Choices appear only after final.
- Sprites: bottom-aligned overlays inside the viewport (1 char: 50% width, 2: 42%,
  3+: 35%), `speaking` class = scale 1.03 + glow, `dimmed` = brightness 0.6 / opacity
  0.5 — re-applied per dialogue segment from `DIALOG[Name]`.
- Generating characters render as an in-slot spinner standee placeholder.

## Character pipeline

1. Traits ROLLED from static lists (hair/eyes/body/personality/distinctive feature +
   **bustSize for every female** — injected verbatim into every sprite prompt) →
   LLM builds a JSON bio around them ("use EXACTLY") → sprite prompt assembled
   deterministically from the structured bio fields + a fixed style block.
   Consistency mechanism = verbatim structured-prompt reuse only (no img2img/seed/LoRA).
2. Characters introduced mid-story ([SCENE]/[MENTIONS] name not yet known): a
   dedicated EXTRACTION prompt pulls appearance/outfit/species/race from the story
   text first ("story takes priority", force-overrides after generation), then the
   bio call. Generation deferred until the scene finishes streaming so the extractor
   sees the full narration.
3. **State-keyed sprite cache** (the direct precedent for our banded cache): three
   undress stages (partial/underwear/nude) pre-generated per character by a background
   queue right after creation; `matchOutfitToStage()` regexes the OUTFIT text to a
   stage key; swap is instant on cache hit, async-generate on miss; cache invalidated
   wholesale when the bio/appearance is edited.

## Backgrounds / memory / chrome

- Dynamic bg: LLM writes a location description from the last ~3 segments, skipped if
  identical to the previous prompt (diff-based), image preloaded then swapped.
- Memory: token-count-triggered compaction (`countTokens` vs `idealMaxContextTokens ×
  0.85`) folds the oldest storyLog entries into a running summary.
- Chrome: lore drawer (user-added canon facts injected as "ESTABLISHED FACTS"),
  save/load via kv, gallery keyed per character, char-edit modal with regen,
  scene-image generator (POV style, orientation picker, prompt editor + regen).

## What Aventuras already does better

Presence/location via a separate classifier (persisted per-entry, no format
brittleness) · outfit/appearance via classifier `replaceVisualDescriptors` · memory
via chapters/retrieval · lorebook · branching/undo · a deterministic body ENGINE where
pixelsaga has a static rolled bustSize string.

## What to adopt (fed into research/42)

The NARR/DIALOG segment grammar as the VN dialogue-format template · click-through ADV
pacing with streaming hold-back · speaking/dimmed sprite highlighting · the
state-keyed sprite cache policy (instant-swap-or-generate-on-miss, pre-gen queue,
wholesale invalidation on appearance change) · in-slot generating placeholders ·
plugin-side background removal as the transparency precedent.
