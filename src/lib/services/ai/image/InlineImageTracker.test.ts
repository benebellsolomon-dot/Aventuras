/**
 * Regression test for the live streaming tracker's flush/start race.
 *
 * `processChunk` starts each <pic> tag's generation asynchronously, and the
 * caller flushes at phase_complete. `startGeneration` now awaits the dedicated
 * booru prompt-writer (a full LLM round-trip) BEFORE it pushes the image into
 * `pendingImages`. If flush did not settle those in-flight starts first, a slow
 * writer on an end-of-narrative tag would race — and be dropped by — the flush.
 * These tests pin the guarantee that flush waits for every started tag.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  createEmbeddedImage: vi.fn(),
  updateEmbeddedImage: vi.fn(),
  getPackTemplate: vi.fn(),
  getImageProfile: vi.fn(),
  emitImageQueued: vi.fn(),
  emitImageReady: vi.fn(),
  assembleInlineImage: vi.fn(),
  pickImageSize: vi.fn(),
  bridgeIdentityAnchor: vi.fn(),
  resolveBooruScenePrompt: vi.fn(),
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
    createEmbeddedImage: mocks.createEmbeddedImage,
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
  emitImageQueued: mocks.emitImageQueued,
  emitImageReady: mocks.emitImageReady,
}))

vi.mock('./inlineAssembly', () => ({
  assembleInlineImage: mocks.assembleInlineImage,
}))

vi.mock('./aspectRatio', () => ({
  pickImageSize: mocks.pickImageSize,
}))

vi.mock('./bridgeSpec', () => ({
  bridgeIdentityAnchor: mocks.bridgeIdentityAnchor,
}))

vi.mock('./booruPromptWriter', () => ({
  resolveBooruScenePrompt: mocks.resolveBooruScenePrompt,
}))

// The tracker now calls the dialect dispatcher (booru writer, then the prose
// writer); route it straight to the booru mock so the existing assertions on
// what reached the writer stay meaningful and the prose writer's module graph
// (context builder, stores) stays out of this unit test.
vi.mock('./scenePromptWriter', () => ({
  resolveScenePrompt: (input: { scenePrompt: string }) => mocks.resolveBooruScenePrompt(input),
}))

import { InlineImageTracker } from './InlineImageTracker'
import type { Character } from '$lib/types'

/** A manually-resolvable deferred, to hold the writer mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const PIC_TAG = '<pic prompt="a woman on a bed" characters="Amelia"></pic>'

beforeEach(() => {
  vi.clearAllMocks()
  // Reset the writer implementation each test — clearAllMocks does NOT clear a
  // persistent mockReturnValue/mockImplementation, so an unresolved deferred set
  // in one test would otherwise leak into the next.
  mocks.resolveBooruScenePrompt.mockReset()
  mocks.resolveBooruScenePrompt.mockImplementation((input: { scenePrompt: string }) =>
    Promise.resolve(input.scenePrompt),
  )
  mocks.getImageProfile.mockReturnValue({ model: 'wai-illustrious-sdxl', providerType: 'nanogpt' })
  mocks.getPackTemplate.mockResolvedValue({ content: 'style prompt' })
  mocks.assembleInlineImage.mockReturnValue({ fullPrompt: 'FINAL PROMPT', bridgeSpec: undefined })
  mocks.pickImageSize.mockReturnValue('832x1216')
  mocks.bridgeIdentityAnchor.mockReturnValue(undefined)
  mocks.generateImage.mockResolvedValue({ base64: 'data' })
  mocks.createEmbeddedImage.mockResolvedValue(undefined)
  mocks.updateEmbeddedImage.mockResolvedValue(undefined)
})

describe('InlineImageTracker flush settles in-flight starts', () => {
  it('waits for a slow writer before flushing (no dropped end-of-narrative image)', async () => {
    const gate = deferred<string>()
    mocks.resolveBooruScenePrompt.mockImplementation(() => gate.promise) // writer still in flight

    const tracker = new InlineImageTracker(
      'story-1',
      'entry-1',
      () => [{ name: 'Amelia' } as Character],
      () => false,
    )

    // Tag detected; startGeneration is now awaiting the writer and has NOT
    // pushed into pendingImages yet.
    tracker.processChunk(`She lay down. ${PIC_TAG}`, false)
    expect(tracker.hasPendingImages).toBe(false)

    // Flush fired at phase_complete — it must block on the in-flight start.
    const flushPromise = tracker.flushToDatabase()
    await Promise.resolve() // let microtasks drain; flush should still be waiting
    expect(mocks.createEmbeddedImage).not.toHaveBeenCalled()

    // Writer resolves → start finishes → flush proceeds and persists the image.
    gate.resolve('general, 1girl, solo, bedroom')
    await flushPromise

    expect(mocks.createEmbeddedImage).toHaveBeenCalledTimes(1)
    const record = mocks.createEmbeddedImage.mock.calls[0][0]
    expect(record.prompt).toBe('FINAL PROMPT')
    expect(record.entryId).toBe('entry-1')
    // The writer output is what assembly received as the tag prompt.
    expect(mocks.assembleInlineImage).toHaveBeenCalledWith(
      expect.objectContaining({ tagPrompt: 'general, 1girl, solo, bedroom' }),
    )
  })

  it('flushes every tag when an early start completes before a slow late one', async () => {
    // First tag's writer resolves immediately; the late tag's writer is held
    // (keyed by the tag's scenePrompt so it is independent of call order). The
    // <pic> parser requires a prompt of at least 10 chars, so both are phrases.
    const lateGate = deferred<string>()
    mocks.resolveBooruScenePrompt.mockImplementation((input: { scenePrompt: string }) =>
      input.scenePrompt === 'the second beat'
        ? lateGate.promise
        : Promise.resolve(input.scenePrompt),
    )

    const tracker = new InlineImageTracker(
      'story-1',
      'entry-1',
      () => [{ name: 'Amelia' } as Character],
      () => false,
    )

    const firstTag = '<pic prompt="the first beat" characters="Amelia"></pic>'
    const lateTag = '<pic prompt="the second beat" characters="Amelia"></pic>'
    tracker.processChunk(`Beat one. ${firstTag}`, false)
    tracker.processChunk(`Beat one. ${firstTag} Beat two. ${lateTag}`, false)

    const flushPromise = tracker.flushToDatabase()
    await Promise.resolve()
    // The late tag has not pushed yet, so flush must still be blocked on it.
    lateGate.resolve('general, 1girl, second')
    await flushPromise

    // BOTH images persisted — the late tag was not dropped by the early flush.
    expect(mocks.createEmbeddedImage).toHaveBeenCalledTimes(2)
  })

  it('is a no-op when no tags were ever started', async () => {
    const tracker = new InlineImageTracker(
      'story-1',
      'entry-1',
      () => [],
      () => false,
    )
    await tracker.flushToDatabase()
    expect(mocks.createEmbeddedImage).not.toHaveBeenCalled()
  })
})

describe('InlineImageTracker explicit-beat routing (research/64 option B)', () => {
  it('routes a rating="explicit" tag to the explicit profile and keeps general tags on the primary', async () => {
    mocks.imageGeneration.explicitProfileId = 'profile-nsfw'
    mocks.imageGeneration.explicitSize = '832x1216'
    mocks.getImageProfile.mockImplementation((id: string) =>
      id === 'profile-nsfw'
        ? { model: 'wai-illustrious-sdxl', providerType: 'nanogpt' }
        : { model: 'wavespeed-ai/krea-v2/turbo-lora', providerType: 'nanogpt' },
    )
    try {
      const tracker = new InlineImageTracker(
        'story-1',
        'entry-1',
        () => [{ name: 'Amelia' } as Character],
        () => false,
      )
      const explicitTag =
        '<pic prompt="two lovers on the bed, nothing on" characters="Amelia" rating="explicit"></pic>'
      const generalTag =
        '<pic prompt="a quiet kitchen at dawn, bread cooling" characters="" rating="general"></pic>'
      tracker.processChunk(`One. ${explicitTag} Two. ${generalTag}`, false)
      await tracker.flushToDatabase()

      const profiles = mocks.generateImage.mock.calls.map(
        (c) => (c[0] as { profileId: string }).profileId,
      )
      expect(profiles).toContain('profile-nsfw')
      expect(profiles).toContain('profile-1')
      // The routed beat carries the explicit profile's model into the booru writer.
      expect(mocks.resolveBooruScenePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          scenePrompt: 'two lovers on the bed, nothing on',
          model: 'wai-illustrious-sdxl',
        }),
      )
      expect(mocks.resolveBooruScenePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          scenePrompt: 'a quiet kitchen at dawn, bread cooling',
          model: 'wavespeed-ai/krea-v2/turbo-lora',
        }),
      )
    } finally {
      delete mocks.imageGeneration.explicitProfileId
      delete mocks.imageGeneration.explicitSize
    }
  })
})
