/**
 * BE engine — the deterministic reducer (D3: events → state; the single writer).
 *
 * The ONLY code path that may mutate bodyState. Its one production caller is
 * StoryStore.applyBeEvents(); everything here is pure and immutable — same
 * inputs (state, events, config, seed, extras) → same outputs, which is what
 * keeps retries/undo replay-safe. No Date.now, no Math.random.
 *
 * Pinned pipeline order (Spec 1, research/37 — each step reads the prior
 * step's output; auto-conditions MUST read post-tick fill or Engorged lags):
 *   1. decay conditions          2. cooldown tick
 *   3. land pendingGrowth        4. apply softState
 *   5. passive fill tick         6. events loop (anticipation split)
 *   7. pressure accrual/pity     8. conditions: derive + classifier merge
 *   9. drift note
 */

import {
  ANTICIPATION_THRESHOLD,
  ENGORGED_FILL_THRESHOLD,
  ENGORGED_TTL,
  GROWTH_DELTA_BY_OUTCOME,
  MAX_BE_CONDITIONS,
  MILKING_DRAIN_PER_INTENSITY,
  OVERFILL_ADD_BASE,
  OVERFILL_FILL_THRESHOLD,
  PRESSURE_ACCRUAL,
  PRESSURE_CAP,
  PRESSURE_FIRE,
  PRESSURE_RELEASE,
  fluidProfile,
} from './constants'
import { clampIntensity, resolveGrowthOutcome, seededRoll } from './roll'

// Re-export: pre-extraction callers (and tests) import seededRoll from here.
export { seededRoll } from './roll'
import type {
  BeEvent,
  BeLogRecord,
  BeSoftState,
  BeStoryConfig,
  BodyCondition,
  BodyState,
  DriftFinding,
  GrowthOutcome,
  ReducerResult,
} from './types'

const GROWTH_KINDS = new Set(['catalyst', 'contact', 'attempt'])

/** Dry outcomes accrue escalator pressure. `ineligible` is deliberately absent —
 * pity-firing growth the story's canon forbids would recreate the research/41 bug. */
const DRY_OUTCOMES = new Set<GrowthOutcome>(['fail', 'partial', 'cooldown', 'muzzled'])

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

const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0

/** Optional per-turn inputs beyond events/softState (Spec 1 Tasks 4+6). */
export interface ReducerExtras {
  /** Classifier-proposed transient conditions (merged derived-first, capped). */
  softConditions?: ReadonlyArray<BodyCondition>
  /** Output-side drift findings from the finalized narrative (drift.ts). */
  driftFindings?: ReadonlyArray<DriftFinding>
  /**
   * Per-turn tick gate (present-only ruling, research/37 Task 9): when false —
   * the character is off-screen — the passive fill tick, overfill pressure, the
   * pity-fire, AND the pendingGrowth land are all held. Off-screen bodies keep
   * time (decay, cooldown) but never change size unseen. Default true.
   */
  ticksEnabled?: boolean
}

/**
 * Apply one turn for ONE character through the pinned pipeline. Pure: neither
 * `state` nor `events` is mutated. `seed` must be stable per (story, entry,
 * character) so a re-applied turn resolves identically.
 */
export function reduceCharacterBody(
  state: BodyState,
  events: ReadonlyArray<BeEvent>,
  config: BeStoryConfig,
  seed: string,
  characterName = '',
  softState?: BeSoftState,
  extras?: ReducerExtras,
): ReducerResult {
  const log: BeLogRecord[] = []
  const profile = fluidProfile(config.fluidType)

  let tier = Number.isFinite(state.tier) ? Math.max(0, state.tier) : 0
  let cooldown = Math.max(0, Math.floor(state.cooldown ?? 0))
  let fillPercent = state.fluids.fillPercent
  let pendingGrowth = state.pendingGrowth
  let attitude = state.attitude
  let arousal = state.arousal
  let growthPressure = Math.max(0, state.growthPressure ?? 0)
  // The previous turn's growth marker expires now; this turn may set a fresh one.
  let lastGrowth: BodyState['lastGrowth'] = undefined
  let grewThisTurn = false
  let dryBeats = 0
  const ticksEnabled = extras?.ticksEnabled !== false

  /** Land growth (cap-clamped): merges into lastGrowth, arms cooldown. Returns the landed delta. */
  const landGrowth = (want: number): number => {
    let delta = want
    if (config.sizeCapTier !== null) {
      delta = Math.min(delta, Math.max(0, config.sizeCapTier - tier))
    }
    if (delta <= 0) return 0
    lastGrowth = lastGrowth
      ? { delta: lastGrowth.delta + delta, tierBefore: lastGrowth.tierBefore }
      : { delta, tierBefore: tier }
    tier += delta
    cooldown = Math.max(0, Math.floor(config.growthCooldownBeats))
    grewThisTurn = true
    return delta
  }

  // ---- Step 1: condition decay (exactly once, before derivation re-upserts) ----
  let conditions = decayConditions(state.conditions)
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

  // ---- Step 2: cooldown tick ----
  if (cooldown > 0) cooldown -= 1

  // ---- Step 3: land the anticipation remainder (locked or off-screen holds it staged) ----
  if (pendingGrowth && !state.locked && ticksEnabled) {
    const landed = landGrowth(pendingGrowth.delta)
    log.push({
      character: characterName,
      kind: 'pending',
      outcome: landed > 0 ? 'success' : 'none',
      delta: landed,
      tierAfter: tier,
      note: landed > 0 ? `anticipation lands +${landed}` : 'capped out',
    })
    pendingGrowth = undefined
  }

  // ---- Step 4: soft states (LLM-proposed, clamp-applied) ----
  if (softState) {
    const moodNotes: string[] = []
    if (softState.attitude && softState.attitude !== attitude) {
      attitude = softState.attitude
      moodNotes.push(`attitude→${attitude}`)
    }
    if (softState.arousal !== undefined) {
      const next = Math.round(clampPercent(softState.arousal))
      if (next !== arousal) {
        arousal = next
        moodNotes.push(`arousal→${next}`)
      }
    }
    if (softState.fluidFill !== undefined) {
      const next = clampPercent(softState.fluidFill)
      if (next !== fillPercent) {
        fillPercent = next
        moodNotes.push(`fill→${next}%`)
      }
    }
    if (moodNotes.length > 0) {
      log.push({
        character: characterName,
        kind: 'mood',
        outcome: 'none',
        delta: 0,
        tierAfter: tier,
        note: moodNotes.join(', '),
      })
    }
  }

  // ---- Step 5: passive fill tick (the FIL loop's intake side) ----
  if (config.passiveFillEnabled && ticksEnabled && fillPercent < 100) {
    const tick = profile.fillRate * (1 + profile.growthFactor)
    const next = clampPercent(fillPercent + tick)
    log.push({
      character: characterName,
      kind: 'fill',
      outcome: 'none',
      delta: 0,
      tierAfter: tier,
      note: `+${Math.round(next - fillPercent)}% passive (${Math.round(next)}%)`,
    })
    fillPercent = next
  }

  // ---- Step 6: events (roll → capped delta, anticipation split at threshold) ----
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
      // Drain nets against the observed/ticked fill (FIL inversion is intentional
      // genre physics: full→pressure→growth→capacity→refill — do not "fix" it).
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

    // Story-cosmology gate (research/41): kinds outside the per-story eligible
    // set never roll — the story's canon, not the dice, says what drives growth.
    // Deliberately precedes the lock/cooldown gates: "ineligible" is the more
    // precise label when both apply. Ineligible beats do NOT accrue pressure.
    if (config.growthEligibleKinds && !config.growthEligibleKinds.includes(event.kind)) {
      log.push({
        character: event.character,
        kind: event.kind,
        outcome: 'ineligible',
        delta: 0,
        tierAfter: tier,
        note: 'kind not growth-eligible in this story',
      })
      return
    }

    // The lock wins over everything, including otherwise-guaranteed triggers (31a §3.6).
    if (state.locked) {
      dryBeats += 1
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
      dryBeats += 1
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
    const outcome = resolveGrowthOutcome(roll, intensity)
    const bandDelta = GROWTH_DELTA_BY_OUTCOME[outcome] ?? 0
    let landed = 0

    if (bandDelta > 0) {
      if (bandDelta >= ANTICIPATION_THRESHOLD) {
        // Two-beat anticipation: land half now, stage the remainder for the
        // next turn's step 3 (re-clamped against the cap at land time).
        const landNow = Math.floor(bandDelta / 2)
        landed = landGrowth(landNow)
        if (landed > 0) {
          pendingGrowth = { delta: bandDelta - landNow, source: event.kind }
        }
      } else {
        landed = landGrowth(bandDelta)
      }
    }
    if (DRY_OUTCOMES.has(outcome)) dryBeats += 1

    log.push({
      character: event.character,
      kind: event.kind,
      outcome,
      delta: landed,
      tierAfter: tier,
      note: `roll ${roll} @i${intensity}`,
    })
  })

  // ---- Step 7: growth-pressure escalator ----
  growthPressure += PRESSURE_ACCRUAL * dryBeats
  // Overfill couples through growthFactor ALONE (review ruling B1): a neutral
  // fluid (milk, gf 0) saturates quietly and the state converges — only
  // growth-coupled fluids feed the intentional FIL loop, at registry strength.
  if (ticksEnabled && fillPercent >= OVERFILL_FILL_THRESHOLD && profile.growthFactor > 0) {
    growthPressure += OVERFILL_ADD_BASE * profile.growthFactor
  }
  growthPressure = Math.min(growthPressure, PRESSURE_CAP)
  if (grewThisTurn) {
    growthPressure = Math.max(0, growthPressure - PRESSURE_RELEASE)
  } else if (ticksEnabled && growthPressure >= PRESSURE_FIRE && !state.locked && cooldown === 0) {
    // One non-guaranteed pity roll, then reset regardless (fire-once-then-reset).
    const roll = seededRoll(`${seed}:pressure`)
    const outcome = resolveGrowthOutcome(roll, 1)
    const landed = outcome === 'success' || outcome === 'critical' ? landGrowth(1) : 0
    log.push({
      character: characterName,
      kind: 'pressure',
      outcome,
      delta: landed,
      tierAfter: tier,
      note: `pity roll ${roll}`,
    })
    growthPressure = 0
  }

  // ---- Step 8: conditions — derived from POST-tick fill, then classifier merge ----
  // Label matching is case-insensitive throughout (a classifier "engorged" must
  // not duplicate the derived "Engorged"; effectiveSupport lowercases too).
  const sameLabel = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
  if (fillPercent >= ENGORGED_FILL_THRESHOLD) {
    // Front insertion: derived-first must survive the cap slice below even when
    // carried conditions already sit at the limit (review finding S1).
    const engorged: BodyCondition = { label: 'Engorged', ttl: ENGORGED_TTL }
    conditions = [engorged, ...conditions.filter((c) => !sameLabel(c.label, 'Engorged'))]
  }
  if (extras?.softConditions) {
    for (const candidate of extras.softConditions) {
      if (conditions.length >= MAX_BE_CONDITIONS) break
      if (typeof candidate.label !== 'string' || candidate.label.trim() === '') continue
      if (conditions.some((c) => sameLabel(c.label, candidate.label))) continue // derived-first wins
      conditions = [
        ...conditions,
        {
          label: candidate.label,
          ...(candidate.note !== undefined ? { note: candidate.note } : {}),
          // Clamp into [0, 99]: float-huge ttls (1e18 - 1 === 1e18) never decay.
          ...(candidate.ttl !== undefined
            ? { ttl: Math.min(99, Math.max(0, Math.floor(candidate.ttl))) }
            : {}),
        },
      ]
    }
  }
  conditions = conditions.slice(0, MAX_BE_CONDITIONS)

  // ---- Step 9: drift note (one-turn carrier; prior note expired above) ----
  const driftNote =
    extras?.driftFindings && extras.driftFindings.length > 0
      ? { note: extras.driftFindings.map((f) => f.note).join('; ') }
      : undefined

  return {
    state: {
      ...state,
      tier,
      cooldown,
      conditions,
      // fluidType syncs to config (the story settings are authoritative) so the
      // fill tick and the mass/context derivations always agree on the fluid.
      fluids: { ...state.fluids, fillPercent, fluidType: config.fluidType },
      pendingGrowth,
      lastGrowth,
      attitude,
      arousal,
      // Finite-guard: a NaN here would silently nuke the whole persisted record
      // on the next readBodyState (all-or-nothing schema parse).
      growthPressure: Number.isFinite(growthPressure) ? growthPressure : 0,
      driftNote,
    },
    log,
  }
}
