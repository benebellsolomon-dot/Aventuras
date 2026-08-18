import { describe, expect, test } from 'vitest'
import {
  bandPosition,
  bandWord,
  comparative,
  cupLetter,
  imageSizePhrase,
  tierForCupLetter,
} from './ladder'

describe('cupLetter', () => {
  test('pins the corrected-math anchors (research/38 C4: 1 inch of diff per letter)', () => {
    // Derived from the corrected bust-diff closed-form at the reference frame:
    // t0≈2.8" → C (dome region matches the old ladder), t47≈20" → T,
    // true X-cup arrives ~tier 64, ZZ+ from ~tier 98.
    expect(cupLetter(0)).toBe('C')
    expect(cupLetter(4)).toBe('DD')
    expect(cupLetter(47)).toBe('T')
    expect(cupLetter(64)).toBe('X')
    expect(cupLetter(120)).toBe('ZZ+')
  })

  test('saturates at the top rung instead of running off the table', () => {
    expect(cupLetter(300)).toBe(cupLetter(5000))
  })

  test('handles junk input as tier 0', () => {
    expect(cupLetter(Number.NaN)).toBe('C')
    expect(cupLetter(-5)).toBe('C')
  })
})

describe('bandWord', () => {
  test('pins the NAI tierToCupTag boundaries', () => {
    expect(bandWord(0)).toBe('flat chest')
    expect(bandWord(3)).toBe('small breasts')
    expect(bandWord(4)).toBe('medium breasts')
    expect(bandWord(14)).toBe('large breasts')
    expect(bandWord(22)).toBe('huge breasts')
    expect(bandWord(30)).toBe('gigantic breasts')
    expect(bandWord(40)).toBe('hyper breasts')
    expect(bandWord(999)).toBe('hyper breasts')
  })

  test('imageSizePhrase mirrors bandWord (the sizeBandMarker contract)', () => {
    for (const tier of [0, 5, 21, 33, 47, 120]) {
      expect(imageSizePhrase(tier)).toBe(bandWord(tier))
    }
  })
})

describe('comparative', () => {
  test('returns prose for every tier and saturates at the ∞ band', () => {
    expect(comparative(0).length).toBeGreaterThan(20)
    expect(comparative(500)).toBe(comparative(10_000))
  })

  test('low tiers read as handfuls, not landscapes', () => {
    expect(comparative(0)).toMatch(/hand|palm/i)
  })
})

describe('tierForCupLetter', () => {
  test('anchors round-trip through cupLetter', () => {
    for (const letter of ['C', 'DD', 'G', 'J', 'M', 'X', 'Z']) {
      const tier = tierForCupLetter(letter)
      expect(tier).not.toBeNull()
      expect(cupLetter(tier as number)).toBe(letter)
    }
  })

  test('normalizes card-style spellings', () => {
    expect(tierForCupLetter('dd-cup')).toBe(tierForCupLetter('DD'))
    expect(tierForCupLetter(' g cup ')).toBe(tierForCupLetter('G'))
  })

  test('returns null for unknown letters', () => {
    expect(tierForCupLetter('teacup')).toBeNull()
    expect(tierForCupLetter('')).toBeNull()
  })

  test('A/B clamp to the genre floor instead of failing to seed', () => {
    expect(tierForCupLetter('A')).toBe(0)
    expect(tierForCupLetter('B-cup')).toBe(0)
  })
})

describe('bandPosition', () => {
  test('0 at a band floor, approaches 1 before the next band, saturates at the top', () => {
    expect(bandPosition(22)).toBe(0) // huge floor
    expect(bandPosition(29)).toBeCloseTo(7 / 8, 5) // last huge tier (next band at 30)
    expect(bandPosition(40)).toBe(0) // hyper floor
    expect(bandPosition(400)).toBe(1) // open-ended top saturates
  })
})
