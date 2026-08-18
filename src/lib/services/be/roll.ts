/**
 * Shared deterministic roll core (research/47 Step 1).
 *
 * The ONLY dice in the app. Two consumers with two band systems that must
 * never merge:
 *   - the BE reducer's growth roll (absolute bands vs ROLL_BANDS), and
 *   - the RPG CheckService's skill checks (DC-relative bands).
 * Pure: same seed → same roll, which is what keeps undo/branch replay and the
 * golden-identity tests (roll.test.ts) honest. No Date.now, no Math.random.
 */

import { INTENSITY_ROLL_BONUS, ROLL_BANDS } from './constants'
import type { GrowthOutcome } from './types'

export const clampIntensity = (value: number): number =>
  Number.isFinite(value) ? Math.min(3, Math.max(1, Math.round(value))) : 1

/** FNV-1a 32-bit hash → deterministic d20 roll for a seed string. */
export function seededRoll(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return ((hash >>> 0) % 20) + 1
}

/** BE growth outcome: absolute bands, intensity adds a flat roll bonus. */
export function resolveGrowthOutcome(roll: number, intensity: number): GrowthOutcome {
  const total = roll + (clampIntensity(intensity) - 1) * INTENSITY_ROLL_BONUS
  if (total >= ROLL_BANDS.critical) return 'critical'
  if (total >= ROLL_BANDS.success) return 'success'
  if (total >= ROLL_BANDS.partial) return 'partial'
  return 'fail'
}

/** RPG check degrees of success (DC-relative). */
export type CheckBand = 'crit' | 'success' | 'partial' | 'fail'

/** Beat the DC by this margin (or roll a high nat on a success) to crit. */
export const CRIT_MARGIN = 8
export const CRIT_NAT = 18
/** Miss the DC by no more than this → partial (success at a cost). */
export const PARTIAL_MISS_WINDOW = 4

/**
 * Band an RPG check. Ruling (research/47 #1): a crit is a DEGREE of success —
 * a nat 18+ that still misses the DC is a plain fail, otherwise high DCs
 * would leak free crits and the DC-chip odds would lie.
 */
export function resolveCheckBand(nat: number, total: number, dc: number): CheckBand {
  if (total >= dc) {
    return total - dc >= CRIT_MARGIN || nat >= CRIT_NAT ? 'crit' : 'success'
  }
  return dc - total <= PARTIAL_MISS_WINDOW ? 'partial' : 'fail'
}
