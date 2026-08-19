/**
 * Aspect-ratio selection by shot type / subject count (research/55 Phase 2).
 *
 * A fixed square canvas crops limbs on full-body shots and merges people in
 * multi-subject scenes. Booru-dialect models (Illustrious/Pony/...) follow
 * shot-type tags and count tags reliably enough to pick a better bucket from
 * them; prose models don't share that vocabulary, so this only applies to
 * the booru dialect — everything else keeps the configured size unchanged.
 */

import { detectPromptDialect } from './dialect'

/** SDXL/Illustrious standard aspect buckets — the sizes wai-illustrious supports. */
export const SQUARE_SIZE = '1024x1024'
export const PORTRAIT_SIZE = '832x1216'
export const LANDSCAPE_SIZE = '1216x832'

const WIDE_SHOT_PATTERN = /\b(wide shot|establishing shot|scenery|landscape)\b/i
const FULL_BODY_PATTERN =
  /\b(full body|cowboy shot|full[- ]length|standing|from below|from above)\b/i
const CLOSE_UP_PATTERN = /\b(close[- ]?up|upper body|portrait|bust|headshot|face|from side)\b/i

export interface PickImageSizeInput {
  /** The assembled/tag prompt to scan for shot-type cues. */
  prompt: string
  /** Number of subjects present (e.g. named characters on the `<pic>` tag). */
  subjectCount: number
  /** Active image model id — gates this to the booru dialect only. */
  model: string | undefined
  /** Configured size to fall back to when no rule applies or dialect is prose. */
  fallback: string
}

/**
 * Pick an SDXL aspect bucket from shot-type cues + subject count. Only
 * applies for the booru dialect; prose models keep the configured fallback
 * since shot vocabulary isn't reliable prompt language there.
 *
 * Rules, evaluated in order:
 * 1. subjectCount >= 2 -> landscape (room to place people side-by-side)
 * 2. wide/establishing/scenery/landscape cue -> landscape
 * 3. full-body/cowboy-shot/standing/from-below/from-above cue -> portrait (tall)
 * 4. close-up/upper-body/portrait/bust/headshot/face/from-side cue -> portrait (tall)
 * 5. no strong cue -> fallback (respect the configured size)
 */
export function pickImageSize(input: PickImageSizeInput): string {
  const { prompt, subjectCount, model, fallback } = input

  if (detectPromptDialect(model) !== 'booru') return fallback

  if (subjectCount >= 2) return LANDSCAPE_SIZE
  if (WIDE_SHOT_PATTERN.test(prompt)) return LANDSCAPE_SIZE
  if (FULL_BODY_PATTERN.test(prompt)) return PORTRAIT_SIZE
  if (CLOSE_UP_PATTERN.test(prompt)) return PORTRAIT_SIZE

  return fallback
}
