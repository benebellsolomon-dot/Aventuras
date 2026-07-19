/**
 * Tests for the si-bridge native provider (Spec 2): request shape, poll loop,
 * binary result handling, abort/timeout, and the structured-spec assembly +
 * tier calibration helpers it rides on.
 */
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  imageFetch: vi.fn(),
  imageGetFetch: vi.fn(),
}))

vi.mock('./fetchAdapter', () => ({
  imageFetch: mocks.imageFetch,
  imageGetFetch: mocks.imageGetFetch,
}))

import { createSiBridgeProvider } from './si-bridge'
import { createA1111Provider } from './a1111'
import { bridgeTierIndex, buildStructuredImageSpec } from '../bridgeSpec'
import { writeBodyState, defaultBodyState } from '$lib/services/be'
import type { BodyState } from '$lib/services/be'

function jsonResponse(payload: unknown): { ok: boolean; json: () => Promise<unknown> } {
  return { ok: true, json: async () => payload }
}

function binaryResponse(bytes: Uint8Array): {
  ok: boolean
  arrayBuffer: () => Promise<ArrayBuffer>
} {
  return { ok: true, arrayBuffer: async () => bytes.buffer as ArrayBuffer }
}

function statefulCharacter(
  name: string,
  stateOverrides: Partial<BodyState> = {},
  visualDescriptors: Record<string, string> = {},
) {
  const state: BodyState = { ...defaultBodyState(), ...stateOverrides }
  return {
    name,
    visualDescriptors,
    metadata: writeBodyState(null, state),
  }
}

function statelessCharacter(name: string) {
  return { name, visualDescriptors: {}, metadata: null }
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_BASE64 = btoa(String.fromCharCode(...PNG_BYTES))

describe('createSiBridgeProvider.generate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.imageFetch.mockReset()
    mocks.imageGetFetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeProvider(overrides: Record<string, unknown> = {}) {
    return createSiBridgeProvider({
      apiKey: 'test-key',
      baseUrl: 'http://bridge.test:8001/',
      ...overrides,
    })
  }

  test('spec request: POST /image with spec + X-API-Key, no workflow pin, then poll + binary result', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_1' }))
    mocks.imageGetFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'complete' }))
      .mockResolvedValueOnce(binaryResponse(PNG_BYTES))

    const provider = makeProvider()
    const promise = provider.generate({
      model: '',
      prompt: 'fallback prompt',
      size: '1024x1024',
      spec: { characters: [{ tier_index: 24 }], intimacy: 'clean' },
    })
    await vi.advanceTimersByTimeAsync(30_000)
    const result = await promise

    expect(result.base64).toBe(PNG_BASE64)

    const [postCall] = mocks.imageFetch.mock.calls
    const postOptions = postCall[0] as {
      url: string
      headers: Record<string, string>
      body: string
    }
    expect(postOptions.url).toBe('http://bridge.test:8001/image')
    expect(postOptions.headers['X-API-Key']).toBe('test-key')
    const body = JSON.parse(postOptions.body)
    expect(body.spec).toEqual({ characters: [{ tier_index: 24 }], intimacy: 'clean' })
    expect(body.campaign_id).toBe('aventuras')
    expect(body.prompt).toBeUndefined()
    expect(body.workflow).toBeUndefined()
    expect(body.width).toBe(1024)
    expect(body.height).toBe(1024)

    const statusUrl = mocks.imageGetFetch.mock.calls[0][0] as string
    expect(statusUrl).toBe('http://bridge.test:8001/image/img_1')
    const resultUrl = mocks.imageGetFetch.mock.calls[1][0] as string
    expect(resultUrl).toBe('http://bridge.test:8001/image/img_1/result?format=png')
  })

  test('poseFaceAnchor rides the body beside the spec (B1 identity-hold)', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_fa' }))
    mocks.imageGetFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'complete' }))
      .mockResolvedValueOnce(binaryResponse(PNG_BYTES))

    const provider = makeProvider()
    const promise = provider.generate({
      model: '',
      prompt: 'fallback',
      size: '832x1216',
      spec: { characters: [{ tier_index: 29 }] },
      poseFaceAnchor: 'QUJD',
      faceidWeight: 0.55,
      openposeStrength: 1.0,
    })
    await vi.advanceTimersByTimeAsync(30_000)
    await promise

    const body = JSON.parse((mocks.imageFetch.mock.calls[0][0] as { body: string }).body)
    expect(body.pose_face_anchor_b64).toBe('QUJD')
    expect(body.faceid_weight).toBe(0.55)
    expect(body.openpose_strength).toBe(1.0)
  })

  test('prompt fallback: no spec sends prompt only', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_2' }))
    mocks.imageGetFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'complete' }))
      .mockResolvedValueOnce(binaryResponse(PNG_BYTES))

    const provider = makeProvider()
    const promise = provider.generate({ model: '', prompt: 'a castle at dusk', size: '512x512' })
    await vi.advanceTimersByTimeAsync(30_000)
    await promise

    const body = JSON.parse((mocks.imageFetch.mock.calls[0][0] as { body: string }).body)
    expect(body.prompt).toBe('a castle at dusk')
    expect(body.spec).toBeUndefined()
    expect(body.be_tier_index).toBeUndefined()
  })

  test('prompt fallback translates a __betier_N__ marker to be_tier_index (native /image does not parse it)', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_2b' }))
    mocks.imageGetFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'complete' }))
      .mockResolvedValueOnce(binaryResponse(PNG_BYTES))

    const provider = makeProvider()
    const promise = provider.generate({
      model: '',
      prompt: '__betier_24__ Lucy at the window, huge breasts, warm light. Style prose.',
      size: '512x512',
    })
    await vi.advanceTimersByTimeAsync(30_000)
    await promise

    const body = JSON.parse((mocks.imageFetch.mock.calls[0][0] as { body: string }).body)
    expect(body.be_tier_index).toBe(24)
    expect(body.prompt).not.toMatch(/__betier_/)
    expect(body.prompt).toContain('Lucy at the window')
  })

  test('tolerates transient poll failures (bridge is still rendering)', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_p1' }))
    mocks.imageGetFetch
      .mockRejectedValueOnce(new Error('502 Bad Gateway'))
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(jsonResponse({ status: 'complete' }))
      .mockResolvedValueOnce(binaryResponse(PNG_BYTES))

    const provider = makeProvider()
    const promise = provider.generate({ model: '', prompt: 'p', size: '512x512' })
    await vi.advanceTimersByTimeAsync(30_000)
    const result = await promise
    expect(result.base64).toBe(PNG_BASE64)
  })

  test('failure counter resets on success — non-consecutive failures never abandon', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_p3' }))
    mocks.imageGetFetch
      .mockRejectedValueOnce(new Error('blip 1'))
      .mockRejectedValueOnce(new Error('blip 2'))
      .mockResolvedValueOnce(jsonResponse({ status: 'running' }))
      .mockRejectedValueOnce(new Error('blip 3'))
      .mockRejectedValueOnce(new Error('blip 4'))
      .mockResolvedValueOnce(jsonResponse({ status: 'running' }))
      .mockRejectedValueOnce(new Error('blip 5'))
      .mockResolvedValueOnce(jsonResponse({ status: 'complete' }))
      .mockResolvedValueOnce(binaryResponse(PNG_BYTES))

    const provider = makeProvider()
    const promise = provider.generate({ model: '', prompt: 'p', size: '512x512' })
    await vi.advanceTimersByTimeAsync(60_000)
    const result = await promise
    expect(result.base64).toBe(PNG_BASE64)
  })

  test('gives up after consecutive poll failures', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_p2' }))
    mocks.imageGetFetch.mockRejectedValue(new Error('connection refused'))

    const provider = makeProvider()
    const promise = provider.generate({ model: '', prompt: 'p', size: '512x512' })
    promise.catch(() => {})
    await vi.advanceTimersByTimeAsync(60_000)
    await expect(promise).rejects.toThrow(/polling failed repeatedly.*connection refused/i)
  })

  test('poll loop passes through queued/running/upscaling before complete', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_3' }))
    mocks.imageGetFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'running' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'upscaling' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'complete' }))
      .mockResolvedValueOnce(binaryResponse(PNG_BYTES))

    const provider = makeProvider()
    const promise = provider.generate({ model: '', prompt: 'p', size: '512x512' })
    await vi.advanceTimersByTimeAsync(60_000)
    const result = await promise

    expect(result.base64).toBe(PNG_BASE64)
    expect(mocks.imageGetFetch).toHaveBeenCalledTimes(5)
  })

  test('failed job throws the bridge error string', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_4' }))
    mocks.imageGetFetch.mockResolvedValueOnce(
      jsonResponse({ status: 'failed', error: 'CUDA out of memory' }),
    )

    const provider = makeProvider()
    const promise = provider.generate({ model: '', prompt: 'p', size: '512x512' })
    promise.catch(() => {}) // avoid unhandled rejection while timers advance
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(promise).rejects.toThrow('CUDA out of memory')
  })

  test('missing job_id throws', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ detail: 'nope' }))

    const provider = makeProvider()
    const promise = provider.generate({ model: '', prompt: 'p', size: '512x512' })
    promise.catch(() => {})
    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).rejects.toThrow(/job_id/i)
  })

  test('abort signal stops the poll loop', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_5' }))
    mocks.imageGetFetch.mockResolvedValue(jsonResponse({ status: 'running' }))

    const controller = new AbortController()
    const provider = makeProvider()
    const promise = provider.generate({
      model: '',
      prompt: 'p',
      size: '512x512',
      signal: controller.signal,
    })
    promise.catch(() => {})
    await vi.advanceTimersByTimeAsync(3000)
    controller.abort()
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(promise).rejects.toThrow(/abort/i)
  })

  test('overall timeout rejects a never-finishing job, floored at the image default', async () => {
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_6' }))
    mocks.imageGetFetch.mockResolvedValue(jsonResponse({ status: 'running' }))

    // A short (LLM-tuned) config timeout must not cut image jobs down: the
    // effective deadline is max(configured, 5 min).
    const provider = makeProvider({ timeoutMs: 10_000 })
    const promise = provider.generate({ model: '', prompt: 'p', size: '512x512' })
    promise.catch(() => {})
    await vi.advanceTimersByTimeAsync(400_000)
    await expect(promise).rejects.toThrow(/timed out after 300s/i)
  })
})

describe('workflow pinning via the profile model (style consistency)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.imageFetch.mockReset()
    mocks.imageGetFetch.mockReset()
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ job_id: 'img_w' }))
    mocks.imageGetFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'complete' }))
      .mockResolvedValueOnce(binaryResponse(PNG_BYTES))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeProvider() {
    return createSiBridgeProvider({ apiKey: 'k', baseUrl: 'http://bridge.test:8001' })
  }

  async function generateWith(model: string) {
    const provider = makeProvider()
    const promise = provider.generate({
      model,
      prompt: '__betier_24__ Lucy at the window, warm light. Prose style.',
      size: '1024x1024',
      spec: { characters: [{ tier_index: 24 }], intimacy: 'clean' },
      poseFaceAnchor: 'QUJD',
    })
    await vi.advanceTimersByTimeAsync(30_000)
    await promise
    return JSON.parse((mocks.imageFetch.mock.calls[0][0] as { body: string }).body)
  }

  test('krea2 pin drops the spec and anchor, rides prompt + be_tier_index (spec pins cannot reach krea bridge-side)', async () => {
    const body = await generateWith('krea2')
    expect(body.spec).toBeUndefined()
    expect(body.be_tier_index).toBe(24)
    expect(body.prompt).toContain('Lucy at the window')
    expect(body.workflow).toBeUndefined()
    expect(body.pose_face_anchor_b64).toBeUndefined()
  })

  test('illustrious pin keeps the spec + anchor and sets the workflow explicitly', async () => {
    const body = await generateWith('illustrious')
    expect(body.spec).toBeDefined()
    expect(body.workflow).toBe('illustrious_image')
    expect(body.pose_face_anchor_b64).toBe('QUJD')
  })

  test('bridge-auto and empty model keep auto-routing (no workflow field)', async () => {
    const body = await generateWith('bridge-auto')
    expect(body.spec).toBeDefined()
    expect(body.workflow).toBeUndefined()
  })
})

describe('a1111 provider with a stray spec', () => {
  test('ignores options.spec — request body carries the prompt only', async () => {
    mocks.imageFetch.mockReset()
    mocks.imageFetch.mockResolvedValueOnce(jsonResponse({ images: ['abc'] }))

    const provider = createA1111Provider({ apiKey: '', baseUrl: 'http://a1111.test' })
    await provider.generate({
      model: '',
      prompt: 'a lighthouse',
      size: '512x512',
      spec: { characters: [{ tier_index: 24 }] },
    })

    const body = JSON.parse((mocks.imageFetch.mock.calls[0][0] as { body: string }).body)
    expect(body.prompt).toBe('a lighthouse')
    expect(body.spec).toBeUndefined()
  })
})

describe('createSiBridgeProvider.listModels', () => {
  beforeEach(() => {
    mocks.imageFetch.mockReset()
    mocks.imageGetFetch.mockReset()
  })

  test('returns the three pipeline pins when the bridge answers', async () => {
    mocks.imageGetFetch.mockResolvedValueOnce(jsonResponse({ workflows: {} }))
    const provider = createSiBridgeProvider({ apiKey: 'k', baseUrl: 'http://b:8001' })
    const models = await provider.listModels('k')
    expect(models.map((m) => m.id)).toEqual(['bridge-auto', 'krea2', 'illustrious'])
  })

  test('tolerates failure with an empty list', async () => {
    mocks.imageGetFetch.mockRejectedValueOnce(new Error('down'))
    const provider = createSiBridgeProvider({ apiKey: 'k', baseUrl: 'http://b:8001' })
    await expect(provider.listModels('k')).resolves.toEqual([])
  })
})

describe('bridgeTierIndex', () => {
  test('is the identity on the shared 0-51 band scalar (full-table calibration 2026-07-19)', () => {
    expect(bridgeTierIndex(0)).toBe(0)
    expect(bridgeTierIndex(3)).toBe(3)
    expect(bridgeTierIndex(13)).toBe(13)
    expect(bridgeTierIndex(21)).toBe(21)
    expect(bridgeTierIndex(29)).toBe(29)
    expect(bridgeTierIndex(39)).toBe(39)
    expect(bridgeTierIndex(47)).toBe(47)
    expect(bridgeTierIndex(51)).toBe(51)
  })

  test('rounds fractional tiers and floors garbage at 0', () => {
    expect(bridgeTierIndex(23.6)).toBe(24)
    expect(bridgeTierIndex(-2)).toBe(0)
    expect(bridgeTierIndex(Number.NaN)).toBe(0)
    expect(bridgeTierIndex(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('buildStructuredImageSpec', () => {
  test('maps tier/shape/appearance and spec-level fields for a solo subject', () => {
    const lucy = statefulCharacter(
      'Lucy',
      { tier: 24, shape: 'firm' },
      { hair: 'long silver hair', eyes: 'blue eyes', build: 'slim' },
    )
    const spec = buildStructuredImageSpec({
      presentCharacters: [lucy],
      tagCharacterNames: ['Lucy'],
      sceneText: 'Lucy leaning on the kitchen counter, huge breasts, morning light',
      narrativeText: 'She hums while making breakfast in the kitchen.',
    })

    expect(spec).not.toBeNull()
    expect(spec!.characters).toHaveLength(1)
    const char = spec!.characters[0]
    expect(char.tier_index).toBe(24)
    expect(char.breast_shape).toBe('firm')
    expect(char.appearance_excerpt).toContain('long silver hair')
    expect(char.appearance_excerpt).toContain('blue eyes')
    expect(spec!.register).toBe('color')
    expect(spec!.style_preset).toBe('semireal')
    expect(spec!.intimacy).toBe('clean')
    expect(spec!.location).toBe('kitchen')
    expect(spec!.regional).toBeUndefined()
  })

  test('strips canonical size-band vocabulary from scene_tags (tier_index is the size authority)', () => {
    const lucy = statefulCharacter('Lucy', { tier: 24 })
    const spec = buildStructuredImageSpec({
      presentCharacters: [lucy],
      tagCharacterNames: ['Lucy'],
      sceneText: 'standing by the window, huge breasts, warm smile',
      narrativeText: '',
    })
    expect(spec!.scene_tags).toContain('standing by the window')
    expect(spec!.scene_tags).toContain('warm smile')
    expect(spec!.scene_tags!.join(' ')).not.toMatch(/huge breasts/i)
  })

  test('lastGrowth emits a SPEC-level be_moments cluster scaled by delta', () => {
    const small = statefulCharacter('Lucy', { tier: 20, lastGrowth: { delta: 1, tierBefore: 19 } })
    const big = statefulCharacter('Mara', { tier: 30, lastGrowth: { delta: 3, tierBefore: 27 } })

    const specSmall = buildStructuredImageSpec({
      presentCharacters: [small],
      tagCharacterNames: ['Lucy'],
      sceneText: 'gasping',
      narrativeText: '',
    })
    // Spec level: the deployed SpecCharacter has no be_moments field, and the
    // spec-level field is the sub-tier-22 Illustrious routing trigger.
    expect(specSmall!.be_moments).toEqual(['mid_expansion', 'strain'])

    const specBig = buildStructuredImageSpec({
      presentCharacters: [big],
      tagCharacterNames: ['Mara'],
      sceneText: 'gasping',
      narrativeText: '',
    })
    expect(specBig!.be_moments).toEqual(['mid_expansion', 'shirt_rip', 'shock'])
  })

  test('no be_moments without landed positive growth', () => {
    const idle = statefulCharacter('Lucy', { tier: 24 })
    const noop = statefulCharacter('Mara', { tier: 24, lastGrowth: { delta: 0, tierBefore: 24 } })
    for (const subject of [idle, noop]) {
      const spec = buildStructuredImageSpec({
        presentCharacters: [subject],
        tagCharacterNames: [subject.name],
        sceneText: 'reading quietly',
        narrativeText: '',
      })
      expect(spec!.be_moments).toBeUndefined()
    }
  })

  test('solo engorgement/arousal cues ride extra_tags and floor intimacy at suggestive', () => {
    const lucy = statefulCharacter('Lucy', {
      tier: 24,
      fluids: { fillPercent: 90, fluidType: 'milk' },
      arousal: 80,
    })
    const spec = buildStructuredImageSpec({
      presentCharacters: [lucy],
      tagCharacterNames: ['Lucy'],
      sceneText: 'at the table',
      narrativeText: '',
    })
    expect(spec!.extra_tags!.some((t) => /engorged/.test(t))).toBe(true)
    expect(spec!.extra_tags!.some((t) => /flushed/.test(t))).toBe(true)
    expect(spec!.intimacy).toBe('suggestive')
  })

  test('narrative context escalates scene intimacy by one step at most', () => {
    const lucy = statefulCharacter('Lucy', { tier: 24 })
    const spec = buildStructuredImageSpec({
      presentCharacters: [lucy],
      tagCharacterNames: ['Lucy'],
      sceneText: 'Lucy smiling at the cafe table',
      narrativeText: 'Afterward they fuck on the counter until orgasm.',
    })
    expect(spec!.intimacy).toBe('suggestive')
  })

  test('location comes from the scene text only — never the narrative beat', () => {
    const lucy = statefulCharacter('Lucy', { tier: 24 })
    const spec = buildStructuredImageSpec({
      presentCharacters: [lucy],
      tagCharacterNames: ['Lucy'],
      sceneText: 'Lucy on the park path',
      narrativeText: 'They left the bedroom and walked to the park.',
    })
    expect(spec!.location).toBeNull()
  })

  test('two stateful subjects set regional and keep per-character tiers', () => {
    const a = statefulCharacter('Lucy', { tier: 24 })
    const b = statefulCharacter('Mara', { tier: 8 })
    const spec = buildStructuredImageSpec({
      presentCharacters: [a, b],
      tagCharacterNames: ['Lucy', 'Mara'],
      sceneText: 'talking at the table',
      narrativeText: '',
    })
    expect(spec!.characters.map((c) => c.tier_index)).toEqual([24, 8])
    expect(spec!.regional).toBe(true)
  })

  test('stateless tagged characters are excluded; no stateful subject → null', () => {
    const lucy = statefulCharacter('Lucy', { tier: 24 })
    const bob = statelessCharacter('Bob')

    const mixed = buildStructuredImageSpec({
      presentCharacters: [lucy, bob],
      tagCharacterNames: ['Lucy', 'Bob'],
      sceneText: 'talking',
      narrativeText: '',
    })
    expect(mixed!.characters).toHaveLength(1)
    expect(mixed!.regional).toBeUndefined()

    const none = buildStructuredImageSpec({
      presentCharacters: [bob],
      tagCharacterNames: ['Bob'],
      sceneText: 'talking',
      narrativeText: '',
    })
    expect(none).toBeNull()
  })

  test('name matching is case-insensitive (presentCharacters convention)', () => {
    const lucy = statefulCharacter('Lucy', { tier: 24 })
    const spec = buildStructuredImageSpec({
      presentCharacters: [lucy],
      tagCharacterNames: ['lucy'],
      sceneText: 'reading',
      narrativeText: '',
    })
    expect(spec!.characters).toHaveLength(1)
  })
})
