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
import {
  MAX_GROWTH_BONUS_CM,
  MAX_GROWTH_CARRY_CM,
  MAX_TIERS_PER_ACT,
  SPELL_GROWTH_CM_PER_INTENSITY,
} from './constants'
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
): { tiers: number; carryCm: number; clipped: boolean } {
  const start = Number.isFinite(tier) ? Math.max(0, Math.floor(tier)) : 0
  const budget = Number.isFinite(cm) ? Math.max(0, cm) : 0
  let current = start
  let spent = 0
  for (;;) {
    if (sizeCapTier !== null && current >= sizeCapTier) {
      return { tiers: current - start, carryCm: 0, clipped: false }
    }
    // Per-act ceiling: the excess is discarded, never carried (a runaway
    // baseline or a corrupt carrier must not loop or dump dozens of tiers).
    if (current - start >= MAX_TIERS_PER_ACT) {
      return { tiers: current - start, carryCm: 0, clipped: true }
    }
    const step = cmPerTierAt(current)
    if (!(step > 0) || spent + step > budget + EPSILON) break
    spent += step
    current += 1
  }
  return {
    tiers: current - start,
    carryCm: Math.min(MAX_GROWTH_CARRY_CM, Math.max(0, budget - spent)),
    clipped: false,
  }
}

/** cm a cast/check growth effect banks (band already folded into the intensity by translateSpellEffects). */
export const bonusCmForIntensity = (intensity: number): number =>
  SPELL_GROWTH_CM_PER_INTENSITY * clampIntensity(intensity)

/** Add to the bank, capped. */
export const bankBonusCm = (current: number | undefined, add: number): number =>
  Math.min(MAX_GROWTH_BONUS_CM, Math.max(0, current ?? 0) + Math.max(0, add))

const finiteOr0 = (v: number | undefined): number => (Number.isFinite(v) ? (v as number) : 0)

/** The banked cm as the engine trusts it: finite, 0..MAX_GROWTH_BONUS_CM. */
export const safeBonusCm = (v: number | undefined): number =>
  Math.min(MAX_GROWTH_BONUS_CM, Math.max(0, finiteOr0(v)))
/** The carried cm as the engine trusts it: finite, 0..MAX_GROWTH_CARRY_CM. */
export const safeCarryCm = (v: number | undefined): number =>
  Math.min(MAX_GROWTH_CARRY_CM, Math.max(0, finiteOr0(v)))

/** The cm the NEXT completed act would grow her: baseline + banked bonus + carried remainder. */
export function actGrowthCm(
  config: Pick<BeStoryConfig, 'growthBaselineCm'>,
  state: Pick<BodyState, 'growthBonusCm' | 'growthCarryCm'>,
): number {
  return (
    config.growthBaselineCm + safeBonusCm(state.growthBonusCm) + safeCarryCm(state.growthCarryCm)
  )
}

/**
 * What the act would do to her this scene — ONE derivation for the narrator's
 * ACT GROWTH line and the reducer, so they cannot disagree. `cm` uses only
 * the PRE-turn bank (a cast made this turn banks for the NEXT act).
 */
export function previewActGrowth(
  config: Pick<BeStoryConfig, 'growthBaselineCm' | 'sizeCapTier'>,
  state: Pick<BodyState, 'tier' | 'locked' | 'growthBonusCm' | 'growthCarryCm'>,
): {
  cm: number
  tiers: number
  tierAfter: number
  bankedCm: number
  /** The carry the act leaves (cap-consistent: computed on the same ladder the act climbs). */
  carryCm: number
  /** The per-act tier ceiling clipped this act (excess cm discarded — say so in the log). */
  clipped: boolean
  mode: 'grows' | 'builds' | 'at_cap' | 'locked'
} {
  const cm = actGrowthCm(config, state)
  const bankedCm = safeBonusCm(state.growthBonusCm)
  if (state.locked) {
    return {
      cm,
      tiers: 0,
      tierAfter: state.tier,
      bankedCm,
      carryCm: 0,
      clipped: false,
      mode: 'locked',
    }
  }
  const { tiers, carryCm, clipped } = tiersForCm(state.tier, cm, config.sizeCapTier)
  const atCap =
    config.sizeCapTier !== null && state.tier + tiers >= config.sizeCapTier && tiers === 0
  return {
    cm,
    tiers,
    tierAfter: state.tier + tiers,
    bankedCm,
    carryCm,
    clipped,
    mode: atCap ? 'at_cap' : tiers === 0 ? 'builds' : 'grows',
  }
}

/** One decimal, for notes and prompts. */
export const fmtCm = (cm: number): string => (Math.round(cm * 10) / 10).toFixed(1)
