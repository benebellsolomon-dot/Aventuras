# research/52 — Harem-tab visual companion layer (V2d)

Written 2026-08-18. Start of the presentation/VN phase's harem-facing piece. Grounds in
`research/42` (VN mode), `research/37` Part III Spec 4 (V2 BE sprite engine), and the
existing `GirlStatusCard.svelte` / `SpriteService.ts` / `selectSprite()` machinery.

**Ben's rulings this session (2026-08-18):**
- **No separate mockups.** Mockups were discussed in a prior session but never saved to
  the repo. Ben's ruling: build from the existing spec + card, and capture the concrete
  layout decisions HERE so they're durable. (This doc IS the mockup of record.)
- **Scope = the harem-tab cards become visual.** NOT the fuller VN story stage (that is
  `VnView.svelte`, already a first cut of research/42 V1). This is the tighter, ship-now
  piece riding the existing sprite engine.

## Goal

Each present harem member's `GirlStatusCard` shows a **portrait/sprite reflecting her
current bust/body state**, alongside the BE stats the card already renders (tier/sizing,
bond, dependence, fluid fill, milk supply, quirks/conditions). The sprite is chosen by the
same deterministic `selectSprite(bodyState)` the VN stage uses, so the card, the prompt
block, and the VN stage never disagree about one girl.

## What already exists (build ON this, add nothing new server-side)

- `selectSprite(state) → { bandIndex, expression, engorged }` — pure, deterministic
  (`be/sprite.ts`). Engorged → landed-growth shock → arousal flush → attitude → neutral.
- `spriteAnchorService.ensureSprite(character, storyId, selection) → CharacterSprite | null`
  — cache-or-enqueue. Returns the cached complete cell; on a cold miss fire-and-forgets the
  whole band (5 cells, sequential ~30s each); returns `null` when no `spriteProfileId` is
  configured. `.subscribe(cb)` fires on cell completion.
- `VnView.svelte` — the reference consumer. Its `refreshSprite` + `spriteUrls`/`spriteCellKeys`
  crossfade pattern and fallback chain (current cell → last-known → `character.portrait` →
  placeholder) is copied here verbatim in spirit.
- `CharacterSprite.imageData` — matted data URL, ready to drop into `<img src>`.

This layer is **pure client-side view** — no new types, no DB, no persistence, no new
service. It only READS the existing sprite cache and triggers the existing generation the
same way the VN stage already does.

## Layout decisions (the mockup of record)

The card stays a compact glance surface (research/48 Step 9 — the full editor remains
`BeStatePanel` in Characters). Add a **portrait thumbnail on the left**, stats on the right:

- **Thumbnail:** vertical, ~56–64px wide, ~3:4, on the leading edge of the card. Rounded,
  `object-cover object-top` (the sprite is a bottom-anchored standee; the card wants the
  bust/face, so top-crop). Subtle ring/border matching card chrome.
- **Body-state reactivity:** thumbnail swaps as `selectSprite` changes — a tier crossing a
  band boundary, becoming engorged, a growth event, arousal flush, attitude shift. Crossfade
  on `cellKey` change (`{#key}` + fade), same as VnView, so lazy per-cell generation doesn't
  blank the card.
- **Fallback chain (identical to VnView):** current cell cutout → `character.portrait` →
  a placeholder tile (the existing `UserRound` icon on `bg-muted`). Never a broken `<img>`.
- **Stats column:** the existing card body (name button, sizing/tier, bond/dependence,
  fluid meter, milk meter, quirk/condition chips) moves into a flex column to the right of
  the thumbnail. No stat is removed; the fluid/milk meters stay full-width UNDER the
  thumbnail+header row so the meters keep their span.
- **Present-only:** only `present` girls get the full card (and thus a sprite). `absent`
  girls stay name rows (`HaremPanel`'s "Elsewhere" list) — no sprite work for them. This
  bounds generation to on-scene characters, matching VnView's MAX_STANDEES intent.

## Gates / guards

- **`beMode` gate:** `refreshSprite` no-ops unless `story.currentStory?.settings?.beMode === true`
  (same as VnView). Cards still render text stats; just no sprite fetch.
- **No sprite profile configured:** `ensureSprite` returns `null` → fall through to
  `character.portrait` → placeholder. The card is fully usable with zero image config.
- **No generation storm:** `ensureSprite` dedupes on the cache and only enqueues on a real
  miss; each present card triggers at most its own band. Acceptable and identical to the
  VN stage's behavior for the same on-scene set.

## Steps

1. **`GirlStatusCard.svelte`** — add the sprite state (`spriteUrl`, `spriteCellKey`),
   `refreshSprite()` (beMode-gated; `readBodyState` is already available via the passed
   `state` prop — use it directly), an `$effect` to refresh on state change, and a
   `subscribe` `$effect` for completion pushes. Restructure the markup into
   thumbnail + stats. `storyId` from `story.currentStory?.id`.
2. **Verify** — `npx vitest run` (678 green — sprite selection tests unchanged),
   `npm run check` (0), `npx eslint .` (clean). Visual: run the app, open Harem tab on a
   BE story with a configured sprite profile, confirm the thumbnail renders and swaps on a
   growth/engorge event; and on a story WITHOUT a sprite profile, confirm graceful
   portrait/placeholder fallback.

## Out of scope (deferred)

- The full VN story stage (background + positioned sprites + textbox) — that's `VnView`,
  research/42 V1, a separate track.
- Absent-girl thumbnails, hover-to-enlarge, tap-to-open-VN — later polish if Ben wants.
- Any change to the sprite engine, matting, anchor flow, or generation cadence.
