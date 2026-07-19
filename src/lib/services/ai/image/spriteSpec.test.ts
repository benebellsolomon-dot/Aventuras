/** Tests for the sprite cell spec/prompt builder (Spec 4 V2a Task 6). */
import { describe, expect, test } from 'vitest'
import { buildSpritePrompt, buildSpriteSpec, type SpriteCellInput } from './spriteSpec'

function cell(overrides: Partial<SpriteCellInput> = {}): SpriteCellInput {
  return {
    name: 'Lucy',
    visualDescriptors: { hair: 'long silver hair', eyes: 'blue eyes', build: 'slim' },
    bandIndex: 4,
    expression: 'neutral',
    engorged: false,
    fluidType: 'milk',
    ...overrides,
  }
}

describe('buildSpriteSpec', () => {
  test('renders the band-representative tier on a solo plain-background framing', () => {
    const spec = buildSpriteSpec(cell())
    expect(spec.characters).toHaveLength(1)
    expect(spec.characters[0].tier_index).toBe(29) // band 4 (huge) representative
    expect(spec.regional).toBeUndefined()
    expect(spec.register).toBe('color')
    expect(spec.style_preset).toBe('semireal')
    expect(spec.intimacy).toBe('clean')
    expect(spec.scene_tags).toEqual(expect.arrayContaining(['solo', 'full body', 'standing']))
    expect(spec.scene_tags!.join(',')).toMatch(/white background/)
    expect(spec.characters[0].appearance_excerpt).toContain('long silver hair')
  })

  test('expression clusters map to be_moments', () => {
    expect(buildSpriteSpec(cell({ expression: 'positive' })).be_moments).toEqual(['pleasure'])
    expect(buildSpriteSpec(cell({ expression: 'neutral' })).be_moments).toBeUndefined()
    expect(buildSpriteSpec(cell({ expression: 'distressed' })).be_moments).toEqual(['embarrassed'])
    const flushed = buildSpriteSpec(cell({ expression: 'flushed' }))
    expect(flushed.be_moments).toEqual(['pleasure'])
    expect(flushed.extra_tags!.some((t) => /flushed/.test(t))).toBe(true)
  })

  test('the engorged cell adds strain and the fluid-typed cue', () => {
    const spec = buildSpriteSpec(cell({ expression: 'distressed', engorged: true, fluidType: 'mana' }))
    expect(spec.be_moments).toEqual(expect.arrayContaining(['strain']))
    expect(spec.extra_tags!.some((t) => /engorged/.test(t) && /mana/.test(t))).toBe(true)
  })
})

describe('buildSpritePrompt', () => {
  test('carries band word, framing, and appearance for prompt-only providers', () => {
    const prompt = buildSpritePrompt(cell({ bandIndex: 2 }))
    expect(prompt).toMatch(/medium breasts/)
    expect(prompt).toMatch(/solo/)
    expect(prompt).toMatch(/white background/)
    expect(prompt).toMatch(/long silver hair/)
  })

  test('band 0 renders flat chest and engorged carries the cue', () => {
    expect(buildSpritePrompt(cell({ bandIndex: 0 }))).toMatch(/flat chest/)
    expect(buildSpritePrompt(cell({ engorged: true }))).toMatch(/engorged/)
  })
})
