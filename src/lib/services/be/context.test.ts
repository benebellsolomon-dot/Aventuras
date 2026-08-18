// ---- Phase 2 (research/48 Step 6): [HAREM STATE] ----
import { describe, expect, it } from 'vitest'

import { buildBeStateBlock, buildHaremStateBlock, HAREM_STATE_HEADER } from './context'
import { defaultBodyState as freshState } from './metadata'
import type { BodyState } from './types'

describe('buildHaremStateBlock', () => {
  it('empty string when no entry carries a track field (Phase-1 saves)', () => {
    expect(buildHaremStateBlock([{ name: 'Mira', state: freshState(6) }])).toBe('')
  })

  it('header is the exact stable string; stances and quirk blurbs render', () => {
    const block = buildHaremStateBlock([
      {
        name: 'Mira',
        state: { ...freshState(9), bond: 75, dependence: 62, quirks: ['proud'] },
      },
    ])
    expect(block.startsWith(`${HAREM_STATE_HEADER}\n`)).toBe(true)
    expect(HAREM_STATE_HEADER).toBe('[HAREM STATE — canonical and authoritative]')
    expect(block).toContain('bond: deeply bonded')
    expect(block).toContain('dependence: craving')
    expect(block).toContain('proud (reason will not move her; desire might)')
    expect(block).toContain('does not become devoted because the scene wants her to')
  })

  it('[BODY STATE] header text is untouched (cache-prefix guard)', () => {
    const body = buildBeStateBlock([{ name: 'Mira', state: freshState(6) }])
    expect(body.startsWith('[BODY STATE — canonical and authoritative]')).toBe(true)
  })

  it('lactating girls append a milk stance phrase; others do not', () => {
    const block = buildHaremStateBlock([
      {
        name: 'Mira',
        state: { ...freshState(20), bond: 50, lactation: { active: true, supplyTier: 2 } },
      },
      { name: 'Lucy', state: { ...freshState(20), bond: 50 } },
    ])
    expect(block).toContain('milk: heavy')
    expect(block.split('\n').find((l) => l.startsWith('Lucy —'))).not.toContain('milk:')
  })

  it('a lactating girl with no other track field still renders (Phase-3 only save)', () => {
    const block = buildHaremStateBlock([
      { name: 'Mira', state: { ...freshState(20), lactation: { active: true, supplyTier: 0 } } },
    ])
    expect(block).toContain('milk: light')
  })
})

// ---- Phase 3 (research/49 Step 6): lactation prompt lines ----

const lactating = (over: Partial<BodyState> = {}): BodyState => ({
  ...freshState(20),
  lactation: { active: true, supplyTier: 1 },
  ...over,
})

describe('buildBeStateBlock — lactation lines (research/49 R11)', () => {
  it('renders the supply label only while active', () => {
    expect(buildBeStateBlock([{ name: 'Mira', state: lactating() }])).toContain(
      'Lactation: active — steady supply',
    )
    expect(
      buildBeStateBlock([
        { name: 'Mira', state: lactating({ lactation: { active: false, supplyTier: 3 } }) },
      ]),
    ).not.toContain('Lactation:')
  })

  it('every supply band renders its own word', () => {
    const words = [0, 1, 2, 3].map((supplyTier) =>
      buildBeStateBlock([
        { name: 'Mira', state: lactating({ lactation: { active: true, supplyTier } }) },
      ]),
    )
    expect(words[0]).toContain('light supply')
    expect(words[1]).toContain('steady supply')
    expect(words[2]).toContain('heavy supply')
    expect(words[3]).toContain('torrential supply')
  })

  it('the engorgement swell line appears only while Engorged, and scales with pressure_prone', () => {
    const calm = buildBeStateBlock([
      {
        name: 'Mira',
        state: lactating({ fluids: { fillPercent: 70, fluidType: 'milk' } }),
      },
    ])
    expect(calm).not.toContain('Engorgement swell')

    const swollen = buildBeStateBlock([
      {
        name: 'Mira',
        state: lactating({ fluids: { fillPercent: 80, fluidType: 'milk' } }),
      },
    ])
    expect(swollen).toContain('Engorgement swell: she presently looks a full cup larger')
    expect(swollen).toContain('do not treat as growth')

    // pressure_prone engorges at 60 and swells two cups.
    const prone = buildBeStateBlock([
      {
        name: 'Mira',
        state: lactating({
          quirks: ['pressure_prone'],
          fluids: { fillPercent: 65, fluidType: 'milk' },
        }),
      },
    ])
    expect(prone).toContain('two full cups larger')
  })
})

describe('[BODY STATE] byte-identity for a non-lactating, non-engorged girl (Phase-3 cache guard)', () => {
  it('renders exactly the pre-Phase-3 string at fill 40 (below the engorge threshold)', () => {
    const state: BodyState = {
      ...freshState(20),
      fluids: { fillPercent: 40, fluidType: 'milk' },
      arousal: 55,
      conditions: [{ label: 'Tender' }],
      baseline: { waistCm: 81, hipsCm: 94, build: 'average', heightCm: 168 },
    }
    expect(buildBeStateBlock([{ name: 'Mira', state }])).toBe(
      `[BODY STATE — canonical and authoritative]
The following body states are engine-tracked ground truth. Prose must respect them exactly: sizes, measurements, mass, posture, mobility and clothing reality. All measurements are metric (cm/kg/L) — use these exact numbers, never invent different ones. The cup letter is her size-identity (volume-anchored, the same for every shape); the bust cm is the shape-adjusted tape measurement — firm and gravity-defying shapes tape larger than the letter alone implies, and that is correct, not a contradiction. Bust size changes ONLY when a growth directive in this block says it changed — never invent growth, shrinkage, or ambient size drift. If world lore, story rules, or character text describe growth timing, cause, speed, or limits differently, THIS BLOCK WINS — lore supplies flavor and mechanism; this block alone decides when growth happens and how much.
Mira — M-cup (tier 20), large breasts.
  Measurements: 121-81-94 cm (bust auto-derived from her current size).
  Size: as wide as both her hands pressed together, each a swollen, heavy weight that is a constant presence on her frame
  Carried mass: ~4.2 kg of breast tissue — heavy enough to ache when unsupported — a noticeable presence on her frame.
  Body weight: ~63 kg total (~58 kg frame + ~4.9 kg breast).
  Next size milestone (NOT yet true — only if she grows another ~1.1 kg): cannot reach past them to touch her toes.
  Shape: natural — heavy and settled, their weight drawing them into a low, soft hang — their lowest curve resting against her upper belly (~13 cm of hang).
  Posture: profound permanent arch; mobility: significantly encumbered; clothing: custom only.
  milk fullness: 40% (~0.7 L of ~1.8 L capacity) — skin soft, supple, and fully accommodated to her size, swollen to ~4.9 kg with milk.
  Active conditions: Tender.
  Mood: arousal 55/100.`,
    )
  })

  it('is NOT byte-identical once she is Engorged — the swell line is fill-gated by design (R6)', () => {
    // Intended behavior, not a cache regression: the engorgement swell applies
    // to any girl at her threshold, lactating or not, so the block gains a line
    // at fill 80 that the pre-Phase-3 string never had.
    const base: BodyState = {
      ...freshState(20),
      fluids: { fillPercent: 40, fluidType: 'milk' },
      arousal: 55,
      conditions: [{ label: 'Tender' }],
      baseline: { waistCm: 81, hipsCm: 94, build: 'average', heightCm: 168 },
    }
    const calm = buildBeStateBlock([{ name: 'Mira', state: base }])
    const swollen = buildBeStateBlock([
      { name: 'Mira', state: { ...base, fluids: { fillPercent: 80, fluidType: 'milk' } } },
    ])
    expect(calm).not.toContain('Engorgement swell')
    expect(swollen).toContain(
      'Engorgement swell: she presently looks a full cup larger than her letter',
    )
    expect(swollen).toContain('do not treat as growth')
    expect(swollen).not.toContain('Lactation:')
  })
})
