/**
 * BE engine — the lactation axis (research/46 §2.4, research/49 Step 1).
 *
 * Pure value math in the tracks.ts mould: nothing here writes BodyState, the
 * reducer sequences it. Supply/threshold rules live here ONCE so prompts, image
 * cues, gating, and UI can never restate them differently.
 *
 * Read-through, never eager: `lactationOf` returns null for a girl who has never
 * been induced, so her persisted state stays key-identical (R1 neutral
 * passthrough — an eager block write would rewrite every character's metadata on
 * the first Phase-3 turn).
 */

import {
  APPARENT_TIER_ENGORGED,
  APPARENT_TIER_PRESSURE_PRONE,
  CHRONIC_SUPPLY_BEATS,
  CHRONIC_SUPPLY_TIER,
  ENGORGED_FILL_THRESHOLD,
  ENGORGED_FILL_THRESHOLD_PRESSURE_PRONE,
  MILK_UNIT_ML,
  SUPPLY_ADAPT_UP_BEATS,
  SUPPLY_EASE_IDLE_BEATS,
  SUPPLY_FILL_RATE_BONUS,
  SUPPLY_LABELS,
  SUPPLY_TIER_MAX,
} from './constants'
import { hasQuirk } from './quirks'
import type { CheckBand } from './roll'
import type { BodyState, LactationState } from './types'

/** Milk grade, from the turn's Milking check (R8). `plain` = no check to grade. */
export type MilkQuality = 'prime' | 'rich' | 'thin' | 'plain'

/** The lactation block, or null — never a default write. */
export function lactationOf(state: BodyState): LactationState | null {
  const block = state.lactation
  if (!block || typeof block !== 'object') return null
  return block
}

/**
 * The one place a persisted supplyTier is made safe to compute with: clamped to
 * the shipped band range and NaN-guarded. A newer build's tier must render and
 * behave as the top band rather than driving off the end of every curve, and a
 * NaN must never reach the returned block — an all-or-nothing schema parse would
 * drop the WHOLE bodyState on the next read.
 */
function safeSupplyTier(tier: number): number {
  return Number.isFinite(tier) ? Math.min(SUPPLY_TIER_MAX, Math.max(0, Math.floor(tier))) : 0
}

/** Supply band word. Clamped, so a tier from a newer build still renders. */
export function supplyLabel(tier: number): string {
  const index = Number.isFinite(tier)
    ? Math.min(SUPPLY_LABELS.length - 1, Math.max(0, Math.floor(tier)))
    : 0
  return SUPPLY_LABELS[index]
}

/**
 * Supply's ONLY coupling into the FIL loop (R4): the passive fill tick scales by
 * this. Exactly 1 when she is not lactating — a non-lactating girl's fill math
 * must be byte-identical to the pre-Phase-3 engine.
 */
export function supplyFillMultiplier(state: BodyState): number {
  const block = lactationOf(state)
  if (!block?.active) return 1
  // Clamped like supplyLabel/supplyMeter: an out-of-range tier from a newer save
  // must not drive a runaway fill tick.
  return 1 + safeSupplyTier(block.supplyTier) * SUPPLY_FILL_RATE_BONUS
}

export interface SupplyMeterView {
  /** Band word for the tier. */
  label: string
  /** Bar fill, 0..100 — one band per step, full at SUPPLY_TIER_MAX. */
  percent: number
  /** Bar colour class; engorgement gets its own so the swell reads at a glance. */
  tint: string
}

const SUPPLY_TINT = 'bg-sky-400/80'
const SUPPLY_TINT_ENGORGED = 'bg-amber-400/90'

/**
 * The milk meter's presentation, computed HERE rather than in the card markup —
 * `.svelte` stays markup-only so this stays testable in the node-env suite.
 */
export function supplyMeter(tier: number, isEngorged: boolean): SupplyMeterView {
  const clamped = Number.isFinite(tier)
    ? Math.min(SUPPLY_TIER_MAX, Math.max(0, Math.floor(tier)))
    : 0
  return {
    label: supplyLabel(clamped),
    percent: ((clamped + 1) / (SUPPLY_TIER_MAX + 1)) * 100,
    tint: isEngorged ? SUPPLY_TINT_ENGORGED : SUPPLY_TINT,
  }
}

export interface SupplyAdapt {
  next: LactationState
  raised: boolean
  eased: boolean
}

/**
 * One beat of demand/neglect adaptation (R3). Milking raises supply; idle beats
 * ease it. Off-screen (`ticksEnabled === false`) an evidenced milking still
 * counts, but the neglect clock HOLDS — the same off-screen reasoning as
 * dependence decay. Supply never deactivates itself: the floor is tier 0.
 */
export function adaptSupply(
  lactation: LactationState,
  milkedThisTurn: boolean,
  ticksEnabled: boolean,
  isEarlyBloomer: boolean,
): SupplyAdapt {
  const unchanged: SupplyAdapt = { next: lactation, raised: false, eased: false }
  if (!lactation.active) return unchanged
  // Every write below carries the guarded tier, so a NaN/out-of-range value from
  // a hand-edited or future save is normalized out rather than propagated.
  const supplyTier = safeSupplyTier(lactation.supplyTier)

  if (milkedThisTurn) {
    const threshold = isEarlyBloomer
      ? Math.max(1, Math.floor(SUPPLY_ADAPT_UP_BEATS / 2))
      : SUPPLY_ADAPT_UP_BEATS
    const demand = (lactation.demandBeats ?? 0) + 1
    if (demand >= threshold && supplyTier < SUPPLY_TIER_MAX) {
      return {
        next: {
          ...lactation,
          supplyTier: supplyTier + 1,
          beatsSinceMilked: 0,
          demandBeats: 0,
        },
        raised: true,
        eased: false,
      }
    }
    // At max supply the counter is pinned rather than accumulating forever —
    // this is persisted state, and an unbounded counter is a slow leak.
    return {
      next: {
        ...lactation,
        supplyTier,
        beatsSinceMilked: 0,
        demandBeats: Math.min(demand, threshold),
      },
      raised: false,
      eased: false,
    }
  }

  if (!ticksEnabled) return unchanged

  const idle = (lactation.beatsSinceMilked ?? 0) + 1
  if (idle >= SUPPLY_EASE_IDLE_BEATS && supplyTier > 0) {
    return {
      next: {
        ...lactation,
        supplyTier: supplyTier - 1,
        beatsSinceMilked: 0,
        demandBeats: 0,
      },
      raised: false,
      eased: true,
    }
  }
  return {
    next: {
      ...lactation,
      supplyTier,
      // Same pin as demandBeats above: at tier 0 there is nothing left to ease,
      // so the idle clock would otherwise climb forever in persisted state.
      beatsSinceMilked: Math.min(idle, SUPPLY_EASE_IDLE_BEATS),
      demandBeats: 0,
    },
    raised: false,
    eased: false,
  }
}

export interface ChronicTick {
  next: LactationState
  fires: boolean
}

/**
 * The counter half of the chronic-supply growth proposal (R5). Sustained high
 * supply accumulates; at the threshold it FIRES with the counter PINNED at the
 * threshold — the reducer owns the roll, every gate, and the reset. Pinning
 * rather than resetting here is what banks a fire the lock or a cooldown blocks:
 * resetting on a blocked fire starved the axis outright in stories where each
 * growth arms a fresh cooldown.
 */
export function tickChronic(lactation: LactationState, ticksEnabled: boolean): ChronicTick {
  if (!lactation.active) return { next: lactation, fires: false }
  if (safeSupplyTier(lactation.supplyTier) < CHRONIC_SUPPLY_TIER) {
    if ((lactation.chronicBeats ?? 0) === 0) return { next: lactation, fires: false }
    return { next: { ...lactation, chronicBeats: 0 }, fires: false }
  }
  if (!ticksEnabled) return { next: lactation, fires: false }

  const beats = (lactation.chronicBeats ?? 0) + 1
  if (beats >= CHRONIC_SUPPLY_BEATS) {
    return { next: { ...lactation, chronicBeats: CHRONIC_SUPPLY_BEATS }, fires: true }
  }
  return { next: { ...lactation, chronicBeats: beats }, fires: false }
}

/** Per-girl Engorged fill threshold (R6) — the reducer AND sprite selection read this one function. */
export function engorgeThreshold(state: BodyState): number {
  return hasQuirk(state, 'pressure_prone')
    ? ENGORGED_FILL_THRESHOLD_PRESSURE_PRONE
    : ENGORGED_FILL_THRESHOLD
}

/**
 * How much LARGER she presently looks while Engorged (R6). Presentation only —
 * prose lines and the image tier pass-through. It must never reach measurements,
 * landGrowth, or selectSprite, or engorgement becomes real growth.
 */
export function apparentTierBonus(state: BodyState, isEngorged: boolean): number {
  if (!isEngorged) return 0
  return hasQuirk(state, 'pressure_prone') ? APPARENT_TIER_PRESSURE_PRONE : APPARENT_TIER_ENGORGED
}

/** Is the Engorged condition live for this girl, at HER threshold (R6)? */
export function isEngorged(state: BodyState): boolean {
  return state.fluids.fillPercent >= engorgeThreshold(state)
}

/**
 * The tier a RENDERER should draw her at: her real tier plus the engorgement
 * swell (R6). Prose lines and the image tier pass-through call this so they can
 * never restate the bonus differently. `measurements()`, `landGrowth`, and
 * `selectSprite` deliberately do NOT — apparent size is not real size.
 */
export function apparentTier(state: BodyState): number {
  return state.tier + apparentTierBonus(state, isEngorged(state))
}

/**
 * Whole 100 ml units expressed by a drain (R7). Floors: a sub-unit expression
 * yields nothing at all — the caller logs why rather than rounding milk into
 * existence.
 */
export function milkYieldUnits(drainedPercent: number, capacityMl: number): number {
  if (!Number.isFinite(drainedPercent) || !Number.isFinite(capacityMl)) return 0
  const ml = (Math.max(0, drainedPercent) * Math.max(0, capacityMl)) / 100
  return Math.max(0, Math.floor(ml / MILK_UNIT_ML))
}

/**
 * Milk grade from this turn's Milking check (R8). A botched check yields NOTHING
 * (null) even though the classifier saw expression — the dice say it went wrong.
 * No check at all grades `plain`.
 */
export function qualityFromBand(band: CheckBand | null): MilkQuality | null {
  switch (band) {
    case 'crit':
      return 'prime'
    case 'success':
      return 'rich'
    case 'partial':
      return 'thin'
    case 'fail':
      return null
    default:
      return 'plain'
  }
}

/**
 * The inventory row a milk stack lives on, structurally (the BE module stays
 * free of app entity imports). The store passes real `Item`s.
 */
export interface MilkItemLike {
  id: string
  name: string
  quantity: number
  metadata?: Record<string, unknown> | null
}

/** Display name for a milk stack — translatable/editable, so NEVER the match key. */
export function milkItemName(characterName: string, fluidType: string): string {
  return `${characterName}'s ${fluidType}`
}

/** The stable identity a milk stack is matched on (R7). */
export function milkItemMetadata(
  characterId: string,
  quality: MilkQuality,
): { milkOf: string; quality: MilkQuality } {
  return { milkOf: characterId, quality }
}

/**
 * Find the existing stack for (girl, quality) — metadata only. Matching on the
 * display name would split a stack the moment someone renames or translates it.
 */
export function findMilkItem<T extends MilkItemLike>(
  items: ReadonlyArray<T>,
  characterId: string,
  quality: MilkQuality,
): T | null {
  for (const item of items) {
    const metadata = item.metadata
    if (!metadata || typeof metadata !== 'object') continue
    if (metadata.milkOf === characterId && metadata.quality === quality) return item
  }
  return null
}
