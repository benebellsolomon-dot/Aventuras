/** Tests for the Phase-A wiring surface: schema extension, context block, sniff, grounding. */
import { describe, expect, test } from 'vitest'
import { classificationResultSchema } from '../ai/sdk/schemas/classifier'
import { buildBeStateBlock } from './context'
import { groundImagePromptSize, sniffTierFromText } from './ladder'
import {
  defaultBodyState,
  maxBodyStateTier,
  uniformBodyStateTier,
  writeBodyState,
} from './metadata'
import {
  MAX_BE_EVENTS_PER_TURN,
  beEventsFromResult,
  beSoftStatesFromResult,
  extendClassificationSchemaWithBeEvents,
} from './schema'
import type { BodyState } from './types'

describe('classifier schema extension', () => {
  test('extends the base schema and validates beEvents', () => {
    const schema = extendClassificationSchemaWithBeEvents(classificationResultSchema)
    const parsed = schema.safeParse({
      entryUpdates: {},
      scene: {},
      beEvents: [{ character: 'Lucy', kind: 'catalyst', intensity: 2 }],
    })
    expect(parsed.success).toBe(true)
    const value = parsed.success ? (parsed.data as Record<string, unknown>) : {}
    expect(value.beEvents).toEqual([{ character: 'Lucy', kind: 'catalyst', intensity: 2 }])
  })

  test('defaults beEvents to empty when the model omits it', () => {
    const schema = extendClassificationSchemaWithBeEvents(classificationResultSchema)
    const parsed = schema.safeParse({ entryUpdates: {}, scene: {} })
    expect(parsed.success).toBe(true)
    expect((parsed.success ? (parsed.data as Record<string, unknown>) : {}).beEvents).toEqual([])
  })

  test('rejects unknown event kinds at the schema boundary', () => {
    const schema = extendClassificationSchemaWithBeEvents(classificationResultSchema)
    const parsed = schema.safeParse({
      entryUpdates: {},
      scene: {},
      beEvents: [{ character: 'Lucy', kind: 'explode', intensity: 2 }],
    })
    expect(parsed.success).toBe(false)
  })
})

describe('beEventsFromResult', () => {
  test('tolerates absence and non-arrays', () => {
    expect(beEventsFromResult({})).toEqual([])
    expect(beEventsFromResult({ beEvents: 'nope' })).toEqual([])
  })

  test('drops malformed entries, keeps valid ones', () => {
    const events = beEventsFromResult({
      beEvents: [
        { character: 'Lucy', kind: 'contact', intensity: 1 },
        { character: 42, kind: 'contact', intensity: 1 },
        { character: 'Zaria', kind: 'not-a-kind', intensity: 1 },
      ],
    })
    expect(events).toEqual([{ character: 'Lucy', kind: 'contact', intensity: 1 }])
  })

  test('caps a hostile oversized array at the per-turn maximum', () => {
    const flood = Array.from({ length: 5000 }, () => ({
      character: 'Lucy',
      kind: 'contact',
      intensity: 1,
    }))
    expect(beEventsFromResult({ beEvents: flood })).toHaveLength(MAX_BE_EVENTS_PER_TURN)
  })
})

describe('beSoftStatesFromResult', () => {
  test('accepts partial reads, drops malformed ones, tolerates absence', () => {
    expect(beSoftStatesFromResult({})).toEqual([])
    const states = beSoftStatesFromResult({
      beStates: [
        { character: 'Lucy', attitude: 'craving', fluidFill: 62 },
        { character: 'Zaria', arousal: 30 },
        { character: 'Mira', attitude: 'euphoric' },
      ],
    })
    expect(states).toEqual([
      { character: 'Lucy', attitude: 'craving', fluidFill: 62 },
      { character: 'Zaria', arousal: 30 },
    ])
  })

  test('the extended schema validates beStates alongside beEvents', () => {
    const schema = extendClassificationSchemaWithBeEvents(classificationResultSchema)
    const parsed = schema.safeParse({
      entryUpdates: {},
      scene: {},
      beStates: [{ character: 'Lucy', attitude: 'conflicted' }],
    })
    expect(parsed.success).toBe(true)
  })
})

describe('buildBeStateBlock', () => {
  const at = (tier: number, extra: Partial<BodyState> = {}): BodyState => ({
    ...defaultBodyState(tier),
    ...extra,
  })

  test('empty entries produce the empty string (template gate relies on it)', () => {
    expect(buildBeStateBlock([])).toBe('')
  })

  test('carries sizing, band, mass, and the authority preamble', () => {
    const block = buildBeStateBlock([{ name: 'Lucy', state: at(39) }])
    expect(block).toContain('canonical and authoritative')
    expect(block).toContain('Lucy —')
    expect(block).toContain('-cup')
    expect(block).toContain('Carried mass:')
    expect(block).toContain('kg of breast tissue')
    expect(block).toContain('never invent growth')
  })

  test('a stored band yields the US sizing string and BWH', () => {
    const block = buildBeStateBlock([
      {
        name: 'Lucy',
        state: at(47, { baseline: { bandIn: 38, waistIn: 32, hipsIn: 40 } }),
      },
    ])
    expect(block).toContain('Lucy — 38X-32-40')
  })

  test('mood line renders attitude and arousal when present', () => {
    const block = buildBeStateBlock([
      { name: 'Lucy', state: at(21, { attitude: 'craving', arousal: 80 }) },
    ])
    expect(block).toContain('transformation attitude craving')
    expect(block).toContain('arousal 80/100')
  })

  test('locked characters get the exact-size assertion', () => {
    const block = buildBeStateBlock([{ name: 'Lucy', state: at(21, { locked: true }) }])
    expect(block).toContain('SIZE LOCKED')
    expect(block).toContain('never round up')
  })

  test('small growth gets incremental language; big growth at low tier stays banded', () => {
    const small = buildBeStateBlock([
      { name: 'Lucy', state: at(11, { lastGrowth: { delta: 1, tierBefore: 10 } }) },
    ])
    expect(small).toContain('subtle and incremental')

    const big = buildBeStateBlock([
      { name: 'Lucy', state: at(12, { lastGrowth: { delta: 2, tierBefore: 10 } }) },
    ])
    expect(big).toContain('GROWTH JUST LANDED')
    expect(big).toContain('no room-scale imagery')
  })

  test('the dramatic register unlocks only at the top bands (31a §3.5 tier gate)', () => {
    const high = buildBeStateBlock([
      { name: 'Lucy', state: at(40, { lastGrowth: { delta: 2, tierBefore: 38 } }) },
    ])
    expect(high).toContain('Dramatic register is earned')
  })

  test('fluid fullness renders with a capacity anchor whenever fill > 0', () => {
    const empty = buildBeStateBlock([
      { name: 'Lucy', state: at(20, { fluids: { fillPercent: 0, fluidType: 'milk' } }) },
    ])
    expect(empty).not.toContain('fullness')
    const high = buildBeStateBlock([
      { name: 'Lucy', state: at(20, { fluids: { fillPercent: 80, fluidType: 'milk' } }) },
    ])
    expect(high).toContain('milk fullness: 80%')
    expect(high).toContain('L capacity')
  })
})

describe('sniffTierFromText', () => {
  test('finds explicit cup letters and skips pseudo-letters', () => {
    expect(sniffTierFromText('she is an X-cup now')).toBeGreaterThan(40)
    expect(sniffTierFromText('a teacup on the shelf')).toBeNull()
    expect(sniffTierFromText('DD cup, honey-blonde')).not.toBeNull()
  })

  test('falls back to band vocabulary at the band anchor', () => {
    const tier = sniffTierFromText('gigantic breasts, warm brown eyes')
    expect(tier).not.toBeNull()
    expect(tier).toBeGreaterThanOrEqual(30)
  })

  test('returns null when nothing size-like appears', () => {
    expect(sniffTierFromText('a kind smile and green eyes')).toBeNull()
  })
})

describe('groundImagePromptSize', () => {
  test('replaces the model band words with the canonical band', () => {
    const grounded = groundImagePromptSize('a woman with huge breasts in a kitchen', 39)
    expect(grounded).toContain('gigantic breasts')
    expect(grounded).not.toContain('huge breasts')
  })

  test('appends the canonical band when the model wrote none', () => {
    const grounded = groundImagePromptSize('a woman standing in a kitchen', 21)
    expect(grounded).toMatch(/, large breasts$/)
  })

  test('replaces every occurrence, not just the first', () => {
    const grounded = groundImagePromptSize('small breasts here, medium breasts there', 29)
    expect(grounded.match(/huge breasts/g)).toHaveLength(2)
  })
})

describe('maxBodyStateTier', () => {
  test('largest named character wins; unseeded characters are ignored', () => {
    const characters = [
      { name: 'Lucy', metadata: writeBodyState(null, defaultBodyState(39)) },
      { name: 'Zaria', metadata: writeBodyState(null, defaultBodyState(13)) },
      { name: 'Mira', metadata: null },
    ]
    expect(maxBodyStateTier(characters, ['zaria', 'LUCY'])).toBe(39)
    expect(maxBodyStateTier(characters, ['Zaria'])).toBe(13)
    expect(maxBodyStateTier(characters, ['Mira'])).toBeNull()
    expect(maxBodyStateTier(characters, ['Nobody'])).toBeNull()
  })
})

describe('story-sourced fluid type', () => {
  test('seed uses the story fluid, falling back to the genre default', () => {
    expect(defaultBodyState(10, 'nectar').fluids.fluidType).toBe('nectar')
    expect(defaultBodyState(10, '   ').fluids.fluidType).toBe('milk')
    expect(defaultBodyState(10).fluids.fluidType).toBe('milk')
  })
})

describe('uniformBodyStateTier (the grounding gate)', () => {
  const characters = [
    { name: 'Lucy', metadata: writeBodyState(null, defaultBodyState(45)) }, // hyper band
    { name: 'Nessa', metadata: writeBodyState(null, defaultBodyState(41)) }, // hyper band
    { name: 'Zaria', metadata: writeBodyState(null, defaultBodyState(10)) }, // medium band
    { name: 'Mira', metadata: null },
  ]

  test('single character grounds at her tier', () => {
    expect(uniformBodyStateTier(characters, ['Lucy'])).toBe(45)
  })

  test('same-band characters ground at the larger tier', () => {
    expect(uniformBodyStateTier(characters, ['Lucy', 'Nessa'])).toBe(45)
  })

  test('mixed-band characters refuse to ground (no size collapse)', () => {
    expect(uniformBodyStateTier(characters, ['Lucy', 'Zaria'])).toBeNull()
  })

  test('unseeded companions do not block grounding of the seeded one', () => {
    expect(uniformBodyStateTier(characters, ['Lucy', 'Mira'])).toBe(45)
    expect(uniformBodyStateTier(characters, ['Mira'])).toBeNull()
  })
})
