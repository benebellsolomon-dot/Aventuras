/** Tests for the V2 sprite selection core (Spec 4 V2a Task 1): 35-cell space, precedence, hash. */
import { describe, expect, test } from 'vitest'
import {
  BAND_SPRITE_TIER,
  bandRepresentativeTier,
  selectSprite,
  spriteAppearanceHash,
  spriteSeed,
  type SpriteAppearanceInput,
} from './sprite'
import { bandIndex } from './ladder'
import { defaultBodyState } from './metadata'
import type { BodyState, TransformationAttitude } from './types'

function state(overrides: Partial<BodyState> = {}): BodyState {
  return { ...defaultBodyState(24), ...overrides }
}

const APPEARANCE: SpriteAppearanceInput = {
  visualDescriptors: {
    hair: 'long silver hair',
    eyes: 'blue eyes',
    build: 'slim',
  },
  shape: 'natural',
  stylePreset: 'semireal',
  register: 'color',
}

describe('selectSprite', () => {
  test('band index follows the ladder bands', () => {
    expect(selectSprite(state({ tier: 0 })).bandIndex).toBe(0)
    expect(selectSprite(state({ tier: 3 })).bandIndex).toBe(1)
    expect(selectSprite(state({ tier: 13 })).bandIndex).toBe(2)
    expect(selectSprite(state({ tier: 21 })).bandIndex).toBe(3)
    expect(selectSprite(state({ tier: 29 })).bandIndex).toBe(4)
    expect(selectSprite(state({ tier: 39 })).bandIndex).toBe(5)
    expect(selectSprite(state({ tier: 45 })).bandIndex).toBe(6)
    expect(selectSprite(state({ tier: 400 })).bandIndex).toBe(6)
  })

  test('engorged pins the single engorged cell (distressed strain look)', () => {
    const s = selectSprite(
      state({
        fluids: { fillPercent: 80, fluidType: 'milk' },
        arousal: 90,
        lastGrowth: { delta: 2, tierBefore: 22 },
        attitude: 'craving',
      }),
    )
    expect(s.engorged).toBe(true)
    expect(s.expression).toBe('distressed')
  })

  test('landed growth outranks flush and attitude', () => {
    const s = selectSprite(
      state({ lastGrowth: { delta: 1, tierBefore: 23 }, arousal: 90, attitude: 'craving' }),
    )
    expect(s.engorged).toBe(false)
    expect(s.expression).toBe('distressed')
  })

  test('zero-delta growth does not force distressed', () => {
    const s = selectSprite(state({ lastGrowth: { delta: 0, tierBefore: 24 }, attitude: 'craving' }))
    expect(s.expression).toBe('positive')
  })

  test('arousal >= 70 selects the flushed cluster (35-cell ruling)', () => {
    expect(selectSprite(state({ arousal: 70, attitude: 'craving' })).expression).toBe('flushed')
    expect(selectSprite(state({ arousal: 69, attitude: 'craving' })).expression).toBe('positive')
  })

  test('attitude map with neutral default', () => {
    const cases: Array<[TransformationAttitude | undefined, string]> = [
      ['craving', 'positive'],
      ['accepting', 'positive'],
      ['fearful', 'distressed'],
      ['resentful', 'distressed'],
      ['conflicted', 'neutral'],
      [undefined, 'neutral'],
    ]
    for (const [attitude, expected] of cases) {
      expect(selectSprite(state({ attitude })).expression).toBe(expected)
    }
  })
})

describe('bandRepresentativeTier', () => {
  test('anchors round-trip into their own band', () => {
    for (let i = 0; i < BAND_SPRITE_TIER.length; i++) {
      expect(bandIndex(bandRepresentativeTier(i))).toBe(i)
    }
  })

  test('clamps out-of-range band indexes', () => {
    expect(bandRepresentativeTier(-1)).toBe(BAND_SPRITE_TIER[0])
    expect(bandRepresentativeTier(99)).toBe(BAND_SPRITE_TIER[BAND_SPRITE_TIER.length - 1])
  })
})

describe('spriteAppearanceHash', () => {
  test('is stable and normalizes case/whitespace', () => {
    const a = spriteAppearanceHash(APPEARANCE)
    const b = spriteAppearanceHash({
      ...APPEARANCE,
      visualDescriptors: {
        hair: '  Long Silver HAIR ',
        eyes: 'Blue Eyes',
        build: ' SLIM',
      },
    })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}$/)
  })

  test('changes on identity-stable fields', () => {
    const base = spriteAppearanceHash(APPEARANCE)
    expect(
      spriteAppearanceHash({
        ...APPEARANCE,
        visualDescriptors: { ...APPEARANCE.visualDescriptors, hair: 'short red hair' },
      }),
    ).not.toBe(base)
    expect(spriteAppearanceHash({ ...APPEARANCE, shape: 'gravity_defying' })).not.toBe(base)
    expect(spriteAppearanceHash({ ...APPEARANCE, stylePreset: 'none' })).not.toBe(base)
  })

  test('field boundaries are preserved (no concatenation ambiguity)', () => {
    const a = spriteAppearanceHash({
      ...APPEARANCE,
      visualDescriptors: { hair: 'long silver', eyes: 'blue' },
    })
    const b = spriteAppearanceHash({
      ...APPEARANCE,
      visualDescriptors: { hair: 'long silv', eyes: 'erblue' },
    })
    expect(a).not.toBe(b)
  })

  test('tolerates null descriptors', () => {
    expect(
      spriteAppearanceHash({
        visualDescriptors: null,
        shape: 'natural',
        stylePreset: 'semireal',
        register: 'color',
      }),
    ).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('spriteSeed', () => {
  test('deterministic, non-negative, character-scoped', () => {
    const hash = spriteAppearanceHash(APPEARANCE)
    const a = spriteSeed('char-1', hash)
    expect(a).toBe(spriteSeed('char-1', hash))
    expect(Number.isInteger(a)).toBe(true)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(spriteSeed('char-2', hash)).not.toBe(a)
  })
})
