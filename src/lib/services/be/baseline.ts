/**
 * Baseline auto-seeding from character text.
 *
 * The frame math (bandCm, frameEstimateKg, inferredBuildNumbers) already
 * handles height + build + waist/hips smoothly — but until now its only input
 * was hand-typed numbers in the BE panel. These parsers lift height and build
 * from the character's visual descriptors/description so a fresh bodyState
 * starts from the character's actual frame instead of the reference frame.
 * Parsed values seed BodyBaseline once at state creation; the panel remains
 * the correction surface and its edits always win.
 */

import { saneHeightCm } from './curves'
import type { BodyBaseline } from './types'

const CM_PER_INCH = 2.54

/** Parse a height in cm from free text ("165 cm", "1.65m", "5'6\"", "5 ft 6"). */
export function parseHeightCm(text: string): number | undefined {
  const s = String(text || '')

  const cmMatch = s.match(/\b(\d{2,3})(?:\.\d+)?\s*cm\b/i)
  if (cmMatch) {
    const sane = saneHeightCm(Number(cmMatch[1]))
    if (sane !== undefined) return sane
  }

  const metersMatch = s.match(/\b([12])[.,](\d{1,2})\s*m\b/i)
  if (metersMatch) {
    const sane = saneHeightCm(Number(metersMatch[1]) * 100 + Number(`0.${metersMatch[2]}`) * 100)
    if (sane !== undefined) return Math.round(sane)
  }

  const feetMatch = s.match(/\b([4-7])\s*(?:'|ft\.?|feet)\s*(\d{1,2})?\s*(?:"|in\b|inches)?/i)
  if (feetMatch) {
    const inches = Number(feetMatch[1]) * 12 + Number(feetMatch[2] ?? 0)
    const sane = saneHeightCm(Math.round(inches * CM_PER_INCH))
    if (sane !== undefined) return sane
  }

  return undefined
}

/** Build vocabulary → the engine's build labels (BUILD_BAND_OFFSET keys). */
const BUILD_SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bpetite\b|\btiny\b|\bdiminutive\b/i, 'petite'],
  [/\bslim\b|\bslender\b|\bwilowy\b|\bwillowy\b|\bthin\b|\blithe\b/i, 'slim'],
  [/\bathletic\b|\btoned\b|\bmuscular\b|\bfit\b/i, 'athletic'],
  [/\bcurvy\b|\bcurvaceous\b|\bvoluptuous\b|\bhourglass\b/i, 'curvy'],
  [/\bfull[- ]figured\b|\bplump\b|\bheavyset\b|\bchubby\b|\bthick\b/i, 'full'],
  [/\baverage\b|\bmedium build\b/i, 'average'],
]

/** Parse a build label from free text; undefined when nothing matches. */
export function parseBuildLabel(text: string): string | undefined {
  const s = String(text || '')
  for (const [pattern, label] of BUILD_SYNONYMS) {
    if (pattern.test(s)) return label
  }
  return undefined
}

/**
 * Derive a starting BodyBaseline from character text (visual descriptors'
 * build line + description). Returns undefined when nothing parseable exists.
 */
export function seedBaselineFromText(text: string): BodyBaseline | undefined {
  const heightCm = parseHeightCm(text)
  const build = parseBuildLabel(text)
  if (heightCm === undefined && build === undefined) return undefined
  return {
    ...(heightCm !== undefined ? { heightCm } : {}),
    ...(build !== undefined ? { build } : {}),
  }
}
