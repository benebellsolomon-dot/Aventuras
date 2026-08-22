/**
 * Tests for the inline image regenerate/retry path: a regenerate must rebuild
 * the request through the same assembleInlineImage pipeline as first-time
 * inline generation (trigger words, engine-tier marker, current style, bridge
 * spec, per-character LoRA) instead of re-sending the stored prompt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  getEmbeddedImage: vi.fn(),
  updateEmbeddedImage: vi.fn(),
  getPackTemplate: vi.fn(),
  getImageProfile: vi.fn(),
  imageGeneration: {
    profileId: 'profile-1',
    size: '1024x1024',
    styleId: 'style-1',
  } as Record<string, unknown>,
}))

vi.mock('./providers/registry', () => ({
  generateImage: mocks.generateImage,
  supportsImageGeneration: () => true,
}))

vi.mock('$lib/services/database', () => ({
  database: {
    getEmbeddedImage: mocks.getEmbeddedImage,
    updateEmbeddedImage: mocks.updateEmbeddedImage,
    getPackTemplate: mocks.getPackTemplate,
  },
}))

vi.mock('$lib/stores/settings.svelte', () => ({
  settings: {
    get systemServicesSettings() {
      return { imageGeneration: mocks.imageGeneration }
    },
    getImageProfile: mocks.getImageProfile,
  },
}))

vi.mock('$lib/services/events', () => ({
  emitImageReady: vi.fn(),
  emitImageAnalysisFailed: vi.fn(),
}))

// The dedicated booru writer runs a real structured LLM call; these tests
// exercise the retry ASSEMBLY, not the writer. Mock it as a passthrough (the
// best-effort fallback behavior) so the request is assembled from the stored
// <pic> prompt exactly as before, without pulling in the AI-SDK import chain.
vi.mock('./booruPromptWriter', () => ({
  resolveBooruScenePrompt: vi.fn(async (input: { scenePrompt: string }) => input.scenePrompt),
}))

import { retryImageGeneration } from './imageUtils'
import { defaultBodyState, writeBodyState } from '$lib/services/be'
import type { Character } from '$lib/types'

function beCharacter(name: string, tier: number, triggerWords?: string): Character {
  return {
    name,
    loraConfig: triggerWords ? { name: 'lucy.safetensors', triggerWords } : null,
    metadata: writeBodyState(null, defaultBodyState(tier)),
    visualDescriptors: {},
  } as unknown as Character
}

const INLINE_IMAGE = {
  id: 'img-1',
  entryId: 'entry-1',
  generationMode: 'inline',
  sourceText: '<pic prompt="Lucy lounging in the garden" characters="Lucy"></pic>',
  prompt: 'Lucy lounging in the garden. OLD STYLE',
}

function lastGenerateCall() {
  return mocks.generateImage.mock.calls.at(-1)?.[0] as {
    prompt: string
    spec?: unknown
    loraOverride?: unknown
  }
}

describe('retryImageGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.imageGeneration = { profileId: 'profile-1', size: '1024x1024', styleId: 'style-1' }
    mocks.getEmbeddedImage.mockResolvedValue(INLINE_IMAGE)
    mocks.updateEmbeddedImage.mockResolvedValue(undefined)
    mocks.getPackTemplate.mockResolvedValue({ content: 'NEW STYLE' })
    mocks.getImageProfile.mockReturnValue({ providerType: 'si-bridge', model: 'krea', apiKey: 'k' })
    mocks.generateImage.mockResolvedValue({ base64: 'AAAA' })
  })

  // Rating routing on retry (research/64 option B; D5 live: a regenerated explicit
  // image fell back to the primary Krea profile, which renders explicit beats as a doll).
  describe('rating routing', () => {
    const EXPLICIT_SETTINGS = {
      profileId: 'profile-1',
      size: '1024x1024',
      styleId: 'style-1',
      referenceProfileId: 'ref-profile',
      referenceSize: '512x768',
      explicitProfileId: 'explicit-profile',
      explicitSize: '832x1216',
    }
    const profileOf = (id: string) =>
      id === 'explicit-profile'
        ? { providerType: 'nanogpt', model: 'wai-illustrious-sdxl', apiKey: 'k' }
        : { providerType: 'nanogpt', model: 'wavespeed-ai/krea-v2/turbo', apiKey: 'k' }

    it('re-routes a stored explicit booru prompt to the explicit profile, skipping the reference swap', async () => {
      mocks.imageGeneration = EXPLICIT_SETTINGS
      mocks.getImageProfile.mockImplementation(profileOf)
      mocks.getEmbeddedImage.mockResolvedValue({
        ...INLINE_IMAGE,
        sourceText: '<pic prompt="Lucy bare on the crate" characters="Lucy"></pic>',
        prompt: 'explicit, uncensored, 1girl, completely nude, sitting, spread legs. OLD STYLE',
      })
      const lucy = {
        ...beCharacter('Lucy', 24),
        portrait: 'data:image/png;base64,QUJD',
      } as Character
      await retryImageGeneration('img-1', 'ignored', {
        presentCharacters: [lucy],
        beMode: true,
        narrativeText: '',
        referenceMode: true,
      })
      const call = lastGenerateCall() as unknown as {
        profileId: string
        size: string
        referenceImages?: string[]
      }
      expect(call.profileId).toBe('explicit-profile')
      expect(call.size).toBe('832x1216')
      expect(call.referenceImages).toBeUndefined()
    })

    it('honors the <pic rating="explicit"> attribute even when the prose prompt has no explicit words', async () => {
      mocks.imageGeneration = EXPLICIT_SETTINGS
      mocks.getImageProfile.mockImplementation(profileOf)
      mocks.getEmbeddedImage.mockResolvedValue({
        ...INLINE_IMAGE,
        sourceText: '<pic prompt="Lucy on the crate" characters="Lucy" rating="explicit"></pic>',
        prompt: 'Lucy on the crate, dusty attic. OLD STYLE',
      })
      await retryImageGeneration('img-1', 'ignored', {
        presentCharacters: [beCharacter('Lucy', 24)],
        beMode: true,
        narrativeText: '',
      })
      expect((lastGenerateCall() as unknown as { profileId: string }).profileId).toBe(
        'explicit-profile',
      )
    })

    it('keeps the primary profile for a general beat, and when no explicit profile is configured', async () => {
      mocks.imageGeneration = EXPLICIT_SETTINGS
      mocks.getImageProfile.mockImplementation(profileOf)
      await retryImageGeneration('img-1', INLINE_IMAGE.prompt, {
        presentCharacters: [beCharacter('Lucy', 24)],
        beMode: true,
        narrativeText: '',
      })
      expect((lastGenerateCall() as unknown as { profileId: string }).profileId).toBe('profile-1')

      mocks.imageGeneration = { ...EXPLICIT_SETTINGS, explicitProfileId: null }
      mocks.getEmbeddedImage.mockResolvedValue({
        ...INLINE_IMAGE,
        prompt: 'explicit, uncensored, 1girl, completely nude. OLD STYLE',
      })
      await retryImageGeneration('img-1', 'ignored', {
        presentCharacters: [beCharacter('Lucy', 24)],
        beMode: true,
        narrativeText: '',
      })
      expect((lastGenerateCall() as unknown as { profileId: string }).profileId).toBe('profile-1')
    })
  })

  it('rebuilds an inline prompt through the shared assembly (trigger words, tier marker, current style)', async () => {
    await retryImageGeneration('img-1', INLINE_IMAGE.prompt, {
      presentCharacters: [beCharacter('Lucy', 24, 'glowmilk')],
      beMode: true,
      narrativeText: 'Lucy stretched out on the grass.',
    })

    const call = lastGenerateCall()
    expect(call.prompt.startsWith('__betier_24__ glowmilk, ')).toBe(true)
    expect(call.prompt).toContain('Lucy lounging in the garden')
    expect(call.prompt.endsWith('. NEW STYLE')).toBe(true)
    expect(call.prompt).not.toContain('OLD STYLE')
  })

  it('passes the assembled bridge spec and per-character LoRA to the provider', async () => {
    await retryImageGeneration('img-1', INLINE_IMAGE.prompt, {
      presentCharacters: [beCharacter('Lucy', 24, 'glowmilk')],
      beMode: true,
      narrativeText: '',
    })

    const call = lastGenerateCall()
    expect(call.spec).toBeDefined()
    expect(call.loraOverride).toMatchObject({ name: 'lucy.safetensors' })
  })

  it('runs a user-edited prompt through assembly too', async () => {
    await retryImageGeneration('img-1', 'ignored', {
      presentCharacters: [beCharacter('Lucy', 24, 'glowmilk')],
      beMode: true,
      narrativeText: '',
      promptOverride: 'Lucy reading by the fire',
    })

    const call = lastGenerateCall()
    expect(call.prompt).toContain('Lucy reading by the fire')
    expect(call.prompt).toContain('glowmilk')
    expect(call.prompt.endsWith('. NEW STYLE')).toBe(true)
  })

  it('persists the assembled prompt on the image record', async () => {
    await retryImageGeneration('img-1', INLINE_IMAGE.prompt, {
      presentCharacters: [beCharacter('Lucy', 24, 'glowmilk')],
      beMode: true,
      narrativeText: '',
    })

    const generatingUpdate = mocks.updateEmbeddedImage.mock.calls.find(
      (c) => (c[1] as { status?: string }).status === 'generating',
    )
    expect((generatingUpdate?.[1] as { prompt: string }).prompt).toBe(lastGenerateCall().prompt)
  })

  it('sends the caller prompt unchanged for non-inline images (gallery edit path)', async () => {
    mocks.getEmbeddedImage.mockResolvedValue({
      ...INLINE_IMAGE,
      generationMode: 'agentic',
      sourceText: 'some narrative sentence',
    })

    await retryImageGeneration('img-1', 'exactly this prompt', {
      presentCharacters: [beCharacter('Lucy', 24, 'glowmilk')],
      beMode: true,
      narrativeText: '',
    })

    expect(lastGenerateCall().prompt).toBe('exactly this prompt')
  })

  it('sends the caller prompt unchanged when no inline context is supplied', async () => {
    await retryImageGeneration('img-1', 'exactly this prompt')
    expect(lastGenerateCall().prompt).toBe('exactly this prompt')
  })

  // The caller used to fetch the style template itself and hand in an
  // already-suffixed prompt; assembly discarded it for inline records and
  // fetched again. The suffix now happens here, once.
  it('appends the current style to an edited prompt for non-inline records', async () => {
    mocks.getEmbeddedImage.mockResolvedValue({
      ...INLINE_IMAGE,
      generationMode: 'agentic',
      sourceText: 'some narrative sentence',
    })

    await retryImageGeneration('img-1', 'Lucy by the fire', {
      presentCharacters: [beCharacter('Lucy', 24, 'glowmilk')],
      beMode: true,
      narrativeText: '',
      promptOverride: 'Lucy by the fire.',
    })

    expect(lastGenerateCall().prompt).toBe('Lucy by the fire. NEW STYLE')
    expect(mocks.getPackTemplate).toHaveBeenCalledTimes(1)
  })
})

// Spec 4 B1: a regenerate of a portrait-anchored inline image must re-gather
// the references and the FaceID anchor, or it renders with no identity hold.
describe('retryImageGeneration portrait references', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.imageGeneration = {
      profileId: 'profile-1',
      referenceProfileId: 'ref-profile',
      size: '1024x1024',
      referenceSize: '768x768',
      styleId: 'style-1',
    }
    mocks.getEmbeddedImage.mockResolvedValue(INLINE_IMAGE)
    mocks.updateEmbeddedImage.mockResolvedValue(undefined)
    mocks.getPackTemplate.mockResolvedValue({ content: 'NEW STYLE' })
    mocks.getImageProfile.mockReturnValue({ providerType: 'si-bridge', model: 'krea', apiKey: 'k' })
    mocks.generateImage.mockResolvedValue({ base64: 'AAAA' })
  })

  function withPortrait(name: string, tier: number): Character {
    return {
      ...beCharacter(name, tier),
      portrait: 'data:image/png;base64,UE9SVA==',
    } as unknown as Character
  }

  it('re-sends the tagged portraits and the si-bridge identity anchor', async () => {
    await retryImageGeneration('img-1', INLINE_IMAGE.prompt, {
      presentCharacters: [withPortrait('Lucy', 24)],
      beMode: true,
      narrativeText: '',
      referenceMode: true,
    })

    const call = mocks.generateImage.mock.calls.at(-1)?.[0] as {
      profileId: string
      size: string
      referenceImages?: string[]
      poseFaceAnchor?: string
    }
    expect(call.referenceImages).toEqual(['data:image/png;base64,UE9SVA=='])
    expect(call.poseFaceAnchor).toBe('UE9SVA==')
    // Same profile/size swap the first-generation path makes.
    expect(call.profileId).toBe('ref-profile')
    expect(call.size).toBe('768x768')
  })

  it('sends no references when portrait mode is off', async () => {
    await retryImageGeneration('img-1', INLINE_IMAGE.prompt, {
      presentCharacters: [withPortrait('Lucy', 24)],
      beMode: true,
      narrativeText: '',
      referenceMode: false,
    })

    const call = mocks.generateImage.mock.calls.at(-1)?.[0] as {
      profileId: string
      referenceImages?: string[]
      poseFaceAnchor?: string
    }
    expect(call.referenceImages).toBeUndefined()
    expect(call.poseFaceAnchor).toBeUndefined()
    expect(call.profileId).toBe('profile-1')
  })
})
