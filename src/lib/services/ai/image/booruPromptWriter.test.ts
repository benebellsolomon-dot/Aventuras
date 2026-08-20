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
  buildLocationBlock,
  buildSubjectDossier,
  composeBooruScenePrompt,
  resolveBooruScenePrompt,
  stripCharacterNames,
  writeBooruScenePrompt,
  type BooruPromptWriterInput,
  type BooruSceneSections,
} from './booruPromptWriter'
import { apparentTier, bandWord, defaultBodyState, writeBodyState } from '$lib/services/be'
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
        'on the left, blonde hair, golden eyes, fair skin, slim, wide hips, young adult, open mouth, ' +
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

describe('writeBooruScenePrompt', () => {
  it('returns null (best-effort) when no preset is assigned', async () => {
    mocks.getServicePresetId.mockReturnValue('')
    const result = await writeBooruScenePrompt(baseInput())
    expect(result).toBeNull()
    expect(mocks.generateStructured).not.toHaveBeenCalled()
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
