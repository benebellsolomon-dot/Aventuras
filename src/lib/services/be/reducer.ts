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
 *   5. passive fill tick (supply-scaled)
 *   6. events loop (quirk-adjusted, anticipation split; induction activates)
 *   7. lactation: supply adapt + chronic-supply growth roll
 *   8. tracks: bond + exposure/dependence + attitude pull
 *   9. pressure accrual/pity (quirk-scaled)
 *   10. conditions: derive (Engorged @ per-girl threshold, Withdrawal) + classifier merge
 *   11. drift note
 */

import {
  ANTICIPATION_THRESHOLD,
  ENGORGED_TTL,
  GROWTH_DELTA_BY_OUTCOME,
  GUARANTEED_GROWTH_ROLL,
  MAX_BE_CONDITIONS,
  MAX_GROWTH_LAND_PER_TURN,
  MILKING_DRAIN_PER_INTENSITY,
  OVERFILL_ADD_BASE,
  OVERFILL_FILL_THRESHOLD,
  PRESSURE_ACCRUAL,
  PRESSURE_CAP,
  PRESSURE_FIRE,
  PRESSURE_RELEASE,
  SUPPLY_TIER_MAX,
  fluidProfile,
  GROWTH_TRIGGER_BANK_NOTE,
  GROWTH_TRIGGER_BLOCK_NOTE,
} from './constants'
import { growthBankHeadroom } from './preview'
import { clampIntensity, resolveGrowthOutcome, seededRoll } from './roll'
import { capacityMlPerSide, measurements } from './measurements'
import {
  adaptSupply,
  engorgeThreshold,
  milkYieldUnits,
  supplyFillMultiplier,
  supplyLabel,
  tickChronic,
} from './lactation'
import { INTERACTION_MILESTONES } from './milestones'
import { hasQuirk } from './quirks'
import {
  applyExposure,
  applyRelationshipTurn,
  decayDependence,
  dependenceOf,
  relOf,
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
  LactationState,
  ReducerResult,
  GrowthGate,
} from './types'

const GROWTH_KINDS = new Set(['catalyst', 'contact', 'attempt'])

/** Dry outcomes accrue escalator pressure. `ineligible` is deliberately absent —
 * pity-firing growth the story's canon forbids would recreate the research/41 bug.
 * `banked` is absent for the mirror reason: an earned bank is growth deferred by
 * one beat, not a dry beat, and must not also buy a pity roll. */
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
  /**
   * Bond movement this turn (research/60): classifier-proposed events feed the
   * gain-capped sparks/grudge math; spell-authored events carry `potent` and
   * are cap-exempt.
   */
  bondEvents?: ReadonlyArray<BondEvent>
  /** Classifier-proposed catalyst exposure this turn (research/48; gain-capped). */
  exposureEvents?: ReadonlyArray<ExposureEvent>
  /**
   * Engine-authored supply surge from a spell cast this turn (research/50 R2,
   * Phase 4). A positive delta bumps an ACTIVE girl's supplyTier before organic
   * adaptation, clamped to SUPPLY_TIER_MAX; a surge on a non-lactating girl is a
   * logged no-op (surge raises existing supply, it does not induce).
   */
  supplyDelta?: number
  /**
   * Absolute growth rule (research/66): with a story cosmology set, NO growth
   * channel lands unless the classifier reported the driving act completing
   * for her this turn with a quote verified against the narration. Absent =
   * legacy behavior (the kinds gate alone).
   */
  growthGate?: GrowthGate
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
  // Absolute growth rule (research/66): gate on unless a verified trigger names her.
  const triggerBlocked =
    extras?.growthGate?.requireTrigger === true && extras.growthGate.triggered !== true
  // Lactation (research/49): the block materializes ONLY on activation — an
  // untouched girl's state must stay key-identical (R1 neutral passthrough).
  let lactation: LactationState | undefined = state.lactation
  let inducedThisTurn = false
  let milkedThisTurn = false
  let drainedPercent = 0
  let tierAtDrain: number | undefined

  // Quirk flags (research/48 Step 3 hook table; the lactation pair per research/49 R10).
  // pressure_prone is read through engorgeThreshold()/apparentTierBonus() rather
  // than a local, so the sprite and the condition can never disagree.
  const isEarlyBloomer = hasQuirk(state, 'early_bloomer')
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
  // Absolute growth rule (research/66): a bank is growth too — it lands only on a
  // turn where the story's act completed on the page (held silently otherwise).
  if (pendingGrowth && !state.locked && ticksEnabled && !triggerBlocked) {
    const tierBeforeLand = tier
    // M-2 (research/54): meter the release. A slow_burn girl can bank a pending
    // delta > 1 across turns; land at most MAX_GROWTH_LAND_PER_TURN this turn and
    // re-stage the rest so the bank drains at the normal +1/turn cadence instead
    // of dumping +4/+5 at once. Normal anticipation stages ≤1, so this is a no-op
    // for everyone but a slow_burn bank.
    const wantLand = Math.min(pendingGrowth.delta, MAX_GROWTH_LAND_PER_TURN)
    const remainder = pendingGrowth.delta - wantLand
    const landed = landGrowth(wantLand)
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
          ? `anticipation lands +${landed}${slowBurnBonus > 0 ? ` (+${slowBurnBonus} slow burn)` : ''}${remainder > 0 ? ` (+${remainder} re-staged)` : ''}`
          : 'capped out',
    })
    // Re-stage the un-landed remainder for next turn; drop it only if NOTHING
    // landed (size cap hit — otherwise it would re-stage forever at the cap).
    pendingGrowth =
      landed > 0 && remainder > 0 ? { delta: remainder, source: pendingGrowth.source } : undefined
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

  // ---- Step 5: passive fill tick (the FIL loop's intake side, supply-scaled) ----
  if (config.passiveFillEnabled && ticksEnabled && fillPercent < 100) {
    // supplyFillMultiplier reads the PRIOR turn's supply (deterministic, and the
    // natural physics: this beat fills at the supply she woke with). It is
    // EXACTLY 1 for a non-lactating girl — no change to the old arithmetic.
    const tick = profile.fillRate * (1 + profile.growthFactor) * supplyFillMultiplier(state)
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

    if (event.kind === 'induction') {
      // R2: evidence beats intent — the classifier saw her body begin producing,
      // so the engine applies it regardless of what the dice said this turn.
      if (lactation?.active) {
        log.push({
          character: event.character,
          kind: event.kind,
          outcome: 'none',
          delta: 0,
          tierAfter: tier,
          note: 'already lactating',
        })
        return
      }
      // Spread, never replace: the block is `.passthrough()`-persisted, so a
      // wholesale rewrite would drop unknown future fields and the neglect/
      // demand counters a toggled-off block still carries.
      lactation = { ...lactation, active: true, supplyTier: lactation?.supplyTier ?? 0 }
      inducedThisTurn = true
      log.push({
        character: event.character,
        kind: event.kind,
        outcome: 'success',
        delta: 0,
        tierAfter: tier,
        note: 'lactation begins',
      })
      return
    }

    if (event.kind === 'milking') {
      // Drain nets against the observed/ticked fill (FIL inversion is intentional
      // genre physics: full→pressure→growth→capacity→refill — do not "fix" it).
      // The yield rides the ACTUAL diff, 0-floor clamped (risk 4): a drain from
      // 30% yields 30 points of milk, never the nominal 40.
      const fillBefore = fillPercent
      fillPercent = Math.max(0, fillPercent - MILKING_DRAIN_PER_INTENSITY * intensity)
      drainedPercent += fillBefore - fillPercent
      // Price capacity at the tier she had when the FIRST drain happened — a
      // growth event ordered later in this same turn must not inflate the yield.
      if (tierAtDrain === undefined) tierAtDrain = tier
      milkedThisTurn = true
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
    // A verified cosmology trigger IS the canon statement that the act drove
    // growth this turn — it outranks the kinds list (which otherwise stalls a
    // triggered turn whose act the classifier filed as `contact`, research/66).
    const triggerVerified = extras?.growthGate?.requireTrigger === true && !triggerBlocked
    if (
      !triggerVerified &&
      config.growthEligibleKinds &&
      !config.growthEligibleKinds.includes(event.kind)
    ) {
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

    // Absolute growth rule (research/66): no verified cosmology trigger on the
    // page → nothing lands, earned or ambient, and the beat is not "dry" (the
    // story's canon denied it, exactly like an ineligible kind — pity-firing
    // growth the canon forbids is the research/41 bug again). EARNED growth
    // (cast/check — essence paid, dice rolled) BANKS instead of vanishing and
    // lands on the next triggered turn; ambient growth simply never happened.
    if (triggerBlocked && GROWTH_KINDS.has(event.kind)) {
      if (event.guaranteed === true && !state.locked) {
        const bankOutcome = resolveGrowthOutcome(GUARANTEED_GROWTH_ROLL, intensity)
        const bankDelta = GROWTH_DELTA_BY_OUTCOME[bankOutcome] ?? 0
        const staged = Math.min(
          bankDelta,
          growthBankHeadroom(tier, pendingGrowth?.delta ?? 0, config.sizeCapTier),
        )
        if (staged > 0) {
          pendingGrowth = { delta: (pendingGrowth?.delta ?? 0) + staged, source: event.kind }
          log.push({
            character: event.character,
            kind: event.kind,
            outcome: 'banked',
            delta: 0,
            tierAfter: tier,
            note: `cast @i${intensity} (guaranteed) → ${GROWTH_TRIGGER_BANK_NOTE} (+${staged} staged)`,
          })
          return
        }
      }
      log.push({
        character: event.character,
        kind: event.kind,
        outcome: 'ineligible',
        delta: 0,
        tierAfter: tier,
        note: GROWTH_TRIGGER_BLOCK_NOTE,
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

    // The guaranteed marker has to be read BEFORE the cooldown gate now: an
    // earned event resolves that gate differently from an ambient one.
    const guaranteed = event.guaranteed === true

    if (cooldown > 0) {
      // Crit punch-through (user ruling): a CRITICAL check lands now, cooldown
      // or not. Everything below the gate runs unchanged for it — including
      // landGrowth, which re-arms the cooldown from this beat. Only the crit
      // band gets this; the marker is set explicitly upstream, never inferred.
      const pierces = guaranteed && event.critPierce === true
      if (!pierces) {
        if (guaranteed) {
          // EARNED growth on cooldown BANKS instead of vanishing (the live
          // failure: crit → catalyst → cooldown → delta 0 → "crit, no stats
          // again"). The band-scaled delta stages into the SAME pendingGrowth
          // carrier slow_burn uses, so step 3 meters it out at
          // MAX_GROWTH_LAND_PER_TURN as the cooldown clears — no new machinery,
          // no way to dump it all at once.
          const bankOutcome = resolveGrowthOutcome(GUARANTEED_GROWTH_ROLL, intensity)
          const bankDelta = GROWTH_DELTA_BY_OUTCOME[bankOutcome] ?? 0
          // The cap wins over the bank: never stage growth she could not have
          // landed anyway (already-staged delta counts against the headroom).
          const staged = Math.min(
            bankDelta,
            growthBankHeadroom(tier, pendingGrowth?.delta ?? 0, config.sizeCapTier),
          )
          if (staged > 0) {
            pendingGrowth = { delta: (pendingGrowth?.delta ?? 0) + staged, source: event.kind }
            // NOT a dry beat: an earned bank is growth deferred, not growth
            // denied, so it must not ALSO accrue pity pressure toward a second
            // free roll. (Ambient cooldown beats keep accruing it — that is
            // what the escalator is for.)
            log.push({
              character: event.character,
              kind: event.kind,
              outcome: 'banked',
              delta: 0,
              tierAfter: tier,
              note: `cast @i${intensity} (guaranteed) → banked (+${staged} staged, lands as the cooldown clears)`,
            })
          } else {
            // At the story's size ceiling: there is nothing to bank, so this
            // degrades to exactly today's cooldown drop.
            dryBeats += 1
            log.push({
              character: event.character,
              kind: event.kind,
              outcome: 'cooldown',
              delta: 0,
              tierAfter: tier,
              note: 'at the size cap — nothing to bank',
            })
          }
          return
        }
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
    }

    // A cast-originated growth event does NOT roll: the successful RPG check was
    // already the dice, and the narrator saw that band before this reducer ran —
    // a second hidden d20 here is how "successful roll, no stats" happened. Every
    // other gate above and below still binds (eligibility, lock, cooldown, the
    // land cap, the size cap, slow-burn staging).
    //
    // Skipped, not consumed-and-ignored: seededRoll is keyed per event as
    // `${seed}:${index}` — a pure hash, not a sequential stream — so not calling
    // it cannot shift any co-occurring ambient event's outcome. Index positions
    // are untouched (nothing is removed from `events`), so ambient replay is
    // byte-identical.
    const roll = guaranteed ? GUARANTEED_GROWTH_ROLL : seededRoll(`${seed}:${index}`)
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
      note: `${guaranteed ? `cast @i${intensity} (guaranteed)` : `roll ${roll} @i${intensity}`}${isSlowBurn && bandDelta > 0 ? ' (slow burn: staged)' : ''}`,
    })
  })

  // ---- Step 7: lactation — supply surge (Phase 4) + adapt + chronic growth (research/49 R3/R5, research/50 R2) ----
  // Magical supply surge first: an explicit spell push applied before organic
  // adaptation. It raises EXISTING supply only (a surge does not induce), clamped
  // to SUPPLY_TIER_MAX; a surge on a non-lactating girl is a logged no-op.
  const supplyDelta = Math.max(0, Math.floor(extras?.supplyDelta ?? 0))
  if (supplyDelta > 0) {
    if (lactation?.active) {
      const before = lactation.supplyTier
      const after = Math.min(SUPPLY_TIER_MAX, before + supplyDelta)
      if (after !== before) {
        lactation = { ...lactation, supplyTier: after }
        log.push({
          character: characterName,
          kind: 'supply',
          outcome: 'none',
          delta: 0,
          tierAfter: tier,
          note: `supply surge → ${supplyLabel(after)}`,
        })
      } else {
        log.push({
          character: characterName,
          kind: 'supply',
          outcome: 'none',
          delta: 0,
          tierAfter: tier,
          note: 'supply surge (already at max supply)',
        })
      }
    } else {
      log.push({
        character: characterName,
        kind: 'supply',
        outcome: 'none',
        delta: 0,
        tierAfter: tier,
        note: 'supply surge ignored (not lactating)',
      })
    }
  }

  // The turn she is induced is not also a neglect beat: adaptation starts next turn.
  let milkYield: { units: number; drainedPercent: number } | undefined
  if (lactation?.active && !inducedThisTurn) {
    const adapt = adaptSupply(lactation, milkedThisTurn, ticksEnabled, isEarlyBloomer)
    lactation = adapt.next
    if (adapt.raised || adapt.eased) {
      log.push({
        character: characterName,
        kind: 'supply',
        outcome: 'none',
        delta: 0,
        tierAfter: tier,
        note: `supply → ${supplyLabel(lactation.supplyTier)}`,
      })
    }

    const chronic = tickChronic(lactation, ticksEnabled)
    lactation = chronic.next
    if (chronic.fires) {
      // Fire-once-then-reset behind the SAME wall as the pity fire — but the
      // counter stays BANKED at the threshold (tickChronic pins it) until the
      // roll actually happens. Resetting on a blocked fire permanently starved
      // the axis in stories where every growth arms a fresh cooldown.
      if (state.locked) {
        log.push({
          character: characterName,
          kind: 'supply',
          outcome: 'muzzled',
          delta: 0,
          tierAfter: tier,
          note: 'chronic supply blocked (locked)',
        })
      } else if (cooldown > 0) {
        log.push({
          character: characterName,
          kind: 'supply',
          outcome: 'cooldown',
          delta: 0,
          tierAfter: tier,
          note: 'chronic supply blocked (cooldown)',
        })
      } else if (triggerBlocked) {
        // Absolute growth rule: held silently, not reset — the beats stay
        // banked (tickChronic pins them at the threshold) and roll on the next
        // triggered turn. No log row: it would repeat every turn (review F8/D4).
      } else {
        const roll = seededRoll(`${seed}:chronic`)
        const outcome = resolveGrowthOutcome(roll, 1)
        const landed = outcome === 'success' || outcome === 'critical' ? landGrowth(1) : 0
        // The roll happened — spend the banked counter (fire-once-then-reset).
        lactation = { ...lactation, chronicBeats: 0 }
        log.push({
          character: characterName,
          kind: 'supply',
          outcome,
          delta: landed,
          tierAfter: tier,
          note: `chronic supply roll ${roll}`,
        })
      }
    }
  }

  // Milk yield (R7 creation input): the store turns this into an inventory item;
  // the reducer only owns the arithmetic, where the drain diff lives.
  if (lactation?.active && drainedPercent > 0) {
    if (inducedThisTurn) {
      // Her milk only came in THIS turn — the fluid the drain emptied was the
      // pre-induction fill, so there is nothing to bottle yet. Milk bottles
      // only when she was already producing at the turn's start.
      log.push({
        character: characterName,
        kind: 'yield',
        outcome: 'none',
        delta: 0,
        tierAfter: tier,
        note: `induction turn — the ${Math.round(drainedPercent)}% expressed was pre-induction ${config.fluidType}, nothing to bottle`,
      })
    } else {
      const units = milkYieldUnits(drainedPercent, 2 * capacityMlPerSide(tierAtDrain ?? tier))
      if (units > 0) {
        milkYield = { units, drainedPercent }
      } else {
        log.push({
          character: characterName,
          kind: 'yield',
          outcome: 'none',
          delta: 0,
          tierAfter: tier,
          note: `sub-unit expression (${Math.round(drainedPercent)}% drained) — nothing to bottle`,
        })
      }
    }
  }

  // ---- Step 8: harem tracks — relationship, exposure/dependence, attitude pull ----
  // Track fields materialize only when something moves them (research/48 risk 7:
  // no eager default writes; read-through defaults live in tracks.ts).
  // The relationship engine (research/60) runs only while ACTIVE — events this
  // turn, or accumulators still draining — so an untouched girl stays
  // key-identical, a legacy `bond` converts exactly once (on her first active
  // turn), and the cadence counter never write-amplifies idle girls.
  let rel = state.rel
  let dependence = state.dependence
  let beatsSinceExposure = state.beatsSinceExposure
  const bondEvents = extras?.bondEvents ?? []
  const exposureEvents = extras?.exposureEvents ?? []

  const relActive =
    bondEvents.length > 0 ||
    (state.rel !== undefined && (state.rel.sparks > 0 || state.rel.grudge > 0))
  if (relActive) {
    const before = relOf(state)
    // devoted_heart: +1 spark per warm event, folded in BEFORE the cap binds.
    const result = applyRelationshipTurn(before, bondEvents, {
      ticks: ticksEnabled,
      devotedHeart: isDevotedHeart,
    })
    const moved =
      state.rel === undefined ||
      result.bondDelta !== 0 ||
      result.sparksDelta !== 0 ||
      result.grudgeDelta !== 0 ||
      result.rel.ct !== before.ct ||
      result.rel.warmed !== before.warmed
    if (moved) rel = result.rel
    const parts: string[] = []
    if (result.sparksDelta !== 0)
      parts.push(
        `sparks ${result.sparksDelta > 0 ? '+' : ''}${result.sparksDelta} → ${result.rel.sparks}`,
      )
    if (result.grudgeDelta !== 0)
      parts.push(
        `grudge ${result.grudgeDelta > 0 ? '+' : ''}${result.grudgeDelta} → ${result.rel.grudge}`,
      )
    if (result.bondDelta !== 0)
      parts.push(`bond ${result.bondDelta > 0 ? '+' : ''}${result.bondDelta} → ${result.rel.bond}`)
    for (const conversion of result.conversions) {
      if (conversion === 'sparks') parts.push('sparks converted')
      if (conversion === 'grudge') parts.push('grudge boiled over')
      if (conversion === 'stalled') parts.push('conversion stalled by grudge')
    }
    if (result.capped) parts.push('gain-capped')
    if (parts.length > 0) {
      log.push({
        character: characterName,
        kind: 'bond',
        outcome: 'none',
        delta: 0,
        tierAfter: tier,
        note: parts.join(' | '),
      })
    }
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

  // ---- Step 9: growth-pressure escalator (greedy_flesh accrues faster) ----
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
  } else if (
    ticksEnabled &&
    growthPressure >= PRESSURE_FIRE &&
    !state.locked &&
    cooldown === 0 &&
    triggerBlocked
  ) {
    // Absolute growth rule: pressure holds at the wall (capped) until a
    // triggered turn — silently, or the row would repeat every turn (review).
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

  // ---- Step 10: conditions — derived from POST-tick fill/tracks, then classifier merge ----
  // Label matching is case-insensitive throughout (a classifier "engorged" must
  // not duplicate the derived "Engorged"; effectiveSupport lowercases too).
  const sameLabel = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
  // Per-girl threshold (R6): pressure_prone engorges early. sprite.ts reads the
  // same function so the rendered cell and the condition can never disagree.
  if (fillPercent >= engorgeThreshold(state)) {
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

  // ---- Step 11: drift note (one-turn carrier; prior note expired above) ----
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
      // Legacy `bond` passes through via ...state untouched; `rel` is
      // authoritative once present (research/60).
      ...(rel !== undefined ? { rel } : {}),
      ...(dependence !== undefined ? { dependence } : {}),
      ...(beatsSinceExposure !== undefined ? { beatsSinceExposure } : {}),
      // Same conditional-spread contract: the lactation block appears only when
      // it already existed or was created this turn (research/49 R1).
      ...(lactation !== undefined ? { lactation } : {}),
    },
    log,
    ...(milkYield !== undefined ? { milkYield } : {}),
  }
}
