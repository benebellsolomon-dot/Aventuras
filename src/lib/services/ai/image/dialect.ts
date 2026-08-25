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
 * only anime-family finetunes want tags. This is the generic-booru FALLBACK
 * inside `imageModelFamily`; named families (nova, animagine) match there
 * first, so their patterns live in one place only.
 */
const BOORU_MODEL_PATTERN =
  /illustrious|pony|noob|animagine|hassaku|autism|anything[-_ ]?v|counterfeit|meina|wai[-_]/i

/**
 * Model FAMILY — finer than dialect, coarser than model id. Each family carries
 * the prompt-shape and sampling knobs measured for it in research/64:
 * - `animagine` (§3m): official score-vocabulary quality prefix + negative,
 *   shot-type tag dropped (it fights the POV tags), `nsfw` joins the rating
 *   block and `uncensored` stays, CFG 6 / steps 28.
 * - `chroma` (§3h–§3l): prose dialect but with REAL CFG + negative (de-distilled
 *   FLUX) — CFG 4 / steps 40, model-card negative, bidirectional size
 *   suppression, and encoder-specific prose rules in the writer template.
 * - `nova` (§3m): standard booru treatment (uncensored Illustrious-class).
 * - `krea`: prose, hosted gate — no sampling knobs of ours apply.
 * - `booru` / `prose`: everything else, by pattern (WAI is the booru default).
 *
 * SINGLE SOURCE OF TRUTH: `detectPromptDialect` derives from this function, so
 * family and dialect can never disagree on a model id (review finding: the
 * nova pattern used to live in two hand-synced regexes).
 */
export type ImageModelFamily = 'animagine' | 'nova' | 'chroma' | 'krea' | 'booru' | 'prose'

export function imageModelFamily(model: string | null | undefined): ImageModelFamily {
  if (!model) return 'prose'
  // `nsfw-gen-illustrious` is NanoGPT's id for Animagine XL 4.0 (measured §3m).
  if (/animagine|nsfw-gen-illustrious/i.test(model)) return 'animagine'
  if (/nova[-_ ]?anime|persona:376130/i.test(model)) return 'nova'
  // Segment-anchored so vendor ids like `wai-chroma-fp8` classify as chroma
  // (checked BEFORE the booru fallback) while `polychrome` stays prose.
  if (/(^|[/_-])chroma/i.test(model)) return 'chroma'
  if (/krea/i.test(model)) return 'krea'
  return BOORU_MODEL_PATTERN.test(model) ? 'booru' : 'prose'
}

const BOORU_DIALECT_FAMILIES: ReadonlySet<ImageModelFamily> = new Set([
  'animagine',
  'nova',
  'booru',
])

export function detectPromptDialect(model: string | null | undefined): PromptDialect {
  return BOORU_DIALECT_FAMILIES.has(imageModelFamily(model)) ? 'booru' : 'prose'
}

/** Quality prefix prepended to booru-dialect prompts (replaces the prose style block). */
export const BOORU_QUALITY_PREFIX = 'masterpiece, best quality, highly detailed'
/**
 * The same prefix for single-window endpoints (research/64 §3g): `highly
 * detailed` is 3 of the 77 CLIP tokens — one position tag — and Illustrious'
 * own recommendation is `masterpiece, best quality`; chunking backends keep
 * the long form.
 */
export const BOORU_QUALITY_PREFIX_SINGLE_WINDOW = 'masterpiece, best quality'

/** Default negative prompt for booru models when the profile doesn't configure one. */
export const BOORU_DEFAULT_NEGATIVE =
  'lowres, worst quality, low quality, bad anatomy, bad hands, extra digits, extra fingers, missing fingers, extra arms, extra limbs, fused fingers, jpeg artifacts, signature, watermark, username, artist name, text, speech bubble, blurry, bad proportions, cropped, multiple views'

/**
 * Animagine XL 4 official sets (model card + research/64 §3m): the score-based
 * quality vocabulary is the model's own; the censor tags in the negative matter
 * because Animagine will otherwise mosaic explicit crotches.
 */
export const ANIMAGINE_QUALITY_PREFIX = 'masterpiece, high score, great score, absurdres'
export const ANIMAGINE_DEFAULT_NEGATIVE =
  'lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, blurry, censored, mosaic censoring, bar censor'

/**
 * Chroma default negative (research/64 §3h): the model-card set + anatomy +
 * the watermark/caption vocabulary. Chroma is de-distilled FLUX — negatives
 * are real — and this is the ONLY watermark defence (never put watermark words
 * in a Chroma positive: they summon the artifact, §3h).
 */
export const CHROMA_DEFAULT_NEGATIVE =
  'low quality, ugly, unfinished, out of focus, deformed, disfigure, blurry, smudged, restricted palette, flat colors, extra arms, extra limbs, bad hands, fused fingers, watermark, signature, text, patreon username, patreon logo, url, web address, username, caption, header text, artist name, twitter handle, social media handle'

/** Per-family quality prefix for booru-dialect prompts. */
export function qualityPrefixForModel(
  model: string | null | undefined,
  singleWindow: boolean,
): string {
  if (imageModelFamily(model) === 'animagine') return ANIMAGINE_QUALITY_PREFIX
  return singleWindow ? BOORU_QUALITY_PREFIX_SINGLE_WINDOW : BOORU_QUALITY_PREFIX
}

/** Per-family default negative for models that take one. */
export function defaultNegativeForModel(model: string | null | undefined): string {
  const family = imageModelFamily(model)
  if (family === 'animagine') return ANIMAGINE_DEFAULT_NEGATIVE
  if (family === 'chroma') return CHROMA_DEFAULT_NEGATIVE
  return BOORU_DEFAULT_NEGATIVE
}

/**
 * Size-aware negative: SD models constantly pull large sizes back toward
 * defaults — suppressing the smaller band words is the standard counter.
 * Derived from the band vocabulary already in the prompt (no tier plumbing
 * needed): find the LARGEST band present and suppress EVERY band strictly
 * below it that is not itself in the prompt. Empty for small sizes or
 * band-less prompts.
 *
 * The immediately-lower band used to be left renderable, and that is exactly
 * where the model escaped to: a live tier-24 subject prompted "huge breasts"
 * rendered as "large breasts" because "large breasts" was the one band word
 * NOT negated. On a backend with no prompt weighting (nanogpt — measured, see
 * providerCapabilities.ts) the negative is the ONLY size-enforcement channel
 * available, so leaving the neighbour band open defeats the whole mechanism.
 *
 * The "not itself in the prompt" filter is what keeps multi-character scenes
 * safe: two girls at "medium breasts" and "huge breasts" still negate only the
 * bands neither of them occupies.
 */
/** Which BE band words appear in the prompt (tag or prose), by ladder index —
 * the ONE band matcher both size negatives share. */
function presentBands(prompt: string): { words: string[]; present: boolean[] } {
  const words = BAND_WORD_THRESHOLDS.map((row) => row.word)
  const present = words.map((word) =>
    new RegExp(`\\b${word.replace(/ /g, '[\\s,]+')}\\b`, 'i').test(prompt),
  )
  return { words, present }
}

export function sizeNegativeForPrompt(prompt: string): string {
  const { words, present } = presentBands(prompt)
  const largest = present.lastIndexOf(true)
  if (largest < 2) return ''
  return words
    .slice(0, largest)
    .filter((_, i) => !present[i])
    .join(', ')
}

/**
 * BIDIRECTIONAL size negative for Chroma (research/64 §3h/§3l): the validated
 * tier recipe suppresses the bands BOTH above and below the target — small
 * girls otherwise inflate toward the explicit register's default and big girls
 * deflate. Same multi-character safety as `sizeNegativeForPrompt`: only bands
 * NO present subject occupies are suppressed. Band words are matched in prose
 * too ("her medium breasts" matches `medium breasts`). Empty when the prompt
 * carries no band vocabulary at all (nothing to anchor a direction to).
 */
export function sizeNegativeBidirectional(prompt: string): string {
  const { words, present } = presentBands(prompt)
  if (!present.some(Boolean)) return ''
  return words.filter((_, i) => !present[i]).join(', ')
}

/**
 * Merges a user-configured negative prompt with a base (e.g. booru anatomy)
 * negative prompt, de-duplicating tokens case-insensitively so the base's
 * standard anatomy/hand/finger negatives survive even when a profile already
 * configures its own. Order is stable: configured tokens first, then any
 * base tokens not already present (by exact token match, not substring —
 * "hands" in a configured negative does not swallow "bad hands" from the
 * base). Either side may be empty.
 */
export function mergeNegativePrompt(configured: string, base: string): string {
  const configuredTokens = configured
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const baseTokens = base
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const seen = new Set(configuredTokens.map((t) => t.toLowerCase()))
  const merged = [...configuredTokens]
  for (const token of baseTokens) {
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(token)
  }
  return merged.join(', ')
}
