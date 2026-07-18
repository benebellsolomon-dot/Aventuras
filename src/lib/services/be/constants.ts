/**
 * BE engine — tuning constants.
 *
 * ⚠ D5 (research/31): every number here is a REFERENCE DEFAULT inherited from the
 * NAI-era engine, tuned for a single-character game. Phase B re-derives them against
 * measured Aventuras turn cadence (the BeLogRecord instrumentation) — do not trust
 * them as final, and do not tune them without cadence data.
 */

import type { BeEventKind, BeStoryConfig, GrowthOutcome } from './types'

/** Growth per outcome band — small and capped, never continuous off the roll margin (31a §3.4). */
export const GROWTH_DELTA_BY_OUTCOME: Readonly<Partial<Record<GrowthOutcome, number>>> = {
  critical: 2,
  success: 1,
  partial: 0,
  fail: 0,
}

/** Beats between growth-eligible beats on the same character (31a §3.4, NAI default). */
export const DEFAULT_GROWTH_COOLDOWN_BEATS = 2

/** d20 outcome bands (Phase-A provisional; D5 re-derivation target). */
export const ROLL_BANDS = {
  critical: 18,
  success: 11,
  partial: 6,
} as const

/** Roll bonus per intensity step above 1 (intensity 1-3 → +0/+2/+4). */
export const INTENSITY_ROLL_BONUS = 2

/** Fluid drained per milking event, scaled by intensity (percent points). */
export const MILKING_DRAIN_PER_INTENSITY = 40

export const DEFAULT_BE_STORY_CONFIG: Readonly<BeStoryConfig> = {
  enabled: false,
  sizeCapTier: null,
  growthCooldownBeats: DEFAULT_GROWTH_COOLDOWN_BEATS,
}

/** The kinds that can land growth (milking drains, stabilize settles — never these). */
export const GROWTH_EVENT_KINDS: ReadonlyArray<BeEventKind> = ['catalyst', 'contact', 'attempt']

/**
 * Narrow a settings-sourced string list to valid growth kinds. Empty/invalid
 * input means "no restriction" (undefined) so pre-existing stories keep the
 * every-kind-eligible behavior.
 */
export function parseGrowthEligibleKinds(
  raw: ReadonlyArray<string> | undefined,
): BeEventKind[] | undefined {
  // Settings JSON is unvalidated at load — reject non-arrays, not just absence.
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const kinds = raw.filter((kind): kind is BeEventKind =>
    (GROWTH_EVENT_KINDS as ReadonlyArray<string>).includes(kind),
  )
  return kinds.length > 0 ? kinds : undefined
}
