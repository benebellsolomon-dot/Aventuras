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
  detectActDefects,
  buildLocationBlock,
  buildPovGuidance,
  buildStorySettingBlock,
  buildSizeSanctions,
  buildSubjectDossier,
  composeBooruScenePrompt,
  resolveBooruScenePrompt,
  stripCharacterNames,
  writeBooruScenePrompt,
  type BooruPromptWriterInput,
  type BooruSceneSections,
  resolveArrangementConflict,
  estimateTokens,
  estimateTagTokens,
  BOORU_SINGLE_WINDOW_TOKEN_BUDGET,
  applyDressStateFallback,
  detectMissingDressState,
  detectWriterDefects,
} from './booruPromptWriter'
import { isDressStateTag } from './dressState'
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
    actInProgress: false,
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

describe('buildPovGuidance', () => {
  it('first/second/hybrid person → protagonist-as-camera framing', () => {
    for (const pov of ['first', 'second', 'hybrid']) {
      const block = buildPovGuidance(pov)
      expect(block).toContain('## Camera and POV')
      expect(block).toContain("through the protagonist's eyes")
    }
  })

  it('third person → observed-scene framing', () => {
    expect(buildPovGuidance('third')).toContain('observed scene')
  })

  it('empty when the story has no POV', () => {
    expect(buildPovGuidance(undefined)).toBe('')
    expect(buildPovGuidance(null)).toBe('')
  })
})

describe('buildStorySettingBlock', () => {
  it('renders genre + description with the setting-fidelity instruction', () => {
    const block = buildStorySettingBlock({
      genre: 'high fantasy',
      description: 'A kingdom on the eve of a mage war.',
    })
    expect(block).toContain('## Story setting')
    expect(block).toContain('Genre: high fantasy.')
    expect(block).toContain('A kingdom on the eve of a mage war.')
    expect(block).toContain('MUST fit this setting')
  })

  it('is empty when there is no story or no genre/description', () => {
    expect(buildStorySettingBlock(null)).toBe('')
    expect(buildStorySettingBlock(undefined)).toBe('')
    expect(buildStorySettingBlock({ genre: '  ', description: '' })).toBe('')
  })

  it('renders with genre alone', () => {
    expect(buildStorySettingBlock({ genre: 'cyberpunk' })).toContain('Genre: cyberpunk.')
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

describe('composeBooruScenePrompt — single-window budget (D5 measurement)', () => {
  it('fits the whole prompt in one CLIP window: total tags capped, scene floor preserved', () => {
    const sections = {
      rating: 'sensitive',
      camera: 'medium shot, pov',
      countTags: '1girl, solo',
      actInProgress: false,
      action:
        'standing, leaning against viewer, grabbing clothes, pov hands, holding dagger, looking at viewer',
      characters: [Array.from({ length: 24 }, (_, i) => `identity tag ${i + 1}`).join(', ')],
      expressions: ['flustered, blush, parted lips'],
      scene:
        'castle courtyard, wet stone, night, rain, hanging lantern, lantern light, dramatic shadow, depth of field',
    }
    const single = composeBooruScenePrompt(sections, [], [], { singleWindow: true })
    const tags = single.split(',').map((t) => t.trim())
    expect(tags.length).toBeLessThanOrEqual(36)
    // The scene keeps its floor — losing the whole setting is the exact
    // failure the budget exists to prevent (bare-wall render, measured).
    expect(single).toContain('castle courtyard')
    // Per-run cap: the 24-tag identity run was trimmed from the tail.
    expect(single).toContain('identity tag 1')
    expect(single).not.toContain('identity tag 24')

    // Default (chunking backends) keeps the richer budget.
    const chunked = composeBooruScenePrompt(sections)
    expect(chunked.split(',').length).toBeGreaterThan(tags.length)
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
    actInProgress: true,
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
    // Scene floor (3) and action floor (4) both hold — identity is never cut.
    expect(tags.filter((t) => t.startsWith('scenery'))).toHaveLength(3)
    expect(tags.filter((t) => t.startsWith('action'))).toHaveLength(4)
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
   * THE LIVE FAILURE (playtest round 5), verbatim. The narration falsely
   * described massive growth, and the writer phrased it as "breast spill,
   * pinned, immobile, trapped" — none of which the previous blacklist's
   * `breasts …ing` / `…than` patterns matched. It also wrote NO band word, so
   * the hoist had nothing to hoist and the engine's "huge breasts" only arrived
   * at the very tail, appended downstream past CLIP's attention window. The
   * render came back with a tiny bust.
   */
  const liveFailure: Partial<BooruSceneSections> = {
    rating: 'explicit, uncensored, detailed anatomy',
    camera: 'wide shot, pov',
    countTags: '1boy, 1girl',
    action: 'lying on back, breast spill, pinned, immobile, trapped',
    characters: [
      'male pov, faceless male',
      '1girl, blonde hair, golden eyes, fair skin, slim, wide hips, young adult, naked, lactation',
    ],
    expressions: ['', 'blush, half-closed eyes, open mouth, drooling'],
    scene: 'ornate manor bedroom, large bed, pillows, moonlight through window, night',
  }

  it('strips the invention and states the engine size after the action block', () => {
    const prompt = composeBooruScenePrompt(liveFailure, [], blondeAt(24))
    expect(prompt).toBe(
      'explicit, uncensored, detailed anatomy, wide shot, pov, 1boy, 1girl, ' +
        'lying on back, huge breasts, ' +
        'male pov, faceless male, ' +
        'blonde hair, golden eyes, fair skin, slim, wide hips, young adult, naked, lactation, ' +
        'blush, half-closed eyes, open mouth, drooling, ' +
        'ornate manor bedroom, large bed, pillows, moonlight through window, night',
    )
    for (const invented of ['breast spill', 'pinned', 'immobile', 'trapped']) {
      expect(prompt).not.toContain(invented)
    }
  })

  it('states the engine size exactly once, ahead of the character runs', () => {
    const prompt = composeBooruScenePrompt(liveFailure, [], blondeAt(24))
    expect(prompt.match(/huge breasts/g)).toHaveLength(1)
    expect(prompt.indexOf('lying on back')).toBeLessThan(prompt.indexOf('huge breasts'))
    expect(prompt.indexOf('huge breasts')).toBeLessThan(prompt.indexOf('male pov'))
    expect(prompt.indexOf('huge breasts')).toBeLessThan(prompt.indexOf('blonde hair'))
  })

  it('injects the band even when the writer wrote no size vocabulary at all', () => {
    // The half of the failure the hoist could not fix: nothing to hoist.
    const prompt = composeBooruScenePrompt(
      { countTags: '1girl, solo', action: 'standing', characters: ['blonde hair, nude'] },
      [],
      blondeAt(24),
    )
    expect(prompt).toBe('1girl, solo, standing, huge breasts, blonde hair, nude')
  })

  it('injects the anchor the engine tier has earned, not the writer’s', () => {
    const prompt = composeBooruScenePrompt(
      {
        countTags: '1girl, solo',
        characters: [
          '1girl, blonde hair, golden eyes, fair skin, hyper breasts, breasts bigger than torso',
        ],
        scene: 'bedroom',
      },
      [],
      blondeAt(40),
    )
    expect(prompt).toContain('hyper breasts, breasts wider than her hips')
    expect(prompt).not.toContain('breasts bigger than torso')
  })

  it('keeps the growth tag only on the turn the engine grew her', () => {
    const grew = composeBooruScenePrompt(liveFailure, [], blondeAt(24, true))
    expect(grew).toContain('huge breasts, breast expansion')
    expect(composeBooruScenePrompt(liveFailure, [], blondeAt(24))).not.toContain('breast expansion')
  })

  it('keeps the act tags that merely name breasts', () => {
    const prompt = composeBooruScenePrompt(
      {
        countTags: '1boy, 1girl',
        action: 'hetero, paizuri, breast squeezing, penis between breasts, gigantic breasts',
        characters: ['pov, male pov, faceless male', '1girl, blonde hair, golden eyes, fair skin'],
        scene: 'bedroom',
      },
      [],
      blondeAt(24),
    )
    expect(prompt).toContain(
      'hetero, paizuri, breast squeezing, penis between breasts, huge breasts',
    )
    expect(prompt).not.toContain('gigantic breasts')
  })

  it('gives each subject her own engine size, in count-tag order', () => {
    const prompt = composeBooruScenePrompt(
      {
        countTags: '2girls',
        action: 'yuri, hugging, breasts covering stomach',
        characters: [
          '1girl, blonde hair, golden eyes, fair skin, gigantic breasts',
          '1girl, black hair, red eyes, pale skin, gigantic breasts',
        ],
        scene: 'bedroom',
      },
      [],
      [
        { identityTags: blondeBank, tier: 24, grewThisTurn: false },
        { identityTags: ravenBank, tier: 45, grewThisTurn: false },
      ],
    )
    expect(prompt).toBe(
      '2girls, yuri, hugging, huge breasts, hyper breasts, breasts wider than her hips, ' +
        '1girl, blonde hair, golden eyes, fair skin, black hair, red eyes, pale skin, bedroom',
    )
  })

  it('leaves a run no sanction claims untouched — a smaller girl keeps her band', () => {
    // Two runs, one tagged subject: the blonde claims hers by bank; the unnamed
    // background girl is someone the engine holds nothing for, so her honest
    // "medium breasts" survives instead of being collateral damage.
    const prompt = composeBooruScenePrompt(
      {
        countTags: '2girls',
        characters: [
          '1girl, blonde hair, golden eyes, fair skin, gigantic breasts',
          'red hair, green eyes, medium breasts',
        ],
        scene: 'bedroom',
      },
      [],
      blondeAt(24),
    )
    expect(prompt).toBe(
      '2girls, huge breasts, medium breasts, ' +
        '1girl, blonde hair, golden eyes, fair skin, red hair, green eyes, bedroom',
    )
  })

  it('states a sanction the writer never depicted rather than losing it', () => {
    const prompt = composeBooruScenePrompt(
      { countTags: '1girl, solo', action: 'standing', characters: [], scene: 'bedroom' },
      [],
      blondeAt(30),
    )
    expect(prompt).toBe(
      '1girl, solo, standing, gigantic breasts, breasts bigger than head, bedroom',
    )
  })

  it('filters nothing when the engine holds no state (non-BE story)', () => {
    expect(composeBooruScenePrompt(liveFailure)).toContain('breast spill')
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

/**
 * The mechanical act backstop. The live failure the check exists for: an
 * explicit mid-paizuri beat came back declared as an act in progress but with
 * an action block that named only a pose and the growth event, so the image
 * rendered an ambiguous solo scene.
 */
describe('detectActDefects', () => {
  it('flags the live failure shape — act declared, no act tag written', () => {
    const defect = detectActDefects(
      sections({
        actInProgress: true,
        countTags: '1boy, 1girl',
        action: 'lying on back, breast expansion, breasts hanging low, looking down',
      }),
    )
    expect(defect?.missingActTag).toBe(true)
    expect(defect?.note).toContain('named no act tag')
  })

  it('passes an act block that leads with the act tag family', () => {
    expect(
      detectActDefects(
        sections({
          actInProgress: true,
          countTags: '1boy, 1girl',
          action: 'hetero, paizuri, breast squeezing, lying on back, breast expansion',
        }),
      ),
    ).toBeNull()
  })

  it('never flags aftermath — a plain pose action is correct there', () => {
    expect(
      detectActDefects(
        sections({
          actInProgress: false,
          countTags: '1boy, 1girl',
          action: 'after sex, lying, on back, on bed, afterglow',
        }),
      ),
    ).toBeNull()
  })

  it('flags a partnered act counted as a lone girl', () => {
    const defect = detectActDefects(
      sections({
        actInProgress: true,
        countTags: '1girl, solo',
        action: 'hetero, paizuri, penis between breasts, lying on back',
      }),
    )
    expect(defect?.missingActTag).toBe(false)
    expect(defect?.missingMaleCount).toBe(true)
    expect(defect?.note).toContain('countTags')
  })

  it('flags the protagonist-POV male when the count tags leave him out', () => {
    const defect = detectActDefects(
      sections({
        actInProgress: true,
        countTags: '1girl',
        action: 'sex, on back',
        characters: ['pov, male pov, faceless male, muscular', '1girl, blonde hair'],
      }),
    )
    expect(defect?.missingMaleCount).toBe(true)
  })

  it('reports both defects in a single note — one retry covers both', () => {
    const defect = detectActDefects(
      sections({
        actInProgress: true,
        countTags: '1girl, solo',
        action: 'hetero, lying on back, breast expansion',
      }),
    )
    expect(defect?.missingActTag).toBe(true)
    expect(defect?.missingMaleCount).toBe(true)
    expect(defect?.note).toContain('act tag family')
    expect(defect?.note).toContain('1boy, 1girl')
  })

  it('demands no male for a solo act or a stated yuri act', () => {
    expect(
      detectActDefects(
        sections({
          actInProgress: true,
          countTags: '1girl, solo',
          action: 'masturbation, fingering',
        }),
      ),
    ).toBeNull()
    expect(
      detectActDefects(
        sections({ actInProgress: true, countTags: '2girls', action: 'yuri, tribadism, on bed' }),
      ),
    ).toBeNull()
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
    // The engine's band word is stated even though the writer omitted it —
    // injection does not depend on the writer having written any size at all.
    expect(result).toBe(
      '1girl, solo, large breasts, black hair, red eyes, nude, ' +
        'blush, half-closed eyes, open mouth, smile, bedroom',
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

/**
 * The act backstop end-to-end. It must stay OFF the hot path (a compliant
 * writer costs exactly one call) and must never fail the image: a retry that
 * is still wrong is used anyway.
 */
describe('writeBooruScenePrompt — act-reliability retry', () => {
  /** The measured failure: act declared, action names only pose + growth. */
  const badSections = sections({
    actInProgress: true,
    countTags: '1boy, 1girl',
    action: 'lying on back, breast expansion, breasts hanging low',
    scene: 'bedroom',
  })

  const goodSections = sections({
    actInProgress: true,
    countTags: '1boy, 1girl',
    action: 'hetero, paizuri, lying on back, breast expansion',
    scene: 'bedroom',
  })

  it('issues no extra call when the writer got it right', async () => {
    mocks.generateStructured.mockResolvedValue(goodSections)
    const result = await writeBooruScenePrompt(baseInput())
    expect(mocks.generateStructured).toHaveBeenCalledTimes(1)
    expect(result).toContain('paizuri')
  })

  it('issues no extra call for an aftermath beat with a plain pose action', async () => {
    mocks.generateStructured.mockResolvedValue(
      sections({ actInProgress: false, countTags: '1boy, 1girl', action: 'after sex, lying' }),
    )
    await writeBooruScenePrompt(baseInput())
    expect(mocks.generateStructured).toHaveBeenCalledTimes(1)
  })

  it('retries once with the correction appended and uses the corrected output', async () => {
    mocks.generateStructured.mockResolvedValueOnce(badSections).mockResolvedValueOnce(goodSections)
    const result = await writeBooruScenePrompt(baseInput())

    expect(mocks.generateStructured).toHaveBeenCalledTimes(2)
    const [retryOpts] = mocks.generateStructured.mock.calls[1]
    expect(retryOpts.system).toContain('SYS')
    expect(retryOpts.system).toContain('named no act tag')
    expect(retryOpts.prompt).toBe('USR')
    expect(result).toContain('paizuri')
  })

  it('uses the retry output even when it is still wrong, and never retries twice', async () => {
    const secondBad = sections({
      actInProgress: true,
      countTags: '1boy, 1girl',
      action: 'lying on back, looking down',
      scene: 'bedroom',
    })
    mocks.generateStructured.mockResolvedValueOnce(badSections).mockResolvedValueOnce(secondBad)
    const result = await writeBooruScenePrompt(baseInput())

    expect(mocks.generateStructured).toHaveBeenCalledTimes(2)
    expect(result).toContain('looking down')
    expect(result).not.toContain('breast expansion')
  })

  it('keeps the first output when the corrective retry throws', async () => {
    mocks.generateStructured
      .mockResolvedValueOnce(badSections)
      .mockRejectedValueOnce(new Error('model error'))
    const result = await writeBooruScenePrompt(baseInput())

    expect(mocks.generateStructured).toHaveBeenCalledTimes(2)
    expect(result).toContain('breast expansion')
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
    const bool = (field: string): boolean => {
      const match = content.match(new RegExp(`^\\s*${field}: (true|false)$`, 'm'))
      if (!match) throw new Error(`worked example is missing the "${field}" field`)
      return match[1] === 'true'
    }
    return {
      rating: str('rating'),
      camera: str('camera'),
      countTags: str('countTags'),
      actInProgress: bool('actInProgress'),
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
      'actInProgress',
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

  it('declares the act in its worked example and passes its own validator', () => {
    const example = parseWorkedExample(template?.content ?? '')
    expect(example.actInProgress).toBe(true)
    expect(detectActDefects(example)).toBeNull()
  })

  it('documents the aftermath counter-example — false needs no act tag', () => {
    const content = template?.content ?? ''
    expect(content).toContain('Counter-example')
    expect(content).toMatch(/actInProgress is FALSE/)
    expect(content).toContain('AFTERMATH')
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

describe('arrangement conflicts (research/64 live: face-to-face + from-behind in one action)', () => {
  const base = {
    rating: 'explicit, uncensored, detailed anatomy',
    camera: 'medium shot',
    countTags: '1boy, 1girl',
    actInProgress: true,
    action:
      'hetero, vaginal, standing sex, pressed together, arms around neck, vaginal from behind, impaled',
    characters: ['long hair, blonde hair, yellow eyes, medium breasts'],
    expressions: ['blush'],
    scene: 'attic, dusty',
  }

  it('detectActDefects flags the mixed arrangement', () => {
    const defect = detectActDefects(base)
    expect(defect?.conflictingArrangement).toBe(true)
    expect(defect?.note).toMatch(/ONE arrangement/)
    expect(
      detectActDefects({
        ...base,
        action: 'hetero, vaginal, standing sex, pressed together, arms around neck',
      }),
    ).toBeNull()
  })

  it("resolveArrangementConflict keeps the writer's lead family and drops the other", () => {
    const fixed = resolveArrangementConflict(base)
    expect(fixed.action).toBe(
      'hetero, vaginal, standing sex, pressed together, arms around neck, impaled',
    )
    const behindFirst = resolveArrangementConflict({
      ...base,
      action: 'hetero, doggystyle, vaginal from behind, kiss',
    })
    expect(behindFirst.action).toBe('hetero, doggystyle, vaginal from behind')
    const clean = { ...base, action: 'hetero, missionary' }
    expect(resolveArrangementConflict(clean)).toBe(clean)
  })
})

describe('single-window token budget', () => {
  it('trims multi-word-heavy prompts to the estimated 77-token window, scene tail first, keeping identity', () => {
    const sections = {
      rating: 'explicit, uncensored, detailed anatomy',
      camera: 'medium shot, pov',
      countTags: '1boy, 1girl',
      actInProgress: true,
      action:
        'hetero, vaginal, standing sex, pressed together, arms around neck, impaled, heavy breathing, holding hips',
      characters: [
        'long hair, straight hair, bangs, blonde hair, yellow eyes, fair skin, slim, wide hips, young adult, only skirt, bare shoulders, topless',
      ],
      expressions: ['blush, half-closed eyes, open mouth'],
      scene:
        'attic, dusty, wooden beams, dormer window, rain, night, warm lantern light, dust motes, depth of field',
    }
    const prompt = composeBooruScenePrompt(sections, [], [], { singleWindow: true })
    const tags = prompt.split(', ')
    expect(estimateTokens(tags)).toBeLessThanOrEqual(BOORU_SINGLE_WINDOW_TOKEN_BUDGET)
    // Identity core survives; the scene gave way first (down to its floor).
    expect(prompt).toContain('blonde hair')
    expect(prompt).toContain('yellow eyes')
    expect(
      tags.filter((t) => ['attic', 'dusty', 'wooden beams'].includes(t)).length,
    ).toBeGreaterThanOrEqual(3)
    expect(prompt).not.toContain('depth of field')
  })

  it('estimateTagTokens charges a token per word plus the comma, two for long words', () => {
    expect(estimateTagTokens('attic')).toBe(2)
    expect(estimateTagTokens('vaginal from behind')).toBe(4)
    expect(estimateTagTokens('masterpiece')).toBe(3)
  })
})

/**
 * Dress-state backstop (D5 round 2). The live failures: the narrator's intent
 * said "standing bare and pressed against a man" and "sitting bare on a wooden
 * crate, legs open" — anticipation beats, so actInProgress was false — and the
 * writer kept her in the dossier's "damp halter top" / wrote no dress state at
 * all. The image model drew her clothed, or got "explicit" with nothing to draw.
 */
describe('dress-state backstop', () => {
  const BARE_INTENT =
    'one woman: long straight blonde hair, yellow eyes, standing bare and pressed against a man, her hand on his belt buckle'
  const girlRun = 'long hair, straight hair, bangs, blonde hair, yellow eyes, fair skin, slim'
  const povRun = 'pov, male pov, faceless male, muscular'

  it('flags the live failure — bare in the intent, clothed in her run', () => {
    const s = sections({
      countTags: '1boy, 1girl',
      characters: [povRun, `${girlRun}, clothed, damp halter top, medium breasts`],
    })
    expect(detectMissingDressState(s, BARE_INTENT)).toBe(true)
    const defect = detectWriterDefects(s, BARE_INTENT)
    expect(defect?.missingDressState).toBe(true)
    expect(defect?.missingActTag).toBe(false)
    expect(defect?.note).toContain('completely nude')
  })

  it('passes once her run states any dress state — nude or clothes-displaced', () => {
    expect(
      detectMissingDressState(
        sections({ characters: [povRun, `${girlRun}, completely nude, medium breasts`] }),
        BARE_INTENT,
      ),
    ).toBe(false)
    expect(
      detectMissingDressState(
        sections({ characters: [`${girlRun}, halter top, clothes pull, medium breasts`] }),
        'her halter top pulled down, breasts exposed',
      ),
    ).toBe(false)
  })

  it('never fires when the intent names no exposure', () => {
    expect(
      detectMissingDressState(
        sections({ characters: [`${girlRun}, clothed, damp halter top`] }),
        'she leans on the rail, halter top damp from the rain, smiling',
      ),
    ).toBe(false)
    expect(
      detectWriterDefects(
        sections({ characters: [`${girlRun}, clothed`] }),
        'a quiet conversation over tea',
      ),
    ).toBeNull()
  })

  it('the faceless POV run never satisfies the check on its own', () => {
    expect(
      detectMissingDressState(
        sections({ characters: [`${povRun}, nude`, `${girlRun}, clothed`] }),
        BARE_INTENT,
      ),
    ).toBe(true)
  })

  it('merges with the act defects into one retry note', () => {
    const defect = detectWriterDefects(
      sections({
        actInProgress: true,
        countTags: '1boy, 1girl',
        action: 'lying on back, breast expansion',
        characters: [povRun, `${girlRun}, clothed`],
      }),
      'naked on the bed beneath him',
    )
    expect(defect?.missingActTag).toBe(true)
    expect(defect?.missingDressState).toBe(true)
    expect(defect?.note).toContain('named no act tag')
    expect(defect?.note).toContain('dress state')
  })

  describe('applyDressStateFallback', () => {
    const amelia = {
      imageTags: 'long hair, straight hair, bangs, blonde hair, yellow eyes, fair skin',
    }

    it('undresses the single named subject: drops "clothed", appends the intent tag', () => {
      const out = applyDressStateFallback(
        sections({ characters: [povRun, `${girlRun}, clothed, damp halter top, medium breasts`] }),
        BARE_INTENT,
        [amelia],
      )
      expect(out.characters).toEqual([
        povRun,
        `${girlRun}, damp halter top, medium breasts, completely nude`,
      ])
    })

    it('uses topless / bottomless for partial exposure', () => {
      const out = applyDressStateFallback(
        sections({ characters: [`${girlRun}, halter top`] }),
        'her halter top pulled down, breasts exposed',
        [amelia],
      )
      expect(out.characters?.[0]).toBe(`${girlRun}, halter top, topless`)
    })

    it('picks her run by bank overlap when an unnamed partner is described', () => {
      const out = applyDressStateFallback(
        sections({
          characters: ['muscular, short dark hair, shirt', `${girlRun}, damp halter top`],
        }),
        BARE_INTENT,
        [amelia],
      )
      expect(out.characters?.[0]).toBe('muscular, short dark hair, shirt')
      expect(out.characters?.[1]).toBe(`${girlRun}, damp halter top, completely nude`)
    })

    it('returns the same object when nothing applies', () => {
      const dressed = sections({ characters: [`${girlRun}, completely nude`] })
      expect(applyDressStateFallback(dressed, BARE_INTENT, [amelia])).toBe(dressed)
      const clothedIntent = sections({ characters: [`${girlRun}, clothed`] })
      expect(applyDressStateFallback(clothedIntent, 'tea on the terrace', [amelia])).toBe(
        clothedIntent,
      )
      const twoSubjects = sections({ characters: [`${girlRun}, clothed`, 'red hair, clothed'] })
      expect(
        applyDressStateFallback(twoSubjects, BARE_INTENT, [amelia, { imageTags: 'red hair' }]),
      ).toBe(twoSubjects)
    })
  })
})

/**
 * Live (2026-08-23, research/64 §3f): twelve routed WAI renders in a row
 * carried NO dress-state tag although every `<pic>` intent said "fully naked" —
 * the writer (or the fallback) put `completely nude` at the run's tail, and in
 * single-window mode the run is head-capped at 13 tags and then tail-trimmed
 * toward the identity floor, so the dress state was the first tag cut. Dress
 * state is the beat's most load-bearing tag on an explicit render (clothed sex
 * dolls are the observed failure) — the run's first dress tag survives both
 * trims; the exemption is bounded to one tag per run.
 */
describe('single-window budget keeps the dress-state tag', () => {
  const longRun =
    'long hair, straight hair, bangs, blonde hair, yellow eyes, fair skin, slim, wide hips, young adult, small waist, long legs, pale skin, completely nude'
  const explicit = {
    rating: 'explicit, uncensored, detailed anatomy',
    camera: 'medium shot, from below, pov',
    countTags: '1boy, 1girl',
    actInProgress: true,
    action: 'hetero, sex, male pov, faceless male, muscular, heavy breathing, holding hips',
    expressions: ['blush, half-closed eyes, open mouth'],
    scene:
      'cluttered attic, pile of cushions, wooden crates, dormer window, rain, night, warm lantern light, dust motes',
  }

  it('survives the token-budget tail trim, in the writer’s position', () => {
    const prompt = composeBooruScenePrompt(
      sections({ ...explicit, characters: [longRun] }),
      [],
      [],
      { singleWindow: true },
    )
    const tags = prompt.split(', ')
    expect(estimateTokens(tags)).toBeLessThanOrEqual(BOORU_SINGLE_WINDOW_TOKEN_BUDGET)
    expect(tags).toContain('completely nude')
    expect(prompt).toContain('blonde hair')
    // Order preserved: the dress tag still sits after her identity tags.
    expect(tags.indexOf('completely nude')).toBeGreaterThan(tags.indexOf('blonde hair'))
  })

  it('survives the 13-tag per-run head cap, keeping 12 identity tags', () => {
    const words =
      'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa'.split(
        ' ',
      )
    const run = [...words, 'topless'].join(', ')
    const prompt = composeBooruScenePrompt(
      sections({ countTags: '1girl, solo', characters: [run], scene: 'garden, day, sunlight' }),
      [],
      [],
      { singleWindow: true },
    )
    const tags = prompt.split(', ')
    expect(tags).toContain('topless')
    expect(tags.filter((t) => words.includes(t))).toHaveLength(12)
    expect(tags).toContain('lima')
    expect(tags).not.toContain('mike')
  })

  it('exempts one dress tag per run (most exposed) — the overrun is bounded to that one tag', () => {
    const dressed = [
      'long hair, straight hair, bangs, blonde hair, yellow eyes, fair skin, slim, wide hips, panties around one leg, partially undressed, completely nude',
      'short hair, red hair, green eyes, freckles, athletic, small waist, long legs, see-through, topless',
    ]
    const bare = dressed.map((run) =>
      run
        .split(', ')
        .filter((t) => !isDressStateTag(t))
        .join(', '),
    )
    const compose = (characters: string[]): string[] =>
      composeBooruScenePrompt(
        sections({
          ...explicit,
          countTags: '1boy, 2girls',
          characters,
          expressions: ['blush', 'smile'],
        }),
        [],
        [],
        { singleWindow: true },
      ).split(', ')
    const withDress = compose(dressed)
    const withoutDress = compose(bare)
    // Each run keeps ONE dress tag — the most exposed; the extras trim like any other tag.
    expect(withDress).toContain('completely nude')
    expect(withDress).toContain('topless')
    expect(withDress).not.toContain('panties around one leg')
    expect(withDress).not.toContain('see-through')
    // Two full identity runs already sit at the floors, so the absolute budget
    // cannot be met either way; the exemption may cost at most the two
    // protected tags on top of the dress-free composition — never more (the
    // delta is expected to EQUAL that cost; a trim-order or token-estimate
    // change that moves it reads as a failure here on purpose).
    expect(estimateTokens(withDress) - estimateTokens(withoutDress)).toBeLessThanOrEqual(
      estimateTagTokens('completely nude') + estimateTagTokens('topless'),
    )
    expect(withDress.length).toBeLessThanOrEqual(36)
  })
})

/**
 * Live (2026-08-23, Ben's report "the tag converter is under-performing"):
 * every routed WAI prompt measured 80–84 real CLIP-BPE tokens against the
 * 77-token window (estimator under-counted digits/hyphens/`hetero`-class words
 * and 66 sat at the 67-token ceiling), so 2–3 scene tags were silently
 * truncated on every render — while the action block was trimmed to
 * `hetero, sex` (positions gone) before a single identity or camera tag gave
 * way, and `pov` / `detailed anatomy` restated what `male pov` / `explicit,
 * uncensored` already carried. research/64 §3g.
 */
describe('single-window budget — calibration and allocation (research/64 §3g)', () => {
  const liveSections = () =>
    sections({
      rating: 'explicit, uncensored, detailed anatomy',
      camera: 'medium shot, from below, pov',
      countTags: '1boy, 1girl',
      actInProgress: true,
      action:
        'hetero, sex, cowgirl position, straddling, girl on top, grabbing another’s breast, lactation, breast sucking',
      characters: [
        'male pov, faceless male, muscular',
        'long hair, straight hair, bangs, blonde hair, yellow eyes, fair skin, slim, wide hips, completely nude',
      ],
      expressions: ['', 'blush, half-closed eyes, open mouth'],
      scene:
        'cluttered attic, pile of cushions, wooden crates, dormer window, rain, night, warm lantern light, heavy breathing',
    })

  it('estimateTagTokens counts digit runs and hyphen pieces as CLIP does', () => {
    expect(estimateTagTokens('1boy')).toBe(3)
    expect(estimateTagTokens('2girls')).toBe(3)
    expect(estimateTagTokens('face-to-face')).toBe(6)
    expect(estimateTagTokens('attic')).toBe(2)
    expect(estimateTagTokens('vaginal from behind')).toBe(4)
  })

  it('keeps the act/position tags (floor 4, trimmed last) and fits the calibrated budget', () => {
    const prompt = composeBooruScenePrompt(liveSections(), [], [], { singleWindow: true })
    const tags = prompt.split(', ')
    expect(estimateTokens(tags)).toBeLessThanOrEqual(BOORU_SINGLE_WINDOW_TOKEN_BUDGET)
    // Positions survive ahead of scene extras and expression extras.
    expect(tags).toContain('hetero')
    expect(tags).toContain('sex')
    expect(tags).toContain('cowgirl position')
    expect(tags).toContain('straddling')
    // Identity core, dress state, a face and a place all still present.
    expect(tags).toContain('blonde hair')
    expect(tags).toContain('completely nude')
    expect(tags).toContain('blush')
    expect(tags).toContain('cluttered attic')
    // The POV run keeps its POV tags (not `muscular`); the camera angle went
    // before any identity tag did.
    expect(tags).toContain('male pov')
    expect(tags).toContain('faceless male')
    expect(tags).not.toContain('muscular')
    expect(tags).not.toContain('from below')
  })

  it('protects the POV tags wherever the writer put them in the run', () => {
    const s = liveSections()
    const tags = composeBooruScenePrompt(
      sections({ ...s, characters: ['muscular, male pov, faceless male', s.characters[1]] }),
      [],
      [],
      { singleWindow: true },
    ).split(', ')
    expect(tags).toContain('male pov')
    expect(tags).toContain('faceless male')
    expect(tags).not.toContain('muscular')
  })

  it('keeps the POV signal when the head cap would have cut the POV tags', () => {
    const words =
      'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar'.split(
        ' ',
      )
    const tags = composeBooruScenePrompt(
      sections({
        camera: 'medium shot, pov',
        countTags: '1boy, 1girl',
        characters: [[...words, 'male pov', 'faceless male'].join(', '), 'long hair, blonde hair'],
        expressions: ['', 'blush'],
        scene: 'attic, night',
      }),
      [],
      [],
      { singleWindow: true },
    ).split(', ')
    expect(tags).toContain('male pov')
    expect(tags).toContain('faceless male')
    expect(tags).not.toContain('pov')
  })

  it('an untrimmed single-window prompt equals the chunked one minus the two restatements', () => {
    const small = sections({
      rating: 'explicit, uncensored, detailed anatomy',
      camera: 'medium shot, pov',
      countTags: '1boy, 1girl',
      actInProgress: true,
      action: 'hetero, sex',
      characters: ['male pov, faceless male', 'long hair, blonde hair, completely nude'],
      expressions: ['', 'blush'],
      scene: 'attic, night',
    })
    expect(composeBooruScenePrompt(small, [], [], { singleWindow: true })).toBe(
      'explicit, uncensored, medium shot, 1boy, 1girl, hetero, sex, male pov, faceless male, long hair, blonde hair, completely nude, blush, attic, night',
    )
    expect(composeBooruScenePrompt(small)).toBe(
      'explicit, uncensored, detailed anatomy, medium shot, pov, 1boy, 1girl, hetero, sex, male pov, faceless male, long hair, blonde hair, completely nude, blush, attic, night',
    )
  })

  it('drops the restated `pov` and `detailed anatomy` in single-window mode only', () => {
    const single = composeBooruScenePrompt(liveSections(), [], [], { singleWindow: true }).split(
      ', ',
    )
    expect(single).not.toContain('pov')
    expect(single).toContain('male pov')
    expect(single).not.toContain('detailed anatomy')
    expect(single.slice(0, 2)).toEqual(['explicit', 'uncensored'])
    const chunked = composeBooruScenePrompt(liveSections()).split(', ')
    expect(chunked).toContain('pov')
    expect(chunked).toContain('detailed anatomy')
  })

  it('keeps bare `pov` when no run states male pov (and the camera is untrimmed)', () => {
    const single = composeBooruScenePrompt(
      sections({
        camera: 'medium shot, pov',
        countTags: '1girl, solo',
        characters: ['long hair, blonde hair, yellow eyes'],
        expressions: ['blush'],
        scene: 'attic, night',
      }),
      [],
      [],
      { singleWindow: true },
    ).split(', ')
    expect(single).toContain('pov')
  })
})
