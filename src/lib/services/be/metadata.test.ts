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
