import { describe, it, expect } from 'vitest'
import { resolveLoraWeight, resolveLora, loraTriggerText } from './loraBinding'

describe('resolveLoraWeight', () => {
  it('returns the base weight at tier 0 with no scaling', () => {
    expect(resolveLoraWeight({ baseWeight: 0.8 }, 0)).toBe(0.8)
  })

  it('defaults base weight to 1 when unset', () => {
    expect(resolveLoraWeight({}, 0)).toBe(1)
  })

  it('scales with tier and clamps to maxWeight', () => {
    // 0.5 + 0.1*10 = 1.5, capped at maxWeight 1.5
    expect(resolveLoraWeight({ baseWeight: 0.5, tierScale: 0.1, maxWeight: 1.5 }, 10)).toBe(1.5)
    // 0.5 + 0.1*3 = 0.8, under the cap
    expect(resolveLoraWeight({ baseWeight: 0.5, tierScale: 0.1, maxWeight: 1.5 }, 3)).toBeCloseTo(
      0.8,
    )
  })

  it('floors negative tiers at 0 and never returns below 0', () => {
    expect(resolveLoraWeight({ baseWeight: 0.5, tierScale: 0.1 }, -5)).toBe(0.5)
    expect(resolveLoraWeight({ baseWeight: -1 }, 0)).toBe(0)
  })

  it('falls back to defaults on non-finite inputs', () => {
    expect(resolveLoraWeight({ baseWeight: NaN, tierScale: NaN, maxWeight: NaN }, NaN)).toBe(1)
  })
})

describe('resolveLora', () => {
  it('returns null when no config or no name', () => {
    expect(resolveLora(null, 5)).toBeNull()
    expect(resolveLora(undefined, 5)).toBeNull()
    expect(resolveLora({ triggerWords: 'foo' }, 5)).toBeNull()
    expect(resolveLora({ name: '   ' }, 5)).toBeNull()
  })

  it('resolves name and tier-scaled weight into both strengths', () => {
    expect(resolveLora({ name: 'grow.safetensors', baseWeight: 0.6, tierScale: 0.05 }, 8)).toEqual({
      name: 'grow.safetensors',
      strengthModel: 1,
      strengthClip: 1,
    })
  })

  it('trims the name', () => {
    expect(resolveLora({ name: ' bimbo.safetensors ' }, 0)?.name).toBe('bimbo.safetensors')
  })
})

describe('loraTriggerText', () => {
  it('returns empty string when no configs carry trigger words', () => {
    expect(loraTriggerText([null, undefined, { name: 'x' }])).toBe('')
  })

  it('splits, trims, and dedupes trigger words across configs (order preserved)', () => {
    expect(
      loraTriggerText([
        { triggerWords: 'huge_growth, glowing skin' },
        { triggerWords: 'glowing skin; radiant' },
      ]),
    ).toBe('huge_growth, glowing skin, radiant')
  })
})
