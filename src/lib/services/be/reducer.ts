/**
 * BE engine — the deterministic reducer (D3: events → state; the single writer).
 *
 * The ONLY code path that may mutate bodyState. Its one production caller will be
 * StoryStore.applyClassificationResult() (the wiring session); everything here is
 * pure and immutable — same inputs (state, events, config, seed) → same outputs,
 * which is what keeps retries/undo replay-safe.
 *
 * Resolution order per 31a: size-lock muzzles BEFORE any roll (even a guaranteed
 * trigger, §3.6) → cooldown gate (§3.4) → seeded outcome roll → outcome-banded
 * capped delta (never continuous off the margin, §3.4) → clamps.
 */

import {
  GROWTH_DELTA_BY_OUTCOME,
  INTENSITY_ROLL_BONUS,
  MILKING_DRAIN_PER_INTENSITY,
  ROLL_BANDS,
} from './constants'
import type {
  BeEvent,
  BeLogRecord,
  BeStoryConfig,
  BodyCondition,
  BodyState,
  GrowthOutcome,
  ReducerResult,
} from './types'

const GROWTH_KINDS = new Set(['catalyst', 'contact', 'attempt'])

const clampIntensity = (value: number): number =>
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

function resolveOutcome(roll: number, intensity: number): GrowthOutcome {
  const total = roll + (clampIntensity(intensity) - 1) * INTENSITY_ROLL_BONUS
  if (total >= ROLL_BANDS.critical) return 'critical'
  if (total >= ROLL_BANDS.success) return 'success'
  if (total >= ROLL_BANDS.partial) return 'partial'
  return 'fail'
}

function decayConditions(conditions: ReadonlyArray<BodyCondition>): BodyCondition[] {
  const next: BodyCondition[] = []
  for (const condition of conditions) {
    if (condition.ttl === undefined) {
      next.push({ ...condition })
    } else if (condition.ttl > 1) {
      next.push({ ...condition, ttl: condition.ttl - 1 })
    }
    // ttl <= 1: expired this turn — dropped
  }
  return next
}

/**
 * Apply one turn's events for ONE character. Pure: neither `state` nor `events`
 * is mutated. `seed` must be stable per (story, entry, character) so a re-applied
 * turn (retry, branch replay) resolves identically. `characterName` attributes
 * non-event log records (condition decay) for the D11 cadence log.
 */
export function reduceCharacterBody(
  state: BodyState,
  events: ReadonlyArray<BeEvent>,
  config: BeStoryConfig,
  seed: string,
  characterName = '',
): ReducerResult {
  const log: BeLogRecord[] = []

  let tier = Number.isFinite(state.tier) ? Math.max(0, state.tier) : 0
  let cooldown = Math.max(0, Math.floor(state.cooldown ?? 0))
  let fillPercent = state.fluids.fillPercent
  let pendingGrowth = state.pendingGrowth
  // The previous turn's growth marker expires now; this turn may set a fresh one.
  let lastGrowth: BodyState['lastGrowth'] = undefined

  // Per-turn condition decay happens exactly once, before events resolve.
  const conditions = decayConditions(state.conditions)
  if (conditions.length !== state.conditions.length) {
    log.push({
      character: characterName,
      kind: 'decay',
      outcome: 'none',
      delta: 0,
      tierAfter: tier,
      note: `${state.conditions.length - conditions.length} condition(s) expired`,
    })
  }
  if (cooldown > 0) cooldown -= 1

  events.forEach((event, index) => {
    const intensity = clampIntensity(event.intensity)

    if (event.kind === 'stabilize') {
      pendingGrowth = undefined
      log.push({
        character: event.character,
        kind: event.kind,
        outcome: 'none',
        delta: 0,
        tierAfter: tier,
      })
      return
    }

    if (event.kind === 'milking') {
      fillPercent = Math.max(0, fillPercent - MILKING_DRAIN_PER_INTENSITY * intensity)
      log.push({
        character: event.character,
        kind: event.kind,
        outcome: 'none',
        delta: 0,
        tierAfter: tier,
        note: `drained to ${fillPercent}%`,
      })
      return
    }

    if (!GROWTH_KINDS.has(event.kind)) {
      log.push({
        character: event.character,
        kind: event.kind,
        outcome: 'none',
        delta: 0,
        tierAfter: tier,
      })
      return
    }

    // The lock wins over everything, including otherwise-guaranteed triggers (31a §3.6).
    if (state.locked) {
      log.push({
        character: event.character,
        kind: event.kind,
        outcome: 'muzzled',
        delta: 0,
        tierAfter: tier,
      })
      return
    }

    if (cooldown > 0) {
      log.push({
        character: event.character,
        kind: event.kind,
        outcome: 'cooldown',
        delta: 0,
        tierAfter: tier,
      })
      return
    }

    const roll = seededRoll(`${seed}:${index}`)
    const outcome = resolveOutcome(roll, intensity)
    let delta = GROWTH_DELTA_BY_OUTCOME[outcome] ?? 0

    if (delta > 0) {
      if (config.sizeCapTier !== null) {
        delta = Math.min(delta, Math.max(0, config.sizeCapTier - tier))
      }
      if (delta > 0) {
        lastGrowth = { delta, tierBefore: tier }
        tier += delta
        cooldown = Math.max(0, Math.floor(config.growthCooldownBeats))
      }
    }

    log.push({
      character: event.character,
      kind: event.kind,
      outcome,
      delta,
      tierAfter: tier,
      note: `roll ${roll} @i${intensity}`,
    })
  })

  return {
    state: {
      ...state,
      tier,
      cooldown,
      conditions,
      fluids: { ...state.fluids, fillPercent },
      pendingGrowth,
      lastGrowth,
    },
    log,
  }
}
