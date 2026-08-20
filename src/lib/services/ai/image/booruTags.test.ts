/**
 * Booru tag-string normalization (research/56): parenthesized globs flattened,
 * engine prose cues compressed to tags the model knows. `$lib/services/be` is
 * the REAL module — the cue vocabulary this maps is the engine's own.
 */
import { describe, expect, it } from 'vitest'
import {
  compressStateCues,
  engineSizeTags,
  flattenTagGroups,
  isSizeVocabularyTag,
  sanitizeBreastTags,
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

describe('sanitizeBreastTags', () => {
  /** Tier 24 = the "huge breasts" band; body-relative anchors start at 30. */
  const huge = { tier: 24, grewThisTurn: false }
  const strip = (tags: string[], sanction = huge) => sanitizeBreastTags(tags, sanction).stripped

  it('strips the live failure: a size invention no magnitude regex would catch', () => {
    // The writer dodged the previous blacklist by phrasing the same over-claim
    // as a noun ("breast spill") and three bare immobility words.
    const result = sanitizeBreastTags(
      ['lying on back', 'breast spill', 'pinned', 'immobile', 'trapped'],
      huge,
    )
    expect(result.kept).toEqual(['lying on back'])
    expect(result.stripped).toEqual(['breast spill', 'pinned', 'immobile', 'trapped'])
  })

  it('strips EVERY band word — the engine states the band itself', () => {
    const result = sanitizeBreastTags(
      ['gigantic breasts', 'hyper breasts', 'huge breasts', 'large breasts', 'flat chest'],
      huge,
    )
    expect(result.kept).toEqual([])
  })

  it('strips anchor phrases with or without the possessive', () => {
    expect(
      strip([
        'breasts wider than hips',
        'breasts bigger than her torso',
        'breasts bigger than head',
      ]),
    ).toEqual([
      'breasts wider than hips',
      'breasts bigger than her torso',
      'breasts bigger than head',
    ])
  })

  it('strips freeform magnitude at ANY tier — invention is not the engine speaking', () => {
    const invented = [
      'breasts covering stomach',
      'breasts reaching waist',
      'breasts spilling over bed',
      'breasts larger than her head',
      'breasts as big as beach balls',
      'room-filling breasts',
      'massive tits',
      'enormous bust',
      'oppai',
    ]
    expect(strip(invented)).toEqual(invented)
    expect(strip(invented, { tier: 45, grewThisTurn: false })).toEqual(invented)
  })

  it('strips immobility only next to breast tags, and only below the hips anchor', () => {
    expect(strip(['huge breasts', 'lying on back', 'unable to move'])).toEqual([
      'huge breasts',
      'unable to move',
    ])
    // No breast mention in the block — a bondage scene keeps its own vocabulary.
    expect(strip(['bound wrists', 'rope', 'unable to move', 'pinned'])).toEqual([])
    // Tier 40 is where the ladder itself claims breasts outscale her hips.
    expect(strip(['paizuri', 'pinned', 'immobile'], { tier: 40, grewThisTurn: false })).toEqual([])
  })

  it('keeps the curated act and contact tags', () => {
    expect(
      strip([
        'paizuri',
        'breast squeezing',
        'breast grab',
        "grabbing another's breast",
        'breast sucking',
        'breast press',
        'breasts on glass',
        'breast rest',
        'breast smother',
        'breasts squeezed together',
        'penis between breasts',
        'nipple play',
        'nipple licking',
        'nipple tweak',
        'cleavage',
      ]),
    ).toEqual([])
  })

  it('keeps anatomy-neutral detail the engine does not own', () => {
    expect(strip(['nipples', 'areolae', 'puffy nipples', 'large areolae', 'underboob'])).toEqual([])
  })

  it('tells a pose tag from the magnitude claim that reuses its words', () => {
    const result = sanitizeBreastTags(['covering breasts', 'breasts covering stomach'], huge)
    expect(result.kept).toEqual(['covering breasts'])
    expect(result.stripped).toEqual(['breasts covering stomach'])
  })

  it('leaves tags that never mention breasts alone', () => {
    const tags = ['lying on back', 'lactation', 'blush', 'wide hips', 'chest of drawers']
    expect(sanitizeBreastTags(tags, huge)).toEqual({ kept: tags, stripped: [] })
  })

  it('strips the growth event too — injection decides whether it happened', () => {
    const growth = ['breast expansion', 'breasts rapidly expanding', 'expanding breasts']
    expect(strip(growth)).toEqual(growth)
    expect(strip(growth, { tier: 24, grewThisTurn: true })).toEqual(growth)
  })

  it('filters nothing when the engine holds no state for the subject', () => {
    const tags = ['hyper breasts', 'breasts covering stomach', 'breast expansion']
    expect(sanitizeBreastTags(tags, null)).toEqual({ kept: tags, stripped: [] })
    expect(sanitizeBreastTags(tags, undefined).kept).toEqual(tags)
  })
})

describe('engineSizeTags', () => {
  it('states the band word alone below the anchor floor', () => {
    expect(engineSizeTags({ tier: 24, grewThisTurn: false })).toEqual(['huge breasts'])
  })

  it('adds the body-relative anchor the tier has earned', () => {
    expect(engineSizeTags({ tier: 40, grewThisTurn: false })).toEqual([
      'hyper breasts',
      'breasts wider than her hips',
    ])
  })

  it('adds the growth event only on the turn the engine grew her', () => {
    expect(engineSizeTags({ tier: 24, grewThisTurn: true })).toEqual([
      'huge breasts',
      'breast expansion',
    ])
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
