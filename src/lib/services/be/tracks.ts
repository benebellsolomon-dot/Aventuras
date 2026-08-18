/**
 * BE engine — harem tracks: bond + dependence (research/48 Step 1, R6/R7).
 *
 * Pure value math, no BodyState writes — the reducer sequences these. The band
 * functions here are THE single source of truth for prompts, gating, check
 * modifiers, and UI alike; thresholds must never be re-stated elsewhere.
 *
 * Defaults are read-through (bondOf/dependenceOf), never written eagerly — an
 * eager default write would rewrite every character's metadata on the first
 * Phase-2 turn and flood the rollback capture (research/48 risk 7).
 */

import {
  BOND_DEFAULT,
  BOND_DELTA_PER_INTENSITY,
  DEPENDENCE_DECAY_PER_IDLE_BEAT,
  DEPENDENCE_DEFAULT,
  DEPENDENCE_GAIN_PER_INTENSITY,
  MAX_BOND_DELTA_PER_TURN,
  MAX_DEPENDENCE_GAIN_PER_TURN,
  WITHDRAWAL_DEPENDENCE_THRESHOLD,
  WITHDRAWAL_IDLE_BEATS,
  WITHDRAWAL_THRESHOLD_DEVOTED_DELTA,
} from './constants'
import { clampIntensity } from './roll'
import type { BodyCondition, BodyState, BondEvent, ExposureEvent } from './types'

export const clampTrack = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0

export const bondOf = (state: BodyState): number =>
  state.bond === undefined ? BOND_DEFAULT : clampTrack(state.bond)

export const dependenceOf = (state: BodyState): number =>
  state.dependence === undefined ? DEPENDENCE_DEFAULT : clampTrack(state.dependence)

// ---- Bands (R7 — the single source of truth) ----

export type BondStance = 'wary' | 'warming' | 'bonded' | 'deeply bonded' | 'devoted'

export function bondStance(bond: number): BondStance {
  if (bond >= 90) return 'devoted'
  if (bond >= 70) return 'deeply bonded'
  if (bond >= 45) return 'bonded'
  if (bond >= 20) return 'warming'
  return 'wary'
}

export type DependenceStage = 'none' | 'curious' | 'hooked' | 'craving' | 'bound'

export function dependenceStage(dependence: number): DependenceStage {
  if (dependence >= 85) return 'bound'
  if (dependence >= 60) return 'craving'
  if (dependence >= 35) return 'hooked'
  if (dependence >= 15) return 'curious'
  return 'none'
}

/** Bond's check-bonus contribution (social/intimate skills only; R7 table). */
export function bondCheckModifier(bond: number): number {
  switch (bondStance(bond)) {
    case 'wary':
      return -2
    case 'warming':
      return 0
    case 'bonded':
      return 1
    case 'deeply bonded':
      return 2
    case 'devoted':
      return 3
  }
}

// ---- Per-turn application (velocity-capped, R6) ----

export interface TrackDelta {
  value: number
  delta: number
  capped: boolean
}

/**
 * Apply one turn's bond events. The cap is SYMMETRIC on the net movement —
 * warming and strain are equally rate-limited.
 */
export function applyBondEvents(
  bond: number,
  events: ReadonlyArray<BondEvent>,
  quirkBonusPerEvent = 0,
): TrackDelta {
  let raw = 0
  for (const event of events) {
    const magnitude = clampIntensity(event.intensity) * BOND_DELTA_PER_INTENSITY
    const sign = event.direction === 'strain' ? -1 : 1
    raw += sign * (magnitude + quirkBonusPerEvent)
  }
  const capped = Math.abs(raw) > MAX_BOND_DELTA_PER_TURN
  const net = capped ? Math.sign(raw) * MAX_BOND_DELTA_PER_TURN : raw
  const value = clampTrack(bond + net)
  return { value, delta: value - bond, capped }
}

/** Apply one turn's exposure events (gain-capped per R6). */
export function applyExposure(
  dependence: number,
  events: ReadonlyArray<ExposureEvent>,
): TrackDelta {
  let raw = 0
  for (const event of events) {
    raw += clampIntensity(event.intensity) * DEPENDENCE_GAIN_PER_INTENSITY
  }
  const capped = raw > MAX_DEPENDENCE_GAIN_PER_TURN
  const gain = capped ? MAX_DEPENDENCE_GAIN_PER_TURN : raw
  const value = clampTrack(dependence + gain)
  return { value, delta: value - dependence, capped }
}

/** One idle beat of dependence decay. */
export const decayDependence = (dependence: number): number =>
  clampTrack(dependence - DEPENDENCE_DECAY_PER_IDLE_BEAT)

/**
 * The withdrawal condition, when it applies (R8). Front-insert the result —
 * MAX_BE_CONDITIONS slices from the tail and must never evict it.
 */
export function withdrawalCondition(
  dependence: number,
  beatsSinceExposure: number,
  harsher: boolean,
): BodyCondition | null {
  const threshold =
    WITHDRAWAL_DEPENDENCE_THRESHOLD - (harsher ? WITHDRAWAL_THRESHOLD_DEVOTED_DELTA : 0)
  if (dependence < threshold || beatsSinceExposure < WITHDRAWAL_IDLE_BEATS) return null
  return {
    label: 'Withdrawal',
    ttl: 2,
    note: harsher
      ? 'shaking, desperate — her devotion makes the absence physically unbearable'
      : 'restless, aching for the catalyst she has gone without',
  }
}
