import { describe, expect, test } from 'vitest'
import { DEFAULT_BE_STORY_CONFIG } from './constants'
import { defaultBodyState } from './metadata'
import { reduceCharacterBody, seededRoll } from './reducer'
import type { BeEvent, BeStoryConfig, BodyState } from './types'

const CONFIG: BeStoryConfig = { ...DEFAULT_BE_STORY_CONFIG, enabled: true }

const growthEvent = (overrides: Partial<BeEvent> = {}): BeEvent => ({
  character: 'Lucy',
  kind: 'catalyst',
  intensity: 2,
  ...overrides,
})

/** Find a seed whose first roll lands in the wanted outcome band (deterministic search). */
function seedFor(predicate: (roll: number) => boolean): string {
  for (let i = 0; i < 10_000; i++) {
    const seed = `probe-${i}`
    if (predicate(seededRoll(`${seed}:0`))) return seed
  }
  throw new Error('no seed found — bands unreachable?')
}

describe('seededRoll', () => {
  test('is deterministic and in 1..20', () => {
    const rolls = new Set<number>()
    for (let i = 0; i < 400; i++) {
      const roll = seededRoll(`s${i}`)
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(20)
      expect(seededRoll(`s${i}`)).toBe(roll)
      rolls.add(roll)
    }
    expect(rolls.size).toBe(20) // full spread over 400 draws
  })
})

describe('reduceCharacterBody', () => {
  test('same inputs produce identical results (replay safety)', () => {
    // Arrange
    const state = defaultBodyState(10)
    const events = [growthEvent(), growthEvent({ kind: 'attempt' })]

    // Act
    const a = reduceCharacterBody(state, events, CONFIG, 'story:42:Lucy')
    const b = reduceCharacterBody(state, events, CONFIG, 'story:42:Lucy')

    // Assert
    expect(a).toEqual(b)
  })

  test('never mutates its inputs', () => {
    const state = defaultBodyState(10)
    state.conditions = [{ label: 'tingling warmth', ttl: 2 }]
    const frozen = JSON.parse(JSON.stringify(state)) as BodyState
    const events = [growthEvent()]

    reduceCharacterBody(state, events, CONFIG, 'seed')

    expect(state).toEqual(frozen)
  })

  test('critical success grows +2, sets the cooldown, and logs the outcome', () => {
    const seed = seedFor((roll) => roll + 2 >= 18) // intensity 2 → +2 bonus
    const result = reduceCharacterBody(defaultBodyState(10), [growthEvent()], CONFIG, seed)

    expect(result.state.tier).toBe(12)
    expect(result.state.cooldown).toBe(CONFIG.growthCooldownBeats)
    expect(result.log).toHaveLength(1)
    expect(result.log[0]).toMatchObject({ outcome: 'critical', delta: 2, tierAfter: 12 })
  })

  test('failure leaves tier untouched', () => {
    const seed = seedFor((roll) => roll + 2 < 6)
    const result = reduceCharacterBody(defaultBodyState(10), [growthEvent()], CONFIG, seed)

    expect(result.state.tier).toBe(10)
    expect(result.log[0].outcome).toBe('fail')
  })

  test('the size-lock muzzles growth without rolling — even at max intensity', () => {
    const state = { ...defaultBodyState(10), locked: true }
    const result = reduceCharacterBody(state, [growthEvent({ intensity: 3 })], CONFIG, 'any')

    expect(result.state.tier).toBe(10)
    expect(result.log[0].outcome).toBe('muzzled')
  })

  test('a successful growth cools down later events in the same turn', () => {
    const seed = seedFor((roll) => roll + 2 >= 18)
    const events = [growthEvent(), growthEvent(), growthEvent()]
    const result = reduceCharacterBody(defaultBodyState(10), events, CONFIG, seed)

    const outcomes = result.log.map((entry) => entry.outcome)
    expect(outcomes[0]).toBe('critical')
    expect(outcomes.slice(1)).toEqual(['cooldown', 'cooldown'])
    expect(result.state.tier).toBe(12) // only the first event landed
  })

  test('an active cooldown gates growth and ticks down once per turn', () => {
    const state = { ...defaultBodyState(10), cooldown: 2 }
    const first = reduceCharacterBody(state, [growthEvent()], CONFIG, 'x')
    expect(first.log[0].outcome).toBe('cooldown')
    expect(first.state.cooldown).toBe(1)

    const second = reduceCharacterBody(first.state, [], CONFIG, 'x')
    expect(second.state.cooldown).toBe(0)
  })

  test('the story size cap clamps growth to the ceiling', () => {
    const seed = seedFor((roll) => roll + 2 >= 18) // would be +2
    const config: BeStoryConfig = { ...CONFIG, sizeCapTier: 11 }
    const result = reduceCharacterBody(defaultBodyState(10), [growthEvent()], config, seed)

    expect(result.state.tier).toBe(11)
    expect(result.log[0].delta).toBe(1)
  })

  test('milking drains fluids and never touches tier', () => {
    const state = defaultBodyState(20)
    state.fluids = { fillPercent: 90, fluidType: 'milk' }
    const result = reduceCharacterBody(
      state,
      [growthEvent({ kind: 'milking', intensity: 2 })],
      CONFIG,
      's',
    )

    expect(result.state.fluids.fillPercent).toBe(10)
    expect(result.state.tier).toBe(20)
  })

  test('stabilize clears pending growth', () => {
    const state: BodyState = {
      ...defaultBodyState(10),
      pendingGrowth: { delta: 1, source: 'ritual' },
    }
    const result = reduceCharacterBody(state, [growthEvent({ kind: 'stabilize' })], CONFIG, 's')

    expect(result.state.pendingGrowth).toBeUndefined()
  })

  test('conditions tick down and expire exactly once per turn, attributed to the character', () => {
    const state = defaultBodyState(10)
    state.conditions = [
      { label: 'tingling warmth', ttl: 2 },
      { label: 'fading flush', ttl: 1 },
      { label: 'permanent mark' },
    ]
    const result = reduceCharacterBody(state, [], CONFIG, 's', 'Lucy')

    expect(result.state.conditions).toEqual([
      { label: 'tingling warmth', ttl: 1 },
      { label: 'permanent mark' },
    ])
    const decay = result.log.find((entry) => entry.kind === 'decay')
    expect(decay?.character).toBe('Lucy')
  })

  test('junk intensity is clamped instead of trusted', () => {
    const result = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent({ intensity: 999 }), growthEvent({ intensity: Number.NaN })],
      CONFIG,
      'clamp-seed',
    )
    const rolled = result.log.filter((entry) => entry.note?.startsWith('roll '))
    expect(rolled.length).toBeGreaterThanOrEqual(1)
    for (const entry of rolled) {
      expect(entry.note).toMatch(/@i[123]$/)
    }
  })
})
