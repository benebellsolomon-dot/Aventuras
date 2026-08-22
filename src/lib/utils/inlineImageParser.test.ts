import { describe, expect, it } from 'vitest'

import { extractPicTags } from './inlineImageParser'

describe('extractPicTags rating', () => {
  it('reads the rating attribute (tolerant) and leaves it null when absent', () => {
    const tags = extractPicTags(
      '<pic prompt="one woman standing in the rain by a window" characters="Amelia" rating="Explicit"></pic>' +
        '<pic prompt="a quiet kitchen at dawn with bread on the table" characters=""></pic>',
    )
    expect(tags.map((t) => t.rating)).toEqual(['explicit', null])
  })

  it('falls back to a booru rating tag opening the prompt', () => {
    const tags = extractPicTags(
      '<pic prompt="explicit, uncensored, detailed anatomy, 1girl, solo" characters="Amelia"></pic>',
    )
    expect(tags[0].rating).toBe('explicit')
  })
})

describe('extractPicTags rating fallback from prompt text', () => {
  it('upgrades an omitted or under-declared rating when the prompt is explicit', () => {
    const tags = extractPicTags(
      '<pic prompt="one woman, completely nude on the bed, bare breasts, legs spread" characters="Amelia"></pic>' +
        '<pic prompt="he thrusts into her as she moans against the wall" characters="Amelia" rating="general"></pic>' +
        '<pic prompt="a quiet kitchen at dawn with bread cooling on the table" characters="" rating="general"></pic>',
    )
    expect(tags.map((t) => t.rating)).toEqual(['explicit', 'explicit', 'general'])
  })
})
