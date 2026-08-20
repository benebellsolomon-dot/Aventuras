/**
 * Booru tag-string normalization (research/56): parenthesized globs flattened,
 * engine prose cues compressed to tags the model knows. `$lib/services/be` is
 * the REAL module — the cue vocabulary this maps is the engine's own.
 */
import { describe, expect, it } from 'vitest'
import { compressStateCues, flattenTagGroups, toTags } from './booruTags'
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
