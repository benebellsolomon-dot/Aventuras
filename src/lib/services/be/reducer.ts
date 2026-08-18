/**
 * BE engine — the deterministic reducer (D3: events → state; the single writer).
 *
 * The ONLY code path that may mutate bodyState. Its one production caller is
 * StoryStore.applyBeEvents(); everything here is pure and immutable — same
 * inputs (state, events, config, seed, extras) → same outputs, which is what
 * keeps retries/undo replay-safe. No Date.now, no Math.random.
 *
 * Pinned pipeline order (Spec 1 + research/48 — each step reads the prior
 * step's output; auto-conditions MUST read post-tick fill or Engorged lags):
 *   1. decay conditions          2. cooldown tick
 *   3. land pendingGrowth        4. apply softState
 *   5. passive fill tick         6. events loop (quirk-adjusted, anticipation split)
 *   7. tracks: bond + exposure/dependence + attitude pull
 *   8. pressure accrual/pity (quirk-scaled)
 *   9. conditions: derive (Engorged, Withdrawal) + classifier merge
 *   10. drift note
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
import { measurements } from './measurements'
import { INTERACTION_MILESTONES } from './milestones'
import { hasQuirk } from './quirks'
import {
  applyBondEvents,
  applyExposure,
  bondOf,
  decayDependence,
  dependenceOf,
  withdrawalCondition,
} from './tracks'
import { CRAVING_PULL_DEPENDENCE } from './constants'

// Re-export: pre-extraction callers (and tests) import seededRoll from here.
export { seededRoll } from './roll'
import type {
  BeEvent,
  BeLogRecord,
  BeSoftState,
  BeStoryConfig,
  BodyCondition,
  BodyState,
  BondEvent,
  DriftFinding,
  ExposureEvent,
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
  /** Classifier-proposed bond movement this turn (research/48; velocity-capped). */
  bondEvents?: ReadonlyArray<BondEvent>
  /** Classifier-proposed catalyst exposure this turn (research/48; gain-capped). */
  exposureEvents?: ReadonlyArray<ExposureEvent>
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

  // Quirk flags (research/48 Step 3 hook table). Phase-3 quirks (early_bloomer,
  // pressure_prone) are deliberately never read here — data-only until the
  // lactation axis lands (R10).
  const isFastMetabolizer = hasQuirk(state, 'fast_metabolizer')
  const isSlowBurn = hasQuirk(state, 'slow_burn')
  const isGreedyFlesh = hasQuirk(state, 'greedy_flesh')
  const isStubbornFrame = hasQuirk(state, 'stubborn_frame')
  const isDevotedHeart = hasQuirk(state, 'devoted_heart')
  const isNeedyNipples = hasQuirk(state, 'needy_nipples')

  /** Land growth (cap-clamped): merges into lastGrowth, arms cooldown. Returns the landed delta. */
  const landGrowth = (want: number): number => {
    let delta = want
    if (config.sizeCapTier !== null) {
      delta = Math.min(delta, Math.max(0, config.sizeCapTier - tier))
    }
    // stubborn_frame's "tier never drifts down" is a forward guard — no negative
    // path exists today; the <= 0 return below already enforces it for everyone.
    if (delta <= 0) return 0
    lastGrowth = lastGrowth
      ? { delta: lastGrowth.delta + delta, tierBefore: lastGrowth.tierBefore }
      : { delta, tierBefore: tier }
    tier += delta
    // greedy_flesh: her body recovers a beat faster.
    cooldown = Math.max(0, Math.floor(config.growthCooldownBeats) - (isGreedyFlesh ? 1 : 0))
    grewThisTurn = true
    return delta
  }

  /** Quirk-adjusted event intensity (fast_metabolizer +1 on catalyst; stubborn_frame −1). */
  const adjustedIntensity = (event: BeEvent): number => {
    let value = clampIntensity(event.intensity)
    if (isFastMetabolizer && event.kind === 'catalyst') value += 1
    if (isStubbornFrame) value -= 1
    return clampIntensity(value)
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
    const tierBeforeLand = tier
    const landed = landGrowth(pendingGrowth.delta)
    // slow_burn: her delayed growth lingers — when the land crosses an
    // interaction milestone, it settles one tier deeper (research/48 hook table).
    let slowBurnBonus = 0
    if (isSlowBurn && landed > 0) {
      const massBefore = measurements({ ...state, tier: tierBeforeLand }).nowTotalKg
      const massAfter = measurements({ ...state, tier }).nowTotalKg
      const crossed = INTERACTION_MILESTONES.some(
        (m) => massBefore < m.massKg && massAfter >= m.massKg,
      )
      if (crossed) slowBurnBonus = landGrowth(1)
    }
    log.push({
      character: characterName,
      kind: 'pending',
      outcome: landed > 0 ? 'success' : 'none',
      delta: landed + slowBurnBonus,
      tierAfter: tier,
      note:
        landed > 0
          ? `anticipation lands +${landed}${slowBurnBonus > 0 ? ` (+${slowBurnBonus} slow burn)` : ''}`
          : 'capped out',
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
      // needy_nipples: arousal climbs faster — but ONLY upward; a scene that
      // calms her still calms her.
      const proposed = Math.round(clampPercent(softState.arousal))
      const rising = proposed > (arousal ?? 0)
      const next = rising && isNeedyNipples ? Math.round(clampPercent(proposed + 10)) : proposed
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

  // ---- Step 6: events (quirk-adjusted roll → capped delta, anticipation split) ----
  events.forEach((event, index) => {
    const intensity = adjustedIntensity(event)

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
      if (isSlowBurn) {
        // slow_burn: nothing lands now — the WHOLE delta stages for next
        // turn's step 3, where the milestone-crossing bonus may deepen it.
        // ACCUMULATE within the turn: a second growth event must not silently
        // drop the first event's staged delta (prior turn's pending already
        // landed and cleared at step 3, so this only ever sums this turn).
        pendingGrowth = { delta: (pendingGrowth?.delta ?? 0) + bandDelta, source: event.kind }
      } else if (bandDelta >= ANTICIPATION_THRESHOLD) {
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
      note: `roll ${roll} @i${intensity}${isSlowBurn && bandDelta > 0 ? ' (slow burn: staged)' : ''}`,
    })
  })

  // ---- Step 7: harem tracks — bond, exposure/dependence, attitude pull ----
  // Track fields materialize only when something moves them (research/48 risk 7:
  // no eager default writes; read-through defaults live in tracks.ts).
  let bond = state.bond
  let dependence = state.dependence
  let beatsSinceExposure = state.beatsSinceExposure
  const bondEvents = extras?.bondEvents ?? []
  const exposureEvents = extras?.exposureEvents ?? []

  if (bondEvents.length > 0) {
    // devoted_heart: +1 per event, folded in BEFORE the velocity cap binds.
    const result = applyBondEvents(bondOf(state), bondEvents, isDevotedHeart ? 1 : 0)
    if (result.delta !== 0) bond = result.value
    log.push({
      character: characterName,
      kind: 'bond',
      outcome: 'none',
      delta: 0,
      tierAfter: tier,
      note: `${result.delta >= 0 ? '+' : ''}${result.delta} → ${result.value}${result.capped ? ' (velocity-capped)' : ''}`,
    })
  }

  if (exposureEvents.length > 0) {
    const result = applyExposure(dependenceOf(state), exposureEvents)
    if (result.delta !== 0) dependence = result.value
    beatsSinceExposure = 0
    log.push({
      character: characterName,
      kind: 'exposure',
      outcome: 'none',
      delta: 0,
      tierAfter: tier,
      note: `+${result.delta} → ${result.value}${result.capped ? ' (gain-capped)' : ''}`,
    })
  } else if (ticksEnabled && dependenceOf(state) > 0) {
    // Idle beat: decay + the withdrawal clock. The dependence > 0 guard is
    // load-bearing — without it every untouched girl gets a write per turn
    // (research/48 risk 4).
    const decayed = decayDependence(dependenceOf(state))
    if (decayed !== dependenceOf(state)) dependence = decayed
    beatsSinceExposure = (state.beatsSinceExposure ?? 0) + 1
  }

  // Craving pull: heavy dependence colors an attitude-less turn. An explicit
  // classifier attitude always wins.
  const effectiveDependence = dependence ?? dependenceOf(state)
  if (
    effectiveDependence >= CRAVING_PULL_DEPENDENCE &&
    !softState?.attitude &&
    attitude !== 'craving'
  ) {
    attitude = 'craving'
    log.push({
      character: characterName,
      kind: 'mood',
      outcome: 'none',
      delta: 0,
      tierAfter: tier,
      note: 'attitude→craving (dependence pull)',
    })
  }

  // ---- Step 8: growth-pressure escalator (greedy_flesh accrues faster) ----
  growthPressure += PRESSURE_ACCRUAL * (isGreedyFlesh ? 1.5 : 1) * dryBeats
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

  // ---- Step 9: conditions — derived from POST-tick fill/tracks, then classifier merge ----
  // Label matching is case-insensitive throughout (a classifier "engorged" must
  // not duplicate the derived "Engorged"; effectiveSupport lowercases too).
  const sameLabel = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
  if (fillPercent >= ENGORGED_FILL_THRESHOLD) {
    // Front insertion: derived-first must survive the cap slice below even when
    // carried conditions already sit at the limit (review finding S1).
    const engorged: BodyCondition = { label: 'Engorged', ttl: ENGORGED_TTL }
    conditions = [engorged, ...conditions.filter((c) => !sameLabel(c.label, 'Engorged'))]
  }
  // Withdrawal (research/48 R8): front-inserted like Engorged so the cap slice
  // can never evict it; re-upserted every turn the condition holds.
  // (The local is initialized from state, so a single ?? 0 covers the unset case.)
  const withdrawal = withdrawalCondition(
    effectiveDependence,
    beatsSinceExposure ?? 0,
    isDevotedHeart,
  )
  if (withdrawal) {
    const isNew = !conditions.some((c) => sameLabel(c.label, 'Withdrawal'))
    conditions = [withdrawal, ...conditions.filter((c) => !sameLabel(c.label, 'Withdrawal'))]
    if (isNew) {
      log.push({
        character: characterName,
        kind: 'withdrawal',
        outcome: 'none',
        delta: 0,
        tierAfter: tier,
        note: `dependence ${effectiveDependence}, ${beatsSinceExposure ?? 0} beats without exposure`,
      })
    }
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

  // ---- Step 10: drift note (one-turn carrier; prior note expired above) ----
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
      // Track fields spread conditionally: an untouched girl's state stays
      // key-identical (the store's stringify no-op-write skip depends on it).
      ...(bond !== undefined ? { bond } : {}),
      ...(dependence !== undefined ? { dependence } : {}),
      ...(beatsSinceExposure !== undefined ? { beatsSinceExposure } : {}),
    },
    log,
  }
}
