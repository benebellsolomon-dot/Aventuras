/**
 * Prompt dialect detection (Megumin-style).
 *
 * Booru-trained anime models (Illustrious, Pony, NoobAI, ...) follow tag
 * dialect far more reliably than flowing prose: explicit count tags control
 * how many characters render, tag prefixes control style, and a negative
 * prompt suppresses common failure modes. LLM-class text encoders (Krea,
 * Flux, DALL-E, plain SDXL finetunes) want natural language instead.
 */

import { BAND_WORD_THRESHOLDS } from '$lib/services/be'

export type PromptDialect = 'prose' | 'booru'

/**
 * Anime/booru-trained model families. Plain "sdxl" alone is deliberately NOT
 * matched — generic SDXL wants natural language (Megumin's Z-Image dialect);
 * only anime-family finetunes want tags.
 */
const BOORU_MODEL_PATTERN =
  /illustrious|pony|noob|animagine|hassaku|autism|anything[-_ ]?v|counterfeit|meina|wai[-_]/i

export function detectPromptDialect(model: string | null | undefined): PromptDialect {
  return model && BOORU_MODEL_PATTERN.test(model) ? 'booru' : 'prose'
}

/** Quality prefix prepended to booru-dialect prompts (replaces the prose style block). */
export const BOORU_QUALITY_PREFIX = 'masterpiece, best quality, highly detailed'

/** Default negative prompt for booru models when the profile doesn't configure one. */
export const BOORU_DEFAULT_NEGATIVE =
  'lowres, worst quality, low quality, bad anatomy, bad hands, extra digits, extra fingers, missing fingers, extra arms, extra limbs, fused fingers, jpeg artifacts, signature, watermark, username, artist name, text, speech bubble, blurry, bad proportions, cropped, multiple views'

/**
 * Size-aware negative: SD models constantly pull large sizes back toward
 * defaults — suppressing the smaller band words is the standard counter.
 * Derived from the band vocabulary already in the prompt (no tier plumbing
 * needed): find the LARGEST band present, suppress every band two or more
 * steps below it that is not itself in the prompt (multi-character scenes
 * keep each character's own band renderable). Empty for small sizes or
 * band-less prompts.
 */
export function sizeNegativeForPrompt(prompt: string): string {
  const words = BAND_WORD_THRESHOLDS.map((row) => row.word)
  const present = words.map((word) =>
    new RegExp(`\\b${word.replace(/ /g, '[\\s,]+')}\\b`, 'i').test(prompt),
  )
  const largest = present.lastIndexOf(true)
  if (largest < 2) return ''
  return words
    .slice(0, largest - 1)
    .filter((_, i) => !present[i])
    .join(', ')
}
