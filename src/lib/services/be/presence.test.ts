// ---- Scene presence scoping for the [BODY STATE] block ----
import { describe, expect, it } from 'vitest'

import {
  PRESENCE_LOOKBACK,
  effectivePresence,
  normalizePresenceName,
  readScenePresence,
  referencedCharacterNames,
  selectScenePresent,
} from './presence'
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

describe('referencedCharacterNames', () => {
  it('collects names from every character-scoped classifier array', () => {
    const names = referencedCharacterNames({
      beEvents: [{ character: 'Amelia', kind: 'catalyst', intensity: 2 }],
      beStates: [{ character: 'Elara', arousal: 40 }],
      beConditions: [{ character: 'Mira', label: 'aching fullness' }],
      bondEvents: [{ character: 'Lucy', direction: 'warm', intensity: 1 }],
      exposureEvents: [{ character: 'Sable', intensity: 2 }],
    })
    expect(names).toEqual(['Amelia', 'Elara', 'Mira', 'Lucy', 'Sable'])
  })

  it('tolerates absent, non-array and malformed entries', () => {
    expect(referencedCharacterNames(null)).toEqual([])
    expect(referencedCharacterNames({})).toEqual([])
    expect(referencedCharacterNames({ beEvents: 'nope' })).toEqual([])
    expect(
      referencedCharacterNames({
        beEvents: [null, 'Amelia', { kind: 'catalyst' }, { character: '   ' }, { character: 7 }],
      }),
    ).toEqual([])
  })

  it('ignores arrays that are not presence evidence', () => {
    expect(referencedCharacterNames({ entryUpdates: [{ character: 'Ghost' }] })).toEqual([])
  })
})

describe('effectivePresence', () => {
  const tracked = ['Amelia', 'Elara']

  it('respects an explicit presence list', () => {
    expect(effectivePresence({ presentCharacterNames: ['Amelia'], trackedNames: tracked })).toEqual(
      new Set(['amelia']),
    )
  })

  it('drops blank and non-string entries from the explicit list', () => {
    expect(effectivePresence({ presentCharacterNames: ['  Amelia  ', '   ', null, 3] })).toEqual(
      new Set(['amelia']),
    )
  })

  it('adds girls the turn referenced by name even when the presence list is empty', () => {
    // The live failure: presence came back [], the classifier's own beEvents
    // named Amelia. She is in the scene; Elara is not.
    const present = effectivePresence({
      presentCharacterNames: [],
      classification: { beEvents: [{ character: 'Amelia', kind: 'catalyst', intensity: 2 }] },
      trackedNames: tracked,
    })
    expect(present).toEqual(new Set(['amelia']))
  })

  it('unions the explicit list with event-referenced girls rather than replacing it', () => {
    const present = effectivePresence({
      presentCharacterNames: ['Elara'],
      classification: { bondEvents: [{ character: 'Amelia', direction: 'warm', intensity: 1 }] },
      trackedNames: tracked,
    })
    expect(present).toEqual(new Set(['elara', 'amelia']))
  })

  it('includes the resolved check target', () => {
    expect(effectivePresence({ presentCharacterNames: [], checkTargetName: 'Amelia' })).toEqual(
      new Set(['amelia']),
    )
  })

  it('falls back to every tracked girl when nothing named anyone', () => {
    // Include-when-in-doubt (module header): a classifier hiccup must not switch
    // the engine off for the turn.
    expect(effectivePresence({ presentCharacterNames: [], trackedNames: tracked })).toEqual(
      new Set(['amelia', 'elara']),
    )
    expect(effectivePresence({})).toEqual(new Set())
  })

  it('does not fall back once anything at all was named', () => {
    const present = effectivePresence({
      presentCharacterNames: ['Some Guard'],
      trackedNames: tracked,
    })
    expect(present).toEqual(new Set(['some guard']))
  })

  it('normalizes every source the same way the module matches names', () => {
    const present = effectivePresence({
      presentCharacterNames: ['  aMELIA '],
      classification: { beEvents: [{ character: 'AMELIA', kind: 'contact', intensity: 1 }] },
      checkTargetName: 'amelia  ',
    })
    expect(present).toEqual(new Set(['amelia']))
    expect(present.has(normalizePresenceName(' Amelia '))).toBe(true)
  })
})
