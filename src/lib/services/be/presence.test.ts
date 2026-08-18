// ---- Scene presence scoping for the [BODY STATE] block ----
import { describe, expect, it } from 'vitest'

import { PRESENCE_LOOKBACK, readScenePresence, selectScenePresent } from './presence'
import type { PresenceEntrySource } from './presence'

const narration = (names?: string[]): PresenceEntrySource => ({
  type: 'narration',
  worldStateDelta:
    names === undefined
      ? null
      : { classificationResult: { scene: { presentCharacterNames: names } } },
})

const userAction: PresenceEntrySource = { type: 'user_action', worldStateDelta: null }

const cast = [{ name: 'Mira' }, { name: 'Lucy' }, { name: 'Sable' }]

describe('readScenePresence', () => {
  it('returns null when there are no entries at all', () => {
    expect(readScenePresence([])).toBeNull()
  })

  it('returns null when no narration entry carries classifier presence', () => {
    expect(readScenePresence([userAction, narration(), narration()])).toBeNull()
  })

  it('reads the most recent non-empty presence list, lowercased and trimmed', () => {
    const present = readScenePresence([narration(['Sable']), narration([' Mira ', 'Lucy'])])
    expect(present).toEqual(new Set(['mira', 'lucy']))
  })

  it('is sticky across empty classifier reads (people do not teleport out)', () => {
    const present = readScenePresence([narration(['Mira']), narration([]), narration([])])
    expect(present).toEqual(new Set(['mira']))
  })

  it('ignores presence older than the lookback window', () => {
    const entries = [
      narration(['Mira']),
      ...Array.from({ length: PRESENCE_LOOKBACK }, () => narration([])),
    ]
    expect(readScenePresence(entries)).toBeNull()
  })

  it('does not count user actions against the lookback budget', () => {
    const entries = [
      narration(['Mira']),
      ...Array.from({ length: 40 }, () => userAction),
      narration([]),
    ]
    expect(readScenePresence(entries)).toEqual(new Set(['mira']))
  })
})

describe('selectScenePresent', () => {
  it('includes everyone when presence cannot be determined', () => {
    expect(selectScenePresent(cast, [])).toEqual(cast)
    expect(selectScenePresent(cast, [userAction, narration()])).toEqual(cast)
  })

  it('keeps only the characters the classifier reported in the scene', () => {
    const selected = selectScenePresent(cast, [narration(['Lucy'])])
    expect(selected.map((c) => c.name)).toEqual(['Lucy'])
  })

  it('matches names case- and whitespace-insensitively', () => {
    const selected = selectScenePresent(cast, [narration(['  sABLE  '])])
    expect(selected.map((c) => c.name)).toEqual(['Sable'])
  })

  it('always includes the named always-include characters (the PC is the camera)', () => {
    const selected = selectScenePresent(cast, [narration(['Lucy'])], { alwaysInclude: ['mira'] })
    expect(selected.map((c) => c.name)).toEqual(['Mira', 'Lucy'])
  })

  it('falls back to everyone when presence names match no tracked character', () => {
    const selected = selectScenePresent(cast, [narration(['Some Guard'])])
    expect(selected).toEqual(cast)
  })

  it('preserves the input order of the surviving characters', () => {
    const selected = selectScenePresent(cast, [narration(['Sable', 'Mira'])])
    expect(selected.map((c) => c.name)).toEqual(['Mira', 'Sable'])
  })

  it('returns the input untouched when there is nothing to scope', () => {
    expect(selectScenePresent([], [narration(['Mira'])])).toEqual([])
  })
})
