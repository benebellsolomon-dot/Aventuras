/**
 * BE engine — tuning constants.
 *
 * ⚠ D5 (research/31): every number here is a REFERENCE DEFAULT inherited from the
 * NAI-era engine, tuned for a single-character game. Phase B re-derives them against
 * measured Aventuras turn cadence (the BeLogRecord instrumentation) — do not trust
 * them as final, and do not tune them without cadence data.
 */

import type { BeEventKind, BeStoryConfig, BodyShape, GrowthOutcome } from './types'

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
  fluidType: 'milk',
  passiveFillEnabled: true,
}

/**
 * Fluid registry (Spec 1 Task 2): density feeds swollen-mass honesty,
 * growthFactor couples the fluid to fill speed and overfill pressure,
 * fillRate is percent-points per passive turn tick.
 */
export interface FluidProfile {
  density: number
  growthFactor: number
  fillRate: number
}

export const FLUID_REGISTRY: Readonly<Record<string, FluidProfile>> = {
  milk: { density: 1.03, growthFactor: 0.0, fillRate: 8 },
  mana: { density: 1.0, growthFactor: 0.3, fillRate: 5 },
  arcane: { density: 1.1, growthFactor: 0.6, fillRate: 8 },
  ambrosia: { density: 1.25, growthFactor: 1.0, fillRate: 12 },
}

export const DEFAULT_FLUID_PROFILE = FLUID_REGISTRY.milk

/** Registry lookup; unknown/garbage fluid names fall back to milk. hasOwn keeps
 * prototype-chain keys ('constructor', '__proto__') from leaking non-profiles. */
export function fluidProfile(type: string): FluidProfile {
  if (typeof type !== 'string') return DEFAULT_FLUID_PROFILE
  const key = type.trim().toLowerCase()
  return Object.hasOwn(FLUID_REGISTRY, key) ? FLUID_REGISTRY[key] : DEFAULT_FLUID_PROFILE
}

// ⚠ D5: every number below is an inherited reference default — re-derive
// against measured cadence data (beLog) before trusting as final.
export const ANTICIPATION_THRESHOLD = 2
export const PRESSURE_FIRE = 85
export const PRESSURE_ACCRUAL = 12
export const PRESSURE_RELEASE = 50
export const OVERFILL_FILL_THRESHOLD = 96
export const OVERFILL_ADD_BASE = 30
/** Hard ceiling on banked pressure (locked/muzzled characters otherwise accrue forever). */
export const PRESSURE_CAP = 170
export const ENGORGED_FILL_THRESHOLD = 75
export const ENGORGED_TTL = 2
export const MAX_BE_CONDITIONS = 6

/** Support/buoyancy axis (Spec 1 Task 7): shape base + condition deltas, clamped [0,1]. */
export const SHAPE_SUPPORT: Readonly<Record<BodyShape, number>> = {
  natural: 0,
  firm: 0.4,
  gravity_defying: 0.9,
}
export const SUPPORT_FROM_CONDITIONS: Readonly<Record<string, number>> = {
  featherlight: 0.8,
  'buoyancy charm': 0.5,
  'heaviness curse': -0.5,
}
/** At or above this support, the hang rung is suppressed in the context block. */
export const SUPPORT_HANG_GATE = 0.3

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
