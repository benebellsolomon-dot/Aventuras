import { describe, expect, it } from 'vitest'

import {
  attributeMod,
  checkBonus,
  defaultRpgSheet,
  essenceMax,
  oddsBand,
  periodIndex,
  successOdds,
} from './derive'
import type { RpgSheet } from './types'

describe('attributeMod', () => {
  const CASES: ReadonlyArray<[number, number]> = [
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [15, 2],
    [16, 3],
    [20, 5],
  ]
  it.each(CASES)('score %i → %i', (score, mod) => {
    expect(attributeMod(score)).toBe(mod)
  })
})

describe('checkBonus', () => {
  const sheet: RpgSheet = {
    ...defaultRpgSheet(),
    attributes: { ...defaultRpgSheet().attributes, int: 16, cha: 15 },
    skills: { alchemy: 2, seduction: 2 },
  }

  it('attribute mod + ranks', () => {
    expect(checkBonus(sheet, 'alchemy')).toBe(5) // INT +3 + 2 ranks
    expect(checkBonus(sheet, 'seduction')).toBe(4) // CHA +2 + 2 ranks
  })

  it('unranked skill = bare attribute mod', () => {
    expect(checkBonus(sheet, 'investigation')).toBe(3) // INT +3, 0 ranks
    expect(checkBonus(sheet, 'athletics')).toBe(0) // STR 10
  })
})

describe('essenceMax', () => {
  it('6 + 2×level', () => {
    expect(essenceMax(1)).toBe(8)
    expect(essenceMax(3)).toBe(12)
    expect(essenceMax(10)).toBe(26)
  })
})

describe('periodIndex (6h periods, 24h/365d calendar)', () => {
  it('increments at each 6-hour boundary', () => {
    expect(periodIndex({ years: 0, days: 0, hours: 5, minutes: 59 })).toBe(0)
    expect(periodIndex({ years: 0, days: 0, hours: 6, minutes: 0 })).toBe(1)
    expect(periodIndex({ years: 0, days: 0, hours: 23, minutes: 0 })).toBe(3)
  })

  it('rolls across days and years', () => {
    expect(periodIndex({ years: 0, days: 1, hours: 0, minutes: 0 })).toBe(4)
    expect(periodIndex({ years: 0, days: 2, hours: 7, minutes: 30 })).toBe(9)
    expect(periodIndex({ years: 1, days: 0, hours: 0, minutes: 0 })).toBe(365 * 4)
  })
})

describe('successOdds / oddsBand', () => {
  it('counts winning naturals out of 20', () => {
    expect(successOdds(0, 21)).toBe(0) // unreachable
    expect(successOdds(0, 1)).toBe(1) // guaranteed
    expect(successOdds(3, 14)).toBe(0.5) // nat 11-20 win
    expect(successOdds(5, 10)).toBe(0.8) // nat 5-20 win
  })

  it('bands: favored ≥0.7, even ≥0.4, else longshot', () => {
    expect(oddsBand(0.8)).toBe('favored')
    expect(oddsBand(0.7)).toBe('favored')
    expect(oddsBand(0.5)).toBe('even')
    expect(oddsBand(0.4)).toBe('even')
    expect(oddsBand(0.39)).toBe('longshot')
  })
})

describe('defaultRpgSheet', () => {
  it('level 1, all attributes 10, no ranks, essence full', () => {
    const sheet = defaultRpgSheet()
    expect(sheet.level).toBe(1)
    expect(Object.values(sheet.attributes)).toEqual([10, 10, 10, 10, 10, 10])
    expect(sheet.skills).toEqual({})
    expect(sheet.essence).toEqual({ current: 8, max: 8 })
    expect(sheet.unspentPoints).toEqual({ attribute: 0, skill: 0 })
    expect(sheet.awardedMilestones).toEqual([])
  })
})
