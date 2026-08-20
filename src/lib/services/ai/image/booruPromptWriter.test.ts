/**
 * Tests for the dedicated booru scene-prompt writer (research/55 follow-up).
 *
 * The AI + settings + context + database layers are mocked so the pure dossier
 * assembly, the call contract, and the gating/fallback paths are exercised
 * without a live model. `$lib/services/be` and `./dialect` are the REAL pure
 * modules — the body-size phrase and booru-model detection are part of what we
 * assert.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateStructured: vi.fn(),
  getServicePresetId: vi.fn(),
  getLocations: vi.fn(),
  ctxAdd: vi.fn(),
  ctxRender: vi.fn(),
  imageGenSettings: { dedicatedBooruPromptWriter: true } as { dedicatedBooruPromptWriter: boolean },
}))

vi.mock('../sdk/generate', () => ({
  generateStructured: mocks.generateStructured,
}))

vi.mock('$lib/stores/settings.svelte', () => ({
  settings: {
    getServicePresetId: mocks.getServicePresetId,
    systemServicesSettings: { imageGeneration: mocks.imageGenSettings },
  },
}))

vi.mock('$lib/services/context', () => ({
  ContextBuilder: vi.fn().mockImplementation(function () {
    return { add: mocks.ctxAdd, render: mocks.ctxRender }
  }),
}))

vi.mock('$lib/services/database', () => ({
  database: { getLocations: mocks.getLocations },
}))

import {
  BOORU_MAX_TAGS,
  buildExpressionCues,
  buildLocationBlock,
  buildSizeSanctions,
  buildSubjectDossier,
  composeBooruScenePrompt,
  resolveBooruScenePrompt,
  stripCharacterNames,
  writeBooruScenePrompt,
  type BooruPromptWriterInput,
  type BooruSceneSections,
} from './booruPromptWriter'
import {
  apparentTier,
  bandWord,
  defaultBodyState,
  readBodyState,
  writeBodyState,
} from '$lib/services/be'
import { imageTemplates } from '$lib/services/prompts/templates/image'
import type { Character, Location } from '$lib/types'

const BOORU_MODEL = 'wai-illustrious-sdxl'
const PROSE_MODEL = 'z-image-turbo'

/** Minimal Character factory — only the fields the writer reads. */
function makeChar(partial: Partial<Character> & { name: string }): Character {
  return {
    imageTags: null,
    visualDescriptors: undefined,
    currentVisualDescriptors: null,
    metadata: null,
    ...partial,
  } as unknown as Character
}

const amelia = makeChar({
  name: 'Amelia',
  imageTags: '1girl, blonde hair, golden eyes, fair skin, slim, wide hips, young adult',
  visualDescriptors: { clothing: 'blue sundress' },
  currentVisualDescriptors: { clothing: 'torn work dress, apron' },
})

/** A character with NO locked bank — the writer must feed appearance prose. */
const bella = makeChar({
  name: 'Bella',
  imageTags: null,
  visualDescriptors: {
    face: 'freckled',
    hair: 'long red hair',
    eyes: 'green eyes',
    clothing: 'green cloak',
  },
})

function baseInput(overrides: Partial<BooruPromptWriterInput> = {}): BooruPromptWriterInput {
  return {
    presentCharacters: [amelia, bella],
    tagCharacterNames: ['Amelia'],
    scenePrompt: 'she curls up on the bed, moonlight through the curtains',
    narrativeText: 'The room was quiet as Amelia settled in for the night.',
    beMode: false,
    storyId: 'story-1',
    ...overrides,
  }
}

/** The writer returns SECTIONS; `composeBooruScenePrompt` imposes the order. */
function sections(overrides: Partial<BooruSceneSections> = {}): BooruSceneSections {
  return {
    rating: 'general',
    camera: '',
    countTags: '1girl, solo',
    action: '',
    characters: [],
    expressions: [],
    scene: 'bedroom',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getServicePresetId.mockReturnValue('preset-image')
  mocks.getLocations.mockResolvedValue([])
  mocks.ctxRender.mockResolvedValue({ system: 'SYS', user: 'USR' })
  mocks.generateStructured.mockResolvedValue(sections())
  mocks.imageGenSettings.dedicatedBooruPromptWriter = true
})

describe('buildSubjectDossier', () => {
  it('copies a locked identity bank verbatim for a tagged subject', () => {
    const dossier = buildSubjectDossier([amelia, bella], ['Amelia'], false)
    expect(dossier).toContain('- Amelia:')
    expect(dossier).toContain(
      'identity tags (copy VERBATIM): 1girl, blonde hair, golden eyes, fair skin, slim, wide hips, young adult',
    )
    // Bella is present but not tagged — she must not appear.
    expect(dossier).not.toContain('Bella')
  })

  it('feeds appearance descriptors for conversion when there is no bank', () => {
    const dossier = buildSubjectDossier([bella], ['Bella'], false)
    expect(dossier).toContain('appearance (convert to booru identity tags):')
    expect(dossier).toContain('hair: long red hair')
    expect(dossier).not.toContain('copy VERBATIM')
  })

  it('prefers current clothing over the baseline outfit', () => {
    const dossier = buildSubjectDossier([amelia], ['Amelia'], false)
    expect(dossier).toContain('current clothing: torn work dress, apron')
    expect(dossier).not.toContain('blue sundress')
  })

  it('omits the body line when beMode is off, includes the band word when on', () => {
    const tier = 18
    const engorged = makeChar({
      name: 'Cora',
      imageTags: '1girl, black hair',
      metadata: writeBodyState(null, defaultBodyState(tier)),
    })
    const off = buildSubjectDossier([engorged], ['Cora'], false)
    expect(off).not.toContain('body:')

    const on = buildSubjectDossier([engorged], ['Cora'], true)
    const state = defaultBodyState(tier)
    expect(on).toContain('body:')
    expect(on).toContain(bandWord(apparentTier(state)))
  })

  it('renders the body line as booru tags — no cup letter, cues compressed', () => {
    const state = defaultBodyState(20)
    const lactating = makeChar({
      name: 'Cora',
      imageTags: '1girl, black hair',
      metadata: writeBodyState(null, {
        ...state,
        fluids: { fillPercent: 50, fluidType: 'Milk' },
        arousal: 80,
      }),
    })
    const dossier = buildSubjectDossier([lactating], ['Cora'], true)
    expect(dossier).toContain(`body: ${bandWord(20)}, lactation, blush, heavy breathing`)
    expect(dossier).not.toContain('-cup')
    expect(dossier).not.toMatch(/swollen with/i)
  })

  it('surfaces a breast-expansion cue in the body line on the turn growth landed', () => {
    const state = defaultBodyState(20)
    const grown = makeChar({
      name: 'Cora',
      imageTags: '1girl, black hair',
      metadata: writeBodyState(null, { ...state, lastGrowth: { delta: 2, tierBefore: 16 } }),
    })
    const dossier = buildSubjectDossier([grown], ['Cora'], true)
    expect(dossier).toContain('body:')
    expect(dossier).toContain('breast expansion')
  })

  it('states the engine expression as booru tags in BE mode', () => {
    const aroused = makeChar({
      name: 'Cora',
      imageTags: '1girl, black hair',
      metadata: writeBodyState(null, { ...defaultBodyState(20), arousal: 90 }),
    })
    expect(buildSubjectDossier([aroused], ['Cora'], true)).toContain(
      'expression (engine state — copy VERBATIM into her expression run, then add what the beat shows): blush, half-closed eyes, open mouth',
    )
    expect(buildSubjectDossier([aroused], ['Cora'], false)).not.toContain('expression (engine')
  })

  it('omits the expression line when the engine evidences no emotional state', () => {
    const calm = makeChar({
      name: 'Cora',
      imageTags: '1girl, black hair',
      metadata: writeBodyState(null, defaultBodyState(20)),
    })
    expect(buildSubjectDossier([calm], ['Cora'], true)).not.toContain('expression (engine')
  })

  it('returns a placeholder when no named subject resolves', () => {
    const dossier = buildSubjectDossier([amelia], ['Nonexistent'], false)
    expect(dossier).toContain('no named subjects')
  })

  it('resolves subjects in tag order and dedupes repeats', () => {
    const dossier = buildSubjectDossier([amelia, bella], ['bella', 'Amelia', 'BELLA'], false)
    expect(dossier.indexOf('- Bella:')).toBeLessThan(dossier.indexOf('- Amelia:'))
    expect(dossier.match(/- Bella:/g)).toHaveLength(1)
  })
})

describe('buildExpressionCues', () => {
  const cora = makeChar({
    name: 'Cora',
    imageTags: '1girl, black hair, red eyes',
    metadata: writeBodyState(null, { ...defaultBodyState(20), arousal: 90 }),
  })
  const resentful = makeChar({
    name: 'Dana',
    imageTags: '1girl, red hair',
    metadata: writeBodyState(null, { ...defaultBodyState(12), attitude: 'resentful' }),
  })

  it('reads the engine soft state of each tagged subject, in tag order', () => {
    const cues = buildExpressionCues([cora, resentful], ['Dana', 'Cora'], true)
    expect(cues).toEqual([
      { identityTags: ['1girl', 'red hair'], expressionTags: ['scowl'] },
      {
        identityTags: ['1girl', 'black hair', 'red eyes'],
        expressionTags: ['blush', 'half-closed eyes', 'open mouth'],
      },
    ])
  })

  it('is empty outside BE mode — the reducer is the only writer of that state', () => {
    expect(buildExpressionCues([cora], ['Cora'], false)).toEqual([])
  })

  it('skips a subject with no body state and one the engine reads as neutral', () => {
    const neutral = makeChar({
      name: 'Eve',
      imageTags: '1girl, brown hair',
      metadata: writeBodyState(null, defaultBodyState(10)),
    })
    expect(buildExpressionCues([amelia, neutral], ['Amelia', 'Eve'], true)).toEqual([])
  })
})

describe('stripCharacterNames', () => {
  const present = [makeChar({ name: 'Amelia' }), makeChar({ name: 'Hana' })]

  it('drops a leaked character name that appears as a standalone tag', () => {
    const out = stripCharacterNames(
      '1girl, solo, Amelia, blonde hair, golden eyes, bedroom',
      present,
    )
    expect(out).toBe('1girl, solo, blonde hair, golden eyes, bedroom')
  })

  it('is case-insensitive and handles multiple names', () => {
    const out = stripCharacterNames('2girls, hana, amelia, kissing, bed', present)
    expect(out).toBe('2girls, kissing, bed')
  })

  it('leaves a name embedded inside a multi-subject clause alone', () => {
    const out = stripCharacterNames("on the left, a woman grabbing Hana's arm, forest", present)
    expect(out).toContain("grabbing Hana's arm")
  })

  it('returns the prompt unchanged when no characters are present', () => {
    expect(stripCharacterNames('1girl, solo, blonde hair', [])).toBe('1girl, solo, blonde hair')
  })
})

describe('buildLocationBlock', () => {
  it('renders name and description', () => {
    const loc = { name: 'Bedroom', description: 'a small candlelit room' } as Location
    expect(buildLocationBlock(loc)).toContain('Bedroom — a small candlelit room')
  })

  it('is empty for a missing location', () => {
    expect(buildLocationBlock(null)).toBe('')
    expect(buildLocationBlock(undefined)).toBe('')
  })
})

describe('composeBooruScenePrompt', () => {
  // The live failure (research/56): a two-character bed paizuri scene rendered
  // as a standing hallway shirt-lift because the action + setting tags sat
  // behind ~20 tags of parenthesized identity clauses, past CLIP's attention.
  const bedScene: BooruSceneSections = {
    rating: 'explicit, uncensored, detailed anatomy',
    camera: 'cowboy shot',
    countTags: '1boy, 1girl',
    action: 'hetero, paizuri, breast squeezing, penis between breasts, lying on back',
    characters: [
      '(on the right, 1boy, muscular, completely nude)',
      '(on the left, 1girl, blonde hair, golden eyes, fair skin, slim, wide hips, young adult, completely nude, huge breasts, open mouth)',
    ],
    expressions: ['', 'blush'],
    scene:
      'dark silk bedsheets, ornate manor bedroom, king-sized bed, moonlight through window, night, depth of field',
  }

  it('orders action ahead of the per-character identity runs, with size hoisted between', () => {
    const prompt = composeBooruScenePrompt(bedScene)
    expect(prompt).toBe(
      'explicit, uncensored, detailed anatomy, cowboy shot, 1boy, 1girl, ' +
        'hetero, paizuri, breast squeezing, penis between breasts, lying on back, ' +
        'huge breasts, ' +
        'on the right, muscular, completely nude, ' +
        'on the left, blonde hair, golden eyes, fair skin, slim, wide hips, young adult, blush, open mouth, ' +
        'dark silk bedsheets, ornate manor bedroom, king-sized bed, moonlight through window, night, depth of field',
    )
    expect(prompt.indexOf('paizuri')).toBeLessThan(prompt.indexOf('blonde hair'))
    expect(prompt.indexOf('lying on back')).toBeLessThan(prompt.indexOf('muscular'))
  })

  it('hoists the size band ahead of the character runs, keeping the early copy', () => {
    const prompt = composeBooruScenePrompt(bedScene)
    expect(prompt.match(/huge breasts/g)).toHaveLength(1)
    expect(prompt.indexOf('huge breasts')).toBeLessThan(prompt.indexOf('on the right'))
    expect(prompt.indexOf('lying on back')).toBeLessThan(prompt.indexOf('huge breasts'))
  })

  it('hoists a relative-size anchor alongside the band word', () => {
    const prompt = composeBooruScenePrompt({
      countTags: '1girl, solo',
      action: 'standing',
      characters: [
        'blonde hair, blue eyes, nude, gigantic breasts, breasts bigger than head, blush',
      ],
      scene: 'bedroom',
    })
    expect(prompt).toBe(
      '1girl, solo, standing, gigantic breasts, breasts bigger than head, ' +
        'blonde hair, blue eyes, nude, blush, bedroom',
    )
  })

  it('hoists each subject size in count-tag order for a multi-subject scene', () => {
    const prompt = composeBooruScenePrompt({
      countTags: '2girls',
      action: 'kissing',
      characters: [
        'blonde hair, blue eyes, medium breasts, nude',
        'black hair, red eyes, huge breasts, nude',
      ],
      scene: 'bedroom',
    })
    expect(prompt).toBe(
      '2girls, kissing, medium breasts, huge breasts, ' +
        'blonde hair, blue eyes, nude, black hair, red eyes, bedroom',
    )
  })

  it('flattens pseudo-regional parentheses — booru models have no regional prompter', () => {
    expect(composeBooruScenePrompt(bedScene)).not.toContain('(')
  })

  it('keeps the character runs in count-tag order', () => {
    const prompt = composeBooruScenePrompt(bedScene)
    expect(prompt.indexOf('1boy')).toBeLessThan(prompt.indexOf('1girl'))
    expect(prompt.indexOf('muscular')).toBeLessThan(prompt.indexOf('blonde hair'))
  })

  it('de-dupes tags that repeat across sections, keeping the first', () => {
    const prompt = composeBooruScenePrompt(bedScene)
    expect(prompt.match(/\b1girl\b/g)).toHaveLength(1)
    expect(prompt.match(/completely nude/g)).toHaveLength(1)
  })

  it('drops a weight suffix left behind by an unwrapped glob', () => {
    const prompt = composeBooruScenePrompt({
      countTags: '1girl',
      characters: ['(blonde hair, blue eyes:1.2)'],
    })
    expect(prompt).toBe('1girl, blonde hair, blue eyes')
  })

  it('trims setting detail first when the tag budget is exceeded', () => {
    const identity = Array.from({ length: 40 }, (_, i) => `identity${i}`)
    const scene = Array.from({ length: 20 }, (_, i) => `scenery${i}`)
    const prompt = composeBooruScenePrompt({
      countTags: '1girl, solo',
      action: 'sitting, reading',
      characters: [identity.join(', ')],
      scene: scene.join(', '),
    })
    const tags = prompt.split(', ')
    expect(tags).toHaveLength(BOORU_MAX_TAGS)
    // Every identity + action tag survived; the setting lost its tail.
    for (const tag of [...identity, 'sitting', 'reading']) expect(tags).toContain(tag)
    expect(tags).toContain('scenery0')
    expect(tags).not.toContain('scenery19')
  })

  it('trims interaction only after the setting has hit its floor, never identity', () => {
    const identity = Array.from({ length: 55 }, (_, i) => `identity${i}`)
    const action = Array.from({ length: 8 }, (_, i) => `action${i}`)
    const scene = Array.from({ length: 8 }, (_, i) => `scenery${i}`)
    const tags = composeBooruScenePrompt({
      countTags: '1girl',
      action: action.join(', '),
      characters: [identity.join(', ')],
      scene: scene.join(', '),
    }).split(', ')
    for (const tag of identity) expect(tags).toContain(tag)
    // Scene floor (3) and action floor (2) both hold — identity is never cut.
    expect(tags.filter((t) => t.startsWith('scenery'))).toHaveLength(3)
    expect(tags.filter((t) => t.startsWith('action'))).toHaveLength(2)
  })

  it('is empty when every section is empty', () => {
    expect(composeBooruScenePrompt({})).toBe('')
  })
})

describe('composeBooruScenePrompt — expression layer', () => {
  const blondeBank = ['1girl', 'blonde hair', 'golden eyes', 'fair skin']
  const ravenBank = ['1girl', 'black hair', 'red eyes', 'pale skin']

  const twoGirls = {
    countTags: '2girls',
    action: 'hugging',
    characters: [
      'blonde hair, golden eyes, fair skin, sundress, medium breasts',
      'black hair, red eyes, pale skin, black dress, huge breasts',
    ],
    expressions: ['smile', 'scowl'],
    scene: 'garden, daylight',
  }

  it('keeps each expression inside its own run, after that person’s identity', () => {
    const prompt = composeBooruScenePrompt(twoGirls)
    expect(prompt).toBe(
      '2girls, hugging, medium breasts, huge breasts, ' +
        'blonde hair, golden eyes, fair skin, sundress, smile, ' +
        'black hair, red eyes, pale skin, black dress, scowl, ' +
        'garden, daylight',
    )
    expect(prompt.indexOf('fair skin')).toBeLessThan(prompt.indexOf('smile'))
    expect(prompt.indexOf('smile')).toBeLessThan(prompt.indexOf('black hair'))
  })

  it('gives two characters their own moods rather than a shared one', () => {
    const prompt = composeBooruScenePrompt({
      ...twoGirls,
      expressions: ['crying, tears', 'crying'],
    })
    // A GLOBAL dedupe would blank the second girl's face; expressions dedupe
    // only within their own run.
    expect(prompt.match(/crying/g)).toHaveLength(2)
  })

  it('merges the engine cue into the run whose identity bank matches', () => {
    const prompt = composeBooruScenePrompt(twoGirls, [
      { identityTags: ravenBank, expressionTags: ['blush', 'half-closed eyes'] },
    ])
    expect(prompt).toContain('pale skin, black dress, blush, half-closed eyes, scowl')
    // The blonde keeps only what the writer gave her.
    expect(prompt).toContain('fair skin, sundress, smile,')
  })

  it('places engine tags ahead of the writer’s and dedupes the overlap', () => {
    const prompt = composeBooruScenePrompt(
      {
        countTags: '1girl, solo',
        characters: ['blonde hair, golden eyes, fair skin, nude'],
        expressions: ['half-closed eyes, seductive smile'],
        scene: 'bedroom',
      },
      [{ identityTags: blondeBank, expressionTags: ['blush', 'half-closed eyes'] }],
    )
    expect(prompt).toBe(
      '1girl, solo, blonde hair, golden eyes, fair skin, nude, ' +
        'blush, half-closed eyes, seductive smile, bedroom',
    )
    expect(prompt.match(/half-closed eyes/g)).toHaveLength(1)
  })

  it('lifts an expression the writer inlined in the run to the run’s tail', () => {
    const prompt = composeBooruScenePrompt({
      countTags: '1girl, solo',
      characters: ['blonde hair, blush, golden eyes, nude'],
      expressions: [''],
      scene: 'bedroom',
    })
    expect(prompt).toBe('1girl, solo, blonde hair, golden eyes, nude, blush, bedroom')
  })

  it('skips the faceless protagonist run when matching positionally', () => {
    const prompt = composeBooruScenePrompt(
      {
        countTags: '1boy, 1girl',
        action: 'hetero, hug',
        // No locked bank for her — her run is converted prose, so it shares no
        // verbatim tag and the cue falls back to the first described run.
        characters: ['pov, male pov, faceless male, muscular', 'red hair, green eyes, nude'],
        expressions: ['', ''],
        scene: 'bedroom',
      },
      [{ identityTags: [], expressionTags: ['blush', 'open mouth'] }],
    )
    expect(prompt).toContain('red hair, green eyes, nude, blush, open mouth')
    expect(prompt.indexOf('faceless male')).toBeLessThan(prompt.indexOf('blush'))
    expect(prompt).not.toContain('faceless male, muscular, blush')
  })

  it('leaves the expressions alone while setting detail can still absorb the overrun', () => {
    const identity = Array.from({ length: 40 }, (_, i) => `identity${i}`)
    const scene = Array.from({ length: 20 }, (_, i) => `scenery${i}`)
    const tags = composeBooruScenePrompt({
      countTags: '1girl',
      action: 'action0, action1, action2, action3, action4, action5',
      characters: [identity.join(', ')],
      expressions: ['blush, half-closed eyes, open mouth'],
      scene: scene.join(', '),
    }).split(', ')
    expect(tags).toHaveLength(BOORU_MAX_TAGS)
    for (const tag of ['blush', 'half-closed eyes', 'open mouth']) expect(tags).toContain(tag)
    expect(tags.filter((t) => t.startsWith('scenery'))).toHaveLength(10)
  })

  it('trims spare expression tags only after the setting has hit its floor', () => {
    const identity = Array.from({ length: 49 }, (_, i) => `identity${i}`)
    const tags = composeBooruScenePrompt({
      countTags: '1girl',
      action: 'action0, action1, action2, action3, action4, action5',
      characters: [identity.join(', ')],
      expressions: ['blush, half-closed eyes, open mouth, seductive smile'],
      scene: 'scenery0, scenery1, scenery2, scenery3, scenery4',
    }).split(', ')
    expect(tags).toHaveLength(BOORU_MAX_TAGS)
    // Setting is down to its floor, interaction is untouched, and the FIRST
    // expression tag (the engine's, when there is one) is the survivor.
    expect(tags.filter((t) => t.startsWith('scenery'))).toHaveLength(3)
    expect(tags.filter((t) => t.startsWith('action'))).toHaveLength(6)
    expect(tags).toContain('blush')
    for (const dropped of ['half-closed eyes', 'open mouth', 'seductive smile']) {
      expect(tags).not.toContain(dropped)
    }
  })

  it('never drops a character’s last expression tag while setting tags survive', () => {
    const run = (prefix: string) => Array.from({ length: 25 }, (_, i) => `${prefix}${i}`).join(', ')
    const tags = composeBooruScenePrompt({
      countTags: '2girls',
      action: 'action0, action1, action2, action3',
      characters: [run('left'), run('right')],
      expressions: ['blush, half-closed eyes, open mouth', 'scowl, glaring, clenched teeth'],
      scene: 'scenery0, scenery1, scenery2, scenery3, scenery4, scenery5',
    }).split(', ')
    expect(tags).toHaveLength(BOORU_MAX_TAGS)
    expect(tags.filter((t) => t.startsWith('scenery'))).toHaveLength(3)
    // One tag each — neither face is blanked.
    expect(tags).toContain('blush')
    expect(tags).toContain('scowl')
    expect(tags).not.toContain('half-closed eyes')
    expect(tags).not.toContain('glaring')
  })
})

describe('composeBooruScenePrompt — engine size sanction', () => {
  const blondeBank = ['1girl', 'blonde hair', 'golden eyes', 'fair skin']
  const ravenBank = ['1girl', 'black hair', 'red eyes', 'pale skin']
  const blondeAt = (tier: number, grewThisTurn = false) => [
    { identityTags: blondeBank, tier, grewThisTurn },
  ]

  /**
   * The live failure: the narration falsely described massive growth (an engine
   * bug), and the writer tagged the NARRATIVE for a subject the engine holds at
   * tier 24 — the "huge breasts" band, where no body-relative anchor is earned.
   */
  const overClaimed: Partial<BooruSceneSections> = {
    countTags: '1girl, solo',
    action:
      'breast expansion, breasts covering stomach, breasts reaching waist, breasts spilling over bed, unable to move, lying on back',
    characters: ['1girl, blonde hair, golden eyes, fair skin, nude, huge breasts, lactation'],
    expressions: ['open mouth'],
    scene: 'bed, night',
  }

  it('strips the narrative size claims the engine tier does not sanction', () => {
    const prompt = composeBooruScenePrompt(overClaimed, [], blondeAt(24))
    expect(prompt).toBe(
      '1girl, solo, lying on back, huge breasts, ' +
        'blonde hair, golden eyes, fair skin, nude, lactation, open mouth, bed, night',
    )
    for (const invented of [
      'breast expansion',
      'breasts covering stomach',
      'breasts reaching waist',
      'breasts spilling over bed',
      'unable to move',
    ]) {
      expect(prompt).not.toContain(invented)
    }
  })

  it('keeps the growth tag when the engine actually grew her this turn', () => {
    const prompt = composeBooruScenePrompt(overClaimed, [], blondeAt(24, true))
    expect(prompt).toContain('breast expansion')
    expect(prompt).not.toContain('breasts covering stomach')
  })

  it('keeps the anchor a tier-40 subject earned and drops the one above it', () => {
    const prompt = composeBooruScenePrompt(
      {
        countTags: '1girl, solo',
        characters: [
          '1girl, blonde hair, golden eyes, fair skin, hyper breasts, breasts wider than hips, breasts bigger than torso',
        ],
        scene: 'bedroom',
      },
      [],
      blondeAt(40),
    )
    expect(prompt).toContain('hyper breasts, breasts wider than hips')
    expect(prompt).not.toContain('breasts bigger than torso')
  })

  it('sanctions each run by its own subject and scene tags by the largest', () => {
    const prompt = composeBooruScenePrompt(
      {
        countTags: '2girls',
        action: 'yuri, hugging, breasts covering stomach',
        characters: [
          'blonde hair, golden eyes, fair skin, gigantic breasts',
          'black hair, red eyes, pale skin, gigantic breasts',
        ],
        scene: 'bedroom',
      },
      [],
      [
        { identityTags: blondeBank, tier: 24, grewThisTurn: false },
        { identityTags: ravenBank, tier: 45, grewThisTurn: false },
      ],
    )
    // One "gigantic breasts" survives — the raven's; the blonde's is unearned.
    expect(prompt.match(/gigantic breasts/g)).toHaveLength(1)
    expect(prompt).toBe(
      '2girls, yuri, hugging, breasts covering stomach, gigantic breasts, ' +
        'blonde hair, golden eyes, fair skin, black hair, red eyes, pale skin, bedroom',
    )
  })

  it('falls back to the largest subject for a run no sanction claims', () => {
    // Two runs, one tagged subject: the blonde claims hers by bank, and the
    // unnamed background girl is sanctioned scene-wide rather than filtered
    // against a body state that is not hers.
    const withBystander: Partial<BooruSceneSections> = {
      countTags: '2girls',
      characters: [
        '1girl, blonde hair, golden eyes, fair skin, gigantic breasts',
        'red hair, green eyes, gigantic breasts',
      ],
      scene: 'bedroom',
    }
    expect(composeBooruScenePrompt(withBystander, [], blondeAt(45))).toContain('gigantic breasts')
    expect(composeBooruScenePrompt(withBystander, [], blondeAt(24))).not.toContain(
      'gigantic breasts',
    )
  })

  it('filters nothing when the engine holds no state (non-BE story)', () => {
    expect(composeBooruScenePrompt(overClaimed)).toContain('breasts covering stomach')
  })
})

describe('buildSizeSanctions', () => {
  const cora = makeChar({
    name: 'Cora',
    imageTags: '1girl, black hair, red eyes',
    metadata: writeBodyState(null, { ...defaultBodyState(24), lastGrowth: undefined }),
  })
  const grown = makeChar({
    name: 'Dana',
    imageTags: '1girl, red hair',
    metadata: writeBodyState(null, {
      ...defaultBodyState(31),
      lastGrowth: { delta: 2, tierBefore: 29 },
    }),
  })

  it('reads the apparent tier and growth flag of each tagged subject, in tag order', () => {
    expect(buildSizeSanctions([cora, grown], ['Dana', 'Cora'], true)).toEqual([
      { identityTags: ['1girl', 'red hair'], tier: 31, grewThisTurn: true },
      { identityTags: ['1girl', 'black hair', 'red eyes'], tier: 24, grewThisTurn: false },
    ])
  })

  it('follows the apparent tier so the band word and the filter agree', () => {
    const engorged = makeChar({
      name: 'Eve',
      imageTags: '1girl, brown hair',
      metadata: writeBodyState(null, {
        ...defaultBodyState(24),
        fluids: { fillPercent: 95, fluidType: 'milk' },
      }),
    })
    const [sanction] = buildSizeSanctions([engorged], ['Eve'], true)
    expect(sanction.tier).toBe(apparentTier(readBodyState(engorged.metadata)!))
    expect(sanction.tier).toBeGreaterThan(24)
  })

  it('is empty outside BE mode and skips a subject with no body state', () => {
    expect(buildSizeSanctions([cora], ['Cora'], false)).toEqual([])
    expect(buildSizeSanctions([amelia], ['Amelia'], true)).toEqual([])
  })
})

describe('writeBooruScenePrompt', () => {
  it('returns null (best-effort) when no preset is assigned', async () => {
    mocks.getServicePresetId.mockReturnValue('')
    const result = await writeBooruScenePrompt(baseInput())
    expect(result).toBeNull()
    expect(mocks.generateStructured).not.toHaveBeenCalled()
  })

  it('filters the writer’s size claims against the subject’s engine tier', async () => {
    const cora = makeChar({
      name: 'Cora',
      imageTags: '1girl, black hair, red eyes',
      metadata: writeBodyState(null, defaultBodyState(24)),
    })
    mocks.generateStructured.mockResolvedValue(
      sections({
        countTags: '1girl, solo',
        action: 'breasts covering stomach, unable to move, lying on back',
        characters: ['1girl, black hair, red eyes, gigantic breasts, huge breasts'],
        expressions: [''],
      }),
    )
    const result = await writeBooruScenePrompt(
      baseInput({ presentCharacters: [cora], tagCharacterNames: ['Cora'], beMode: true }),
    )
    expect(result).toBe(
      'general, 1girl, solo, lying on back, huge breasts, black hair, red eyes, bedroom',
    )
  })

  it('renders the template and returns the trimmed prompt on success', async () => {
    const result = await writeBooruScenePrompt(baseInput())
    expect(result).toBe('general, 1girl, solo, bedroom')

    // Rendered the booru-writer template with the expected variables.
    expect(mocks.ctxRender).toHaveBeenCalledWith('image-booru-scene-prompt')
    const vars = mocks.ctxAdd.mock.calls[0][0]
    expect(vars.subjectCount).toBe('1')
    expect(vars.subjectDossier).toContain('copy VERBATIM')
    expect(vars.sceneIntent).toContain('curls up on the bed')

    // Called the structured LLM with the resolved preset + service id.
    const [opts, serviceId] = mocks.generateStructured.mock.calls[0]
    expect(opts.presetId).toBe('preset-image')
    expect(serviceId).toBe('imageGeneration')
  })

  it('strips leaked character names from the model output', async () => {
    mocks.generateStructured.mockResolvedValue(
      sections({ rating: '', characters: ['Amelia, blonde hair'] }),
    )
    const result = await writeBooruScenePrompt(baseInput())
    expect(result).toBe('1girl, solo, blonde hair, bedroom')
  })

  it('lands the engine expression inside the matching character run', async () => {
    const cora = makeChar({
      name: 'Cora',
      imageTags: '1girl, black hair, red eyes',
      metadata: writeBodyState(null, { ...defaultBodyState(20), arousal: 90 }),
    })
    mocks.generateStructured.mockResolvedValue(
      sections({
        rating: '',
        countTags: '1girl, solo',
        characters: ['1girl, black hair, red eyes, nude'],
        expressions: ['smile'],
      }),
    )
    const result = await writeBooruScenePrompt(
      baseInput({ presentCharacters: [cora], tagCharacterNames: ['Cora'], beMode: true }),
    )
    expect(result).toBe(
      '1girl, solo, black hair, red eyes, nude, blush, half-closed eyes, open mouth, smile, bedroom',
    )
  })

  it('includes the current location block when a location is current', async () => {
    mocks.getLocations.mockResolvedValue([
      { name: 'Attic', description: 'dusty', current: false } as Location,
      { name: 'Bedroom', description: 'candlelit', current: true } as Location,
    ])
    await writeBooruScenePrompt(baseInput())
    const vars = mocks.ctxAdd.mock.calls[0][0]
    expect(vars.locationBlock).toContain('Bedroom — candlelit')
  })

  it('still succeeds when the location lookup throws', async () => {
    mocks.getLocations.mockRejectedValue(new Error('db down'))
    const result = await writeBooruScenePrompt(baseInput())
    expect(result).toBe('general, 1girl, solo, bedroom')
    const vars = mocks.ctxAdd.mock.calls[0][0]
    expect(vars.locationBlock).toBe('')
  })

  it('omits the location lookup entirely when no story id is given (retry path)', async () => {
    const { storyId: _omit, ...noStory } = baseInput()
    const result = await writeBooruScenePrompt(noStory)
    expect(result).toBe('general, 1girl, solo, bedroom')
    expect(mocks.getLocations).not.toHaveBeenCalled()
    const vars = mocks.ctxAdd.mock.calls[0][0]
    expect(vars.locationBlock).toBe('')
  })

  it('returns null when the AI call throws', async () => {
    mocks.generateStructured.mockRejectedValue(new Error('model error'))
    const result = await writeBooruScenePrompt(baseInput())
    expect(result).toBeNull()
  })

  it('returns null when the model returns empty sections', async () => {
    mocks.generateStructured.mockResolvedValue(
      sections({ rating: '   ', countTags: '', scene: ' , ' }),
    )
    const result = await writeBooruScenePrompt(baseInput())
    expect(result).toBeNull()
  })
})

describe('resolveBooruScenePrompt', () => {
  it('returns the original prompt unchanged when the setting is off', async () => {
    mocks.imageGenSettings.dedicatedBooruPromptWriter = false
    const result = await resolveBooruScenePrompt({ ...baseInput(), model: BOORU_MODEL })
    expect(result).toBe(baseInput().scenePrompt)
    expect(mocks.generateStructured).not.toHaveBeenCalled()
  })

  it('returns the original prompt unchanged for a non-booru model', async () => {
    const result = await resolveBooruScenePrompt({ ...baseInput(), model: PROSE_MODEL })
    expect(result).toBe(baseInput().scenePrompt)
    expect(mocks.generateStructured).not.toHaveBeenCalled()
  })

  it('returns the writer output for a booru model when the call succeeds', async () => {
    const result = await resolveBooruScenePrompt({ ...baseInput(), model: BOORU_MODEL })
    expect(result).toBe('general, 1girl, solo, bedroom')
  })

  it('falls back to the original prompt when the writer yields nothing', async () => {
    mocks.getServicePresetId.mockReturnValue('') // writer returns null
    const result = await resolveBooruScenePrompt({ ...baseInput(), model: BOORU_MODEL })
    expect(result).toBe(baseInput().scenePrompt)
  })
})

/**
 * The template is the writer's whole specification, and it has been rewritten
 * repeatedly (sections → POV/size → emotion → act-first). Each rewrite has
 * silently broken something the code depends on: the emotion round left the
 * character-run bullet still asking for an expression that had moved to its own
 * field, and the live act-first regression showed up as an action block with no
 * act in it. These pin the contract the code and the worked example must share.
 */
describe('image-booru-scene-prompt template contract', () => {
  const template = imageTemplates.find((t) => t.id === 'image-booru-scene-prompt')

  /** Pull the template's worked example back out as the sections it depicts. */
  function parseWorkedExample(content: string): BooruSceneSections {
    const str = (field: string): string => {
      const match = content.match(new RegExp(`^\\s*${field}: (".*")$`, 'm'))
      if (!match) throw new Error(`worked example is missing the "${field}" field`)
      return JSON.parse(match[1]) as string
    }
    const arr = (field: string): string[] => {
      const match = content.match(new RegExp(`^\\s*${field}: (\\[.*\\])$`, 'm'))
      if (!match) throw new Error(`worked example is missing the "${field}" field`)
      return JSON.parse(match[1]) as string[]
    }
    return {
      rating: str('rating'),
      camera: str('camera'),
      countTags: str('countTags'),
      action: str('action'),
      characters: arr('characters'),
      expressions: arr('expressions'),
      scene: str('scene'),
    }
  }

  it('names every section field the writer schema requires', () => {
    for (const field of [
      'rating',
      'camera',
      'countTags',
      'action',
      'characters',
      'expressions',
      'scene',
    ]) {
      expect(template?.content).toContain(`FIELD "${field}"`)
    }
  })

  it('makes the ongoing act outrank the event of the moment in the action field', () => {
    const content = template?.content ?? ''
    // The regression: a transformation mid-act replaced the act tags entirely.
    expect(content).toContain('THE ACT FIRST')
    expect(content).toContain('NEVER INSTEAD')
    expect(content).toMatch(/SUPPLEMENTS the act tags/)
  })

  it('never asks for expression tags inside a character run — they have their own field', () => {
    expect(template?.content).toContain('NO expression tags here')
  })

  it('composes its worked example act-first, inside the tag budget', () => {
    const example = parseWorkedExample(template?.content ?? '')
    const prompt = composeBooruScenePrompt(example)
    const tags = prompt.split(', ')

    expect(tags.length).toBeLessThanOrEqual(BOORU_MAX_TAGS)
    // Act tags lead the action block; the growth event follows, and both survive.
    expect(prompt.indexOf('paizuri')).toBeLessThan(prompt.indexOf('breast expansion'))
    expect(prompt.indexOf('hetero')).toBeLessThan(prompt.indexOf('breast expansion'))
    // ...and the whole action block still precedes the identity runs.
    expect(prompt.indexOf('breast expansion')).toBeLessThan(prompt.indexOf('blonde hair'))
    // Size stays hoisted between action and identity (placement is code-side).
    expect(prompt.indexOf('huge breasts')).toBeLessThan(prompt.indexOf('blonde hair'))
  })

  it('keeps the worked example on the faceless protagonist-POV form', () => {
    const example = parseWorkedExample(template?.content ?? '')
    expect(example.camera).toContain('pov')
    expect(example.characters[0]).toContain('faceless male')
    expect(example.expressions).toHaveLength(example.characters.length)
    expect(example.expressions[0]).toBe('') // no face to render
    expect(example.expressions[1].split(', ').length).toBeLessThanOrEqual(3)
  })
})
