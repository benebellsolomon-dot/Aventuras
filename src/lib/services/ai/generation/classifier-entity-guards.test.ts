/**
 * guardClassifierEntities — accept-time entity-routing plausibility guard
 * (research/63). The fixture at the bottom is the REAL persisted output of the
 * D5 playtest turn that filled the panels with junk (story d97724f2, entry
 * position 13): a position-filling model parsed cleanly and routed a quest and
 * a plot point into newCharacters, a known character into locationUpdates, a
 * known location into itemUpdates, and "minutes" into scene.currentLocationName.
 */
import { describe, expect, it } from 'vitest'

import type { ClassificationResult } from '../sdk/schemas/classifier'
import {
  ENTITY_NAME_MAX,
  SPACELESS_NAME_MAX,
  guardClassifierEntities,
  knownEntityNames,
  type KnownEntityNames,
} from './classifier-entity-guards'

const emptyKnown: KnownEntityNames = {
  characters: new Set(),
  locations: new Set(),
  items: new Set(),
  storyBeats: new Set(),
}

const base = (overrides: Partial<ClassificationResult['entryUpdates']> = {}, scene = {}) =>
  ({
    entryUpdates: {
      characterUpdates: [],
      locationUpdates: [],
      itemUpdates: [],
      storyBeatUpdates: [],
      newCharacters: [],
      newLocations: [],
      newItems: [],
      newStoryBeats: [],
      ...overrides,
    },
    scene: {
      currentLocationName: null,
      presentCharacterNames: [],
      timeProgression: 'none',
      ...scene,
    },
  }) as ClassificationResult

const reasons = (rejects: { reason: string }[]) => rejects.map((r) => r.reason)

describe('guardClassifierEntities — identity and passthrough', () => {
  it('returns the very same object when nothing is rejected or scrubbed', () => {
    const result = base(
      {
        newCharacters: [{ name: 'Amelia', description: 'the Warden’s stepdaughter' }],
        newLocations: [{ name: 'The Manor Study' }],
        newItems: [{ name: 'Star chart', location: 'inventory' }],
        newStoryBeats: [{ title: 'Camping trip with Amelia', description: 'Packing for a trip' }],
      },
      { currentLocationName: 'The Kitchen', presentCharacterNames: ['Amelia'] },
    )
    const guarded = guardClassifierEntities(result, emptyKnown)
    expect(guarded.result).toBe(result)
    expect(guarded.rejects).toEqual([])
    expect(guarded.result._guardRejects).toBeUndefined()
  })

  it('keeps extension arrays and runtime-var defs on the copy, and records rejects on it', () => {
    const result = {
      ...base({ newCharacters: [{ name: 'minutes' }] }),
      beEvents: [{ character: 'Mira' }],
      _runtimeVarDefs: [{ variableName: 'mood' }],
    } as unknown as ClassificationResult
    const guarded = guardClassifierEntities(result, emptyKnown)
    expect(guarded.result).not.toBe(result)
    expect(guarded.result.beEvents).toEqual([{ character: 'Mira' }])
    expect(guarded.result._runtimeVarDefs).toEqual([{ variableName: 'mood' }])
    expect(guarded.result.entryUpdates.newCharacters).toEqual([])
    expect(guarded.result._guardRejects).toEqual([
      { kind: 'character', field: 'newCharacters', name: 'minutes', reason: 'schema-vocabulary' },
    ])
  })

  it('is idempotent — guarding a guarded result changes nothing and appends no rejects', () => {
    const once = guardClassifierEntities(playtestFixture(), playtestKnown)
    const twice = guardClassifierEntities(once.result, playtestKnown)
    expect(twice.result).toBe(once.result)
    expect(twice.rejects).toEqual([])
    expect(twice.result._guardRejects).toHaveLength(once.rejects.length)
  })

  it('keeps accepted entries verbatim (the store matches raw stored names)', () => {
    const entry = { name: 'Silver   pendant\n of dawn' }
    const guarded = guardClassifierEntities(base({ newItems: [entry] }), emptyKnown)
    expect(guarded.result.entryUpdates.newItems[0]).toBe(entry)
  })

  it('tolerates malformed shapes instead of throwing: missing arrays, null entries, non-string names', () => {
    const result = {
      entryUpdates: { newCharacters: [null, { name: 42 }, { name: 'Elara' }] },
      scene: { currentLocationName: 7, presentCharacterNames: 'Amelia' },
    } as unknown as ClassificationResult
    const guarded = guardClassifierEntities(result, emptyKnown)
    expect(reasons(guarded.rejects)).toEqual(['malformed-entry', 'not-a-string', 'not-a-string'])
    expect(guarded.result.entryUpdates.newCharacters).toEqual([{ name: 'Elara' }])
    expect(guarded.result.entryUpdates.newLocations).toEqual([])
    expect(guarded.result.scene.currentLocationName).toBeNull()
    expect(guarded.result.scene.presentCharacterNames).toEqual([])
  })

  it('rebuilds missing/non-array slots even when nothing else changed (the store dereferences them all)', () => {
    const result = {
      entryUpdates: { characterUpdates: {} },
      scene: { presentCharacterNames: 'Amelia' },
    } as unknown as ClassificationResult
    const guarded = guardClassifierEntities(result, emptyKnown)
    expect(guarded.rejects).toEqual([])
    expect(guarded.result.entryUpdates).toEqual({
      characterUpdates: [],
      locationUpdates: [],
      itemUpdates: [],
      storyBeatUpdates: [],
      newCharacters: [],
      newLocations: [],
      newItems: [],
      newStoryBeats: [],
    })
    expect(guarded.result.scene.presentCharacterNames).toEqual([])
    expect(guarded.result._guardRejects).toBeUndefined()
    // A missing scene is seeded with engine-safe defaults.
    const noScene = guardClassifierEntities(
      { entryUpdates: {} } as unknown as ClassificationResult,
      emptyKnown,
    )
    expect(noScene.result.scene).toEqual({
      currentLocationName: null,
      presentCharacterNames: [],
      timeProgression: 'none',
    })
  })
})

describe('vocabulary rules', () => {
  it('rejects HARD vocabulary (time/status/literal) in any case or decoration, for every kind', () => {
    const guarded = guardClassifierEntities(
      base(
        {
          newCharacters: [{ name: 'Active' }],
          newLocations: [{ name: 'minutes.' }, { name: 'minutes​' }],
          newItems: [{ name: 'NULL' }],
          newStoryBeats: [{ title: '"pending"' }],
        },
        { currentLocationName: 'Hours', presentCharacterNames: ['none'] },
      ),
      emptyKnown,
    )
    expect(reasons(guarded.rejects)).toEqual(Array(7).fill('schema-vocabulary'))
    expect(guarded.result.scene.currentLocationName).toBeNull()
    expect(guarded.result.scene.presentCharacterNames).toEqual([])
  })

  it('rejects SOFT vocabulary only in exact lowercase enum form — "Ally", "Na", "Revelation" are names', () => {
    const guarded = guardClassifierEntities(
      base({
        newCharacters: [{ name: 'quest' }, { name: 'Ally' }, { name: 'Na' }, { name: 'Unknown' }],
        newItems: [{ name: 'inventory' }, { name: 'Ground' }],
        newStoryBeats: [{ title: 'plot_point' }, { title: 'Revelation' }],
      }),
      emptyKnown,
    )
    expect(guarded.rejects.map((r) => r.name)).toEqual(['quest', 'inventory', 'plot_point'])
    expect(guarded.result.entryUpdates.newCharacters.map((c) => c.name)).toEqual([
      'Ally',
      'Na',
      'Unknown',
    ])
  })

  it('rejects time phrases routed into a name field but keeps deadline-style titles', () => {
    const guarded = guardClassifierEntities(
      base(
        {
          newLocations: [
            { name: 'a few minutes later' },
            { name: 'Several days pass' },
            { name: 'Hours' },
            { name: 'A moment' },
          ],
          newStoryBeats: [
            { title: 'Seven Days' },
            { title: 'Ten Years' },
            { title: 'The Hours' },
            { title: 'Days Before' },
            { title: 'Hour of the Wolf' },
            { title: 'Moment' },
          ],
        },
        { currentLocationName: 'Two hours ago' },
      ),
      emptyKnown,
    )
    // "Hours" is HARD vocabulary; "Days Before" (bare unit + qualifier) is the
    // accepted casualty — "hours later" is a realistic misroute.
    expect(guarded.rejects.map((r) => `${r.name}:${r.reason}`)).toEqual([
      'a few minutes later:time-phrase',
      'Several days pass:time-phrase',
      'Hours:schema-vocabulary',
      'A moment:time-phrase',
      'Days Before:time-phrase',
      'Two hours ago:time-phrase',
    ])
    expect(guarded.result.entryUpdates.newStoryBeats.map((b) => b.title)).toEqual([
      'Seven Days',
      'Ten Years',
      'The Hours',
      'Hour of the Wolf',
      'Moment',
    ])
  })
})

describe('shape rules', () => {
  it('rejects a multi-sentence narrative as a location name', () => {
    const narrative =
      'Amelia challenged her stepfather to a sparring match with practice daggers in the rainy yard. First bout went to Amelia.'
    const guarded = guardClassifierEntities(
      base({ newLocations: [{ name: narrative }] }),
      emptyKnown,
    )
    expect(guarded.rejects[0].reason).toMatch(/^too-long/)
  })

  it('rejects short sentence-shaped names but keeps honorifics, initials, and a trailing period', () => {
    const guarded = guardClassifierEntities(
      base({
        newCharacters: [
          { name: "St. Mary's Hospital for the Infirm" },
          { name: "Mr. Smith's Emporium of Rare Things" },
          { name: 'Dr. Elias Vance of the Ninth Ward' },
          { name: 'J. R. R. Tolkien' },
          { name: 'Ye Olde Shoppe of Wonders and Curios.' },
        ],
        newLocations: [
          { name: 'The kitchen. Amelia stood there.' },
          { name: 'She walked in and sat down. Then nothing' },
          { name: '她走进厨房，看见了那把刀。' },
          { name: '她走进厨房，看见了那把刀' },
          { name: '東京タワー' },
        ],
      }),
      emptyKnown,
    )
    expect(guarded.result.entryUpdates.newCharacters).toHaveLength(5)
    expect(guarded.result.entryUpdates.newLocations).toEqual([{ name: '東京タワー' }])
    expect(reasons(guarded.rejects)).toEqual(Array(4).fill('sentence-shaped'))
  })

  it('caps length and words, and caps spaceless names tighter; requires a letter', () => {
    const guarded = guardClassifierEntities(
      base({
        newItems: [
          { name: 'a b c d e f g h i j k l m' },
          { name: '   ' },
          { name: '3' },
          { name: '...' },
          { name: 'x'.repeat(SPACELESS_NAME_MAX + 1) },
          { name: 'Archmage Thessaly of the Ninth Spire, Keeper of the Dawn Gate' },
          { name: 'Donaudampfschifffahrtsgesell' },
        ],
      }),
      emptyKnown,
    )
    expect(reasons(guarded.rejects)).toEqual([
      'too-many-words (13>12)',
      'empty',
      'no-letters',
      'no-letters',
      `too-long (${SPACELESS_NAME_MAX + 1}>${SPACELESS_NAME_MAX} spaceless)`,
    ])
    expect(guarded.result.entryUpdates.newItems.map((i) => i.name)).toEqual([
      'Archmage Thessaly of the Ninth Spire, Keeper of the Dawn Gate',
      'Donaudampfschifffahrtsgesell',
    ])
  })

  it(`accepts a name exactly at the ${ENTITY_NAME_MAX}-char cap and rejects one over`, () => {
    const atCap = ('Abcdefghi '.repeat(8) + 'x').slice(0, ENTITY_NAME_MAX)
    expect(atCap.length).toBe(ENTITY_NAME_MAX)
    expect(
      guardClassifierEntities(base({ newLocations: [{ name: atCap }] }), emptyKnown).rejects,
    ).toEqual([])
    const over = guardClassifierEntities(
      base({ newLocations: [{ name: atCap + 'y' }] }),
      emptyKnown,
    )
    expect(over.rejects[0].reason).toBe(`too-long (${ENTITY_NAME_MAX + 1}>${ENTITY_NAME_MAX})`)
  })
})

describe('type-routing rules', () => {
  it('rejects a "character" whose relationship is a story-beat type', () => {
    const guarded = guardClassifierEntities(
      base({
        newCharacters: [
          { name: 'Camping trip with Amelia', relationship: 'quest' },
          { name: "Lady Elswyth's loaf", relationship: 'plot_point' },
          { name: 'Elara', relationship: 'friend' },
        ],
      }),
      emptyKnown,
    )
    expect(reasons(guarded.rejects)).toEqual([
      'relationship-is-beat-type',
      'relationship-is-beat-type',
    ])
    expect(guarded.result.entryUpdates.newCharacters.map((c) => c.name)).toEqual(['Elara'])
  })

  it('rejects a NEW location/item/beat that exactly names a known entity of another type', () => {
    const known = knownEntityNames({
      characters: [{ name: 'Cook Maren' }],
      locations: [{ name: 'The Kitchen' }],
      items: [{ name: 'Star chart' }],
      storyBeats: [{ title: 'Camping trip with Amelia' }],
    })
    const guarded = guardClassifierEntities(
      base({
        newLocations: [{ name: 'cook maren' }, { name: 'Camping trip with Amelia' }],
        newItems: [{ name: 'The Kitchen' }],
        newStoryBeats: [{ title: 'Star Chart' }],
        newCharacters: [{ name: 'Camping trip with Amelia', relationship: 'friend' }],
      }),
      known,
    )
    expect(reasons(guarded.rejects)).toEqual([
      'names-a-known-story-beat',
      'names-a-known-character',
      'names-a-known-story-beat',
      'names-a-known-location',
      'names-a-known-item',
    ])
  })

  it('lets a NEW character share a name with a known location or item (sword-spirit "Dawn")', () => {
    const known = knownEntityNames({
      characters: [],
      locations: [{ name: 'Eden' }],
      items: [{ name: 'Dawn' }],
      storyBeats: [],
    })
    const guarded = guardClassifierEntities(
      base({ newCharacters: [{ name: 'Dawn' }, { name: 'Eden' }] }),
      known,
    )
    expect(guarded.rejects).toEqual([])
  })

  it('currentLocationName: rejects a known character/item/beat, keeps a known location even if long', () => {
    const longPlace = 'The Grand Cathedral of the Eternal Flame at Highwater on the Northern Shore'
    const known = knownEntityNames({
      characters: [{ name: 'Amelia' }],
      locations: [{ name: 'The Kitchen' }, { name: longPlace }],
      items: [],
      storyBeats: [],
    })
    const at = (name: string) =>
      guardClassifierEntities(base({}, { currentLocationName: name }), known).result.scene
        .currentLocationName
    expect(at('Amelia')).toBeNull()
    expect(at('  The Kitchen ')).toBe('  The Kitchen ')
    expect(at(longPlace)).toBe(longPlace)
  })

  it('scrubs leaked enum tokens out of prose fields on new entries without dropping the entity', () => {
    const guarded = guardClassifierEntities(
      base({
        newCharacters: [{ name: 'Elara', relationship: 'active', description: 'a traveller' }],
        newLocations: [{ name: 'Rainy Yard', description: 'active' }],
        newItems: [{ name: 'Dagger', location: '', description: 'Worn' }],
        newStoryBeats: [{ title: 'Star Chart', description: 'pending' }],
      }),
      emptyKnown,
    )
    expect(guarded.rejects).toEqual([])
    const eu = guarded.result.entryUpdates
    expect(eu.newCharacters[0]).toEqual({ name: 'Elara', description: 'a traveller' })
    expect(eu.newLocations[0]).toEqual({ name: 'Rainy Yard' })
    // "Worn" as a DESCRIPTION is prose; an empty item location is a leak.
    expect(eu.newItems[0]).toEqual({ name: 'Dagger', description: 'Worn' })
    expect(eu.newStoryBeats[0]).toEqual({ title: 'Star Chart' })
  })

  it('scrubs leaked enum tokens out of update `changes` too (the destructive side)', () => {
    const known = knownEntityNames({
      characters: [{ name: 'Amelia' }],
      locations: [{ name: 'The Kitchen' }],
      items: [{ name: 'Dagger' }],
      storyBeats: [{ title: 'Star Chart' }],
    })
    const guarded = guardClassifierEntities(
      base({
        characterUpdates: [
          { name: 'Amelia', changes: { relationship: 'quest', status: 'active' } },
        ],
        locationUpdates: [
          {
            name: 'The Kitchen',
            changes: { description: 'active', descriptionAddition: 'pending' },
          },
        ],
        itemUpdates: [{ name: 'Dagger', changes: { location: '', equipped: true } }],
        storyBeatUpdates: [
          { title: 'Star Chart', changes: { description: '', status: 'completed' } },
        ],
      }),
      known,
    )
    expect(guarded.rejects).toEqual([])
    const eu = guarded.result.entryUpdates
    expect(eu.characterUpdates[0].changes).toEqual({ status: 'active' })
    expect(eu.locationUpdates[0].changes).toEqual({})
    expect(eu.itemUpdates[0].changes).toEqual({ equipped: true })
    expect(eu.storyBeatUpdates[0].changes).toEqual({ status: 'completed' })
  })

  it('drops junk presentCharacterNames entries but keeps real ones (known or new)', () => {
    const guarded = guardClassifierEntities(
      base({}, { presentCharacterNames: ['Amelia', 'minutes', 'a few minutes later', 'Elara'] }),
      knownEntityNames({
        // A junk character row that already exists must still not be marked present.
        characters: [{ name: 'Amelia' }, { name: 'minutes' }],
        locations: [],
        items: [],
        storyBeats: [],
      }),
    )
    expect(guarded.result.scene.presentCharacterNames).toEqual(['Amelia', 'Elara'])
    expect(guarded.rejects.map((r) => [r.kind, r.reason])).toEqual([
      ['presentCharacter', 'schema-vocabulary'],
      ['presentCharacter', 'time-phrase'],
    ])
  })
})

describe('update arrays — known-name bypass and paired rejection', () => {
  const known = knownEntityNames({
    characters: [
      {
        name: 'A very long user-created character name that exceeds the cap easily, truly, by a lot of words',
      },
      { name: 'Ally' },
    ],
    locations: [{ name: 'minutes' }],
    items: [],
    storyBeats: [{ title: 'Midsummer Ball Dispute' }],
  })

  it('lets an update through for a KNOWN same-type entity even when the name fails shape/soft rules', () => {
    const guarded = guardClassifierEntities(
      base({
        characterUpdates: [
          {
            name: 'A very long user-created character name that exceeds the cap easily, truly, by a lot of words',
            changes: { status: 'inactive' },
          },
          { name: 'ally', changes: { newTraits: ['loyal'] } },
        ],
        storyBeatUpdates: [{ title: 'Midsummer Ball Dispute', changes: { status: 'completed' } }],
      }),
      known,
    )
    expect(guarded.rejects).toEqual([])
  })

  it('still rejects a HARD-vocabulary update even when that junk row already exists', () => {
    const guarded = guardClassifierEntities(
      base({ locationUpdates: [{ name: 'minutes', changes: { current: true } }] }),
      known,
    )
    expect(reasons(guarded.rejects)).toEqual(['schema-vocabulary'])
  })

  it('holds an UNKNOWN update name (which would stub a row) to the new-entity bar', () => {
    const guarded = guardClassifierEntities(
      base({
        locationUpdates: [
          { name: 'Cook Maren', changes: { description: 'broad woman' } },
          { name: 'Rainy Yard', changes: { visited: true } },
        ],
      }),
      knownEntityNames({
        characters: [{ name: 'Cook Maren' }],
        locations: [],
        items: [],
        storyBeats: [],
      }),
    )
    expect(guarded.rejects).toEqual([
      {
        kind: 'location',
        field: 'locationUpdates',
        name: 'Cook Maren',
        reason: 'names-a-known-character',
      },
    ])
    expect(guarded.result.entryUpdates.locationUpdates.map((l) => l.name)).toEqual(['Rainy Yard'])
  })

  it('rejects the paired update when the NEW entry of the same name was rejected', () => {
    const guarded = guardClassifierEntities(
      base({
        newCharacters: [{ name: 'Star chart promise', relationship: 'quest' }],
        characterUpdates: [{ name: 'star chart promise', changes: { status: 'active' } }],
        newItems: [{ name: 'The Kitchen' }],
        itemUpdates: [{ name: 'The Kitchen', changes: { quantity: 2 } }],
      }),
      knownEntityNames({
        characters: [],
        locations: [{ name: 'The Kitchen' }],
        items: [],
        storyBeats: [],
      }),
    )
    expect(guarded.rejects.map((r) => `${r.field}:${r.reason}`)).toEqual([
      'newCharacters:relationship-is-beat-type',
      'characterUpdates:paired-new-entry-rejected',
      'newItems:names-a-known-location',
      'itemUpdates:paired-new-entry-rejected',
    ])
  })
})

// ---------------------------------------------------------------------------
// Real playtest payload (persisted worldStateDelta.classificationResult, trimmed)
// ---------------------------------------------------------------------------

const playtestKnown = knownEntityNames({
  characters: [{ name: 'Amelia' }, { name: 'The Warden' }, { name: 'Cook Maren' }],
  locations: [{ name: 'The Kitchen' }, { name: 'The Manor Study' }],
  items: [],
  storyBeats: [{ title: 'Star Chart' }],
})

function playtestFixture(): ClassificationResult {
  return base(
    {
      newCharacters: [
        {
          name: 'Camping trip with Amelia',
          description:
            'Amelia and the Warden are preparing for a multi-day camping trip together — packing gear, food, and the star chart he promised her years ago',
          relationship: 'quest',
          traits: [],
          visualDescriptors: { face: '', hair: '', eyes: '', build: '' },
          status: 'active',
        },
        {
          name: "Lady Elswyth's loaf",
          description: 'Amelia is baking her late mother’s recipe',
          relationship: 'plot_point',
          traits: [],
          status: 'active',
        },
      ],
      characterUpdates: [
        {
          name: 'Amelia',
          changes: {
            status: 'active',
            relationship: '',
            visualDescriptors: { face: 'fair skin, gold eyes, flour dusting one cheek' },
          },
        },
      ],
      locationUpdates: [
        {
          name: 'Cook Maren',
          changes: { visited: false, current: false, description: 'broad woman' },
        },
      ],
      itemUpdates: [
        { name: 'The Kitchen', changes: { quantity: 0, location: '', equipped: false } },
      ],
      storyBeatUpdates: [{ title: 'Star Chart', changes: { status: 'pending', description: '' } }],
    },
    { currentLocationName: 'minutes', presentCharacterNames: [], timeProgression: 'none' },
  )
}

describe('the D5 playtest payload', () => {
  it('drops every mis-routed entity, keeps the legitimate Amelia update, scrubs its leaked fields', () => {
    const guarded = guardClassifierEntities(playtestFixture(), playtestKnown)
    expect(guarded.rejects.map((r) => `${r.field}:${r.name}:${r.reason}`)).toEqual([
      'newCharacters:Camping trip with Amelia:relationship-is-beat-type',
      "newCharacters:Lady Elswyth's loaf:relationship-is-beat-type",
      'locationUpdates:Cook Maren:names-a-known-character',
      'itemUpdates:The Kitchen:names-a-known-location',
      'scene.currentLocationName:minutes:schema-vocabulary',
    ])
    const eu = guarded.result.entryUpdates
    expect(eu.newCharacters).toEqual([])
    expect(eu.locationUpdates).toEqual([])
    expect(eu.itemUpdates).toEqual([])
    expect(eu.characterUpdates).toEqual([
      {
        name: 'Amelia',
        changes: {
          status: 'active',
          visualDescriptors: { face: 'fair skin, gold eyes, flour dusting one cheek' },
        },
      },
    ])
    expect(eu.storyBeatUpdates).toEqual([{ title: 'Star Chart', changes: { status: 'pending' } }])
    expect(guarded.result.scene.currentLocationName).toBeNull()
    expect(guarded.result.scene.timeProgression).toBe('none')
    expect(guarded.result._guardRejects).toHaveLength(5)
  })
})
