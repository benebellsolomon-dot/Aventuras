/**
 * Tests for the per-character expression layer's vocabulary + engine mapping.
 *
 * `$lib/services/be` is the REAL module — the arousal thresholds and the
 * attitude/bond bands are exactly what the engine stores, and a drift between
 * the two is the bug these tests exist to catch.
 */
import { describe, expect, it } from 'vitest'
import { SPRITE_AROUSAL_FLUSH_THRESHOLD, defaultBodyState } from '$lib/services/be'
import {
  AROUSAL_BLUSH_THRESHOLD,
  AROUSAL_PEAK_THRESHOLD,
  EXPRESSION_TAG_FAMILIES,
  MAX_ENGINE_EXPRESSION_TAGS,
  arousalExpressionTags,
  engineExpressionTags,
  isExpressionTag,
} from './expressionTags'

const state = (overrides: Partial<ReturnType<typeof defaultBodyState>> = {}) => ({
  ...defaultBodyState(18),
  ...overrides,
})

describe('isExpressionTag', () => {
  it('recognizes every tag in the curated families, case-insensitively', () => {
    for (const family of Object.values(EXPRESSION_TAG_FAMILIES)) {
      for (const tag of family) {
        expect(isExpressionTag(tag)).toBe(true)
        expect(isExpressionTag(` ${tag.toUpperCase()} `)).toBe(true)
      }
    }
  })

  it('rejects identity, size, clothing and setting tags', () => {
    for (const tag of ['blonde hair', 'huge breasts', 'completely nude', 'bedroom', '1girl']) {
      expect(isExpressionTag(tag)).toBe(false)
    }
  })
})

describe('arousalExpressionTags', () => {
  it('is silent below the blush threshold', () => {
    expect(arousalExpressionTags(undefined)).toEqual([])
    expect(arousalExpressionTags(0)).toEqual([])
    expect(arousalExpressionTags(AROUSAL_BLUSH_THRESHOLD - 1)).toEqual([])
  })

  it('climbs the ladder by band', () => {
    expect(arousalExpressionTags(AROUSAL_BLUSH_THRESHOLD)).toEqual(['blush'])
    expect(arousalExpressionTags(SPRITE_AROUSAL_FLUSH_THRESHOLD)).toEqual([
      'blush',
      'heavy breathing',
      'half-closed eyes',
    ])
    expect(arousalExpressionTags(AROUSAL_PEAK_THRESHOLD)).toEqual([
      'blush',
      'heavy breathing',
      'open mouth',
    ])
  })

  it('reuses the engine flush threshold so the face and the sprite cell agree', () => {
    expect(arousalExpressionTags(SPRITE_AROUSAL_FLUSH_THRESHOLD - 1)).toEqual(['blush'])
  })
})

describe('engineExpressionTags', () => {
  it('emits nothing when the engine evidences no emotional state', () => {
    expect(engineExpressionTags(state())).toEqual([])
  })

  it('never reaches the overwhelmed rung — that one is the writer-only explicit-beat call', () => {
    const tags = engineExpressionTags(state({ arousal: 100 }))
    for (const extreme of ['ahegao', 'rolling eyes', 'tongue out', 'torogao']) {
      expect(tags).not.toContain(extreme)
    }
  })

  it('maps each transformation attitude to one face tag', () => {
    expect(engineExpressionTags(state({ attitude: 'craving' }))).toEqual(['seductive smile'])
    expect(engineExpressionTags(state({ attitude: 'accepting' }))).toEqual(['smile'])
    expect(engineExpressionTags(state({ attitude: 'conflicted' }))).toEqual(['nervous'])
    expect(engineExpressionTags(state({ attitude: 'fearful' }))).toEqual(['scared'])
    expect(engineExpressionTags(state({ attitude: 'resentful' }))).toEqual(['scowl'])
  })

  it('surfaces the growth that landed this beat', () => {
    expect(engineExpressionTags(state({ lastGrowth: { delta: 2, tierBefore: 16 } }))).toEqual([
      'surprised',
    ])
  })

  it('ranks arousal over growth over attitude and caps the block', () => {
    const tags = engineExpressionTags(
      state({
        arousal: AROUSAL_PEAK_THRESHOLD,
        lastGrowth: { delta: 1, tierBefore: 17 },
        attitude: 'fearful',
      }),
    )
    expect(tags).toEqual(['blush', 'heavy breathing', 'open mouth'])
    expect(tags).toHaveLength(MAX_ENGINE_EXPRESSION_TAGS)
  })

  it('reads bond only at the extremes, and only when it was actually set', () => {
    // An unset bond reads through to a default — rendering that as devotion
    // would be inventing state the engine never recorded.
    expect(engineExpressionTags(state())).toEqual([])
    expect(engineExpressionTags(state({ bond: 95 }))).toEqual(['loving gaze'])
    expect(engineExpressionTags(state({ bond: 5 }))).toEqual(['averted eyes'])
    expect(engineExpressionTags(state({ bond: 50 }))).toEqual([])
    // New-scale negative bands (research/60): hostile glares, cold averts.
    const relState = (bond: number) =>
      state({ rel: { bond, sparks: 0, grudge: 0, ct: 0, warmed: false } })
    expect(engineExpressionTags(relState(-4))).toEqual(['glaring'])
    expect(engineExpressionTags(relState(-1))).toEqual(['averted eyes'])
  })

  it('lets the stronger signals crowd out the bond flavor', () => {
    const tags = engineExpressionTags(
      state({ arousal: AROUSAL_PEAK_THRESHOLD, bond: 95, attitude: 'craving' }),
    )
    expect(tags).not.toContain('loving gaze')
    expect(tags).toHaveLength(MAX_ENGINE_EXPRESSION_TAGS)
  })

  it('only emits tags the assembly can classify as expressions', () => {
    const tags = engineExpressionTags(
      state({ arousal: 75, attitude: 'resentful', lastGrowth: { delta: 1, tierBefore: 17 } }),
    )
    for (const tag of tags) expect(isExpressionTag(tag)).toBe(true)
  })
})
