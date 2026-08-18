import { describe, expect, it } from 'vitest'

import { defaultBodyState } from './metadata'
import {
  applyBondEvents,
  applyExposure,
  bondCheckModifier,
  bondOf,
  bondStance,
  clampTrack,
  decayDependence,
  dependenceOf,
  dependenceStage,
  withdrawalCondition,
} from './tracks'
import type { BondEvent } from './types'

const warm = (intensity: number): BondEvent => ({ character: 'Mira', direction: 'warm', intensity })
const strain = (intensity: number): BondEvent => ({
  character: 'Mira',
  direction: 'strain',
  intensity,
})

describe('band boundaries (R7 — single source of truth)', () => {
  it('bond stances at every edge', () => {
    expect(bondStance(0)).toBe('wary')
    expect(bondStance(19)).toBe('wary')
    expect(bondStance(20)).toBe('warming')
    expect(bondStance(44)).toBe('warming')
    expect(bondStance(45)).toBe('bonded')
    expect(bondStance(69)).toBe('bonded')
    expect(bondStance(70)).toBe('deeply bonded')
    expect(bondStance(89)).toBe('deeply bonded')
    expect(bondStance(90)).toBe('devoted')
    expect(bondStance(100)).toBe('devoted')
  })

  it('dependence stages at every edge', () => {
    expect(dependenceStage(0)).toBe('none')
    expect(dependenceStage(14)).toBe('none')
    expect(dependenceStage(15)).toBe('curious')
    expect(dependenceStage(34)).toBe('curious')
    expect(dependenceStage(35)).toBe('hooked')
    expect(dependenceStage(59)).toBe('hooked')
    expect(dependenceStage(60)).toBe('craving')
    expect(dependenceStage(84)).toBe('craving')
    expect(dependenceStage(85)).toBe('bound')
  })

  it('bond check modifier table', () => {
    expect(bondCheckModifier(5)).toBe(-2)
    expect(bondCheckModifier(30)).toBe(0)
    expect(bondCheckModifier(50)).toBe(1)
    expect(bondCheckModifier(75)).toBe(2)
    expect(bondCheckModifier(95)).toBe(3)
  })
})

describe('read-through defaults (no eager writes)', () => {
  it('unset fields default without touching state', () => {
    const state = defaultBodyState()
    expect(bondOf(state)).toBe(20)
    expect(dependenceOf(state)).toBe(0)
    expect(state.bond).toBeUndefined()
    expect(state.dependence).toBeUndefined()
  })

  it('clampTrack bounds and rounds', () => {
    expect(clampTrack(-5)).toBe(0)
    expect(clampTrack(101)).toBe(100)
    expect(clampTrack(49.6)).toBe(50)
    expect(clampTrack(Number.NaN)).toBe(0)
  })
})

describe('applyBondEvents (velocity-capped, symmetric)', () => {
  it('uncapped small movement', () => {
    const result = applyBondEvents(20, [warm(1)]) // +2
    expect(result).toEqual({ value: 22, delta: 2, capped: false })
  })

  it('caps a gushing turn: 3 warm events @i3 = +18 raw → +5', () => {
    const result = applyBondEvents(20, [warm(3), warm(3), warm(3)])
    expect(result.value).toBe(25)
    expect(result.capped).toBe(true)
  })

  it('the strain cap is symmetric', () => {
    const result = applyBondEvents(50, [strain(3), strain(3), strain(3)])
    expect(result.value).toBe(45)
    expect(result.capped).toBe(true)
  })

  it('mixed events net before capping', () => {
    const result = applyBondEvents(50, [warm(2), strain(1)]) // +4 -2 = +2
    expect(result).toEqual({ value: 52, delta: 2, capped: false })
  })

  it('quirk bonus per event folds in before the cap binds', () => {
    // devoted_heart: +1 per event → warm(1) = 2+1 = 3
    expect(applyBondEvents(20, [warm(1)], 1).value).toBe(23)
    // …but the cap still binds on a big turn
    expect(applyBondEvents(20, [warm(3), warm(3)], 1).value).toBe(25)
  })

  it('clamps at 0 and 100', () => {
    expect(applyBondEvents(1, [strain(3)]).value).toBe(0)
    expect(applyBondEvents(99, [warm(3)]).value).toBe(100)
  })
})

describe('applyExposure / decay', () => {
  it('gain by intensity, capped per turn', () => {
    expect(applyExposure(0, [{ character: 'M', intensity: 1 }])).toEqual({
      value: 2,
      delta: 2,
      capped: false,
    })
    const big = applyExposure(0, [
      { character: 'M', intensity: 3 },
      { character: 'M', intensity: 3 },
    ]) // 12 raw → 4
    expect(big.value).toBe(4)
    expect(big.capped).toBe(true)
  })

  it('decays one point per idle beat, floored at 0', () => {
    expect(decayDependence(10)).toBe(9)
    expect(decayDependence(0)).toBe(0)
  })
})

describe('withdrawalCondition (R8)', () => {
  it('fires at threshold and idle beats, not below either', () => {
    expect(withdrawalCondition(60, 3, false)?.label).toBe('Withdrawal')
    expect(withdrawalCondition(59, 3, false)).toBeNull()
    expect(withdrawalCondition(60, 2, false)).toBeNull()
  })

  it('devoted_heart lowers the threshold and harshens the note', () => {
    const harsh = withdrawalCondition(45, 3, true)
    expect(harsh).not.toBeNull()
    expect(harsh?.note).toContain('devotion')
    expect(withdrawalCondition(45, 3, false)).toBeNull()
  })

  it('carries a 2-beat ttl', () => {
    expect(withdrawalCondition(80, 5, false)?.ttl).toBe(2)
  })
})
