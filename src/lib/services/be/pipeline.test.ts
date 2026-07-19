/**
 * Spec 1 pipeline battery (research/37 Part II, Spec 1 test plan): the pinned
 * 9-step reducer order — decay → cooldown tick → land pendingGrowth → softState
 * → passive fill tick → events (anticipation split) → pressure accrual/pity →
 * auto-conditions from post-tick fill + classifier merge → drift note.
 */
import { describe, expect, test } from 'vitest'
import {
  ANTICIPATION_THRESHOLD,
  DEFAULT_BE_STORY_CONFIG,
  ENGORGED_FILL_THRESHOLD,
  ENGORGED_TTL,
  FLUID_REGISTRY,
  MAX_BE_CONDITIONS,
  OVERFILL_ADD_BASE,
  PRESSURE_ACCRUAL,
  PRESSURE_CAP,
  PRESSURE_FIRE,
  PRESSURE_RELEASE,
  fluidProfile,
} from './constants'
import { buildBeStateBlock } from './context'
import { bodyRow, effectiveSupport, measurements } from './measurements'
import { defaultBodyState } from './metadata'
import { reduceCharacterBody, seededRoll } from './reducer'
import type { BeEvent, BeStoryConfig, BodyState } from './types'

const CONFIG: BeStoryConfig = { ...DEFAULT_BE_STORY_CONFIG, enabled: true }
const NO_TICK: BeStoryConfig = { ...CONFIG, passiveFillEnabled: false }

const growthEvent = (overrides: Partial<BeEvent> = {}): BeEvent => ({
  character: 'Lucy',
  kind: 'catalyst',
  intensity: 2,
  ...overrides,
})

const withFill = (fillPercent: number, extra: Partial<BodyState> = {}): BodyState => ({
  ...defaultBodyState(10),
  fluids: { fillPercent, fluidType: 'milk' },
  ...extra,
})

/** Seed whose FIRST event roll (index 0) satisfies the predicate. */
function seedFor(predicate: (roll: number) => boolean): string {
  for (let i = 0; i < 10_000; i++) {
    const seed = `pipe-${i}`
    if (predicate(seededRoll(`${seed}:0`))) return seed
  }
  throw new Error('no seed found')
}

/** Seed whose PRESSURE roll satisfies the predicate (pity path). */
function pressureSeedFor(predicate: (roll: number) => boolean): string {
  for (let i = 0; i < 10_000; i++) {
    const seed = `pity-${i}`
    if (predicate(seededRoll(`${seed}:pressure`))) return seed
  }
  throw new Error('no pressure seed found')
}

describe('fluidProfile registry', () => {
  test('known fluids resolve; unknown falls back to milk', () => {
    expect(fluidProfile('ambrosia')).toBe(FLUID_REGISTRY.ambrosia)
    expect(fluidProfile('  MILK ')).toBe(FLUID_REGISTRY.milk)
    expect(fluidProfile('unobtainium')).toBe(FLUID_REGISTRY.milk)
  })
})

describe('step 5 — passive fill tick', () => {
  test('fill increments by fillRate × (1 + growthFactor) and logs a fill record', () => {
    const { state, log } = reduceCharacterBody(withFill(50), [], CONFIG, 's', 'Lucy')
    expect(state.fluids.fillPercent).toBe(58) // milk: 8 × (1 + 0)
    expect(log.some((r) => r.kind === 'fill' && r.note?.includes('passive'))).toBe(true)
  })

  test('growthFactor scales the tick (ambrosia: 12 × 2 = 24)', () => {
    const config = { ...CONFIG, fluidType: 'ambrosia' }
    const state = { ...withFill(50), fluids: { fillPercent: 50, fluidType: 'ambrosia' } }
    const { state: next } = reduceCharacterBody(state, [], config, 's', 'Lucy')
    expect(next.fluids.fillPercent).toBe(74)
  })

  test('clamps at 100 and does not tick (or log) once saturated', () => {
    const { state } = reduceCharacterBody(withFill(97), [], CONFIG, 's', 'Lucy')
    expect(state.fluids.fillPercent).toBe(100)
    const again = reduceCharacterBody(state, [], CONFIG, 's', 'Lucy')
    expect(again.state.fluids.fillPercent).toBe(100)
    expect(again.log.some((r) => r.kind === 'fill')).toBe(false)
  })

  test('disabled by config; drain still nets against the tick when enabled', () => {
    const off = reduceCharacterBody(withFill(50), [], NO_TICK, 's', 'Lucy')
    expect(off.state.fluids.fillPercent).toBe(50)

    const drained = reduceCharacterBody(
      withFill(50),
      [growthEvent({ kind: 'milking', intensity: 1 })],
      CONFIG,
      's',
      'Lucy',
    )
    expect(drained.state.fluids.fillPercent).toBe(18) // 50 + 8 - 40
  })

  test('softState fluidFill applies before the tick (step 4 before 5)', () => {
    const { state } = reduceCharacterBody(withFill(20), [], CONFIG, 's', 'Lucy', {
      character: 'Lucy',
      fluidFill: 60,
    })
    expect(state.fluids.fillPercent).toBe(68)
  })
})

describe('steps 3+6 — anticipation two-beat', () => {
  test('a delta ≥ threshold splits: half lands now, remainder goes pending', () => {
    const seed = seedFor((roll) => roll + 2 >= 18) // critical → delta 2 = threshold
    const { state } = reduceCharacterBody(defaultBodyState(10), [growthEvent()], CONFIG, seed)
    expect(ANTICIPATION_THRESHOLD).toBe(2)
    expect(state.tier).toBe(11)
    expect(state.lastGrowth).toEqual({ delta: 1, tierBefore: 10 })
    expect(state.pendingGrowth).toEqual({ delta: 1, source: 'catalyst' })
  })

  test('the next reduce lands the pending remainder and clears it', () => {
    const staged = { ...defaultBodyState(11), pendingGrowth: { delta: 1, source: 'catalyst' } }
    const { state, log } = reduceCharacterBody(staged, [], NO_TICK, 's', 'Lucy')
    expect(state.tier).toBe(12)
    expect(state.lastGrowth).toEqual({ delta: 1, tierBefore: 11 })
    expect(state.pendingGrowth).toBeUndefined()
    expect(log.some((r) => r.kind === 'pending' && r.delta === 1)).toBe(true)
  })

  test('a locked character holds the pending growth un-landed', () => {
    const staged = {
      ...defaultBodyState(11),
      locked: true,
      pendingGrowth: { delta: 1, source: 'catalyst' },
    }
    const { state } = reduceCharacterBody(staged, [], NO_TICK, 's', 'Lucy')
    expect(state.tier).toBe(11)
    expect(state.pendingGrowth).toEqual({ delta: 1, source: 'catalyst' })
  })

  test('pending re-clamps against sizeCapTier at land time (may drop to nothing)', () => {
    const capped = { ...CONFIG, passiveFillEnabled: false, sizeCapTier: 11 }
    const staged = { ...defaultBodyState(11), pendingGrowth: { delta: 2, source: 'catalyst' } }
    const { state } = reduceCharacterBody(staged, [], capped, 's', 'Lucy')
    expect(state.tier).toBe(11)
    expect(state.pendingGrowth).toBeUndefined()
    expect(state.lastGrowth).toBeUndefined()
  })

  test('a sub-threshold success does not split', () => {
    const seed = seedFor((roll) => roll + 2 >= 11 && roll + 2 < 18)
    const { state } = reduceCharacterBody(defaultBodyState(10), [growthEvent()], CONFIG, seed)
    expect(state.tier).toBe(11)
    expect(state.pendingGrowth).toBeUndefined()
  })
})

describe('step 7 — growth-pressure escalator', () => {
  test('dry growth beats accrue pressure', () => {
    const seed = seedFor((roll) => roll + 2 < 6) // fail band at i2
    const { state } = reduceCharacterBody(defaultBodyState(10), [growthEvent()], NO_TICK, seed)
    expect(state.growthPressure).toBe(PRESSURE_ACCRUAL)
  })

  test('ineligible kinds do NOT accrue pressure (cosmology amendment)', () => {
    const config = { ...NO_TICK, growthEligibleKinds: ['catalyst'] as const }
    const { state } = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent({ kind: 'contact' })],
      config,
      seedFor((roll) => roll + 2 < 6),
    )
    expect(state.growthPressure ?? 0).toBe(0)
  })

  test('overfill couples through growthFactor ONLY — neutral milk converges (review B1)', () => {
    const milk = reduceCharacterBody(withFill(100), [], CONFIG, 's', 'Lucy')
    expect(milk.state.growthPressure).toBe(0) // gf 0 → no runaway on the default fluid
    // Saturated milk state is a fixed point: writes stop.
    expect(reduceCharacterBody(milk.state, [], CONFIG, 's', 'Lucy').state).toEqual(milk.state)

    const config = { ...CONFIG, fluidType: 'ambrosia' }
    const full = { ...defaultBodyState(10), fluids: { fillPercent: 100, fluidType: 'ambrosia' } }
    const { state } = reduceCharacterBody(full, [], config, 's', 'Lucy')
    expect(state.growthPressure).toBe(OVERFILL_ADD_BASE * FLUID_REGISTRY.ambrosia.growthFactor)
  })

  test('pressure is capped (locked characters cannot bank unbounded pity)', () => {
    const primed = {
      ...defaultBodyState(10),
      locked: true,
      growthPressure: 1000,
      fluids: { fillPercent: 100, fluidType: 'arcane' },
    }
    const { state } = reduceCharacterBody(primed, [], { ...CONFIG, fluidType: 'arcane' }, 's')
    expect(state.growthPressure).toBeLessThanOrEqual(PRESSURE_CAP)
  })

  test('at the fire threshold one pity roll fires, then pressure resets to 0', () => {
    const seed = pressureSeedFor((roll) => roll >= 11) // pity success band
    const primed = { ...defaultBodyState(10), growthPressure: PRESSURE_FIRE }
    const { state, log } = reduceCharacterBody(primed, [], NO_TICK, seed, 'Lucy')
    expect(state.tier).toBe(11)
    expect(state.growthPressure).toBe(0)
    expect(log.some((r) => r.kind === 'pressure' && r.delta === 1)).toBe(true)
  })

  test('a failed pity roll still resets pressure (fire-once-then-reset)', () => {
    const seed = pressureSeedFor((roll) => roll < 6)
    const primed = { ...defaultBodyState(10), growthPressure: PRESSURE_FIRE }
    const { state } = reduceCharacterBody(primed, [], NO_TICK, seed, 'Lucy')
    expect(state.tier).toBe(10)
    expect(state.growthPressure).toBe(0)
  })

  test('landed event growth releases pressure instead of pity-firing', () => {
    const seed = seedFor((roll) => roll + 2 >= 11 && roll + 2 < 18)
    const primed = { ...defaultBodyState(10), growthPressure: PRESSURE_FIRE }
    const { state } = reduceCharacterBody(primed, [growthEvent()], NO_TICK, seed)
    expect(state.tier).toBe(11)
    expect(state.growthPressure).toBe(PRESSURE_FIRE - PRESSURE_RELEASE)
  })

  test('lock muzzles the pity-fire and pressure survives', () => {
    const primed = { ...defaultBodyState(10), locked: true, growthPressure: PRESSURE_FIRE }
    const { state } = reduceCharacterBody(primed, [], NO_TICK, 's', 'Lucy')
    expect(state.tier).toBe(10)
    expect(state.growthPressure).toBe(PRESSURE_FIRE)
  })

  test('cooldown defers the pity-fire', () => {
    const primed = { ...defaultBodyState(10), cooldown: 2, growthPressure: PRESSURE_FIRE }
    const { state } = reduceCharacterBody(primed, [], NO_TICK, 's', 'Lucy')
    expect(state.tier).toBe(10)
    expect(state.growthPressure).toBe(PRESSURE_FIRE)
  })
})

describe('step 8 — conditions: auto-Engorged + classifier merge', () => {
  test('post-tick fill ≥ threshold upserts Engorged with TTL', () => {
    // 70 + 8 tick = 78 ≥ 75: the tick must run BEFORE derivation (step 5 < 8)
    const { state } = reduceCharacterBody(withFill(70), [], CONFIG, 's', 'Lucy')
    expect(ENGORGED_FILL_THRESHOLD).toBe(75)
    const engorged = state.conditions.find((c) => c.label === 'Engorged')
    expect(engorged?.ttl).toBe(ENGORGED_TTL)
  })

  test('Engorged TTL refreshes while full and decays away after fill drops', () => {
    const full = reduceCharacterBody(withFill(80), [], NO_TICK, 's', 'Lucy').state
    expect(full.conditions.find((c) => c.label === 'Engorged')?.ttl).toBe(ENGORGED_TTL)

    const drainedOnce = reduceCharacterBody(
      { ...full, fluids: { fillPercent: 10, fluidType: 'milk' } },
      [],
      NO_TICK,
      's',
      'Lucy',
    ).state
    expect(drainedOnce.conditions.find((c) => c.label === 'Engorged')?.ttl).toBe(ENGORGED_TTL - 1)
  })

  test('classifier conditions merge derived-first, dedupe by label, cap at max', () => {
    const soft = Array.from({ length: 10 }, (_, i) => ({ label: `cond-${i}` }))
    const { state } = reduceCharacterBody(withFill(80), [], NO_TICK, 's', 'Lucy', undefined, {
      softConditions: [{ label: 'Engorged', note: 'classifier duplicate' }, ...soft],
    })
    expect(state.conditions.length).toBeLessThanOrEqual(MAX_BE_CONDITIONS)
    const engorged = state.conditions.filter((c) => c.label === 'Engorged')
    expect(engorged).toHaveLength(1)
    expect(engorged[0]?.ttl).toBe(ENGORGED_TTL) // derived wins over the duplicate
  })

  test('classifier condition ttl clamps to ≥ 0', () => {
    const { state } = reduceCharacterBody(
      defaultBodyState(10),
      [],
      NO_TICK,
      's',
      'Lucy',
      undefined,
      {
        softConditions: [{ label: 'zapped', ttl: -3 }],
      },
    )
    const zapped = state.conditions.find((c) => c.label === 'zapped')
    expect(zapped).toBeDefined()
    expect((zapped?.ttl ?? 0) >= 0).toBe(true)
  })
})

describe('step 9 — drift note carrier', () => {
  test('a prior driftNote clears when no findings arrive', () => {
    const noted = { ...defaultBodyState(10), driftNote: { note: 'old note' } }
    const { state } = reduceCharacterBody(noted, [], NO_TICK, 's', 'Lucy')
    expect(state.driftNote).toBeUndefined()
  })

  test('findings set the note, joined', () => {
    const { state } = reduceCharacterBody(
      defaultBodyState(10),
      [],
      NO_TICK,
      's',
      'Lucy',
      undefined,
      {
        driftFindings: [
          { kind: 'cup_contradiction', note: 'said DD, is G' },
          { kind: 'size_overshoot', note: 'beach ball at tier 10' },
        ],
      },
    )
    expect(state.driftNote?.note).toBe('said DD, is G; beach ball at tier 10')
  })
})

describe('off-screen hold (review B2 — present-only ruling)', () => {
  const OFFSCREEN = { ticksEnabled: false }

  test('ticks disabled: no fill tick, pending stays staged, no pity-fire', () => {
    const staged = {
      ...withFill(50),
      growthPressure: PRESSURE_FIRE,
      pendingGrowth: { delta: 1, source: 'catalyst' },
    }
    const { state } = reduceCharacterBody(staged, [], CONFIG, 's', 'Lucy', undefined, OFFSCREEN)
    expect(state.fluids.fillPercent).toBe(50)
    expect(state.pendingGrowth).toEqual({ delta: 1, source: 'catalyst' })
    expect(state.tier).toBe(10)
    expect(state.growthPressure).toBe(PRESSURE_FIRE)
  })

  test('time still passes off-screen: cooldown ticks and conditions decay', () => {
    const cooling = {
      ...defaultBodyState(10),
      cooldown: 2,
      conditions: [{ label: 'fading flush', ttl: 1 }],
    }
    const { state } = reduceCharacterBody(cooling, [], CONFIG, 's', 'Lucy', undefined, OFFSCREEN)
    expect(state.cooldown).toBe(1)
    expect(state.conditions).toEqual([])
  })
})

describe('review hardenings', () => {
  test('derived Engorged survives a full condition cap (review S1)', () => {
    const stuffed = {
      ...withFill(80),
      conditions: Array.from({ length: MAX_BE_CONDITIONS }, (_, i) => ({ label: `perm-${i}` })),
    }
    const { state } = reduceCharacterBody(stuffed, [], NO_TICK, 's', 'Lucy')
    expect(state.conditions.some((c) => c.label === 'Engorged')).toBe(true)
    expect(state.conditions.length).toBeLessThanOrEqual(MAX_BE_CONDITIONS)
  })

  test('prototype-chain fluid names fall back to milk', () => {
    for (const hostile of ['constructor', '__proto__', 'toString', 'Constructor  ']) {
      expect(fluidProfile(hostile)).toBe(FLUID_REGISTRY.milk)
    }
  })

  test('growthPressure can never persist as NaN', () => {
    const poisoned = { ...withFill(100), growthPressure: Number.NaN }
    const { state } = reduceCharacterBody(poisoned, [], CONFIG, 's', 'Lucy')
    expect(Number.isFinite(state.growthPressure)).toBe(true)
  })

  test('state fluidType syncs to the story config', () => {
    const stale = { ...defaultBodyState(10), fluids: { fillPercent: 0, fluidType: 'mana' } }
    const { state } = reduceCharacterBody(stale, [], CONFIG, 's', 'Lucy') // config milk
    expect(state.fluids.fluidType).toBe('milk')
  })
})

describe('fluid density threading (Task 2)', () => {
  test('a denser fluid weighs more at the same fill; dry mass is untouched', () => {
    const milk = measurements(withFill(100))
    const ambrosia = measurements({
      ...defaultBodyState(10),
      fluids: { fillPercent: 100, fluidType: 'ambrosia' },
    })
    expect(ambrosia.nowTotalKg).toBeGreaterThan(milk.nowTotalKg)
    expect(ambrosia.dryTotalKg).toBe(milk.dryTotalKg)
  })
})

describe('ONSET line (Task 3)', () => {
  test('the block renders the onset directive only while growth is pending', () => {
    const staged = { ...defaultBodyState(20), pendingGrowth: { delta: 1, source: 'contact' } }
    expect(buildBeStateBlock([{ name: 'Lucy', state: staged }])).toContain('ONSET:')
    expect(buildBeStateBlock([{ name: 'Lucy', state: defaultBodyState(20) }])).not.toContain(
      'ONSET:',
    )
  })
})

describe('[CONTINUITY] render (Task 6)', () => {
  test('a carried driftNote renders bare — the note owns its imperative', () => {
    const noted = { ...defaultBodyState(20), driftNote: { note: 'said DD — use tracked size' } }
    const block = buildBeStateBlock([{ name: 'Lucy', state: noted }])
    expect(block).toContain('[CONTINUITY] said DD — use tracked size.')
    expect(block).not.toContain('Correct this silently') // would contradict growth_omitted notes
    expect(buildBeStateBlock([{ name: 'Lucy', state: defaultBodyState(20) }])).not.toContain(
      '[CONTINUITY]',
    )
  })
})

describe('support/buoyancy axis (Task 7)', () => {
  test('shape bases and condition deltas combine, clamped to [0,1]', () => {
    expect(effectiveSupport(defaultBodyState(20))).toBe(0) // natural
    expect(effectiveSupport({ ...defaultBodyState(20), shape: 'firm' })).toBe(0.4)
    expect(
      effectiveSupport({
        ...defaultBodyState(20),
        shape: 'firm',
        conditions: [{ label: 'featherlight' }],
      }),
    ).toBe(1) // 0.4 + 0.8 clamps
    expect(
      effectiveSupport({
        ...defaultBodyState(20),
        conditions: [{ label: 'heaviness curse' }],
      }),
    ).toBe(0) // clamps at zero
  })

  test('high support suppresses the hang rung in the context block', () => {
    const heavy = { ...defaultBodyState(60) } // natural, deep in hang territory
    const row = bodyRow(60, 'natural')
    expect(row.hang.length).toBeGreaterThan(0) // fixture sanity: this tier hangs
    expect(buildBeStateBlock([{ name: 'Lucy', state: heavy }])).toContain(row.hang)
    const charmed = { ...heavy, conditions: [{ label: 'buoyancy charm' }] }
    expect(buildBeStateBlock([{ name: 'Lucy', state: charmed }])).not.toContain(row.hang)
  })
})

describe('milestone line (Task 8)', () => {
  test('the block names the next milestone, hedged as not-yet-true', () => {
    const block = buildBeStateBlock([{ name: 'Lucy', state: defaultBodyState(20) }])
    expect(block).toContain('Next size milestone (NOT yet true')
  })
})

describe('growth directive during a split (review fix)', () => {
  test('lastGrowth + pendingGrowth renders the SURGING directive, not the clamped one', () => {
    const midSplit = {
      ...defaultBodyState(11),
      lastGrowth: { delta: 1, tierBefore: 10 },
      pendingGrowth: { delta: 1, source: 'catalyst' },
    }
    const block = buildBeStateBlock([{ name: 'Lucy', state: midSplit }])
    expect(block).toContain('GROWTH SURGING')
    expect(block).toContain('ONSET:')
    expect(block).not.toContain('no further this beat')
  })
})

describe('conditions render (review fix)', () => {
  test('active conditions surface in the block', () => {
    const conditioned = {
      ...defaultBodyState(20),
      conditions: [{ label: 'buoyancy charm', note: 'from the river blessing' }],
    }
    expect(buildBeStateBlock([{ name: 'Lucy', state: conditioned }])).toContain(
      'Active conditions: buoyancy charm (from the river blessing).',
    )
  })
})

describe('pipeline replay safety', () => {
  test('the full pipeline is deterministic across identical runs', () => {
    const state = {
      ...withFill(70),
      growthPressure: 40,
      pendingGrowth: { delta: 1, source: 'contact' },
    }
    const events = [growthEvent(), growthEvent({ kind: 'milking' })]
    const extras = { softConditions: [{ label: 'tingling' }] }
    const a = reduceCharacterBody(state, events, CONFIG, 'replay:1', 'Lucy', undefined, extras)
    const b = reduceCharacterBody(state, events, CONFIG, 'replay:1', 'Lucy', undefined, extras)
    expect(a).toEqual(b)
  })
})
