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

const RATING_RANK: Readonly<Record<ImageBeatRating, number>> = {
  general: 0,
  sensitive: 1,
  explicit: 2,
}

/**
 * Explicit-content vocabulary in the prompt TEXT. Word-bounded, case-insensitive;
 * covers nudity, anatomy and sex acts in both the prose and booru dialects.
 * Deliberately excludes suggestive-only words (cleavage, lingerie) — those are
 * `sensitive`, and routing only acts on `explicit`.
 */
const EXPLICIT_TEXT =
  /\b(?:nude|naked|topless|bottomless|unclothed|undressed|fully bare|completely bare|bare(?:d)? (?:breasts?|chest|nipples?|pussy|ass|buttocks|genitals?)|nipples?|areolae?|genitals?|pussy|vagina|vulva|labia|clit(?:oris)?|cock|penis|dick|erection|erect|cum|semen|ejaculat\w*|sex|intercourse|penetrat\w*|thrust\w*|orgasm\w*|climax\w*|moan\w*|blowjob|fellatio|irrumatio|cunnilingus|paizuri|naizuri|titfuck|titjob|handjob|footjob|rimming|cowgirl position|missionary|doggy ?style|sex from behind|spread (?:legs|thighs)|fucks?|fucking|fucked|masturbat\w*|fingering|grinding|lactat\w*|milk (?:spray\w*|leak\w*|dripp\w*|squirt\w*)|breast milk|squirting|creampie|gangbang|orgy|bukkake|ahegao|hentai|nsfw|explicit)\b/i

const SENSITIVE_TEXT =
  /\b(?:lingerie|underwear|panties|bra|cleavage|bikini|swimsuit|see-through|sheer|wet (?:shirt|blouse|top)|thigh-?highs?|garter|stockings|strip(?:ping|ped|s)?|undressing|half-dressed|partially (?:undressed|clothed)|towel|bath(?:ing|tub)?|shower\w*|kiss\w*|making out|straddl\w*|groping|fondl\w*|arous\w*|breasts?|bust|chest)\b/i

/** Rating implied by the prompt's own wording (explicit > sensitive > null). */
export function inferRatingFromText(prompt: string): ImageBeatRating | null {
  if (EXPLICIT_TEXT.test(prompt)) return 'explicit'
  if (SENSITIVE_TEXT.test(prompt)) return 'sensitive'
  return null
}

/**
 * The rating a beat is ROUTED on: the higher of what the narrator declared and
 * what the prompt text implies. Text can upgrade a missing or under-declared
 * rating (D5 live: narrators omit or under-set it), never downgrade one — a
 * false upgrade only sends a suggestive beat to the explicit profile, a miss
 * renders a doll.
 */
export function effectiveBeatRating(
  declared: ImageBeatRating | null | undefined,
  prompt: string,
): ImageBeatRating | null {
  const inferred = inferRatingFromText(prompt)
  if (!declared) return inferred
  if (!inferred) return declared
  return RATING_RANK[inferred] > RATING_RANK[declared] ? inferred : declared
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
