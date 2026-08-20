/**
 * Booru tag-string normalization (research/56): parenthesized globs flattened,
 * engine prose cues compressed to tags the model knows. `$lib/services/be` is
 * the REAL module — the cue vocabulary this maps is the engine's own.
 */
import { describe, expect, it } from 'vitest'
import {
  compressStateCues,
  flattenTagGroups,
  isSizeVocabularyTag,
  sanitizeSizeTags,
  toTags,
} from './booruTags'
import { defaultBodyState, imageStateCues } from '$lib/services/be'

describe('flattenTagGroups', () => {
  it('unwraps a pseudo-regional multi-tag glob', () => {
    expect(flattenTagGroups('1girl, (on the left, blonde hair, nude), bedroom')).toBe(
      '1girl, on the left, blonde hair, nude, bedroom',
    )
  })

  it('keeps a real A1111 weighting group intact', () => {
    expect(flattenTagGroups('1girl, (huge breasts:1.20), bedroom')).toBe(
      '1girl, (huge breasts:1.20), bedroom',
    )
  })

  it('keeps a single-tag emphasis group intact', () => {
    expect(flattenTagGroups('1girl, (smile), bedroom')).toBe('1girl, (smile), bedroom')
  })

  it('drops the now-meaningless weight when unwrapping a weighted glob', () => {
    expect(flattenTagGroups('(on the left, 1girl, blonde hair:1.2), bed')).toBe(
      'on the left, 1girl, blonde hair, bed',
    )
  })

  it('leaves escaped parens — they are part of danbooru tag names', () => {
    expect(flattenTagGroups('1girl, hatsune miku \\(append\\), stage')).toBe(
      '1girl, hatsune miku \\(append\\), stage',
    )
  })

  it('collapses empty tags and stray whitespace', () => {
    expect(flattenTagGroups(' 1girl ,, ,  bedroom ')).toBe('1girl, bedroom')
  })
})

describe('toTags', () => {
  it('splits a run into flattened tags', () => {
    expect(toTags('1girl, (on the left, nude)')).toEqual(['1girl', 'on the left', 'nude'])
  })

  it('is empty for nullish or blank input', () => {
    expect(toTags(null)).toEqual([])
    expect(toTags('  ,  ')).toEqual([])
  })
})

describe('compressStateCues', () => {
  it('maps the engine fill cue to lactation and lowercases the fluid type', () => {
    const state = {
      ...defaultBodyState(20),
      fluids: { fillPercent: 50, fluidType: 'Milk' },
      arousal: 80,
    }
    const cues = imageStateCues(state)
    // The engine's own wording — prose the booru model has never seen.
    expect(cues[0]).toContain('subtly swollen with Milk')
    expect(compressStateCues(cues)).toEqual(['lactation', 'blush', 'heavy breathing'])
  })

  it('maps a full engorgement to the leaking tags', () => {
    const state = {
      ...defaultBodyState(20),
      fluids: { fillPercent: 95, fluidType: 'milk' },
    }
    expect(compressStateCues(imageStateCues(state))).toEqual(['lactation', 'leaking milk'])
  })

  it('maps the growth cue to breast expansion', () => {
    const state = {
      ...defaultBodyState(20),
      lastGrowth: { delta: 2, tierBefore: 16 },
    }
    expect(compressStateCues(imageStateCues(state))).toEqual(['breast expansion'])
  })

  it('de-dupes tags shared by two cues', () => {
    expect(
      compressStateCues(['breasts visibly engorged', 'breasts subtly swollen with milk']),
    ).toEqual(['lactation'])
  })

  it('passes an unknown cue through lowercased rather than dropping it', () => {
    expect(compressStateCues(['Brand New Engine Cue'])).toEqual(['brand new engine cue'])
  })

  it('is empty for no cues', () => {
    expect(compressStateCues([])).toEqual([])
  })
})

describe('sanitizeSizeTags', () => {
  /** Tier 24 = the "huge breasts" band; body-relative anchors start at 30. */
  const huge = { tier: 24, grewThisTurn: false }
  const strip = (tags: string[], sanction = huge) => sanitizeSizeTags(tags, sanction).stripped

  it('strips a band word above the subject band, keeps her own and lower ones', () => {
    const result = sanitizeSizeTags(
      ['gigantic breasts', 'hyper breasts', 'huge breasts', 'large breasts'],
      huge,
    )
    expect(result.kept).toEqual(['huge breasts', 'large breasts'])
    expect(result.stripped).toEqual(['gigantic breasts', 'hyper breasts'])
  })

  it('strips an anchor phrase the tier has not earned, keeps the one it has', () => {
    const atForty = { tier: 40, grewThisTurn: false }
    const result = sanitizeSizeTags(
      ['breasts wider than hips', 'breasts bigger than torso', 'breasts bigger than head'],
      atForty,
    )
    expect(result.kept).toEqual(['breasts wider than hips', 'breasts bigger than head'])
    expect(result.stripped).toEqual(['breasts bigger than torso'])
  })

  it('matches an anchor phrase whether or not the writer kept the possessive', () => {
    expect(strip(['breasts bigger than her head'])).toEqual(['breasts bigger than her head'])
    expect(
      sanitizeSizeTags(['breasts bigger than her head'], { tier: 30, grewThisTurn: false }),
    ).toEqual({ kept: ['breasts bigger than her head'], stripped: [] })
  })

  it('strips freeform magnitude the narration invented below the anchor floor', () => {
    expect(
      strip([
        'breasts covering stomach',
        'breasts reaching waist',
        'breasts spilling over bed',
        'breasts larger than her head',
        'breasts as big as beach balls',
        'room-filling breasts',
      ]),
    ).toEqual([
      'breasts covering stomach',
      'breasts reaching waist',
      'breasts spilling over bed',
      'breasts larger than her head',
      'breasts as big as beach balls',
      'room-filling breasts',
    ])
  })

  it('keeps freeform magnitude a hyper-band subject has actually earned', () => {
    const hyper = { tier: 45, grewThisTurn: false }
    expect(
      sanitizeSizeTags(['breasts covering stomach', 'breasts reaching waist'], hyper).stripped,
    ).toEqual([])
  })

  it('strips immobility phrasing only next to breast tags', () => {
    expect(strip(['huge breasts', 'lying on back', 'unable to move'])).toEqual(['unable to move'])
    expect(strip(['bound wrists', 'rope', 'unable to move'])).toEqual([])
  })

  it('keeps act tags that merely mention breasts', () => {
    expect(
      strip([
        'paizuri',
        'breast squeezing',
        'breast grab',
        'breasts squeezed together',
        'cleavage',
      ]),
    ).toEqual([])
  })

  it('gates the growth-event tags on the engine having grown her this turn', () => {
    const growth = ['breast expansion', 'breasts rapidly expanding', 'skin stretching taut']
    expect(strip(growth)).toEqual(growth)
    expect(strip(growth, { tier: 24, grewThisTurn: true })).toEqual([])
  })

  it('filters nothing when the engine holds no state for the subject', () => {
    const tags = ['hyper breasts', 'breasts covering stomach', 'breast expansion']
    expect(sanitizeSizeTags(tags, null)).toEqual({ kept: tags, stripped: [] })
    expect(sanitizeSizeTags(tags, undefined).kept).toEqual(tags)
  })
})

describe('isSizeVocabularyTag', () => {
  it('recognizes band words and anchor phrases, with or without the possessive', () => {
    expect(isSizeVocabularyTag('huge breasts')).toBe(true)
    expect(isSizeVocabularyTag('Breasts Bigger Than Her Head')).toBe(true)
    expect(isSizeVocabularyTag('breasts wider than hips')).toBe(true)
  })

  it('does not claim act tags or invented magnitude phrasing', () => {
    expect(isSizeVocabularyTag('paizuri')).toBe(false)
    expect(isSizeVocabularyTag('breasts covering stomach')).toBe(false)
  })
})
