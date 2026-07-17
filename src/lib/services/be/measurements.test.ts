import { describe, expect, test } from 'vitest'
import { GOLDEN_MEASUREMENTS, BODY_ROWS_BY_SHAPE } from './ladder-data'
import { cupLetter } from './ladder'
import {
  bodyRow,
  bwhString,
  capacityMlPerSide,
  dryKgPerSide,
  estimatedBodyWeightKg,
  fluidPressureLabel,
  imageStateCues,
  measurements,
  nowKgPerSide,
  sizingString,
  weightFeel,
} from './measurements'
import { defaultBodyState } from './metadata'
import type { BodyState } from './types'

describe('curves reproduce the baked golden snapshots (the spine, at rung resolution)', () => {
  test.each([...GOLDEN_MEASUREMENTS])('tier %#', (golden) => {
    expect(cupLetter(golden.tier)).toBe(golden.letter)
    expect(2 * dryKgPerSide(golden.tier)).toBeCloseTo(golden.dryTotalKg, 1)
    expect(2 * capacityMlPerSide(golden.tier)).toBeCloseTo(golden.capacityTotalMl, 0)
    const state = defaultBodyState(golden.tier)
    expect(measurements(state).breastMassPct).toBeCloseTo(golden.bodyPct, 0)
  })

  test('curves are strictly monotonic in tier', () => {
    for (let t = 1; t <= 300; t++) {
      expect(dryKgPerSide(t)).toBeGreaterThan(dryKgPerSide(t - 1))
      expect(capacityMlPerSide(t)).toBeGreaterThan(capacityMlPerSide(t - 1))
    }
  })

  test('fluid load raises current mass (engorgement is visible to the weight channel)', () => {
    expect(nowKgPerSide(47, 100)).toBeGreaterThan(nowKgPerSide(47, 0))
    expect(nowKgPerSide(47, 0)).toBeCloseTo(dryKgPerSide(47), 5)
  })

  test('reference body weight matches the NAI estimate', () => {
    expect(estimatedBodyWeightKg(165, 'average')).toBe(58)
    expect(estimatedBodyWeightKg(undefined, undefined)).toBe(58)
    expect(estimatedBodyWeightKg(165, 'petite')).toBeLessThan(58)
  })
})

describe('label ladders', () => {
  test('weight feel rungs are reachable and escalate', () => {
    const low = weightFeel(0.7)
    const high = weightFeel(60)
    expect(low).toBeTruthy()
    expect(high).toBeTruthy()
    expect(low).not.toBe(high)
  })

  test('fluid pressure carries a resting label and escalates to engorged', () => {
    // The baked NAI skin-tension ladder describes the resting state too (the
    // context block simply never renders the fluid line at 0% fill).
    expect(fluidPressureLabel(0)).toBeTruthy()
    expect(fluidPressureLabel(95)).toBeTruthy()
    expect(fluidPressureLabel(95)).not.toBe(fluidPressureLabel(0))
    expect(fluidPressureLabel(95)).not.toBe(fluidPressureLabel(60))
  })
})

describe('body rows (baked NAI moment-model rungs)', () => {
  test('gravity_defying never hangs, at any tier', () => {
    for (const row of BODY_ROWS_BY_SHAPE.gravity_defying) {
      expect(row.hang).toBe('')
    }
  })

  test('natural hangs at large tiers; shapes diverge', () => {
    expect(bodyRow(47, 'natural').hang).toBeTruthy()
    expect(bodyRow(47, 'gravity_defying').hang).toBe('')
    expect(bodyRow(47, 'natural').posture).not.toBe(bodyRow(47, 'gravity_defying').posture)
  })

  test('every field is non-empty for posture/mobility/clothing across the sweep', () => {
    for (const shape of ['natural', 'firm', 'gravity_defying'] as const) {
      for (const tier of [0, 13, 31, 47, 120, 300]) {
        const row = bodyRow(tier, shape)
        expect(row.posture).toBeTruthy()
        expect(row.mobility).toBeTruthy()
        expect(row.clothing).toBeTruthy()
      }
    }
  })
})

describe('sizing strings (US convention)', () => {
  test('band + letter when the band is known; letter-cup fallback otherwise', () => {
    expect(sizingString(47, { bandIn: 38 })).toBe('38X')
    expect(sizingString(47)).toBe('X-cup')
  })

  test('full BWH only when all three dimensions exist', () => {
    expect(bwhString(47, { bandIn: 38, waistIn: 32, hipsIn: 40 })).toBe('38X-32-40')
    expect(bwhString(47, { bandIn: 38, waistIn: 32 })).toBeNull()
    expect(bwhString(47)).toBeNull()
  })
})

describe('image state cues', () => {
  const at = (extra: Partial<BodyState>): BodyState => ({ ...defaultBodyState(30), ...extra })

  test('engorgement cue at 75%+ fill, arousal cue at 70+', () => {
    expect(imageStateCues(at({}))).toEqual([])
    const engorged = imageStateCues(at({ fluids: { fillPercent: 80, fluidType: 'milk' } }))
    expect(engorged.join(' ')).toContain('engorged')
    expect(engorged.join(' ')).toContain('milk')
    const aroused = imageStateCues(at({ arousal: 85 }))
    expect(aroused.join(' ')).toContain('aroused')
  })
})
