import { describe, it, expect } from 'vitest'
import { detectPromptDialect, sizeNegativeForPrompt, mergeNegativePrompt } from './dialect'

describe('detectPromptDialect', () => {
  it('routes anime tag families to booru, everything else to prose', () => {
    expect(detectPromptDialect('wai-illustrious-sdxl')).toBe('booru')
    expect(detectPromptDialect('ponyDiffusionV6XL')).toBe('booru')
    expect(detectPromptDialect('noobai-xl')).toBe('booru')
    expect(detectPromptDialect('z-image-turbo')).toBe('prose')
    expect(detectPromptDialect('flux-kontext')).toBe('prose')
    expect(detectPromptDialect('')).toBe('prose')
    expect(detectPromptDialect(undefined)).toBe('prose')
  })
})

describe('sizeNegativeForPrompt', () => {
  it('suppresses every band strictly below the largest present', () => {
    // The neighbour band is the escape hatch the live failure used (a tier-24
    // "huge breasts" prompt rendered "large breasts"), so it is negated too.
    expect(sizeNegativeForPrompt('1girl, huge breasts, garden')).toBe(
      'flat chest, small breasts, medium breasts, large breasts',
    )
    expect(sizeNegativeForPrompt('1girl, hyper breasts')).toBe(
      'flat chest, small breasts, medium breasts, large breasts, huge breasts, gigantic breasts',
    )
  })

  it('keeps bands that are themselves in the prompt (multi-character scenes)', () => {
    const negative = sizeNegativeForPrompt('2girls, huge breasts, small breasts')
    expect(negative).not.toContain('small breasts')
    expect(negative).toContain('flat chest')
  })

  it('never negates a neighbouring band that a second character actually occupies', () => {
    const negative = sizeNegativeForPrompt('2girls, medium breasts, huge breasts')
    expect(negative).not.toContain('medium breasts')
    expect(negative).toBe('flat chest, small breasts, large breasts')
  })

  it('empty for small sizes or band-less prompts', () => {
    expect(sizeNegativeForPrompt('1girl, small breasts')).toBe('')
    expect(sizeNegativeForPrompt('a castle at sunset')).toBe('')
  })
})

describe('mergeNegativePrompt', () => {
  it('puts configured tokens first, then base tokens not already present', () => {
    expect(mergeNegativePrompt('blurry, watermark', 'bad hands, blurry, extra fingers')).toBe(
      'blurry, watermark, bad hands, extra fingers',
    )
  })

  it('dedupes case-insensitively without dropping distinct base tokens', () => {
    expect(mergeNegativePrompt('Blurry', 'blurry, bad hands')).toBe('Blurry, bad hands')
  })

  it('matches whole tokens, not substrings (configured "hands" does not swallow base "bad hands")', () => {
    expect(mergeNegativePrompt('hands', 'bad hands, extra fingers')).toBe(
      'hands, bad hands, extra fingers',
    )
  })

  it('falls back to base alone when nothing is configured', () => {
    expect(mergeNegativePrompt('', 'bad hands, extra fingers')).toBe('bad hands, extra fingers')
  })

  it('falls back to configured alone when base is empty', () => {
    expect(mergeNegativePrompt('watermark, blurry', '')).toBe('watermark, blurry')
  })

  it('ignores stray commas and whitespace from either input', () => {
    expect(mergeNegativePrompt(' blurry ,, watermark ', 'blurry,   bad hands')).toBe(
      'blurry, watermark, bad hands',
    )
  })
})
