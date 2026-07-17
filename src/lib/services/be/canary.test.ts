/**
 * Cross-derivation canary (31a lesson 1): one canonical scalar, every derived view
 * must move together. This is the test class that would have caught the NAI-era
 * "derived circumference disagreed with canonical weight by 2x" bug.
 */
import { describe, expect, test } from 'vitest'
import { CUP_LETTER_THRESHOLDS } from './ladder-data'
import { bandIndex, comparative, cupLetter } from './ladder'
import { groundingFacts } from './derive'

const SWEEP_MAX = 300

describe('derivation monotonicity across the full sweep', () => {
  test('cup letters never regress as tier climbs', () => {
    const order = new Map(CUP_LETTER_THRESHOLDS.map((row, i) => [row.cup, i]))
    let last = -1
    for (let tier = 0; tier <= SWEEP_MAX; tier++) {
      const idx = order.get(cupLetter(tier))
      expect(idx).toBeDefined()
      expect(idx as number).toBeGreaterThanOrEqual(last)
      last = idx as number
    }
  })

  test('band index never regresses as tier climbs', () => {
    let last = -1
    for (let tier = 0; tier <= SWEEP_MAX; tier++) {
      const idx = bandIndex(tier)
      expect(idx).toBeGreaterThanOrEqual(last)
      last = idx
    }
  })

  test('comparative prose only changes at increasing tiers (band walk is one-directional)', () => {
    let lastDescription = comparative(0)
    let changes = 0
    const seen = new Set([lastDescription])
    for (let tier = 1; tier <= SWEEP_MAX; tier++) {
      const description = comparative(tier)
      if (description !== lastDescription) {
        // A band left behind must never come back.
        expect(seen.has(description)).toBe(false)
        seen.add(description)
        lastDescription = description
        changes++
      }
    }
    expect(changes).toBeGreaterThanOrEqual(40) // all 51 bands minus the sparse top rows
  })

  test('every tier yields non-empty facts from every derivation', () => {
    for (let tier = 0; tier <= SWEEP_MAX; tier += 7) {
      expect(cupLetter(tier)).toBeTruthy()
      expect(comparative(tier)).toBeTruthy()
      for (const shape of ['natural', 'firm', 'gravity_defying'] as const) {
        const facts = groundingFacts(tier, shape)
        expect(facts.posture).toBeTruthy()
        expect(facts.mobility).toBeTruthy()
        expect(facts.clothing).toBeTruthy()
      }
    }
  })

  test('magical support neutralizes burden at every size', () => {
    for (const tier of [13, 26, 39, 82, 200]) {
      const supported = groundingFacts(tier, 'gravity_defying')
      expect(supported.mobility).toMatch(/weightless/)
      const natural = groundingFacts(tier, 'natural')
      expect(natural.mobility).not.toMatch(/weightless/)
    }
  })
})
