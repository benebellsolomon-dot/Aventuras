/**
 * Phase 3 reducer integration (research/49 Step 2): the new step 7 (supply adapt
 * + chronic-supply growth roll), the supply-scaled fill tick, induction
 * activation, the per-girl engorge threshold, and milkYield.
 */
import { describe, expect, it } from 'vitest'

import {
  CHRONIC_SUPPLY_BEATS,
  CHRONIC_SUPPLY_TIER,
  DEFAULT_BE_STORY_CONFIG,
  ENGORGED_FILL_THRESHOLD,
  ENGORGED_FILL_THRESHOLD_PRESSURE_PRONE,
  MILKING_DRAIN_PER_INTENSITY,
  SUPPLY_ADAPT_UP_BEATS,
  SUPPLY_EASE_IDLE_BEATS,
  SUPPLY_FILL_RATE_BONUS,
} from './constants'
import { capacityMlPerSide } from './measurements'
import { defaultBodyState } from './metadata'
import { milkYieldUnits } from './lactation'
import { reduceCharacterBody, seededRoll } from './reducer'
import { resolveGrowthOutcome } from './roll'
import type { BeEvent, BeStoryConfig, BodyState, LactationState } from './types'

const CONFIG: BeStoryConfig = {
  ...DEFAULT_BE_STORY_CONFIG,
  enabled: true,
  passiveFillEnabled: false,
}
const TICK: BeStoryConfig = { ...CONFIG, passiveFillEnabled: true }

const induction = (): BeEvent => ({ character: 'Mira', kind: 'induction', intensity: 1 })
const milking = (intensity = 1): BeEvent => ({ character: 'Mira', kind: 'milking', intensity })
const catalyst = (intensity = 2): BeEvent => ({ character: 'Mira', kind: 'catalyst', intensity })

const lactating = (overrides: Partial<LactationState> = {}): LactationState => ({
  active: true,
  supplyTier: 0,
  ...overrides,
})

const stateWith = (overrides: Partial<BodyState> = {}): BodyState => ({
  ...defaultBodyState(10),
  ...overrides,
})

/** Seed whose CHRONIC roll satisfies the predicate. */
function chronicSeedFor(predicate: (roll: number) => boolean): string {
  for (let i = 0; i < 10_000; i++) {
    const seed = `lact-${i}`
    if (predicate(seededRoll(`${seed}:chronic`))) return seed
  }
  throw new Error('no chronic seed found')
}

// ---- Risk 1: the neutral-passthrough contract, asserted before anything else ----

describe('neutral passthrough (research/49 risk 1)', () => {
  it('no lactation key + no induction event → byte-identical output, key order included', () => {
    const state = stateWith({ fluids: { fillPercent: 40, fluidType: 'milk' } })
    const seed = 'neutral'
    const events = [catalyst(2), milking(1)]
    const result = reduceCharacterBody(state, events, TICK, seed, 'Mira')

    expect(result.state).not.toHaveProperty('lactation')
    expect(result.milkYield).toBeUndefined()
    expect(result.log.every((r) => !['induction', 'supply', 'yield'].includes(r.kind))).toBe(true)
    // Keys AND their order are the guard: any unconditional lactation write
    // rewrites every character's metadata on the first Phase-3 turn.
    expect(Object.keys(result.state)).toEqual([
      'tier',
      'shape',
      'fluids',
      'conditions',
      'locked',
      'cooldown',
      'pendingGrowth',
      'lastGrowth',
      'attitude',
      'arousal',
      'growthPressure',
      'driftNote',
    ])
    expect(JSON.stringify(result.state)).not.toContain('lactation')
  })

  it('a milking event on a non-lactating girl drains but yields nothing', () => {
    const result = reduceCharacterBody(
      stateWith({ fluids: { fillPercent: 90, fluidType: 'milk' } }),
      [milking(1)],
      CONFIG,
      's',
      'Mira',
    )
    expect(result.state.fluids.fillPercent).toBe(90 - MILKING_DRAIN_PER_INTENSITY)
    expect(result.milkYield).toBeUndefined()
    expect(result.state.lactation).toBeUndefined()
  })
})

// ---- Step 6: induction ----

describe('step 6 — induction activates (R2)', () => {
  it('the first induction event activates at supply tier 0 and logs it', () => {
    const result = reduceCharacterBody(stateWith(), [induction()], CONFIG, 's', 'Mira')
    expect(result.state.lactation).toEqual({ active: true, supplyTier: 0 })
    const row = result.log.find((r) => r.kind === 'induction')
    expect(row?.outcome).toBe('success')
  })

  it('a repeat induction while active is a logged no-op', () => {
    const state = stateWith({ lactation: lactating({ supplyTier: 2, demandBeats: 1 }) })
    const result = reduceCharacterBody(state, [induction()], CONFIG, 's', 'Mira')
    expect(result.state.lactation?.supplyTier).toBe(2)
    const row = result.log.find((r) => r.kind === 'induction')
    expect(row?.outcome).toBe('none')
    expect(row?.note).toContain('already lactating')
  })

  it('induction on a toggled-off block re-activates it WITHOUT destroying its fields', () => {
    // Review fix 2: the block is `.passthrough()`-persisted — a wholesale
    // replace drops counters and any unknown field a newer build wrote.
    const state = stateWith({
      lactation: {
        ...lactating({ active: false, supplyTier: 2, demandBeats: 3 }),
        futureField: 'keep me',
      } as never,
    })
    const result = reduceCharacterBody(state, [induction()], CONFIG, 's', 'Mira')
    expect(result.state.lactation).toEqual({
      active: true,
      supplyTier: 2,
      demandBeats: 3,
      futureField: 'keep me',
    })
  })

  it('induction never touches tier, cooldown, or pressure', () => {
    const before = stateWith()
    const result = reduceCharacterBody(before, [induction()], CONFIG, 's', 'Mira')
    expect(result.state.tier).toBe(before.tier)
    expect(result.state.cooldown).toBe(0)
    expect(result.state.lastGrowth).toBeUndefined()
  })
})

// ---- Step 5: supply-scaled fill tick ----

describe('step 5 — the fill tick scales with supply (R4)', () => {
  it('each supply tier multiplies the milk tick by 1 + tier × bonus', () => {
    for (let tier = 0; tier <= 3; tier++) {
      const { state } = reduceCharacterBody(
        stateWith({
          fluids: { fillPercent: 0, fluidType: 'milk' },
          lactation: lactating({ supplyTier: tier }),
        }),
        [],
        TICK,
        's',
        'Mira',
      )
      expect(state.fluids.fillPercent).toBeCloseTo(8 * (1 + tier * SUPPLY_FILL_RATE_BONUS), 6)
    }
  })

  it('reads the PRIOR turn supply tier — a raise this turn does not retro-scale the tick', () => {
    const { state } = reduceCharacterBody(
      stateWith({
        fluids: { fillPercent: 60, fluidType: 'milk' },
        lactation: lactating({ supplyTier: 0, demandBeats: SUPPLY_ADAPT_UP_BEATS - 1 }),
      }),
      [milking(1)],
      TICK,
      's',
      'Mira',
    )
    expect(state.lactation?.supplyTier).toBe(1) // raised this turn…
    expect(state.fluids.fillPercent).toBe(28) // …but the tick used tier 0: 60 + 8 - 40
  })

  it('an inactive block leaves the tick exactly unscaled', () => {
    const { state } = reduceCharacterBody(
      stateWith({
        fluids: { fillPercent: 0, fluidType: 'milk' },
        lactation: lactating({ active: false, supplyTier: 3 }),
      }),
      [],
      TICK,
      's',
      'Mira',
    )
    expect(state.fluids.fillPercent).toBe(8)
  })
})

// ---- Step 7: supply adaptation ----

describe('step 7 — supply adapts to demand and neglect (R3)', () => {
  it('consecutive milked beats raise supply at the threshold and log it', () => {
    let state = stateWith({
      fluids: { fillPercent: 100, fluidType: 'milk' },
      lactation: lactating(),
    })
    for (let beat = 1; beat < SUPPLY_ADAPT_UP_BEATS; beat++) {
      const step = reduceCharacterBody(state, [milking(1)], CONFIG, 's', 'Mira')
      expect(step.state.lactation?.supplyTier).toBe(0)
      state = { ...step.state, fluids: { fillPercent: 100, fluidType: 'milk' } }
    }
    const raised = reduceCharacterBody(state, [milking(1)], CONFIG, 's', 'Mira')
    expect(raised.state.lactation?.supplyTier).toBe(1)
    expect(raised.log.find((r) => r.kind === 'supply')?.note).toContain('steady')
  })

  it('early_bloomer halves the adapt-up threshold', () => {
    const result = reduceCharacterBody(
      stateWith({
        fluids: { fillPercent: 100, fluidType: 'milk' },
        quirks: ['early_bloomer'],
        lactation: lactating(),
      }),
      [milking(1)],
      CONFIG,
      's',
      'Mira',
    )
    expect(result.state.lactation?.supplyTier).toBe(1)
  })

  it('idle beats ease supply back down', () => {
    let state = stateWith({ lactation: lactating({ supplyTier: 1 }) })
    for (let beat = 1; beat < SUPPLY_EASE_IDLE_BEATS; beat++) {
      state = reduceCharacterBody(state, [], CONFIG, 's', 'Mira').state
      expect(state.lactation?.supplyTier).toBe(1)
    }
    const eased = reduceCharacterBody(state, [], CONFIG, 's', 'Mira')
    expect(eased.state.lactation?.supplyTier).toBe(0)
    expect(eased.log.find((r) => r.kind === 'supply')?.note).toContain('light')
  })

  it('off-screen beats hold the neglect clock', () => {
    let state = stateWith({ lactation: lactating({ supplyTier: 1 }) })
    for (let beat = 0; beat < SUPPLY_EASE_IDLE_BEATS * 2; beat++) {
      state = reduceCharacterBody(state, [], CONFIG, 's', 'Mira', undefined, {
        ticksEnabled: false,
      }).state
    }
    expect(state.lactation?.supplyTier).toBe(1)
    expect(state.lactation?.beatsSinceMilked ?? 0).toBe(0)
  })
})

// ---- Step 7: chronic-supply growth ----

describe('step 7 — chronic supply proposes growth through landGrowth (R5)', () => {
  const chronicState = (overrides: Partial<BodyState> = {}): BodyState =>
    stateWith({
      lactation: lactating({
        supplyTier: CHRONIC_SUPPLY_TIER,
        chronicBeats: CHRONIC_SUPPLY_BEATS - 1,
      }),
      ...overrides,
    })

  it('fires at the beat threshold, lands +1 on a success, and resets the counter', () => {
    const seed = chronicSeedFor((r) => resolveGrowthOutcome(r, 1) === 'success')
    const result = reduceCharacterBody(chronicState(), [], CONFIG, seed, 'Mira')
    expect(result.state.tier).toBe(11)
    expect(result.state.lactation?.chronicBeats).toBe(0)
    const row = result.log.find((r) => r.kind === 'supply' && r.note?.includes('chronic'))
    expect(row?.delta).toBe(1)
  })

  it('a failed chronic roll still resets (fire-once-then-reset)', () => {
    const seed = chronicSeedFor((r) => resolveGrowthOutcome(r, 1) === 'fail')
    const result = reduceCharacterBody(chronicState(), [], CONFIG, seed, 'Mira')
    expect(result.state.tier).toBe(10)
    expect(result.state.lactation?.chronicBeats).toBe(0)
  })

  it('the lock blocks it', () => {
    const seed = chronicSeedFor((r) => resolveGrowthOutcome(r, 1) === 'critical')
    const result = reduceCharacterBody(chronicState({ locked: true }), [], CONFIG, seed, 'Mira')
    expect(result.state.tier).toBe(10)
    expect(
      result.log.find((r) => r.kind === 'supply' && r.note?.includes('chronic'))?.outcome,
    ).toBe('muzzled')
  })

  it('an active cooldown blocks it', () => {
    const seed = chronicSeedFor((r) => resolveGrowthOutcome(r, 1) === 'critical')
    const result = reduceCharacterBody(chronicState({ cooldown: 3 }), [], CONFIG, seed, 'Mira')
    expect(result.state.tier).toBe(10)
    expect(
      result.log.find((r) => r.kind === 'supply' && r.note?.includes('chronic'))?.outcome,
    ).toBe('cooldown')
  })

  it('the story size cap clamps it to nothing', () => {
    const seed = chronicSeedFor((r) => resolveGrowthOutcome(r, 1) === 'critical')
    const result = reduceCharacterBody(
      chronicState(),
      [],
      { ...CONFIG, sizeCapTier: 10 },
      seed,
      'Mira',
    )
    expect(result.state.tier).toBe(10)
  })

  it('off-screen holds the counter entirely', () => {
    const seed = chronicSeedFor((r) => resolveGrowthOutcome(r, 1) === 'critical')
    const result = reduceCharacterBody(chronicState(), [], CONFIG, seed, 'Mira', undefined, {
      ticksEnabled: false,
    })
    expect(result.state.tier).toBe(10)
    expect(result.state.lactation?.chronicBeats).toBe(CHRONIC_SUPPLY_BEATS - 1)
  })

  it('a fire the lock blocks stays BANKED and lands the beat the lock lifts (review fix 4)', () => {
    const seed = chronicSeedFor((r) => resolveGrowthOutcome(r, 1) === 'critical')
    const blocked = reduceCharacterBody(chronicState({ locked: true }), [], CONFIG, seed, 'Mira')
    expect(blocked.state.tier).toBe(10)
    expect(blocked.state.lactation?.chronicBeats).toBe(CHRONIC_SUPPLY_BEATS)

    const freed = reduceCharacterBody({ ...blocked.state, locked: false }, [], CONFIG, seed, 'Mira')
    expect(freed.state.tier).toBe(11)
    expect(freed.state.lactation?.chronicBeats).toBe(0)
  })

  it('a fire a cooldown blocks stays banked too — frequent growth must not starve the axis', () => {
    const seed = chronicSeedFor((r) => resolveGrowthOutcome(r, 1) === 'critical')
    const blocked = reduceCharacterBody(chronicState({ cooldown: 2 }), [], CONFIG, seed, 'Mira')
    expect(blocked.state.lactation?.chronicBeats).toBe(CHRONIC_SUPPLY_BEATS)
    // The cooldown ticked 2 → 1 on that turn and 1 → 0 on this one, so the
    // banked fire finally resolves.
    const next = reduceCharacterBody(blocked.state, [], CONFIG, seed, 'Mira')
    expect(next.state.tier).toBe(11)
    expect(next.state.lactation?.chronicBeats).toBe(0)
  })

  it('supply below the chronic tier resets the counter instead of accumulating', () => {
    const result = reduceCharacterBody(
      stateWith({
        lactation: lactating({ supplyTier: CHRONIC_SUPPLY_TIER - 1, chronicBeats: 4 }),
      }),
      [],
      CONFIG,
      's',
      'Mira',
    )
    expect(result.state.lactation?.chronicBeats).toBe(0)
  })
})

// ---- Step 10: per-girl engorge threshold ----

describe('step 10 — the engorge threshold is per-girl (R6)', () => {
  const fillBetween = Math.floor(
    (ENGORGED_FILL_THRESHOLD_PRESSURE_PRONE + ENGORGED_FILL_THRESHOLD) / 2,
  )
  const hasEngorged = (state: BodyState): boolean =>
    state.conditions.some((c) => c.label === 'Engorged')

  it('a plain girl is not Engorged below 75; pressure_prone is, at the same fill', () => {
    const plain = reduceCharacterBody(
      stateWith({ fluids: { fillPercent: fillBetween, fluidType: 'milk' } }),
      [],
      CONFIG,
      's',
      'Mira',
    )
    const prone = reduceCharacterBody(
      stateWith({
        fluids: { fillPercent: fillBetween, fluidType: 'milk' },
        quirks: ['pressure_prone'],
      }),
      [],
      CONFIG,
      's',
      'Mira',
    )
    expect(hasEngorged(plain.state)).toBe(false)
    expect(hasEngorged(prone.state)).toBe(true)
  })

  it('the flat threshold still binds for everyone else', () => {
    const at = reduceCharacterBody(
      stateWith({ fluids: { fillPercent: ENGORGED_FILL_THRESHOLD, fluidType: 'milk' } }),
      [],
      CONFIG,
      's',
      'Mira',
    )
    expect(hasEngorged(at.state)).toBe(true)
  })
})

// ---- milkYield ----

describe('milkYield (R7 drain diff)', () => {
  const capacityMl = 2 * capacityMlPerSide(10)

  it('is set from the ACTUAL drain diff on an active girl', () => {
    const result = reduceCharacterBody(
      stateWith({
        fluids: { fillPercent: 90, fluidType: 'milk' },
        lactation: lactating({ supplyTier: 1 }),
      }),
      [milking(1)],
      CONFIG,
      's',
      'Mira',
    )
    expect(result.milkYield?.drainedPercent).toBe(MILKING_DRAIN_PER_INTENSITY)
    expect(result.milkYield?.units).toBe(milkYieldUnits(MILKING_DRAIN_PER_INTENSITY, capacityMl))
    expect(result.milkYield?.units).toBeGreaterThan(0)
  })

  it('clamps at the 0 fill floor — a near-empty girl yields no phantom milk (risk 4)', () => {
    const result = reduceCharacterBody(
      stateWith({
        fluids: { fillPercent: 30, fluidType: 'milk' },
        lactation: lactating(),
      }),
      [milking(1)],
      CONFIG,
      's',
      'Mira',
    )
    // Drain wants 40 points from 30 — the diff is 30, not 40.
    expect(result.milkYield?.drainedPercent).toBe(30)
    expect(result.state.fluids.fillPercent).toBe(0)
  })

  it('sums multiple milking events in one turn', () => {
    const result = reduceCharacterBody(
      stateWith({
        fluids: { fillPercent: 100, fluidType: 'milk' },
        lactation: lactating(),
      }),
      [milking(1), milking(1)],
      CONFIG,
      's',
      'Mira',
    )
    expect(result.milkYield?.drainedPercent).toBe(2 * MILKING_DRAIN_PER_INTENSITY)
  })

  it('a sub-unit expression yields nothing and logs why', () => {
    const tinyDrain = stateWith({
      tier: 0,
      fluids: { fillPercent: 1, fluidType: 'milk' },
      lactation: lactating(),
    })
    const result = reduceCharacterBody(tinyDrain, [milking(1)], CONFIG, 's', 'Mira')
    expect(result.milkYield).toBeUndefined()
    expect(result.log.find((r) => r.kind === 'yield')?.note).toContain('sub-unit')
  })

  it('bottles NOTHING on the turn she is induced, and logs why (review fix 1)', () => {
    // Induction + milking in one turn: the fluid the drain emptied was the
    // pre-induction fill, not milk she was producing.
    const result = reduceCharacterBody(
      stateWith({
        tier: 20,
        fluids: { fillPercent: 100, fluidType: 'milk' },
      }),
      [milking(3), induction()],
      CONFIG,
      's',
      'Mira',
    )
    expect(result.state.lactation?.active).toBe(true)
    expect(result.milkYield).toBeUndefined()
    expect(result.log.find((r) => r.kind === 'yield')?.note).toContain('pre-induction')
  })

  it('bottles normally on the NEXT turn, once she was already producing', () => {
    const first = reduceCharacterBody(
      stateWith({ tier: 20, fluids: { fillPercent: 100, fluidType: 'milk' } }),
      [milking(1), induction()],
      CONFIG,
      's',
      'Mira',
    )
    const second = reduceCharacterBody(
      { ...first.state, fluids: { fillPercent: 100, fluidType: 'milk' } },
      [milking(1)],
      CONFIG,
      's',
      'Mira',
    )
    expect(second.milkYield?.units).toBeGreaterThan(0)
  })

  it('prices capacity at the tier she had when the drain happened (review fix 8)', () => {
    // Tier 15 → 16 is a whole-unit difference at a 40% drain, so pricing the
    // yield at the post-chronic-growth tier is observable.
    const seed = chronicSeedFor((r) => resolveGrowthOutcome(r, 1) === 'critical')
    const result = reduceCharacterBody(
      stateWith({
        tier: 15,
        fluids: { fillPercent: 100, fluidType: 'milk' },
        lactation: lactating({
          supplyTier: CHRONIC_SUPPLY_TIER,
          chronicBeats: CHRONIC_SUPPLY_BEATS - 1,
        }),
      }),
      [milking(1)],
      CONFIG,
      seed,
      'Mira',
    )
    expect(result.state.tier).toBe(16) // chronic growth landed this turn
    const atDrain = milkYieldUnits(MILKING_DRAIN_PER_INTENSITY, 2 * capacityMlPerSide(15))
    const afterGrowth = milkYieldUnits(MILKING_DRAIN_PER_INTENSITY, 2 * capacityMlPerSide(16))
    expect(afterGrowth).toBeGreaterThan(atDrain) // the assertion below is meaningful
    expect(result.milkYield?.units).toBe(atDrain)
  })

  it('is absent when she is not lactating, even with a big drain', () => {
    const result = reduceCharacterBody(
      stateWith({ fluids: { fillPercent: 100, fluidType: 'milk' } }),
      [milking(2)],
      CONFIG,
      's',
      'Mira',
    )
    expect(result.milkYield).toBeUndefined()
  })
})

// ---- Phase 4: supply_surge (research/50 R2) ----

describe('supply surge (research/50 Phase 4)', () => {
  it('raises an active girl by the delta, before organic adaptation', () => {
    const result = reduceCharacterBody(
      stateWith({ lactation: lactating({ supplyTier: 0 }) }),
      [],
      CONFIG,
      's',
      'Mira',
      undefined,
      { supplyDelta: 2 },
    )
    expect(result.state.lactation?.supplyTier).toBe(2)
    expect(result.log.some((r) => r.kind === 'supply' && r.note?.includes('surge →'))).toBe(true)
  })

  it('clamps at SUPPLY_TIER_MAX and logs the ceiling', () => {
    const result = reduceCharacterBody(
      stateWith({ lactation: lactating({ supplyTier: 2 }) }),
      [],
      CONFIG,
      's',
      'Mira',
      undefined,
      { supplyDelta: 5 },
    )
    expect(result.state.lactation?.supplyTier).toBe(3)
  })

  it('is a logged no-op when she is not lactating (surge does not induce)', () => {
    const result = reduceCharacterBody(stateWith(), [], CONFIG, 's', 'Mira', undefined, {
      supplyDelta: 2,
    })
    expect(result.state.lactation).toBeUndefined()
    expect(result.log.some((r) => r.kind === 'supply' && r.note?.includes('not lactating'))).toBe(
      true,
    )
  })

  it('leaves output byte-identical when no supplyDelta is passed (neutral passthrough)', () => {
    const state = stateWith({ lactation: lactating({ supplyTier: 1 }) })
    const withField = reduceCharacterBody(state, [], CONFIG, 's', 'Mira', undefined, {})
    const without = reduceCharacterBody(state, [], CONFIG, 's', 'Mira')
    expect(withField).toEqual(without)
  })
})
