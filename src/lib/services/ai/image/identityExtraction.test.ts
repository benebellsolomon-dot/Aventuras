/**
 * Tests for the identity-extraction utility (research/55 component A).
 *
 * The AI layer is mocked so the call contract, the parse/normalization
 * guarantees, and the best-effort null paths are exercised without a live model.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateStructured: vi.fn(),
  getServicePresetId: vi.fn(),
}))

vi.mock('../sdk/generate', () => ({
  generateStructured: mocks.generateStructured,
}))

vi.mock('$lib/stores/settings.svelte', () => ({
  settings: {
    getServicePresetId: mocks.getServicePresetId,
  },
}))

import { extractIdentity, normalizeExtraction, normalizeIdentityTags } from './identityExtraction'

// A holstaur (monster girl) fixture whose species markers MUST survive as tags
// and whose size/transient/clothing pollution must be stripped or rerouted.
const holstaurRaw = {
  identityTags: [
    'cow girl',
    'cow ears',
    'cow horns',
    'cow tail',
    '(long hair:1.2)', // weighted — must become plain
    'chestnut hair',
    'brown eyes',
    'huge breasts', // size — must be dropped
    'cleavage', // size — must be dropped
  ],
  cleanBaseline: {
    face: 'soft round face',
    hair: 'long wavy chestnut hair',
    eyes: 'gentle brown eyes',
    build: 'tall, wide hips, curvy frame',
    distinguishing: 'cow ears, small curved horns, cow tail, cow-print markings',
  },
  currentState: {
    face: 'warm smile, flushed cheeks, semen on chin',
    clothing: 'torn milkmaid dress pulled down, apron',
  },
}

// The "Amelia" fixture from the design doc: baseline face polluted with
// post-orgasm scene state that the model should route to currentState.
const ameliaRaw = {
  identityTags: ['long silver hair', 'violet eyes', 'pale skin'],
  cleanBaseline: {
    face: 'delicate features, pale skin',
    hair: 'long silver hair',
    eyes: 'violet eyes',
    build: 'slender frame',
    // model left the current outfit stuffed in the baseline — must be rerouted
    clothing: 'unbuttoned blouse',
  },
  currentState: {
    face: 'post-orgasm, flushed, semen on chin',
  },
}

describe('normalizeIdentityTags', () => {
  it('strips A1111 weighting to plain lowercase tags', () => {
    expect(normalizeIdentityTags(['(elf ears:1.3)', 'Blue Eyes:1.1', '[freckles]'])).toEqual([
      'elf ears',
      'blue eyes',
      'freckles',
    ])
  })

  it('drops size/breast vocabulary so tags cannot fight the engine tier', () => {
    expect(
      normalizeIdentityTags(['huge breasts', 'large breasts', 'cleavage', 'long black hair']),
    ).toEqual(['long black hair'])
  })

  it('splits comma-joined tags and dedupes', () => {
    expect(normalizeIdentityTags(['cow ears, cow ears', 'cow ears'])).toEqual(['cow ears'])
  })

  it('drops sub-minimum fragments', () => {
    expect(normalizeIdentityTags(['ab', 'green eyes'])).toEqual(['green eyes'])
  })
})

describe('normalizeExtraction', () => {
  it('keeps species tags and drops size/weights from a monster-girl split', () => {
    const result = normalizeExtraction(holstaurRaw)
    expect(result.identityTags).toEqual([
      'cow girl',
      'cow ears',
      'cow horns',
      'cow tail',
      'long hair',
      'chestnut hair',
      'brown eyes',
    ])
    // no size vocabulary survives
    expect(result.identityTags).not.toContain('huge breasts')
    expect(result.identityTags).not.toContain('cleavage')
  })

  it('excludes clothing/accessories from the clean baseline', () => {
    const result = normalizeExtraction(holstaurRaw)
    expect(result.cleanBaseline.clothing).toBeUndefined()
    expect(result.cleanBaseline).toEqual({
      face: 'soft round face',
      hair: 'long wavy chestnut hair',
      eyes: 'gentle brown eyes',
      build: 'tall, wide hips, curvy frame',
      distinguishing: 'cow ears, small curved horns, cow tail, cow-print markings',
    })
  })

  it('routes transient state and current clothing into currentState', () => {
    const result = normalizeExtraction(holstaurRaw)
    expect(result.currentState).toEqual({
      face: 'warm smile, flushed cheeks, semen on chin',
      clothing: 'torn milkmaid dress pulled down, apron',
    })
  })

  it('reroutes a stray baseline outfit into currentState without clobbering', () => {
    const result = normalizeExtraction(ameliaRaw)
    // clothing the model left in the baseline is moved out
    expect(result.cleanBaseline.clothing).toBeUndefined()
    expect(result.currentState.clothing).toBe('unbuttoned blouse')
    // the polluted baseline face keeps only the stable value the model returned
    expect(result.cleanBaseline.face).toBe('delicate features, pale skin')
    expect(result.currentState.face).toBe('post-orgasm, flushed, semen on chin')
  })
})

describe('extractIdentity', () => {
  beforeEach(() => {
    mocks.generateStructured.mockReset()
    mocks.getServicePresetId.mockReset()
    mocks.getServicePresetId.mockReturnValue('imageGeneration')
  })

  it('calls the AI layer with the schema and returns the parsed split', async () => {
    mocks.generateStructured.mockResolvedValue(holstaurRaw)

    const result = await extractIdentity({
      name: 'Lucy',
      visualDescriptors: {
        face: 'soft round face, flushed, semen on chin',
        hair: 'long wavy chestnut hair',
        build: 'tall, huge breasts, curvy',
        clothing: 'torn milkmaid dress',
        distinguishing: 'cow ears, horns, cow tail',
      },
    })

    expect(mocks.generateStructured).toHaveBeenCalledTimes(1)
    const [callArgs, serviceId] = mocks.generateStructured.mock.calls[0]
    expect(callArgs.presetId).toBe('imageGeneration')
    expect(callArgs.schema).toBeDefined()
    // schema is a zod object that parses the split shape
    expect(callArgs.schema.safeParse(holstaurRaw).success).toBe(true)
    expect(typeof callArgs.system).toBe('string')
    expect(callArgs.system).toContain('holstaur')
    expect(callArgs.prompt).toContain('Lucy')
    expect(serviceId).toBe('imageGeneration')

    expect(result).not.toBeNull()
    expect(result?.identityTags).toContain('cow ears')
    expect(result?.identityTags).not.toContain('huge breasts')
    expect(result?.cleanBaseline.clothing).toBeUndefined()
    expect(result?.currentState.clothing).toBe('torn milkmaid dress pulled down, apron')
  })

  it('returns null when no text model is configured (no preset assigned)', async () => {
    mocks.getServicePresetId.mockReturnValue(undefined)

    const result = await extractIdentity({ visualDescriptors: { hair: 'red hair' } })

    expect(result).toBeNull()
    expect(mocks.generateStructured).not.toHaveBeenCalled()
  })

  it('returns null when the AI call throws (best-effort, never throws)', async () => {
    mocks.generateStructured.mockRejectedValue(new Error('model unavailable'))

    const result = await extractIdentity({ visualDescriptors: { hair: 'red hair' } })

    expect(result).toBeNull()
  })
})
