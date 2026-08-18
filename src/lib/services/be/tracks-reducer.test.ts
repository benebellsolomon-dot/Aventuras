/** Phase 2 reducer integration (research/48 Step 3): quirk hooks + track step. */
import { describe, expect, it } from 'vitest'

import { DEFAULT_BE_STORY_CONFIG } from './constants'
import { defaultBodyState } from './metadata'
import { reduceCharacterBody, seededRoll } from './reducer'
import { resolveGrowthOutcome } from './roll'
import type { BeEvent, BodyState, BondEvent, ExposureEvent } from './types'

const config = { ...DEFAULT_BE_STORY_CONFIG, enabled: true, passiveFillEnabled: false }

const catalyst = (intensity = 2): BeEvent => ({ character: 'Mira', kind: 'catalyst', intensity })
const warm = (intensity = 2): BondEvent => ({ character: 'Mira', direction: 'warm', intensity })
const exposure = (intensity = 2): ExposureEvent => ({ character: 'Mira', intensity })

function stateWith(overrides: Partial<BodyState> = {}): BodyState {
  return { ...defaultBodyState(6), ...overrides }
}

/** Find a seed whose first event roll produces the wanted outcome at intensity. */
function seedFor(predicate: (roll: number) => boolean): string {
  for (let i = 0; i < 10_000; i++) {
    const seed = `trk-${i}`
    if (predicate(seededRoll(`${seed}:0`))) return seed
  }
  throw new Error('no seed found')
}

describe('neutral passthrough', () => {
  it('no quirks + no track events → output identical to a pre-Phase-2 reduce', () => {
    const state = stateWith()
    const seed = seedFor((r) => resolveGrowthOutcome(r, 2) === 'success')
    const withoutTracks = reduceCharacterBody(state, [catalyst()], config, seed, 'Mira')
    // No bond/dependence/beats keys materialize; log has no track rows.
    expect(withoutTracks.state.bond).toBeUndefined()
    expect(withoutTracks.state.dependence).toBeUndefined()
    expect(withoutTracks.state.beatsSinceExposure).toBeUndefined()
    expect(
      withoutTracks.log.every((r) => !['bond', 'exposure', 'withdrawal'].includes(r.kind)),
    ).toBe(true)
  })
})

describe('quirk hooks in isolation', () => {
  it('fast_metabolizer: catalyst intensity +1 changes the outcome band', () => {
    // Find a roll where i2 fails the band that i3 makes.
    const seed = seedFor(
      (r) => resolveGrowthOutcome(r, 2) === 'partial' && resolveGrowthOutcome(r, 3) === 'success',
    )
    const plain = reduceCharacterBody(stateWith(), [catalyst(2)], config, seed, 'Mira')
    const quirked = reduceCharacterBody(
      stateWith({ quirks: ['fast_metabolizer'] }),
      [catalyst(2)],
      config,
      seed,
      'Mira',
    )
    expect(plain.log[0].outcome).toBe('partial')
    expect(quirked.log[0].outcome).toBe('success')
    expect(quirked.log[0].note).toContain('@i3')
  })

  it('stubborn_frame: intensity −1 (floor 1)', () => {
    const seed = seedFor(
      (r) => resolveGrowthOutcome(r, 1) === 'partial' && resolveGrowthOutcome(r, 2) === 'success',
    )
    const quirked = reduceCharacterBody(
      stateWith({ quirks: ['stubborn_frame'] }),
      [catalyst(2)],
      config,
      seed,
      'Mira',
    )
    expect(quirked.log[0].outcome).toBe('partial')
    expect(quirked.log[0].note).toContain('@i1')
  })

  it('slow_burn: nothing lands now, whole delta stages as pendingGrowth', () => {
    const seed = seedFor((r) => resolveGrowthOutcome(r, 2) === 'success')
    const quirked = reduceCharacterBody(
      stateWith({ quirks: ['slow_burn'] }),
      [catalyst(2)],
      config,
      seed,
      'Mira',
    )
    expect(quirked.state.tier).toBe(6)
    expect(quirked.state.pendingGrowth).toEqual({ delta: 1, source: 'catalyst' })
    expect(quirked.log[0].note).toContain('slow burn: staged')
    // Next turn it lands via step 3.
    const next = reduceCharacterBody(quirked.state, [], config, `${seed}-2`, 'Mira')
    expect(next.state.tier).toBeGreaterThanOrEqual(7)
  })

  it('slow_burn: two growth events in one turn ACCUMULATE in pendingGrowth', () => {
    // Find a seed where BOTH event rolls (index 0 and 1) succeed at i2.
    let seed = ''
    for (let i = 0; i < 10_000; i++) {
      const candidate = `dual-${i}`
      if (
        resolveGrowthOutcome(seededRoll(`${candidate}:0`), 2) === 'success' &&
        resolveGrowthOutcome(seededRoll(`${candidate}:1`), 2) === 'success'
      ) {
        seed = candidate
        break
      }
    }
    const result = reduceCharacterBody(
      stateWith({ quirks: ['slow_burn'] }),
      [catalyst(2), catalyst(2)],
      config,
      seed,
      'Mira',
    )
    expect(result.state.pendingGrowth?.delta).toBe(2) // 1 + 1, not overwritten to 1
  })

  it('greedy_flesh: armed cooldown is one beat shorter', () => {
    const seed = seedFor((r) => resolveGrowthOutcome(r, 2) === 'success')
    const plain = reduceCharacterBody(stateWith(), [catalyst(2)], config, seed, 'Mira')
    const quirked = reduceCharacterBody(
      stateWith({ quirks: ['greedy_flesh'] }),
      [catalyst(2)],
      config,
      seed,
      'Mira',
    )
    expect(quirked.state.cooldown).toBe(plain.state.cooldown - 1)
  })

  it('needy_nipples: rising arousal gets +10, falling arousal is untouched', () => {
    const rising = reduceCharacterBody(
      stateWith({ quirks: ['needy_nipples'], arousal: 20 }),
      [],
      config,
      's',
      'Mira',
      { character: 'Mira', arousal: 50 },
    )
    expect(rising.state.arousal).toBe(60)
    const falling = reduceCharacterBody(
      stateWith({ quirks: ['needy_nipples'], arousal: 80 }),
      [],
      config,
      's',
      'Mira',
      { character: 'Mira', arousal: 30 },
    )
    expect(falling.state.arousal).toBe(30)
  })

  it('phase-3 quirks produce zero state difference', () => {
    const seed = seedFor((r) => resolveGrowthOutcome(r, 2) === 'success')
    const plain = reduceCharacterBody(stateWith(), [catalyst(2)], config, seed, 'Mira')
    const lact = reduceCharacterBody(
      stateWith({ quirks: ['early_bloomer', 'pressure_prone'] }),
      [catalyst(2)],
      config,
      seed,
      'Mira',
    )
    expect({ ...lact.state, quirks: undefined }).toEqual({ ...plain.state, quirks: undefined })
  })
})

describe('step 7 — tracks', () => {
  it('bond events apply velocity-capped, with the capped note in the log', () => {
    const result = reduceCharacterBody(stateWith(), [], config, 's', 'Mira', undefined, {
      bondEvents: [warm(3), warm(3), warm(3)],
    })
    expect(result.state.bond).toBe(25) // default 20 + capped 5
    const row = result.log.find((r) => r.kind === 'bond')
    expect(row?.note).toContain('velocity-capped')
  })

  it('devoted_heart folds +1 per event before the cap', () => {
    const result = reduceCharacterBody(
      stateWith({ quirks: ['devoted_heart'] }),
      [],
      config,
      's',
      'Mira',
      undefined,
      { bondEvents: [warm(1)] },
    )
    expect(result.state.bond).toBe(23) // 20 + (2+1)
  })

  it('exposure resets the withdrawal clock; idle beats advance it and decay dependence', () => {
    const exposed = reduceCharacterBody(
      stateWith({ dependence: 30, beatsSinceExposure: 2 }),
      [],
      config,
      's',
      'Mira',
      undefined,
      { exposureEvents: [exposure(1)] },
    )
    expect(exposed.state.dependence).toBe(32)
    expect(exposed.state.beatsSinceExposure).toBe(0)

    const idle = reduceCharacterBody(
      stateWith({ dependence: 30, beatsSinceExposure: 0 }),
      [],
      config,
      's',
      'Mira',
    )
    expect(idle.state.dependence).toBe(29)
    expect(idle.state.beatsSinceExposure).toBe(1)
  })

  it('idle ticks do not run off-screen, and never materialize tracks on a clean girl', () => {
    const offscreen = reduceCharacterBody(
      stateWith({ dependence: 30, beatsSinceExposure: 1 }),
      [],
      config,
      's',
      'Mira',
      undefined,
      { ticksEnabled: false },
    )
    expect(offscreen.state.dependence).toBe(30)
    expect(offscreen.state.beatsSinceExposure).toBe(1)
  })

  it('craving pull colors an attitude-less turn but never overrides the classifier', () => {
    const pulled = reduceCharacterBody(
      stateWith({ dependence: 70, beatsSinceExposure: 0 }),
      [],
      config,
      's',
      'Mira',
      undefined,
      { exposureEvents: [exposure(1)] },
    )
    expect(pulled.state.attitude).toBe('craving')

    const explicit = reduceCharacterBody(
      stateWith({ dependence: 70 }),
      [],
      config,
      's',
      'Mira',
      { character: 'Mira', attitude: 'fearful' },
      { exposureEvents: [exposure(1)] },
    )
    expect(explicit.state.attitude).toBe('fearful')
  })
})

describe('step 9 — withdrawal condition', () => {
  const withdrawn = stateWith({ dependence: 70, beatsSinceExposure: 3 })

  it('appears at the threshold', () => {
    const result = reduceCharacterBody(withdrawn, [], config, 's', 'Mira')
    expect(result.state.conditions.some((c) => c.label === 'Withdrawal')).toBe(true)
    expect(result.log.some((r) => r.kind === 'withdrawal')).toBe(true)
  })

  it('survives a six-condition classifier flood (front insertion)', () => {
    const flood = Array.from({ length: 6 }, (_, i) => ({ label: `Cond${i}` }))
    const result = reduceCharacterBody(withdrawn, [], config, 's', 'Mira', undefined, {
      softConditions: flood,
    })
    expect(result.state.conditions[0].label).toBe('Withdrawal')
    expect(result.state.conditions.length).toBeLessThanOrEqual(6)
  })

  it('devoted_heart fires at the lowered threshold', () => {
    const result = reduceCharacterBody(
      stateWith({ dependence: 50, beatsSinceExposure: 3, quirks: ['devoted_heart'] }),
      [],
      config,
      's',
      'Mira',
    )
    expect(result.state.conditions.some((c) => c.label === 'Withdrawal')).toBe(true)
  })
})
