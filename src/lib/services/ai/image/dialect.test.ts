import { describe, it, expect } from 'vitest'
import { detectPromptDialect, sizeNegativeForPrompt } from './dialect'

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
  it('suppresses bands two or more steps below the largest present', () => {
    expect(sizeNegativeForPrompt('1girl, huge breasts, garden')).toBe(
      'flat chest, small breasts, medium breasts',
    )
    expect(sizeNegativeForPrompt('1girl, hyper breasts')).toBe(
      'flat chest, small breasts, medium breasts, large breasts, huge breasts',
    )
  })

  it('keeps bands that are themselves in the prompt (multi-character scenes)', () => {
    const negative = sizeNegativeForPrompt('2girls, huge breasts, small breasts')
    expect(negative).not.toContain('small breasts')
    expect(negative).toContain('flat chest')
  })

  it('empty for small sizes or band-less prompts', () => {
    expect(sizeNegativeForPrompt('1girl, small breasts')).toBe('')
    expect(sizeNegativeForPrompt('a castle at sunset')).toBe('')
  })
})
