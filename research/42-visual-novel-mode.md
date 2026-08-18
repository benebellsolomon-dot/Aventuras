# 42 — Visual Novel mode for Aventuras (research + recommended architecture)

**Date:** 2026-07-19 · **Basis:** three parallel research passes (AI-VN landscape /
Aventuras integration surface / BE-specific sprite design) commissioned by Ben's ask:
"a Visual Novel mode similar to perchance.org/pixelsaga, tailored for BE stories."
This doc is the synthesis; it is self-contained.

**Status:** FOLDED INTO THE ACTIVE PLAN — research/37 Part III (added 2026-07-19)
carries the build phases (V1–V4 + the RPG-layer brief R) and the live ordering; this
doc remains the architecture/rationale source.

## Executive summary

- **VN mode should be a client-side presentation layer, not a new story mode** — a new
  `ActivePanel` screen composing over the existing generation pipeline. The BE engine's
  deterministic state (`bandIndex(tier)`, arousal, attitude, fill, `lastGrowth`,
  present characters, location) is exactly the signal set a VN renderer needs, and it
  already persists per-entry.
- **The field's consensus on AI-VN images**: never generate sprites per turn (30-60s
  latency + identity drift). Pre-generate cached sprite sets, swap client-side
  deterministically, reserve live generation for backgrounds and occasional event CGs
  behind skeleton placeholders. Our band ladder makes the cache tractable: 7 size
  bands × 3 expression clusters + 1 engorged variant ≈ 28 cells/character, generated
  lazily on first band entry.
- **A surprising amount is already built**: the background pipeline is literally
  VN-authored (its prompt opens "You are a Visual Director AI for a visual novel
  game" and reserves negative space for dialogue boxes and sprites); portraits are
  already standee-framed ("full body, facing viewer, plain background"); ActionChoices
  is already a typed, keyboard-navigable 4-choice VN menu; per-entry scene state
  (present characters, location) is durably stored in `world_state_delta`.
- **v1 is nearly free** (a weekend-scale slice): new VN panel + sharp `currentBgImage`
  + present-character portraits as standees + textbox bound to the existing streaming
  content + the unmodified ActionChoices. Zero generation changes.
- **The real build (v2+) is downstream of Spec 2** (the si-bridge native provider,
  research/37): FaceID identity anchors, banded sprite sets, and `/animate/growth`
  event clips all need the bridge's native `/image` path the current A1111 shim can't
  reach. **The #1 blocking decision is transparency** — the bridge has no
  transparent-sprite output today (verified: no matting node in any preset).

## 1. Landscape lessons (what to copy, what to avoid)

**pixelsaga — now fully verified** (Ben provided the complete generator source
2026-07-19; mechanics distilled in `bundles/pixelsaga/MECHANICS.md`). The load-bearing
observations, superseding the earlier triangulation:

1. **Speaker attribution is solved with a structured narrator format** — the single
   LLM call emits `[SCENE: names]` / `[MENTIONS: names]` / `OUTFIT[Name]: …` /
   alternating `NARR:` + `DIALOG[Name]:` blocks / `>>> choice` lines, regex-parsed
   into typed segments. This is a working, proven template for our
   `VN_DIALOGUE_INSTRUCTIONS` — the piece we'd flagged as zero-precedent.
2. **Transparency is plugin-side matting** — sprites are generated with
   `removeBackground: true`. Background removal as a generation-service feature is
   the industry-normal answer; this strengthens Open Decision #1 option (a) (a
   matting node on the bridge) as the standard path.
3. **A state-keyed sprite cache is exactly their architecture too** — three undress
   stages pre-generated per character by a background queue, a regex state-matcher
   picking the cache key from the narrator's OUTFIT text, instant swap on hit /
   async generate on miss, wholesale invalidation on appearance edit. Our banded
   sprite-set design is the same machine with a better key (deterministic
   `bandIndex(tier)` from the engine instead of regexing prose).
4. **Display loop worth copying**: ADV click-through — one segment at a time with a
   nameplate box, segments finalized incrementally DURING streaming (the partial
   last segment held back; auto-advance if the reader has caught up), choices only
   after finalization. Plus `speaking` (scale+glow) / `dimmed` (darkened) sprite
   classes re-applied per dialogue segment, and in-slot spinner standees for
   still-generating characters.
5. **Their consistency ceiling is low**: character identity rides nothing but
   verbatim reuse of a structured prompt assembled from a JSON bio (no img2img, no
   seed pinning, no LoRA). Notably for BE: every female character carries a static
   rolled `bustSize` injected into every sprite prompt — a frozen version of what
   our engine makes dynamic. Aventuras with FaceID anchors + the tier ladder
   exceeds this on every axis.
6. Their presence tracking makes the NARRATOR declare `[SCENE:]` inline; Aventuras'
   separate classifier (persisted per-entry) is architecturally cleaner and already
   built. Same for their token-count summary compaction (we have chapters/memory),
   lore drawer (lorebook), and story-priority appearance extraction (classifier
   visualDescriptors).

**SillyTavern VN mode** (Ben's prior era) is the reference implementation and its
failure modes are our design checklist:
1. Incomplete expression sets fall back to neutral-face at exactly the beats that
   matter → we generate the full (small) cluster set per band, lazily but atomically.
2. Non-uniform sprite framing makes characters jump/resize on every swap → one
   framing contract per sprite set (shared anchor + seed + conditioning; independent
   panels, never one crowded batch — crowded reference sheets drift).
3. Group-chat sprite bugs / no multi-card scenes → our stage composes solo sprites
   client-side from `presentCharacterNames` (z-index by recency), and multi-character
   *interaction* art goes through the bridge's `regional:true` as event CGs — two
   mechanisms, kept distinct.
- The community's Prome VN extension (speaker focus/defocus, letterbox, sprite-shake,
  one-message-at-a-time) is a feature mine for later polish.
- Sprite-consistency prior art: ComfyUI VNCCS (character-profile → pose × expression
  × outfit sprite trees, transparent exports); LoRA-per-character (~95% likeness) vs
  img2img anchoring at denoise 0.3-0.5 (cheap, good enough per session). Our Spec 2
  B1 FaceID anchor is the same idea, server-side.

**Minimum "reads as a VN" grammar** (Ren'Py conventions): background + positioned
sprite(s) + ADV textbox with nameplate + a choice/continue affordance + typewriter
reveal (cheap, high signal). Skippable: NVL mode, elaborate enter/exit choreography,
backlog (the feed IS the backlog). Treat CG event art cautiously — it's where AI
identity-consistency bites hardest; CGs must ride the same anchored pipeline as
sprites, never fresh unanchored generations.

## 2. The Aventuras surface (what exists / what's new)

**Reusable as-is** (verified with file/line specifics by the surface pass):
- Screen-swap seam: `AppShell.svelte`'s `activePanel` switch (`'gallery'` is the
  precedent for a full-canvas non-feed panel). NOT `visualProseMode` (that's a
  prompt-format flag, same feed layout).
- Backgrounds: `background_images` (one current row per story×branch) +
  `story.currentBgImage` reactive binding + the VN-authored Visual-Director analysis
  template running every turn. Render sharp (bypass `backgroundBlur`) and it's a VN
  background layer today.
- Choices: `ActionChoices.svelte` — numbered, typed (action/dialogue/examine/move
  with icons), digit-key bindings, feeds `ActionInput` as prefilled text. Unmodified.
- Streaming: `ui.streamingContent` is format-agnostic; a VN textbox binds to it.
- Scene state: `entry.worldStateDelta.classificationResult.scene` gives
  presentCharacterNames + currentLocationName per entry, durably (stateTracking
  defaults ON). Caveats: player character must be OR'd in via `relationship==='self'`
  (every consumer replicates this); classifier failure yields an empty list — the
  renderer must tolerate stale presence.
- Portraits: standee-framed by design, three generation triggers + upload,
  `referenceMode` img2img plumbing exists. Gap: they never render in the feed today,
  and backgrounds are opaque gradients (no alpha).

**Must build new:**
- The VN panel components (background/sprite-stage/textbox/nameplate layers).
- **Speaker attribution** — prose has NO structured dialogue markup today (the
  colored spans are visualProseMode free-form, model's choice, not a speaker map).
  v1 ships plain narration in the textbox; v2 adds a `VN_DIALOGUE_INSTRUCTIONS`
  block (same pattern as INLINE_IMAGE_INSTRUCTIONS) + a tolerant parser —
  **template now proven**: pixelsaga's `NARR:` / `DIALOG[Name]:` grammar (§1),
  adapted so the plain feed view can strip the tags and the drift detectors still
  see the character names (DIALOG[Lucy] preserves attribution windows).
- `vnMode` toggle: per-story StorySettings flag (the beMode 8-file wiring template) or
  even simpler, a per-UI view toggle (recommended: **view toggle**, composes with both
  story modes and needs no generation fork).
- A centralized reactive "images for current entry" accessor (each StoryEntry
  currently queries its own).
- **Pipeline wall to resolve at v2**: inline `<pic>` images and background generation
  are mutually exclusive today (`BackgroundImagePhase.ts:69` skips bg when
  imageGenerationMode==='inline'); a VN turn wants both.

## 3. The BE-specific design (the differentiator)

No generic AI-VN has a deterministic body engine driving its sprites. Ours does:

- **Sprite strategy**: lazily-generated banded sprite sets per character —
  `bandIndex(tier)` (7 bands: flat/small/medium/large/huge/gigantic/hyper) ×
  3 expression clusters + 1 engorged variant, FaceID-anchored via the Spec 2 B1
  extension point, cached in a new `character_sprites` table
  (`character_id, appearance_hash, band_index, expression, engorged, status`) with
  the `background_images` CRUD/GC pattern. Generate a band's cells on first entry
  into that band (~30s/render ⇒ ~2 min/band, amortized across play); WEBP to keep
  SQLite sane. Selection is a pure `bodyState → (band, cluster, engorged)` function —
  testable, deterministic, no classifier needed (attitude+arousal already exist).
- **Expression cut** (avoiding the ST 28-emotion trap): clusters =
  positive/eager (craving, accepting) · neutral (conflicted/none) · distressed
  (fearful, resentful); arousal ≥ 70 overrides to flushed; fill shows only as the
  engorged variant at ≥ 75% (matches the existing imageStateCues threshold, so prose
  and sprite agree). Conditions stay prose-only. Scripted override hook: a growth
  land forces the shock/distressed cluster for that beat.
- **Growth moments, two tiers**:
  - *Band-crossing sprite transition* (cheap, always-on): `bandIndex` changed →
    crossfade to the new band's sprite (`{#key}` + svelte crossfade). The honest floor.
  - */animate/growth event clip* (expensive, gated): only on `lastGrowth.delta ≥ 2`,
    milestone crossings, or the SURGING two-beat — fire-and-forget with the
    embedded_images status/retry pattern, "[growth clip generating]" badge, static
    swap already on screen as the fallback. Needs MP4 filesystem storage + a <video>
    surface (largest new piece; defer to v4).
- **Stage vs CG**: solo transparent sprites composited client-side are the stage;
  `regional:true` multi-character frames and `<pic>` inline images are event CGs
  (full-bleed overlay render in VN mode).
- **Backgrounds**: keep the diff-based Visual Director, add a location-keyed cache
  (`currentLocationName` → cached bg) so revisits don't regenerate.

## 4. Phased roadmap

| Phase | Content | Effort | Depends on |
|---|---|---|---|
| **v0** | Spec 2 si-bridge native provider (already planned as research/37 Phase 4) — unlocks illustrious tier ladder, FaceID, regional, /animate | M-L | bridge reachable |
| **v1** | VN panel MVP: activePanel screen, sharp bg, present-character portrait standees w/ speaking/dimmed highlighting + in-slot generating placeholders, ADV click-through textbox with streaming segment hold-back (pixelsaga display loop), ActionChoices as-is, typewriter | S | nothing — ship now |
| **v2** | Banded sprite sets: anchor governance, `character_sprites` cache, lazy batch gen, selection function, crossfade swaps; speaker-tagged textbox; resolve inline-vs-bg exclusivity | M-L | v0 + transparency ruling |
| **v3** | Multi-character stage (compositing, z-order), regional interaction CGs, location-keyed bg cache | M | v2 |
| **v4** | Growth polish: band-crossing transitions (pull earlier if cheap) + gated /animate/growth clips + MP4 surface | L | v2 |

## 5. Open decisions (Ben rules)

1. **Transparency — ✅ RULED (Ben, 2026-07-19): app-side background removal,
   option (b).** Rationale fit: client-side matting works for ANY sprite provider
   (NanoGPT / OpenRouter image models included), matching the provider-agnostic
   ruling — the bridge-side matting node (a) would have covered si-bridge only.
   *Implementation reconciliation (research, same day): NATIVE Rust — `ort` crate
   + isnet-anime.onnx (Apache-2.0, anime-purpose-built) behind one Tauri command
   doing matte+resize+WEBP; WKWebView WASM disqualified (ORT-web WebGPU memory bug
   on WebKit 26, ~20s CPU timings, large-allocation kills); RMBG license-banned.
   Model is an optional bundle resource — absent → pass-through (opaque sprites).*
2. **tier_index calibration — ✅ RESOLVED (2026-07-19, P3): identity mapping.** All
   three ladders agree at every band boundary (full-table source verification against
   deployed-truth GitHub main; the dry-run 401s from the Mac — keyed curl in
   research/37 Spec 2 §Shipped for a later confirmation probe).
3. **Anchor source — ✅ RULED (Ben, 2026-07-19): dedicated approved anchor render.**
   A neutral-pose per-character anchor image, generated once and explicitly approved,
   stored beside the portrait — NOT portrait reuse. V2 scope gains a small approval
   flow (generate → approve/regenerate) + an anchor asset per character; re-anchor
   policy on appearance change comes with the approval flow by construction.
   *Follow-up rulings (same day): anchor renders at the character's SEED tier (the
   "at rest" look — play grows upward from seed), and the cell space is 35 (a
   dedicated `flushed` arousal cluster joins positive/neutral/distressed + engorged;
   arousal is first-class in this genre). Full spec: research/37 Part II Spec 4.*
4. **vnMode scope**: UI view toggle (recommended) vs per-story setting vs third
   StoryMode (rejected — forks generation).
5. **Growth-clip scope**: every band crossing vs delta≥2/milestones only; MP4 storage
   commitment; or defer clips entirely and ship transitions.
6. **Sprite trigger**: lazy per-band (recommended) vs eager full-set at creation, with
   an optional pre-warm action in the character panel.
7. **Speaker attribution format** (v2): structured dialogue tags in narrator output —
   design the tag grammar so the drift detectors and the plain feed view stay happy.

## Provenance

Synthesized from three agent research passes (2026-07-19): web landscape (Perchance
plugin docs, SillyTavern VN/expressions docs + issue tracker, Prome extension, VNCCS,
Ren'Py docs — URLs preserved in the session transcript), a read-only Aventuras
codebase map (file:line specifics inline above), and a BE-sprite design pass over the
engine + research/32/37 + the si-bridge INTEGRATION contract. §1's pixelsaga analysis
was upgraded from triangulation to OBSERVED after Ben provided the complete generator
source (same day); the distilled mechanics live in `bundles/pixelsaga/MECHANICS.md`.
