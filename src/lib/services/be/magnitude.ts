/**
 * BE engine — growth magnitude for cosmology stories (research/66 §magnitude).
 *
 * Ben's ruling: what causes growth has a BASELINE cm amount the story sets, so
 * prose and stats cannot under/over-grow each other; spells, skills and magic
 * MODIFY that amount (they bank cm into her next act) rather than growing her
 * on their own. Tiers are the engine's size scalar; cm of bust maps onto them
 * through the natural bust curve (the same curve the cup letter rides), with
 * the sub-tier remainder carried to the next act. Pure.
 */
import { MAX_GROWTH_BONUS_CM, SPELL_GROWTH_CM_PER_INTENSITY } from './constants'
import { bustDiffCm } from './curves'
import { clampIntensity } from './roll'
import type { BeStoryConfig, BodyState } from './types'

const EPSILON = 1e-9

/** Bust-diff cm gained by going from `tier` to `tier + 1` (natural backbone, dry). */
export const cmPerTierAt = (tier: number): number =>
  bustDiffCm(tier + 1, 'natural', 0) - bustDiffCm(tier, 'natural', 0)

/**
 * How many whole tiers `cm` of bust buys from `tier`, and the cm left over.
 * Stops at the story's size cap (no carry past the cap — it would re-stage
 * forever). Non-positive cm buys nothing and carries nothing.
 */
export function tiersForCm(
  tier: number,
  cm: number,
  sizeCapTier: number | null,
): { tiers: number; carryCm: number } {
  const start = Number.isFinite(tier) ? Math.max(0, Math.floor(tier)) : 0
  const budget = Number.isFinite(cm) ? Math.max(0, cm) : 0
  let current = start
  let spent = 0
  for (;;) {
    if (sizeCapTier !== null && current >= sizeCapTier) {
      return { tiers: current - start, carryCm: 0 }
    }
    const step = cmPerTierAt(current)
    if (!(step > 0) || spent + step > budget + EPSILON) break
    spent += step
    current += 1
  }
  return { tiers: current - start, carryCm: Math.max(0, budget - spent) }
}

/** cm a cast/check growth effect banks (band already folded into the intensity by translateSpellEffects). */
export const bonusCmForIntensity = (intensity: number): number =>
  SPELL_GROWTH_CM_PER_INTENSITY * clampIntensity(intensity)

/** Add to the bank, capped. */
export const bankBonusCm = (current: number | undefined, add: number): number =>
  Math.min(MAX_GROWTH_BONUS_CM, Math.max(0, current ?? 0) + Math.max(0, add))

/** The cm the NEXT completed act would grow her: baseline + banked bonus + carried remainder. */
export function actGrowthCm(
  config: Pick<BeStoryConfig, 'growthBaselineCm'>,
  state: Pick<BodyState, 'growthBonusCm' | 'growthCarryCm'>,
): number {
  return (
    config.growthBaselineCm +
    Math.max(0, state.growthBonusCm ?? 0) +
    Math.max(0, state.growthCarryCm ?? 0)
  )
}

/** One decimal, for notes and prompts. */
export const fmtCm = (cm: number): string => (Math.round(cm * 10) / 10).toFixed(1)
