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

import {
  computeIdentityUpdates,
  extractIdentity,
  IMAGE_TAGS_AUTO_HASH_KEY,
  normalizeExtraction,
  normalizeIdentityTags,
  type IdentityExtraction,
} from './identityExtraction'
import { hashContent } from '$lib/services/packs/hash'

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

describe('computeIdentityUpdates', () => {
  const extractionWith = (tags: string[]): IdentityExtraction => ({
    identityTags: tags,
    cleanBaseline: { hair: 'red hair', eyes: 'green eyes' },
    currentState: { clothing: 'sundress' },
  })

  it('writes the bank when the character has none, and stores its hash', async () => {
    const updates = await computeIdentityUpdates(
      { imageTags: null, metadata: null },
      extractionWith(['1girl', 'red hair', 'green eyes']),
    )

    expect(updates.bankChanged).toBe(true)
    expect(updates.imageTags).toBe('1girl, red hair, green eyes')
    expect(updates.imageTagsAutoHash).toBe(await hashContent('1girl, red hair, green eyes'))
    // baseline/current always surfaced for the caller
    expect(updates.cleanBaseline).toEqual({ hair: 'red hair', eyes: 'green eyes' })
    expect(updates.currentState).toEqual({ clothing: 'sundress' })
  })

  it('overwrites the bank when it still equals the last auto-derivation', async () => {
    const oldBank = '1girl, blue eyes'
    const updates = await computeIdentityUpdates(
      { imageTags: oldBank, metadata: { [IMAGE_TAGS_AUTO_HASH_KEY]: await hashContent(oldBank) } },
      extractionWith(['1girl', 'green eyes']),
    )

    expect(updates.bankChanged).toBe(true)
    expect(updates.imageTags).toBe('1girl, green eyes')
    expect(updates.imageTagsAutoHash).toBe(await hashContent('1girl, green eyes'))
  })

  it('preserves a user-edited bank (hash mismatch → no write)', async () => {
    const userBank = '1girl, my custom curated tag'
    const staleAutoHash = await hashContent('1girl, blue eyes') // hash of a DIFFERENT old auto value
    const updates = await computeIdentityUpdates(
      { imageTags: userBank, metadata: { [IMAGE_TAGS_AUTO_HASH_KEY]: staleAutoHash } },
      extractionWith(['1girl', 'green eyes']),
    )

    expect(updates.bankChanged).toBe(false)
    expect(updates.imageTags).toBeUndefined()
    expect(updates.imageTagsAutoHash).toBeUndefined()
    // baseline/current still returned so callers can propose baseline rewrites
    expect(updates.cleanBaseline).toEqual({ hair: 'red hair', eyes: 'green eyes' })
  })

  it('preserves a non-empty bank that has no auto-hash on record', async () => {
    const updates = await computeIdentityUpdates(
      { imageTags: '1girl, some tag', metadata: null },
      extractionWith(['1girl', 'green eyes']),
    )

    expect(updates.bankChanged).toBe(false)
    expect(updates.imageTags).toBeUndefined()
  })

  it('does not write when the extraction produced no tags', async () => {
    const updates = await computeIdentityUpdates(
      { imageTags: null, metadata: null },
      extractionWith([]),
    )

    expect(updates.bankChanged).toBe(false)
    expect(updates.imageTags).toBeUndefined()
  })

  it('round-trips: the stored hash lets the next derivation re-recognize its own auto value', async () => {
    // 1st pass seeds an empty character
    const first = await computeIdentityUpdates(
      { imageTags: '', metadata: null },
      extractionWith(['1girl', 'red hair']),
    )
    expect(first.bankChanged).toBe(true)

    // Persist exactly what the caller would write, then derive again
    const persisted = {
      imageTags: first.imageTags!,
      metadata: { [IMAGE_TAGS_AUTO_HASH_KEY]: first.imageTagsAutoHash! },
    }
    const second = await computeIdentityUpdates(persisted, extractionWith(['1girl', 'long hair']))

    // The guard recognizes the untouched auto bank and re-derives cleanly
    expect(second.bankChanged).toBe(true)
    expect(second.imageTags).toBe('1girl, long hair')
    expect(second.imageTagsAutoHash).toBe(await hashContent('1girl, long hair'))
  })
})
