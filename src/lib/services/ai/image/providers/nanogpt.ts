/**
 * NanoGPT Image Provider
 *
 * Direct HTTP calls to nano-gpt.com API.
 * - txt2img: POST /images/generations (JSON)
 * - img2img: Same endpoint + imageDataUrl in body
 */

import type {
  ImageProvider,
  ImageProviderConfig,
  ImageGenerateOptions,
  ImageGenerateResult,
  ImageModelInfo,
} from './types'
import { imageFetch, imageGetFetch } from './fetchAdapter'
import {
  detectPromptDialect,
  sizeNegativeForPrompt,
  mergeNegativePrompt,
  BOORU_DEFAULT_NEGATIVE,
} from '../dialect'

const DEFAULT_BASE_URL = 'https://nano-gpt.com/api/v1'
const MODELS_ENDPOINT = 'https://nano-gpt.com/api/models'

/** Krea 2 Turbo LoRA and friends: NanoGPT tags them `lora`; the id carries it too. */
const LORA_MODEL_PATTERN = /lora/i
export const NANOGPT_MAX_LORAS = 3
const LORA_SCALE_MIN = 0
const LORA_SCALE_MAX = 2

export interface NanoGptLora {
  /** Direct `.safetensors` URL (wavespeed's `loras[].path`). */
  path: string
  scale: number
}

/**
 * Normalise a profile's configured LoRA list for the wire: https URLs only,
 * scale clamped to 0–2 (wavespeed recommends 0.8–1.0; the Krea2 NSFW recipe
 * runs 1.5), at most NANOGPT_MAX_LORAS. Anything else is dropped.
 */
export function sanitizeNanoGptLoras(raw: unknown): NanoGptLora[] {
  if (!Array.isArray(raw)) return []
  const out: NanoGptLora[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const path =
      typeof (entry as { path?: unknown }).path === 'string'
        ? (entry as { path: string }).path.trim()
        : ''
    if (!/^https:\/\/\S+$/i.test(path)) continue
    const rawScale = Number((entry as { scale?: unknown }).scale)
    const scale = Number.isFinite(rawScale)
      ? Math.min(LORA_SCALE_MAX, Math.max(LORA_SCALE_MIN, rawScale))
      : 1
    out.push({ path, scale })
    if (out.length >= NANOGPT_MAX_LORAS) break
  }
  return out
}

/**
 * wavespeed Krea 2 on NanoGPT IGNORES width/height (measured live, research/64
 * §4: a 1536x1536 request rendered 1024x1024 on `krea-v2/turbo`, and on
 * `turbo-lora` took the portrait reference's 2:3). The endpoint's own knobs are
 * `aspect_ratio` (W:H from a fixed option list) and `resolution` — '1k' | '2k'
 * on the turbo family, the aspect string itself on krea-v2-large / medium. The
 * requested size is mapped onto those so the profile's size means something.
 */
const WAVESPEED_KREA_TURBO = /^wavespeed-ai\/krea-v2\/turbo(?:-lora)?$/i
const WAVESPEED_KREA_SIZED = /^wavespeed-ai\/krea-v2-(large|medium|medium-turbo)\/text-to-image$/i
const KREA_TURBO_ASPECTS = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '2:1', '1:2']
const KREA_SIZED_ASPECTS: Readonly<Record<string, ReadonlyArray<string>>> = {
  large: ['1:1', '4:3', '3:2', '16:9', '2.35:1', '4:5', '2:3', '9:16'],
  medium: ['1:1', '4:3', '3:4', '16:9', '9:16'],
  'medium-turbo': ['1:1', '4:3', '3:2', '16:9', '2.35:1', '4:5', '2:3', '9:16'],
}
/** At or above this many requested pixels the turbo family renders '2k' (~4 MP) instead of '1k' (~1 MP). */
export const KREA_TWO_K_MIN_PIXELS = 2_000_000

function nearestAspect(width: number, height: number, options: ReadonlyArray<string>): string {
  const target = Math.log(width / height)
  return options.reduce((best, option) => {
    const [w, h] = option.split(':').map(Number)
    const distance = Math.abs(Math.log(w / h) - target)
    const [bw, bh] = best.split(':').map(Number)
    return distance < Math.abs(Math.log(bw / bh) - target) ? option : best
  }, options[0])
}

/** The wavespeed Krea size parameters for a requested WxH, or null for any other model. */
export function wavespeedKreaSizeParams(
  model: string,
  width: number,
  height: number,
): { aspect_ratio: string; resolution: string } | null {
  if (!(width > 0 && height > 0)) return null
  if (WAVESPEED_KREA_TURBO.test(model)) {
    return {
      aspect_ratio: nearestAspect(width, height, KREA_TURBO_ASPECTS),
      resolution: width * height >= KREA_TWO_K_MIN_PIXELS ? '2k' : '1k',
    }
  }
  const sized = WAVESPEED_KREA_SIZED.exec(model)
  if (sized) {
    const aspect = nearestAspect(width, height, KREA_SIZED_ASPECTS[sized[1].toLowerCase()])
    return { aspect_ratio: aspect, resolution: aspect }
  }
  return null
}

/** Whether a NanoGPT image model id looks like a LoRA-capable endpoint. */
export const isLoraCapableNanoGptModel = (model: string): boolean => LORA_MODEL_PATTERN.test(model)

// Known img2img capable models/tags
const IMG2IMG_TAGS = new Set(['image-to-image', 'image-edit'])

export function createNanoGPTProvider(config: ImageProviderConfig): ImageProvider {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL

  return {
    id: 'nanogpt',
    name: 'NanoGPT',

    async generate(options: ImageGenerateOptions): Promise<ImageGenerateResult> {
      const { model, prompt, size, referenceImages, signal } = options
      const [width, height] = size.split('x').map(Number)

      const body: Record<string, unknown> = {
        model,
        prompt,
        width: width || 1024,
        height: height || 1024,
        // One image per request, always — the pipeline reads data[0] only, and
        // the Krea endpoints advertise max_images 4 (the default is 1 but a
        // per-model default must never be able to bill four renders for one).
        n: 1,
      }

      // wavespeed Krea ignores width/height — send its own size knobs too.
      const kreaSize = wavespeedKreaSizeParams(model, width || 1024, height || 1024)
      if (kreaSize) {
        body.aspect_ratio = kreaSize.aspect_ratio
        body.resolution = kreaSize.resolution
      }

      // LoRA adapters (wavespeed `loras: [{path, scale}]`) — only on LoRA-capable
      // endpoints (wavespeed-ai/krea-v2/turbo-lora). NanoGPT's per-model
      // parameter list does not advertise the field; this is a pass-through
      // whose effect must be verified live (research/63).
      const loras = sanitizeNanoGptLoras(config.providerOptions?.loras)
      if (loras.length > 0 && isLoraCapableNanoGptModel(model)) {
        body.loras = loras
      }

      const isBooru = detectPromptDialect(model) === 'booru'

      // Sampling knobs (NanoGPT: guidance_scale default 7.5, num_inference_steps
      // default 30). Booru anime SDXL checkpoints (Illustrious / Pony / NoobAI)
      // are trained for LOW guidance — the 7.5 default oversaturates and "burns"
      // them (blown highlights, crunchy anatomy). ~5 CFG / ~30 steps is the
      // community sweet spot and the single biggest raw-quality lever here.
      // Prose/photoreal models keep NanoGPT's defaults. Both overridable per
      // profile via providerOptions.cfgScale / providerOptions.steps.
      const cfgScale = (config.providerOptions?.cfgScale as number) ?? (isBooru ? 5 : undefined)
      const steps = (config.providerOptions?.steps as number) ?? (isBooru ? 30 : undefined)
      if (typeof cfgScale === 'number') body.guidance_scale = cfgScale
      if (typeof steps === 'number') body.num_inference_steps = steps

      // Booru/SD-family models take a negative prompt; profile config merges
      // with the standard anti-artifact default for booru models (deduped)
      // rather than replacing it, so anatomy/hand negatives always apply.
      // The size-aware negative (suppress smaller band words) stacks on top.
      const configuredNegative = (config.providerOptions?.negativePrompt as string) || ''
      const negativePrompt = [
        isBooru
          ? mergeNegativePrompt(configuredNegative, BOORU_DEFAULT_NEGATIVE)
          : configuredNegative,
        isBooru ? sizeNegativeForPrompt(prompt) : '',
      ]
        .filter(Boolean)
        .join(', ')
      if (negativePrompt) {
        body.negative_prompt = negativePrompt
      }

      // img2img: pass reference as imageDataUrl
      if (referenceImages?.length) {
        body.imageDataUrl = `data:image/png;base64,${referenceImages[0]}`
      }

      const response = await imageFetch({
        url: `${baseUrl}/images/generations`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
        serviceId: 'nanogpt-image',
      })

      const data = await response.json()
      const imageData = data?.data?.[0]

      if (imageData?.b64_json) {
        return { base64: imageData.b64_json, revisedPrompt: imageData.revised_prompt }
      }
      if (imageData?.url) {
        // Fetch the image URL and convert to base64
        const imgResponse = await fetch(imageData.url)
        const blob = await imgResponse.blob()
        const buffer = await blob.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)
        return { base64, revisedPrompt: imageData.revised_prompt }
      }

      throw new Error('No image data in NanoGPT response')
    },

    async listModels(): Promise<ImageModelInfo[]> {
      try {
        const response = await imageGetFetch(MODELS_ENDPOINT)
        if (!response.ok) return getFallbackModels()

        const data = await response.json()
        const imageModels = data?.models?.image || {}
        const entries = Object.values(imageModels) as Array<{
          name?: string
          model?: string
          description?: string
          cost?: Record<string, number>
          resolutions?: Array<{ value: string; comment?: string }>
          tags?: string[]
          supportsMultipleImg2Img?: boolean
        }>

        if (entries.length === 0) return getFallbackModels()

        return entries.map((m) => {
          const supportsSizes = m.resolutions?.map((r) => r.value.replace('*', 'x')) || [
            '512x512',
            '1024x1024',
          ]
          const supportsImg2Img =
            m.tags?.some((t) => IMG2IMG_TAGS.has(t)) || m.supportsMultipleImg2Img || false

          let costPerImage: number | undefined
          if (m.cost && typeof m.cost === 'object') {
            const costs = Object.values(m.cost).filter((c) => typeof c === 'number')
            if (costs.length > 0) costPerImage = costs.reduce((a, b) => a + b, 0) / costs.length
          }

          return {
            id: m.model || m.name || '',
            name: m.name || m.model || '',
            description: m.description,
            supportsSizes,
            supportsImg2Img,
            costPerImage,
          }
        })
      } catch {
        return getFallbackModels()
      }
    },
  }
}

function getFallbackModels(): ImageModelInfo[] {
  return [
    {
      id: 'z-image-turbo',
      name: 'Image Turbo',
      description: 'Fast, efficient image generation',
      supportsSizes: ['512x512', '1024x1024'],
      supportsImg2Img: false,
    },
    {
      id: 'flux-kontext',
      name: 'Flux Kontext',
      description: 'Context-aware image generation',
      supportsSizes: ['512x512', '1024x1024'],
      supportsImg2Img: true,
    },
  ]
}
