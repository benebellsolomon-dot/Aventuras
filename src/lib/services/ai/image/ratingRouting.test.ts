import { describe, expect, it } from 'vitest'

import {
  effectiveBeatRating,
  inferRatingFromText,
  parseBeatRating,
  ratingFromPromptPrefix,
  resolveRatingRoute,
} from './ratingRouting'

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

describe('inferRatingFromText / effectiveBeatRating (narrator-omitted rating fallback)', () => {
  it('reads explicit vocabulary out of prose and booru prompts', () => {
    expect(
      inferRatingFromText('one woman, completely nude, her bare breasts and nipples visible'),
    ).toBe('explicit')
    expect(inferRatingFromText('two lovers on the bed, he thrusts into her, she moans')).toBe(
      'explicit',
    )
    expect(inferRatingFromText('1girl, solo, paizuri, nude, bedroom')).toBe('explicit')
    expect(
      inferRatingFromText(
        'a young woman in a damp white blouse, cleavage showing, leaning in for a kiss',
      ),
    ).toBe('sensitive')
    expect(
      inferRatingFromText('a quiet kitchen at dawn with bread cooling on the table'),
    ).toBeNull()
  })

  it('does not fire on near-words', () => {
    expect(
      inferRatingFromText(
        'the sextant on the chart table, a cockatoo on the rail, the Sussex coast',
      ),
    ).toBeNull()
  })

  it('upgrades a missing or under-declared rating, never downgrades a declared one', () => {
    expect(effectiveBeatRating(null, 'she stands naked in the rain')).toBe('explicit')
    expect(effectiveBeatRating('general', 'she stands naked in the rain')).toBe('explicit')
    expect(effectiveBeatRating('sensitive', 'bare breasts pressed against the glass')).toBe(
      'explicit',
    )
    expect(effectiveBeatRating('explicit', 'a quiet kitchen at dawn')).toBe('explicit')
    expect(effectiveBeatRating('general', 'a quiet kitchen at dawn')).toBe('general')
    expect(effectiveBeatRating(null, 'a quiet kitchen at dawn')).toBeNull()
  })
})
