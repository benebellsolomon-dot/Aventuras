/**
 * BE engine — tuning constants.
 *
 * ⚠ D5 (research/31): every number here is a REFERENCE DEFAULT inherited from the
 * NAI-era engine, tuned for a single-character game. Phase B re-derives them against
 * measured Aventuras turn cadence (the BeLogRecord instrumentation) — do not trust
 * them as final, and do not tune them without cadence data.
 */

import type { BeEventKind, BeStoryConfig, BodyShape, GrowthOutcome } from './types'
import type { CheckBand } from './roll'

/** Growth per outcome band — small and capped, never continuous off the roll margin (31a §3.4). */
export const GROWTH_DELTA_BY_OUTCOME: Readonly<Partial<Record<GrowthOutcome, number>>> = {
  critical: 2,
  success: 1,
  partial: 0,
  fail: 0,
}

/** Beats between growth-eligible beats on the same character (31a §3.4, NAI default). */
export const DEFAULT_GROWTH_COOLDOWN_BEATS = 2

/**
 * Default lifetime (turns) for a spell-applied `condition` effect that arrives
 * with no explicit ttl (L-1, research/54). Without this a cast condition would be
 * permanent (ttl undefined never decays) and could crowd out real derived
 * conditions against MAX_BE_CONDITIONS. Mirrors the check_debuff `ttl ?? 2` intent
 * but lingers slightly longer for a generic enchantment.
 */
export const SPELL_CONDITION_DEFAULT_TTL = 3

/**
 * Max tiers a STAGED/pending growth may land in a single turn's step 3 (M-2,
 * research/54). Normal growth already lands ≤1/turn (cooldown gates step-6 events;
 * a crit anticipation-splits to +1 now). A slow_burn girl can bank a larger
 * pendingGrowth across turns — this caps how much of it releases per turn so the
 * bank meters out at the same +1/turn cadence instead of a single +4/+5 dump.
 * The remainder re-stages for the following turn.
 */
export const MAX_GROWTH_LAND_PER_TURN = 1

/** d20 outcome bands (Phase-A provisional; D5 re-derivation target). */
export const ROLL_BANDS = {
  critical: 18,
  success: 11,
  partial: 6,
} as const

/** Roll bonus per intensity step above 1 (intensity 1-3 → +0/+2/+4). */
export const INTENSITY_ROLL_BONUS = 2

/**
 * The synthetic roll a CAST-originated growth event resolves on instead of the
 * reducer's own d20 (resolve-then-narrate ruling, from live play).
 *
 * The bug it fixes: the RPG check succeeded, the narrator was told "success" and
 * described the growth, and then the reducer rolled a SECOND, invisible d20 that
 * failed — narrated growth, no stats. A successful cast IS the dice; the engine
 * must not re-roll behind the player's back.
 *
 * Derived, not magic: the lowest roll at which a scene-defining (intensity 3)
 * beat still crits. So every intensity lands at least `success`, and the band→
 * intensity scaling (crit +1 / success +0 / partial −1) keeps a meaningful top
 * end — an intensity-3 cast lands `critical`. Every other gate (eligible kinds,
 * lock, cooldown, per-turn land cap, size cap, slow-burn staging) still applies.
 */
export const GUARANTEED_GROWTH_ROLL = ROLL_BANDS.critical - 2 * INTENSITY_ROLL_BONUS

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

// ---- Phase 2 harem tracks (research/48 R6; bond re-based research/60) ----
// ⚠ D5: reference defaults — re-derive against real play cadence data.

// Relationship track (FF5.2 unification, research/60): bond lives on −5..+20
// and RISES only through sparks conversion — the anti-positivity-bias lever
// that replaced the old symmetric ±5 velocity cap. Direct movement is
// negative-only and capped.
export const REL_BOND_MIN = -5
export const REL_BOND_MAX = 20
/** New-scale default (old BOND_DEFAULT 20 ÷ LEGACY_BOND_DIVISOR — stays 'warming'). */
export const REL_BOND_DEFAULT = 4
/** Legacy 0-100 bond values convert on read: round(bond / 5). */
export const LEGACY_BOND_DIVISOR = 5
/** Sparks gained per turn cap (devoted_heart folds +1/event BEFORE this binds). */
export const MAX_SPARKS_GAIN_PER_TURN = 2
export const MAX_GRUDGE_GAIN_PER_TURN = 1
/** Direct bond loss per turn cap (scene-defining strain only). */
export const MAX_DIRECT_BOND_LOSS_PER_TURN = 2
/** Every SPARKS_CHECK_PERIOD interaction turns: sparks >= threshold → bond +1. */
export const SPARKS_CONVERT_THRESHOLD = 7
export const SPARKS_CHECK_PERIOD = 5
/**
 * Hard ceiling on banked sparks (fix-diff HIGH-1): under 2× the threshold, a
 * bank can pay out at most ONE conversion after warmth stops, then fades —
 * an unbounded bank converted to bond forever with zero new warmth.
 */
export const SPARKS_BANK_CAP = SPARKS_CONVERT_THRESHOLD * 2 - 1
/** Every GRUDGE_CHECK_PERIOD interaction turns: grudge >= threshold → bond −1. */
export const GRUDGE_CONVERT_THRESHOLD = 5
export const GRUDGE_CHECK_PERIOD = 3
/** At/above this grudge, sparks conversion is blocked (sparks hold, banked). */
export const GRUDGE_STALL_THRESHOLD = 3

/** Dependence gain cap per character per turn (gain only; decay is 1/turn). */
export const MAX_DEPENDENCE_GAIN_PER_TURN = 4
export const DEPENDENCE_GAIN_PER_INTENSITY = 2
export const DEPENDENCE_DECAY_PER_IDLE_BEAT = 1
export const DEPENDENCE_DEFAULT = 0
export const WITHDRAWAL_DEPENDENCE_THRESHOLD = 60
/** devoted_heart lowers the withdrawal threshold by this much. */
export const WITHDRAWAL_THRESHOLD_DEVOTED_DELTA = 15
export const WITHDRAWAL_IDLE_BEATS = 3
/** At/above this dependence, an attitude-less turn pulls attitude to craving. */
export const CRAVING_PULL_DEPENDENCE = 60

// ---- Phase 3 lactation axis (research/49 Step 1) ----
// ⚠ D5: reference defaults stacked on still-untuned Phase 1-2 numbers — re-derive from play.

/** Highest supply tier; SUPPLY_LABELS indexes 0..SUPPLY_TIER_MAX. */
export const SUPPLY_TIER_MAX = 3
export const SUPPLY_LABELS: ReadonlyArray<string> = ['light', 'steady', 'heavy', 'torrential']
/** Consecutive milked beats before supply adapts UP one tier (early_bloomer halves it). */
export const SUPPLY_ADAPT_UP_BEATS = 2
/** Beats without milking before supply eases DOWN one tier. */
export const SUPPLY_EASE_IDLE_BEATS = 4
/** Passive fill tick multiplier per supply tier (R4: 1 + tier × bonus). */
export const SUPPLY_FILL_RATE_BONUS = 0.5
/** At or above this supply tier, sustained beats accumulate toward a growth proposal. */
export const CHRONIC_SUPPLY_TIER = 2
/** Sustained high-supply beats before the chronic growth roll fires (then resets). */
export const CHRONIC_SUPPLY_BEATS = 6
/** pressure_prone engorges early (R6). */
export const ENGORGED_FILL_THRESHOLD_PRESSURE_PRONE = 60
/** early_bloomer's induction-attempt check bonus (a DC −4 expressed as +4). */
export const EARLY_BLOOMER_INDUCTION_BONUS = 4
/** Milk is inventoried in whole units of this volume (R7). */
export const MILK_UNIT_ML = 100
/** Apparent (presentation-only) tier bump while Engorged — never a real tier write. */
export const APPARENT_TIER_ENGORGED = 1
export const APPARENT_TIER_PRESSURE_PRONE = 2

// ---- Magic / spells, BE side (research/50 Phase 4; D5 reference defaults) ----
// Co-located with be/effects.ts (the effect translation), which must not import
// rpg/. rpg/modifiers reads the check-debuff pair below from $lib/services/be.
/** Band → emitted spell-effect intensity delta (R4). fail = null → no effects. */
export const SPELL_BAND_INTENSITY_DELTA: Readonly<Record<CheckBand, number | null>> = {
  crit: 1,
  success: 0,
  partial: -1,
  fail: null,
}
/**
 * Base intensity for a check-backed growth ACTION that no classifier event
 * mirrored (`promoteGrowthIntent` synthesis). Deliberately mid-ladder so the
 * band still means something through SPELL_BAND_INTENSITY_DELTA: partial → 1,
 * success → 2, crit → 3. At base 1 every band would collapse to the same
 * landed +1 and the roll would stop mattering.
 */
export const GROWTH_INTENT_BASE_INTENSITY = 2

/** Max supplyTier bump a single supply_surge effect may apply. */
export const SUPPLY_SURGE_MAX_DELTA = 2
/** DC penalty a check_debuff condition imposes on checks targeting the afflicted girl. */
export const CHECK_DEBUFF_DC_PENALTY = 2
/** Condition-label prefix the RPG modifier layer recognizes as a spell check-debuff. */
export const CHECK_DEBUFF_CONDITION_PREFIX = 'hex:'
