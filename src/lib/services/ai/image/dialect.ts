/**
 * Prompt dialect detection (Megumin-style).
 *
 * Booru-trained anime models (Illustrious, Pony, NoobAI, ...) follow tag
 * dialect far more reliably than flowing prose: explicit count tags control
 * how many characters render, tag prefixes control style, and a negative
 * prompt suppresses common failure modes. LLM-class text encoders (Krea,
 * Flux, DALL-E, plain SDXL finetunes) want natural language instead.
 */

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
