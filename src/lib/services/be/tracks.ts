/**
 * BE engine — harem tracks: relationship (bond/sparks/grudge) + dependence.
 *
 * Pure value math, no BodyState writes — the reducer sequences these. The band
 * functions here are THE single source of truth for prompts, gating, check
 * modifiers, and UI alike; thresholds must never be re-stated elsewhere.
 *
 * research/60 (FF5.2 unification): bond lives on −5..+20 and rises ONLY via
 * sparks conversion — warm events feed sparks, strain feeds grudge (and, when
 * scene-defining, direct capped loss). Legacy 0-100 `bond` values convert on
 * read (round(bond/5)); the `rel` block is authoritative once present.
 *
 * Defaults are read-through (relOf/bondOf/dependenceOf), never written eagerly —
 * an eager default write would rewrite every character's metadata on the first
 * turn and flood the rollback capture (research/48 risk 7).
 */

import {
  DEPENDENCE_DECAY_PER_IDLE_BEAT,
  DEPENDENCE_DEFAULT,
  DEPENDENCE_GAIN_PER_INTENSITY,
  GRUDGE_CHECK_PERIOD,
  GRUDGE_CONVERT_THRESHOLD,
  GRUDGE_STALL_THRESHOLD,
  LEGACY_BOND_DIVISOR,
  MAX_DEPENDENCE_GAIN_PER_TURN,
  MAX_DIRECT_BOND_LOSS_PER_TURN,
  MAX_GRUDGE_GAIN_PER_TURN,
  MAX_SPARKS_GAIN_PER_TURN,
  REL_BOND_DEFAULT,
  REL_BOND_MAX,
  REL_BOND_MIN,
  SPARKS_BANK_CAP,
  SPARKS_CHECK_PERIOD,
  SPARKS_CONVERT_THRESHOLD,
  WITHDRAWAL_DEPENDENCE_THRESHOLD,
  WITHDRAWAL_IDLE_BEATS,
  WITHDRAWAL_THRESHOLD_DEVOTED_DELTA,
} from './constants'
import { clampIntensity } from './roll'
import type { BodyCondition, BodyState, BondEvent, ExposureEvent, RelationshipState } from './types'

export const clampTrack = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0

export const clampBond = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(REL_BOND_MAX, Math.max(REL_BOND_MIN, Math.round(value)))
    : REL_BOND_DEFAULT

const clampCounter = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.round(value) : 0

/**
 * The relationship state, with lazy legacy conversion: `rel` wins when present;
 * otherwise a legacy 0-100 `bond` converts (round(bond/5)); otherwise defaults.
 * Never writes — the reducer materializes `rel` only when something moves it.
 */
export function relOf(state: BodyState): RelationshipState {
  if (state.rel) {
    return {
      bond: clampBond(state.rel.bond),
      sparks: clampCounter(state.rel.sparks),
      grudge: clampCounter(state.rel.grudge),
      ct: clampCounter(state.rel.ct),
      warmed: state.rel.warmed === true,
    }
  }
  // Math.floor, NOT round: floor preserves every legacy band and gate edge
  // exactly (44→8 warming, 45→9 bonded; 69→13, 70→14; 89→17, 90→18) — a
  // rounded conversion silently unlocked gated content for saves at old
  // bond 38-44 (adversarial finding F2/R-3).
  const bond =
    state.bond === undefined
      ? REL_BOND_DEFAULT
      : clampBond(Math.floor(clampTrack(state.bond) / LEGACY_BOND_DIVISOR))
  return { bond, sparks: 0, grudge: 0, ct: 0, warmed: false }
}

/** The relationship number on the −5..+20 scale (legacy values converted). */
export const bondOf = (state: BodyState): number => relOf(state).bond

export const dependenceOf = (state: BodyState): number =>
  state.dependence === undefined ? DEPENDENCE_DEFAULT : clampTrack(state.dependence)

// ---- Bands (the single source of truth) ----

export type BondStance =
  | 'hostile'
  | 'cold'
  | 'wary'
  | 'warming'
  | 'bonded'
  | 'deeply bonded'
  | 'devoted'

// Band edges are the EXACT floor-conversions of the legacy edges (20/45/70/90
// ÷ 5 → 4/9/14/18) so no save changes stance or gate access on load.
export function bondStance(bond: number): BondStance {
  if (bond >= 18) return 'devoted'
  if (bond >= 14) return 'deeply bonded'
  if (bond >= 9) return 'bonded'
  if (bond >= 4) return 'warming'
  if (bond >= 0) return 'wary'
  if (bond >= -2) return 'cold'
  return 'hostile'
}

/**
 * Per-stance behavior blurb for the harem prompt block: FF5.2's tier language
 * and physical-gate guidance, expressed as prose direction (never hard locks —
 * research/60 keeps shipped gate semantics in gating.ts).
 */
export function stanceBlurb(stance: BondStance): string {
  switch (stance) {
    case 'hostile':
      return 'openly hostile — verbal weapons out, keeps her distance, works against him'
    case 'cold':
      return 'cold and guarded — clipped answers, avoids being alone with him'
    case 'wary':
      return 'a polite stranger — neutral courtesy, standard social distance'
    case 'warming':
      return 'genuinely warming — seeks his company, remembers details; a friendly touch lands, more does not'
    case 'bonded':
      return 'trusts him — comfortable with his hands and close contact; deeper wants stay unspoken'
    case 'deeply bonded':
      return 'deep trust — inside jokes, admits what she wants; romantic intimacy fits who they are now'
    case 'devoted':
      return 'devoted — constant closeness, fierce public defense; nothing held back'
  }
}

export type DependenceStage = 'none' | 'curious' | 'hooked' | 'craving' | 'bound'

export function dependenceStage(dependence: number): DependenceStage {
  if (dependence >= 85) return 'bound'
  if (dependence >= 60) return 'craving'
  if (dependence >= 35) return 'hooked'
  if (dependence >= 15) return 'curious'
  return 'none'
}

/** Bond's check-bonus contribution (social/intimate skills only). */
export function bondCheckModifier(bond: number): number {
  switch (bondStance(bond)) {
    case 'hostile':
      return -4
    case 'cold':
      return -2
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

// ---- Per-turn application ----

export interface TrackDelta {
  value: number
  delta: number
  capped: boolean
}

export interface RelationshipTurnResult {
  rel: RelationshipState
  /** Net bond movement this turn (conversions + direct loss). */
  bondDelta: number
  sparksDelta: number
  grudgeDelta: number
  /** True when a per-turn gain/loss cap bound. */
  capped: boolean
  /**
   * What the cadence checks did, in occurrence order: 'sparks' = sparks
   * converted to +1 bond; 'grudge' = grudge boiled over to −1; 'stalled' =
   * sparks conversion blocked by grudge. Both checks can fire the same turn.
   */
  conversions: ReadonlyArray<'sparks' | 'grudge' | 'stalled'>
}

/**
 * One turn of the relationship engine (research/60, adversarial-review tuned):
 * 1. warm events → sparks (+1 / +2 by intensity; devoted_heart raises the
 *    per-turn cap by 1 AND folds +1 per event, so her warmth actually lands);
 *    a warm event of intensity ≥2 also repairs 1 grudge — apology scenes work;
 * 2. strain events → grudge +1 (capped); only scene-defining strain
 *    (intensity 3) moves bond directly (−1, capped per turn) — sustained
 *    conflict damages bond through grudge boil-over instead, so one misread
 *    scene can't ratchet a bonded girl to hostile;
 * 3. cadence (only when ticks): ct++, every GRUDGE_CHECK_PERIOD grudge
 *    converts (≥ threshold → bond −1) or decays; every SPARKS_CHECK_PERIOD
 *    sparks convert (≥ threshold, unless stalled by the grudge level AT the
 *    check — snapshot BEFORE grudge conversion, so a worse grudge never
 *    outperforms a milder one) spending SPARKS_CONVERT_THRESHOLD and KEEPING
 *    the remainder (banked warmth pays out over later checks, never burned),
 *    or fade −1 when the cycle saw no warmth.
 * Direct bond RAISES never happen from classifier events — conversion only.
 * Spell-authored events (potent, be/effects.ts) are cap-exempt and doubled:
 * an engine-guaranteed charm must not be a no-op.
 */
export function applyRelationshipTurn(
  rel: RelationshipState,
  events: ReadonlyArray<BondEvent>,
  options: { ticks: boolean; devotedHeart?: boolean },
): RelationshipTurnResult {
  let { bond, sparks, grudge, ct, warmed } = rel
  let capped = false
  const conversions: Array<'sparks' | 'grudge' | 'stalled'> = []

  // 1-2. events
  let sparksGain = 0
  let potentSparks = 0
  let grudgeGain = 0
  let potentGrudge = 0
  let directLoss = 0
  let repairs = false
  let strained = false
  for (const event of events) {
    const intensity = clampIntensity(event.intensity)
    const base = intensity >= 2 ? 2 : 1
    if (event.direction === 'warm') {
      // devoted_heart's fold applies to organic warmth only — a spell's punch
      // is the spell's, not the quirk's (fix-diff LOW-9, intended).
      if (event.potent) potentSparks += base * 2
      else sparksGain += base + (options.devotedHeart ? 1 : 0)
      if (intensity >= 2) repairs = true
    } else {
      strained = true
      if (event.potent) {
        // An engine-guaranteed curse must land too (fix-diff MEDIUM-3):
        // doubled grudge, cap-exempt; direct loss from intensity 2 up, still
        // inside the per-turn loss cap.
        potentGrudge += 2
        if (intensity >= 3) directLoss += 2
        else if (intensity >= 2) directLoss += 1
      } else {
        grudgeGain += 1
        if (intensity >= 3) directLoss += 1
      }
    }
  }
  const sparksCap = MAX_SPARKS_GAIN_PER_TURN + (options.devotedHeart ? 1 : 0)
  if (sparksGain > sparksCap) {
    sparksGain = sparksCap
    capped = true
  }
  if (grudgeGain > MAX_GRUDGE_GAIN_PER_TURN) {
    grudgeGain = MAX_GRUDGE_GAIN_PER_TURN
    capped = true
  }
  if (directLoss > MAX_DIRECT_BOND_LOSS_PER_TURN) {
    directLoss = MAX_DIRECT_BOND_LOSS_PER_TURN
    capped = true
  }
  sparks += sparksGain + potentSparks
  // Banked warmth is bounded (fix-diff HIGH-1): at most one conversion can
  // ride on the bank after warmth stops; the rest would be a passive ratchet.
  if (sparks > SPARKS_BANK_CAP) {
    sparks = SPARKS_BANK_CAP
    capped = true
  }
  grudge += grudgeGain + potentGrudge
  bond -= directLoss
  // Repair only on strain-free turns (fix-diff HIGH-2): a warm gesture in the
  // same scene as fresh friction is not an apology — without this guard the
  // repair cancels the turn's grudge gain and the stall never engages.
  if (repairs && !strained) grudge = Math.max(0, grudge - 1)
  if (sparksGain + potentSparks > 0) warmed = true

  // 3. cadence — active interaction turns only (off-screen never fades,
  // research/48; the reducer additionally gates on accumulator activity).
  if (options.ticks) {
    ct += 1
    // Snapshot: the stall decision reads the grudge level AT the check, not
    // the post-boil-over value — otherwise grudge 5 (boils over, resets to 0)
    // would let sparks through while a milder grudge 4 blocks them (R-4).
    const grudgeAtCheck = grudge
    if (ct % GRUDGE_CHECK_PERIOD === 0) {
      if (grudge >= GRUDGE_CONVERT_THRESHOLD) {
        bond -= 1
        grudge = 0
        conversions.push('grudge')
      } else if (grudge > 0) {
        grudge -= 1
      }
    }
    if (ct % SPARKS_CHECK_PERIOD === 0) {
      if (sparks >= SPARKS_CONVERT_THRESHOLD) {
        if (grudgeAtCheck >= GRUDGE_STALL_THRESHOLD) {
          conversions.push('stalled')
        } else {
          bond += 1
          sparks -= SPARKS_CONVERT_THRESHOLD
          conversions.push('sparks')
        }
      } else if (!warmed && sparks > 0) {
        sparks -= 1
      }
      warmed = false
    }
  }

  bond = clampBond(bond)
  const next: RelationshipState = { bond, sparks, grudge, ct, warmed }
  return {
    rel: next,
    bondDelta: bond - rel.bond,
    sparksDelta: sparks - rel.sparks,
    grudgeDelta: grudge - rel.grudge,
    capped,
    conversions,
  }
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
