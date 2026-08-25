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

// ============================================================================
// Model families + per-family knobs (research/64 §3h–§3m)
// ============================================================================

import {
  imageModelFamily,
  qualityPrefixForModel,
  defaultNegativeForModel,
  sizeNegativeBidirectional,
  ANIMAGINE_QUALITY_PREFIX,
  ANIMAGINE_DEFAULT_NEGATIVE,
  CHROMA_DEFAULT_NEGATIVE,
  BOORU_DEFAULT_NEGATIVE,
  BOORU_QUALITY_PREFIX,
  BOORU_QUALITY_PREFIX_SINGLE_WINDOW,
} from './dialect'

describe('imageModelFamily', () => {
  it('maps the measured NanoGPT ids to their families', () => {
    expect(imageModelFamily('nsfw-gen-illustrious')).toBe('animagine') // Animagine XL 4.0 (§3m)
    expect(imageModelFamily('animagine-xl-31')).toBe('animagine')
    expect(imageModelFamily('persona:376130@2456367')).toBe('nova') // Nova Anime XL
    expect(imageModelFamily('chroma')).toBe('chroma')
    expect(imageModelFamily('wavespeed-ai/krea-v2/turbo-lora')).toBe('krea')
    expect(imageModelFamily('fal-ai/krea-2/turbo')).toBe('krea')
    expect(imageModelFamily('wai-illustrious-sdxl')).toBe('booru')
    expect(imageModelFamily('z-image-turbo')).toBe('prose')
    expect(imageModelFamily(undefined)).toBe('prose')
  })

  it('nova and chroma dialects: nova is booru, chroma is prose', () => {
    expect(detectPromptDialect('persona:376130@2456367')).toBe('booru')
    expect(detectPromptDialect('nova-anime-xl')).toBe('booru')
    expect(detectPromptDialect('chroma')).toBe('prose')
  })

  it('does not mistake polychrome-ish substrings for chroma', () => {
    expect(imageModelFamily('polychrome-v2')).toBe('prose')
    expect(imageModelFamily('some/chroma-hd')).toBe('chroma')
  })
})

describe('qualityPrefixForModel / defaultNegativeForModel', () => {
  it('animagine gets its official score sets', () => {
    expect(qualityPrefixForModel('nsfw-gen-illustrious', true)).toBe(ANIMAGINE_QUALITY_PREFIX)
    expect(qualityPrefixForModel('nsfw-gen-illustrious', false)).toBe(ANIMAGINE_QUALITY_PREFIX)
    expect(defaultNegativeForModel('nsfw-gen-illustrious')).toBe(ANIMAGINE_DEFAULT_NEGATIVE)
    expect(ANIMAGINE_DEFAULT_NEGATIVE).toContain('mosaic censoring')
  })

  it('everything else keeps the WAI prefixes (single-window aware)', () => {
    expect(qualityPrefixForModel('wai-illustrious-sdxl', true)).toBe(
      BOORU_QUALITY_PREFIX_SINGLE_WINDOW,
    )
    expect(qualityPrefixForModel('wai-illustrious-sdxl', false)).toBe(BOORU_QUALITY_PREFIX)
    expect(defaultNegativeForModel('persona:376130@2456367')).toBe(BOORU_DEFAULT_NEGATIVE)
  })

  it('chroma default negative carries the model-card + caption vocabulary, never in a positive', () => {
    expect(defaultNegativeForModel('chroma')).toBe(CHROMA_DEFAULT_NEGATIVE)
    expect(CHROMA_DEFAULT_NEGATIVE).toContain('flat colors')
    expect(CHROMA_DEFAULT_NEGATIVE).toContain('patreon username')
    expect(CHROMA_DEFAULT_NEGATIVE).toContain('twitter handle')
  })
})

describe('sizeNegativeBidirectional (chroma, research/64 §3l)', () => {
  it('suppresses bands both above and below the present band', () => {
    const negative = sizeNegativeBidirectional('a woman with medium breasts riding')
    expect(negative).toContain('small breasts')
    expect(negative).toContain('large breasts')
    expect(negative).toContain('gigantic breasts')
    expect(negative).not.toContain('medium breasts')
  })

  it('keeps every band any present subject occupies (multi-girl safety)', () => {
    const negative = sizeNegativeBidirectional('one has small breasts, the other gigantic breasts')
    expect(negative).not.toContain('small breasts')
    expect(negative).not.toContain('gigantic breasts')
    expect(negative).toContain('huge breasts')
  })

  it('empty when no band vocabulary is present', () => {
    expect(sizeNegativeBidirectional('a castle at sunset')).toBe('')
  })
})

describe('family/dialect single source (review fixes)', () => {
  it('embedded chroma ids classify as chroma, not booru', () => {
    expect(imageModelFamily('wai-chroma-fp8')).toBe('chroma')
    expect(detectPromptDialect('wai-chroma-fp8')).toBe('prose')
    expect(imageModelFamily('vendor_chroma-v2')).toBe('chroma')
    expect(imageModelFamily('polychrome-v2')).toBe('prose')
  })

  it('dialect always derives from family (no dual-regex drift possible)', () => {
    for (const id of ['nsfw-gen-illustrious', 'persona:376130@2456367', 'wai-illustrious-sdxl']) {
      expect(detectPromptDialect(id)).toBe('booru')
    }
    for (const id of ['chroma', 'wavespeed-ai/krea-v2/turbo', 'z-image-turbo']) {
      expect(detectPromptDialect(id)).toBe('prose')
    }
  })
})
