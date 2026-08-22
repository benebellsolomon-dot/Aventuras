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

import { createNanoGPTProvider, sanitizeNanoGptLoras } from './nanogpt'
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
