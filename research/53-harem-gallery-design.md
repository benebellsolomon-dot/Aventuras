# research/53 — Harem-tab visual gallery design (presentation phase)

Written 2026-08-18. Approved design from a brainstorm session with Ben. Evolves the
shipped V2d card (`research/52`) into the intended fuller harem tab. **Mockup of record:**
`research/mockups/53-harem-gallery-v2.html` (open in a browser — the approved v2 layout).

## What this is

The harem tab becomes a **hybrid gallery**: compact roster rows by default, each girl
**expands in place** into a full portrait card. Roster-glance and admire-the-collection in
one surface. This is the presentation-phase centerpiece; it sits on the existing sprite
engine and BE measurement functions — no new engine work.

## Approved decisions (from the brainstorm)

1. **Hybrid expand/collapse.** Present girls render as collapsed rows; clicking a row
   expands it into the full card (portrait + measurements + stats). Independent toggles —
   more than one may be open. None expanded by default (tap to open).
2. **Cup size + measurements are the headline. Tier is demoted to faint background.** Ben's
   ruling: tier is bookkeeping; what matters at a glance is her cup letter and her
   bust/body measurements. Tier appears only as a small muted tag.
3. **Every girl with body state renders as a visual row — always. Presence is a badge +
   sort, not a gate.** *(Revised 2026-08-18 after diagnosing the V2d "card doesn't render"
   bug — see below.)* All non-self characters with body state show as collapsed visual
   roster rows (thumbnail + cup + measurements), sorted **present-first**, with an "in
   scene" badge on those the classifier reports present. Any girl can expand. No girl is
   demoted to a name-only row on account of scene absence.

### Why (root cause of the shipped-but-invisible V2d card)

The shipped V2d `HaremPanel` gated the *visual card* on scene-presence: present girls got
`GirlStatusCard`, everyone else got a one-line "Elsewhere" text row. In the live story
(`c5cee28d` "Amelia of Evermere", `beMode` on, Amelia + Elara both with body state) the
latest entries carry `classificationResult.scene.presentCharacterNames = []` — the scene
classifier under-populates present-names (same silent-classifier class as the Suggestions
model saga; worth a Debug-Mode look, tracked separately). Result: both girls fell to the
text rows and **no visual card ever rendered**. Making presence a badge instead of a gate
removes this fragility entirely — the tab shows the roster regardless of classifier state.
4. **Portraits reuse the V2d sprite pipeline** — `selectSprite(bodyState)` →
   `spriteAnchorService.ensureSprite` → fallback chain (current cell → `character.portrait`
   → placeholder), beMode-gated, `{#key}` crossfade. Collapsed thumbnail and expanded
   portrait use the same source at different sizes.

## Data — every field maps to an existing engine function (nothing invented)

From `$lib/services/be` (all pure, already unit-tested):

| Shown | Source |
|---|---|
| Cup letter (`L-cup`) — the hero | `cupLetter(state.tier)` / `sizingString(state.tier)` |
| Size comparison (`beachball-heavy`) | `comparative(state.tier)` |
| B·W·H (`118 · 81 · 94 cm`) | `bwhCmString(state)` |
| bust / band / mass / hang | `measurements(state)` → `bustCm`, `bandCm`, `nowTotalKg`, `droopCm` |
| weight-feel, breast-mass %, total body kg, capacity L | `measurements(state)` (available; opt-in — see open call) |
| fullness firmness (`firm`) | `fluidPressureLabel(state.fluids.fillPercent)` |
| milk volume (`2.1 / 2.6 L`) | `measurements(state)` → `fillMlTotal` / `capacityTotalMl` |
| bond stance + value | `bondStance(bondOf(state))`, `bondOf(state)` |
| dependence stage + value | `dependenceStage(dependenceOf(state))`, `dependenceOf(state)` |
| expression / engorged badges | `selectSprite(state)` + `isEngorged(state)` |
| quirk / condition chips | `readQuirks`, `QUIRK_BY_ID`, `state.conditions` |
| grew-this-turn flag | `state.lastGrowth` (with `cupLetter(before)→cupLetter(now)`) |
| tier tag (faint) | `state.tier` |

## Layout (per the approved mockup)

**Collapsed row** — thumbnail (40×52, sprite/portrait/placeholder) · name · faint `tier N`
tag · a glance line `cup · bust cm · mass kg` · one bond chip (+ a condition chip like
`lactating` when relevant) · chevron. Bust/mass is the primary line; tier is tiny.

**Expanded card** — portrait on the left (~152px, 3:4, with expression + engorged state
overlaid bottom-left and the faint tier tag top-right); right column:
- name + attitude (italic)
- **size block** (inset panel): large cup letter + `comparative()`, then a 2-col
  measurement grid (bust / band / mass / hang) and a full-width B·W·H row
- stat meters: bond, dependence, fullness (`% · firmness`), milk (`L / L`)
- footer: quirk/condition chips + a `▲ grew this turn` flag

**Presence** — present girls sort first and carry a small "in scene" badge (a heart/dot in
the row). Absent girls render as the SAME visual collapsed row, just without the badge and
sorted after. No separate name-only "Elsewhere" list. (A subtle divider or dimming between
the present and absent groups is fine, but both are full visual rows.)

Turn log (`TurnLogList`) stays below the roster, unchanged.

## Component structure

Keep files small and cohesive (each ≤ ~150 lines):

- **`HaremPanel.svelte`** (exists) — owns the present-first sort and the expanded-id set
  (`Set<string>` of open girls); renders every body-state girl as a `HaremGirlRow`
  (collapsed) or `GirlStatusCard` (expanded) + `TurnLogList`. No name-only rows.
- **`HaremGirlRow.svelte`** (new) — the collapsed roster row; emits an expand toggle.
- **`GirlStatusCard.svelte`** (evolve the shipped V2d card) — the expanded card: portrait +
  size block + meters + footer.
- **`SizeBlock.svelte`** (new) — the cup + measurements presentational block, fed
  `state: BodyState`; calls the be measurement/label functions. Reused nowhere else yet,
  but extracted so the card stays lean and the measurement formatting lives in one place.
- **`girlSprite.svelte.ts`** (new helper) — the sprite refresh/subscribe logic (currently
  inline in the V2d card and duplicated conceptually in VnView). A small rune-based helper
  returning `{ url, cellKey }` given `(character, bodyState)`, so both the row thumbnail and
  the expanded portrait share one implementation instead of copy-pasting the effect.

## Open calls to confirm before/at implementation (non-blocking — sensible defaults chosen)

- **Which extra measurements in the expanded block?** Default set: bust / band / mass /
  hang / B·W·H. The engine also has weight-feel label, breast-mass % of body, total body
  weight, capacity in L. Default: keep the five; add weight-feel as a subtle caption under
  mass. (Ben: "looks good for now" — treated as approval of the five-field default.)
- **Collapsed glance line** = `cup · bust · mass`. Default kept.
- **Default expansion state** = all collapsed. (Alternative: auto-expand the scene-focus
  girl. Deferred — start collapsed.)

## Out of scope (this iteration)

- The full VN story stage (background + positioned sprites + textbox) — separate track
  (`research/42` V1, `VnView.svelte`).
- Absent-girl portraits/expansion, hover-to-zoom, tap-to-open-in-VN, animated growth media.
- Any change to the sprite engine, matting, measurement curves, or generation cadence.

## Verify

`npx vitest run` (measurement/label formatters already covered), `npm run check` (0),
`npx eslint .`. Visual: Harem tab on a BE story — collapsed rows show cup·bust·mass, a row
expands into the full portrait + size block, absent girls list with cup letters; graceful
fallback with no sprite profile configured.
