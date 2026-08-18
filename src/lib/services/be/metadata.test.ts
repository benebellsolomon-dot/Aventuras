import { describe, expect, test } from 'vitest'
import {
  BODY_STATE_KEY,
  defaultBodyState,
  readBodyState,
  seedBodyStateFromCup,
  writeBodyState,
} from './metadata'
import { cupLetter } from './ladder'

describe('read/write round-trip', () => {
  test('writes into empty metadata and reads back identically', () => {
    const state = defaultBodyState(21)
    const metadata = writeBodyState(null, state)

    expect(readBodyState(metadata)).toEqual(state)
  })

  test('stores a deep copy — later mutation of the input state cannot reach the metadata', () => {
    const state = defaultBodyState(12)
    const metadata = writeBodyState(null, state)

    state.fluids.fillPercent = 99
    state.conditions.push({ label: 'injected after write' })

    const stored = readBodyState(metadata)
    expect(stored?.fluids.fillPercent).toBe(0)
    expect(stored?.conditions).toEqual([])
  })

  test('preserves sibling metadata keys (runtimeVars must survive)', () => {
    const existing = { runtimeVars: { hunger: { value: 3 } }, other: 'kept' }
    const metadata = writeBodyState(existing, defaultBodyState(5))

    expect(metadata.runtimeVars).toEqual(existing.runtimeVars)
    expect(metadata.other).toBe('kept')
    expect(existing).not.toHaveProperty(BODY_STATE_KEY) // input untouched
  })

  test('unknown future fields pass through the validator (lesson 3)', () => {
    const state = { ...defaultBodyState(8), futureField: 'from a newer build' }
    const metadata = writeBodyState({}, state)
    const roundTripped = readBodyState(metadata) as unknown as Record<string, unknown>

    expect(roundTripped.futureField).toBe('from a newer build')
  })

  test('legacy states without cooldown gain the default instead of failing', () => {
    const legacy: Record<string, unknown> = { ...defaultBodyState(9) }
    delete legacy.cooldown
    const parsed = readBodyState({ [BODY_STATE_KEY]: legacy })

    expect(parsed).not.toBeNull()
    expect(parsed?.cooldown).toBe(0)
  })
})

describe('absent / corrupt metadata', () => {
  test('returns null for null metadata and missing keys', () => {
    expect(readBodyState(null)).toBeNull()
    expect(readBodyState({})).toBeNull()
  })

  test('returns null rather than throwing on corrupt shapes', () => {
    expect(readBodyState({ [BODY_STATE_KEY]: 'garbage' })).toBeNull()
    expect(readBodyState({ [BODY_STATE_KEY]: { tier: 'not a number' } })).toBeNull()
    expect(readBodyState({ [BODY_STATE_KEY]: { tier: -4 } })).toBeNull()
  })
})

describe('lactation block (research/49 R1 — neutral passthrough)', () => {
  test('a legacy state with no lactation key round-trips WITHOUT gaining one', () => {
    const legacy = defaultBodyState(9)
    const parsed = readBodyState(writeBodyState(null, legacy))

    expect(parsed).toEqual(legacy)
    expect(parsed).not.toHaveProperty('lactation')
    expect(Object.keys(parsed as object)).toEqual(Object.keys(legacy))
  })

  test('a full lactation block round-trips with every counter intact', () => {
    const state = {
      ...defaultBodyState(9),
      lactation: {
        active: true,
        supplyTier: 2,
        beatsSinceMilked: 1,
        demandBeats: 3,
        chronicBeats: 5,
      },
    }
    expect(readBodyState(writeBodyState(null, state))).toEqual(state)
  })

  test('counters are optional — the minimal activation shape parses', () => {
    const state = { ...defaultBodyState(9), lactation: { active: true, supplyTier: 0 } }
    expect(readBodyState(writeBodyState(null, state))?.lactation).toEqual({
      active: true,
      supplyTier: 0,
    })
  })

  test('a supplyTier from a newer build survives an older reader (no max)', () => {
    const parsed = readBodyState({
      [BODY_STATE_KEY]: {
        ...defaultBodyState(9),
        lactation: { active: true, supplyTier: 7, futureCounter: 2 },
      },
    })
    expect(parsed?.lactation?.supplyTier).toBe(7)
    expect((parsed?.lactation as unknown as Record<string, unknown>).futureCounter).toBe(2)
  })

  test('a corrupt lactation block fails the whole parse rather than being silently dropped', () => {
    expect(
      readBodyState({
        [BODY_STATE_KEY]: { ...defaultBodyState(9), lactation: { active: 'yes', supplyTier: 0 } },
      }),
    ).toBeNull()
  })
})

describe('seeding from a card cup letter', () => {
  test('a known letter seeds its anchor tier', () => {
    const state = seedBodyStateFromCup('X')
    expect(cupLetter(state.tier)).toBe('X')
    expect(state.locked).toBe(false)
  })

  test('an unknown letter falls back to the default tier', () => {
    expect(seedBodyStateFromCup('nonsense').tier).toBe(defaultBodyState().tier)
  })
})
