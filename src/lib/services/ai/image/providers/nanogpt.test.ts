/**
 * NanoGPT provider request-shaping tests. The HTTP adapter is mocked so we can
 * assert the request body without a live API call. Focus: booru-model sampling
 * knobs (guidance_scale / num_inference_steps) — the 7.5 CFG default oversaturates
 * Illustrious-family checkpoints, so booru models get lower, overridable defaults.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ imageFetch: vi.fn() }))

vi.mock('./fetchAdapter', () => ({
  imageFetch: mocks.imageFetch,
  imageGetFetch: vi.fn(),
}))

import {
  createNanoGPTProvider,
  sanitizeKreaStrength,
  sanitizeNanoGptLoras,
  wavespeedKreaSizeParams,
} from './nanogpt'
import type { ImageProviderConfig } from './types'

function lastBody(): Record<string, unknown> {
  const call = mocks.imageFetch.mock.calls.at(-1)![0]
  return JSON.parse(call.body as string)
}

const OK_RESPONSE = { json: async () => ({ data: [{ b64_json: 'abc' }] }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.imageFetch.mockResolvedValue(OK_RESPONSE)
})

function gen(config: Partial<ImageProviderConfig>, model: string) {
  const provider = createNanoGPTProvider({ apiKey: 'k', ...config })
  return provider.generate({ model, prompt: 'general, 1girl, solo', size: '832x1216' })
}

describe('NanoGPT sampling knobs', () => {
  it('applies low booru defaults (CFG 5, 30 steps) for an Illustrious model', async () => {
    await gen({}, 'wai-illustrious-sdxl')
    const body = lastBody()
    expect(body.guidance_scale).toBe(5)
    expect(body.num_inference_steps).toBe(30)
  })

  it('omits the knobs for a non-booru model (keeps NanoGPT defaults)', async () => {
    await gen({}, 'z-image-turbo')
    const body = lastBody()
    expect(body.guidance_scale).toBeUndefined()
    expect(body.num_inference_steps).toBeUndefined()
  })

  it('lets providerOptions override the booru defaults', async () => {
    await gen({ providerOptions: { cfgScale: 4, steps: 26 } }, 'pony-diffusion')
    const body = lastBody()
    expect(body.guidance_scale).toBe(4)
    expect(body.num_inference_steps).toBe(26)
  })

  it('still sends the merged booru negative prompt', async () => {
    await gen({}, 'wai-illustrious-sdxl')
    const body = lastBody()
    expect(typeof body.negative_prompt).toBe('string')
    expect(body.negative_prompt as string).toContain('bad anatomy')
  })
})

describe('NanoGPT image count + LoRA pass-through (research/63, Krea 2 Turbo LoRA)', () => {
  it('always asks for exactly one image', async () => {
    await gen({}, 'wavespeed-ai/krea-v2/turbo')
    expect(lastBody().n).toBe(1)
  })

  it('passes sanitized loras only to LoRA-capable model ids', async () => {
    const loras = [{ path: 'https://host.example/nikke.safetensors', scale: 0.9 }]
    await gen({ providerOptions: { loras } }, 'wavespeed-ai/krea-v2/turbo-lora')
    expect(lastBody().loras).toEqual(loras)
    await gen({ providerOptions: { loras } }, 'wavespeed-ai/krea-v2/turbo')
    expect(lastBody().loras).toBeUndefined()
  })

  it('sanitizeNanoGptLoras: https-only paths, clamped scale, max 3, junk dropped', () => {
    expect(
      sanitizeNanoGptLoras([
        { path: 'https://a/x.safetensors', scale: 2.7 },
        { path: 'http://insecure/y.safetensors', scale: 1 },
        { path: 'https://b/y.safetensors', scale: 'abc' },
        null,
        { path: 'https://c/z.safetensors', scale: -1 },
        { path: 'https://d/w.safetensors', scale: 1 },
      ]),
    ).toEqual([
      { path: 'https://a/x.safetensors', scale: 2 },
      { path: 'https://b/y.safetensors', scale: 1 },
      { path: 'https://c/z.safetensors', scale: 0 },
    ])
    expect(sanitizeNanoGptLoras('nope')).toEqual([])
  })
})

/**
 * wavespeed Krea ignores width/height (live: 1536x1536 rendered 1024x1024 on
 * turbo, 832x1248 on turbo-lora via the portrait reference). The request maps
 * the size onto the endpoint's own aspect_ratio / resolution knobs.
 */
describe('wavespeed Krea size params', () => {
  it('maps a square 1536 request to 1:1 at 2k on the turbo family', () => {
    expect(wavespeedKreaSizeParams('wavespeed-ai/krea-v2/turbo-lora', 1536, 1536)).toEqual({
      aspect_ratio: '1:1',
      resolution: '2k',
    })
    expect(wavespeedKreaSizeParams('wavespeed-ai/krea-v2/turbo', 1024, 1024)).toEqual({
      aspect_ratio: '1:1',
      resolution: '1k',
    })
  })

  it('picks the nearest listed aspect for portrait / landscape sizes', () => {
    expect(wavespeedKreaSizeParams('wavespeed-ai/krea-v2/turbo', 832, 1216)?.aspect_ratio).toBe(
      '2:3',
    )
    expect(wavespeedKreaSizeParams('wavespeed-ai/krea-v2/turbo', 1216, 832)?.aspect_ratio).toBe(
      '3:2',
    )
    expect(wavespeedKreaSizeParams('wavespeed-ai/krea-v2/turbo', 1920, 1080)?.aspect_ratio).toBe(
      '16:9',
    )
  })

  it("uses the aspect string as the resolution on the sized family, from that model's own list", () => {
    expect(wavespeedKreaSizeParams('wavespeed-ai/krea-v2-medium/text-to-image', 832, 1216)).toEqual(
      {
        aspect_ratio: '3:4',
        resolution: '3:4',
      },
    )
    expect(wavespeedKreaSizeParams('wavespeed-ai/krea-v2-large/text-to-image', 832, 1216)).toEqual({
      aspect_ratio: '2:3',
      resolution: '2:3',
    })
  })

  it('returns null for every other model, and sends nothing extra for them', async () => {
    expect(wavespeedKreaSizeParams('wai-illustrious-sdxl', 832, 1216)).toBeNull()
    expect(wavespeedKreaSizeParams('fal-ai/krea-2/turbo', 1024, 1024)).toBeNull()
    await gen({}, 'wai-illustrious-sdxl')
    expect(lastBody().aspect_ratio).toBeUndefined()
    expect(lastBody().resolution).toBeUndefined()
  })

  it('puts the knobs on the wire next to width/height for a Krea turbo request', async () => {
    await gen({}, 'wavespeed-ai/krea-v2/turbo-lora')
    const body = lastBody()
    expect(body.width).toBe(832)
    expect(body.height).toBe(1216)
    expect(body.aspect_ratio).toBe('2:3')
    expect(body.resolution).toBe('1k')
  })
})

describe('wavespeed Krea img2img strength (research/64 §4 open item)', () => {
  const REF = ['QUJD']
  function genRef(config: Partial<ImageProviderConfig>, model: string, refs?: string[]) {
    const provider = createNanoGPTProvider({ apiKey: 'k', ...config })
    return provider.generate({
      model,
      prompt: 'a woman by a window',
      size: '1536x1536',
      referenceImages: refs,
    })
  }

  it('sends providerOptions.strength with a reference image on the Krea turbo family', async () => {
    await genRef({ providerOptions: { strength: 0.4 } }, 'wavespeed-ai/krea-v2/turbo-lora', REF)
    expect(lastBody().strength).toBe(0.4)
    expect(lastBody().imageDataUrl).toBe('data:image/png;base64,QUJD')
  })

  it('omits strength when unset (endpoint default 0.65 applies)', async () => {
    await genRef({}, 'wavespeed-ai/krea-v2/turbo-lora', REF)
    expect(lastBody().strength).toBeUndefined()
  })

  it('omits strength without a reference image, and on non-Krea models', async () => {
    await genRef({ providerOptions: { strength: 0.4 } }, 'wavespeed-ai/krea-v2/turbo')
    expect(lastBody().strength).toBeUndefined()
    await genRef({ providerOptions: { strength: 0.4 } }, 'wai-illustrious-sdxl', REF)
    expect(lastBody().strength).toBeUndefined()
  })

  it('sanitizeKreaStrength: clamps to 0–1, accepts numeric strings, rejects junk', () => {
    expect(sanitizeKreaStrength(1.7)).toBe(1)
    expect(sanitizeKreaStrength(-2)).toBe(0)
    expect(sanitizeKreaStrength('0.35')).toBe(0.35)
    expect(sanitizeKreaStrength(0.123)).toBe(0.12)
    expect(sanitizeKreaStrength('')).toBeUndefined()
    expect(sanitizeKreaStrength(undefined)).toBeUndefined()
    expect(sanitizeKreaStrength(NaN)).toBeUndefined()
    expect(sanitizeKreaStrength('abc')).toBeUndefined()
  })
})

describe('NanoGPT per-family knobs (research/64 §3h/§3m)', () => {
  it('Animagine gets CFG 6 / 28 steps and its official negative', async () => {
    await gen({}, 'nsfw-gen-illustrious')
    const body = lastBody()
    expect(body.guidance_scale).toBe(6)
    expect(body.num_inference_steps).toBe(28)
    expect(body.negative_prompt as string).toContain('low score')
    expect(body.negative_prompt as string).toContain('mosaic censoring')
  })

  it('Chroma gets CFG 4 / 40 steps, the model-card negative, and bidirectional size suppression', async () => {
    const provider = createNanoGPTProvider({ apiKey: 'k' })
    await provider.generate({
      model: 'chroma',
      prompt: 'a woman with medium breasts riding, exactly two people',
      size: '1024x1536',
    })
    const body = lastBody()
    expect(body.guidance_scale).toBe(4)
    expect(body.num_inference_steps).toBe(40)
    const negative = body.negative_prompt as string
    expect(negative).toContain('flat colors')
    expect(negative).toContain('patreon username')
    // Bidirectional: bands above AND below medium suppressed.
    expect(negative).toContain('small breasts')
    expect(negative).toContain('gigantic breasts')
    expect(negative).not.toContain('medium breasts,')
  })

  it('Nova Anime XL rides the standard booru path (CFG 5/30 + booru negative)', async () => {
    await gen({}, 'persona:376130@2456367')
    const body = lastBody()
    expect(body.guidance_scale).toBe(5)
    expect(body.num_inference_steps).toBe(30)
    expect(body.negative_prompt as string).toContain('bad anatomy')
  })

  it('profile providerOptions still override every family default', async () => {
    await gen(
      { providerOptions: { cfgScale: 3.5, steps: 26, negativePrompt: 'my negative' } },
      'chroma',
    )
    const body = lastBody()
    expect(body.guidance_scale).toBe(3.5)
    expect(body.num_inference_steps).toBe(26)
    expect((body.negative_prompt as string).startsWith('my negative')).toBe(true)
  })

  it('non-chroma prose models (krea) keep endpoint defaults and no injected negative', async () => {
    await gen({}, 'wavespeed-ai/krea-v2/turbo')
    const body = lastBody()
    expect(body.guidance_scale).toBeUndefined()
    expect(body.negative_prompt).toBeUndefined()
  })
})
