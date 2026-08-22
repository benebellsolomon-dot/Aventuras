import { describe, expect, it } from 'vitest'

import { parseBeatRating, ratingFromPromptPrefix, resolveRatingRoute } from './ratingRouting'

describe('parseBeatRating', () => {
  it('folds case, whitespace and aliases', () => {
    expect(parseBeatRating('Explicit')).toBe('explicit')
    expect(parseBeatRating(' nsfw ')).toBe('explicit')
    expect(parseBeatRating('suggestive')).toBe('sensitive')
    expect(parseBeatRating('questionable')).toBe('sensitive')
    expect(parseBeatRating('SFW')).toBe('general')
    expect(parseBeatRating('spicy')).toBeNull()
    expect(parseBeatRating(undefined)).toBeNull()
  })
})

describe('ratingFromPromptPrefix', () => {
  it('reads the booru rating tag that opens a tag prompt', () => {
    expect(ratingFromPromptPrefix('explicit, uncensored, detailed anatomy, 1girl')).toBe('explicit')
    expect(ratingFromPromptPrefix('General, 1girl, solo')).toBe('general')
    expect(ratingFromPromptPrefix('a young woman with red hair')).toBeNull()
  })
})

describe('resolveRatingRoute', () => {
  const base = {
    profileId: 'krea',
    size: '1024x1024',
    explicitProfileId: 'illus',
    explicitSize: '832x1216',
  }

  it('routes an explicit beat to the explicit profile and size', () => {
    expect(resolveRatingRoute('explicit', base)).toEqual({
      profileId: 'illus',
      size: '832x1216',
      routed: true,
    })
  })

  it('keeps the primary for general/sensitive/unknown, and when no explicit profile is set', () => {
    expect(resolveRatingRoute('sensitive', base)).toEqual({
      profileId: 'krea',
      size: '1024x1024',
      routed: false,
    })
    expect(resolveRatingRoute(null, base)).toEqual({
      profileId: 'krea',
      size: '1024x1024',
      routed: false,
    })
    expect(resolveRatingRoute('explicit', { ...base, explicitProfileId: null })).toEqual({
      profileId: 'krea',
      size: '1024x1024',
      routed: false,
    })
  })

  it('falls back to the primary size when the explicit size is unset', () => {
    expect(resolveRatingRoute('explicit', { ...base, explicitSize: '' }).size).toBe('1024x1024')
  })
})
