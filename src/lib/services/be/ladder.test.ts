import { describe, expect, test } from 'vitest'
import { bandWord, comparative, cupLetter, imageSizePhrase, tierForCupLetter } from './ladder'

describe('cupLetter', () => {
  test('pins the validated NAI anchors', () => {
    // Goldens from the v0.4.7 extraction (research/34): t0=C, t13=G, t50=Z, t82=ZZ+.
    expect(cupLetter(0)).toBe('C')
    expect(cupLetter(13)).toBe('G')
    expect(cupLetter(50)).toBe('Z')
    expect(cupLetter(82)).toBe('ZZ+')
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
})
