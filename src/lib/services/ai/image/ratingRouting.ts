/**
 * Rating-based image routing (research/64 option B).
 *
 * Krea 2 on a hosted endpoint cannot render explicit anatomy (its refusal
 * gate lives in the text-fusion projector, which hosted LoRA loaders can't
 * patch), while the booru path on an NSFW-capable model can — and Krea is the
 * better scene/style model for everything else. So each beat carries a content
 * rating (a `rating` attribute on the <pic> tag, a `rating` field on analyzed
 * scenes), and an EXPLICIT beat is routed to a dedicated image profile when one
 * is configured. Everything else keeps the primary profile.
 *
 * Pure helpers — the three generation paths (streaming tracker, post-hoc inline
 * service, analyzed scenes) call `resolveRatingRoute` right after picking the
 * primary profile and before any reference/portrait override.
 */

export type ImageBeatRating = 'general' | 'sensitive' | 'explicit'

const RATING_ALIASES: Readonly<Record<string, ImageBeatRating>> = {
  general: 'general',
  safe: 'general',
  sfw: 'general',
  sensitive: 'sensitive',
  suggestive: 'sensitive',
  questionable: 'sensitive',
  explicit: 'explicit',
  nsfw: 'explicit',
  adult: 'explicit',
}

/** Tolerant rating parse: case/whitespace-insensitive, common aliases; null when unusable. */
export function parseBeatRating(raw: unknown): ImageBeatRating | null {
  if (typeof raw !== 'string') return null
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
  return RATING_ALIASES[key] ?? null
}

/**
 * Booru-dialect prompts open with a rating tag ("explicit, uncensored, …",
 * "general, 1girl, …"); read it as the beat rating when no attribute was given.
 */
export function ratingFromPromptPrefix(prompt: string): ImageBeatRating | null {
  const match = /^\s*(general|safe|sensitive|questionable|explicit)\b/i.exec(prompt)
  return match ? parseBeatRating(match[1]) : null
}

export interface RatingRouteSettings {
  profileId: string | null
  size: string
  explicitProfileId?: string | null
  explicitSize?: string | null
}

export interface RatingRoute {
  profileId: string | null
  size: string
  /** True when the explicit profile was selected (callers skip reference/img2img overrides). */
  routed: boolean
}

/** Pick the profile/size for a beat: the explicit profile for explicit beats when configured, else primary. */
export function resolveRatingRoute(
  rating: ImageBeatRating | null | undefined,
  imageSettings: RatingRouteSettings,
): RatingRoute {
  const explicitProfileId = imageSettings.explicitProfileId ?? null
  if (rating === 'explicit' && explicitProfileId) {
    return {
      profileId: explicitProfileId,
      size: imageSettings.explicitSize || imageSettings.size,
      routed: true,
    }
  }
  return { profileId: imageSettings.profileId, size: imageSettings.size, routed: false }
}
