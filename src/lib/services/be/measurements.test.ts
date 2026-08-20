import { describe, expect, test } from 'vitest'
import { GOLDEN_MEASUREMENTS, BODY_ROWS_BY_SHAPE } from './ladder-data'
import {
  bandCm,
  bodyRow,
  bustCm,
  bustDiffCm,
  bwhCmString,
  capacityMlPerSide,
  droopCm,
  dryBustCm,
  dryBustNote,
  dryKgPerSide,
  fluidPressureLabel,
  imageStateCues,
  measurements,
  nowKgPerSide,
  resolveBuild,
  sizingString,
  weightFeel,
} from './measurements'
import { frameEstimateKg } from './curves'
import { defaultBodyState } from './metadata'
import type { BodyState } from './types'

describe('curves reproduce the baked golden snapshots (the spine, at rung resolution)', () => {
  test.each([...GOLDEN_MEASUREMENTS])('tier %#', (golden) => {
    expect(2 * dryKgPerSide(golden.tier)).toBeCloseTo(golden.dryTotalKg, 1)
    expect(2 * capacityMlPerSide(golden.tier)).toBeCloseTo(golden.capacityTotalMl, 0)
    expect(droopCm(golden.tier, 'natural', 0)).toBeCloseTo(golden.droopCm, 1)
    const state = defaultBodyState(golden.tier)
    // Frame now subtracts the baseline-breast double-count (research/38 C3), so
    // the pct sits slightly above the spine's golden — within half a point.
    expect(measurements(state).breastMassPct).toBeCloseTo(golden.bodyPct, 0)
  })

  test('corrected bust anchors (research/38 C1: dome preserved, big end re-anchored)', () => {
    // Reference band 66 cm. Dome region unchanged vs the spine (t13 was 87.94);
    // the anchored region reads honestly larger (spine t47 was 101.7).
    expect(bustCm(13, 'natural', 0)).toBeCloseTo(87.9, 0)
    expect(bustCm(31, 'natural', 0)).toBeCloseTo(107.1, 0)
    expect(bustCm(47, 'natural', 0)).toBeCloseTo(116.8, 0)
  })

  test('the Norma Stitz anchor: measured 178 cm bust reproduces on her band', () => {
    expect(109 + bustDiffCm(82, 'natural', 0)).toBeCloseTo(178, 0)
  })

  test('bust circumference grows with tier and with fill, and never saturates', () => {
    expect(bustCm(20, 'natural')).toBeGreaterThan(bustCm(10, 'natural'))
    expect(bustCm(47, 'natural', 100)).toBeGreaterThan(bustCm(47, 'natural', 0))
    expect(bustCm(400, 'natural')).toBeGreaterThan(bustCm(300, 'natural')) // D1: unbounded
  })

  test('bust rides the character band: bigger waist/build → bigger absolute bust', () => {
    const ref = bustCm(47, 'natural', 0)
    expect(bustCm(47, 'natural', 0, { waistCm: 81, build: 'average' })).toBeCloseTo(ref + 20, 0)
    expect(bustCm(47, 'natural', 0, { waistCm: 61, build: 'curvy' })).toBeCloseTo(ref + 3, 0)
  })

  test('dryBustCm is the same tape at fill 0, so it never moves with fill', () => {
    expect(dryBustCm(47, 'natural')).toBeCloseTo(bustCm(47, 'natural', 0), 5)
    expect(dryBustCm(47, 'natural', { waistCm: 81, build: 'average' })).toBeCloseTo(
      bustCm(47, 'natural', 0, { waistCm: 81, build: 'average' }),
      5,
    )
    expect(dryBustCm(47, 'natural')).toBeLessThan(bustCm(47, 'natural', 100))
  })

  test('dryBustNote explains a full girl and stays quiet on an empty one', () => {
    const state = defaultBodyState(47)
    const empty: BodyState = { ...state, fluids: { ...state.fluids, fillPercent: 0 } }
    const full: BodyState = { ...state, fluids: { ...state.fluids, fillPercent: 100 } }
    expect(dryBustNote(empty)).toBeNull()
    expect(dryBustNote(full)).toBe(
      `${Math.round(dryBustCm(47, state.shape, state.baseline))} cm dry`,
    )
  })

  test('dryBustNote makes the drain-while-growing case legible', () => {
    // The live failure: +1 tier while draining 88% → 8% reads as a NET cm drop.
    const base = defaultBodyState(20)
    const before: BodyState = { ...base, fluids: { ...base.fluids, fillPercent: 88 } }
    const after: BodyState = { ...base, tier: 21, fluids: { ...base.fluids, fillPercent: 8 } }
    const liveBefore = bustCm(before.tier, before.shape, 88, before.baseline)
    const liveAfter = bustCm(after.tier, after.shape, 8, after.baseline)
    expect(liveAfter).toBeLessThan(liveBefore)
    // The dry tape, which is what "she grew" means, still goes up.
    expect(dryBustCm(after.tier, after.shape, after.baseline)).toBeGreaterThan(
      dryBustCm(before.tier, before.shape, before.baseline),
    )
    expect(dryBustNote(before)).not.toBeNull()
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

  test('reference frame weight matches the NAI estimate', () => {
    expect(frameEstimateKg({ heightCm: 165, build: 'average' })).toBe(58)
    expect(frameEstimateKg(undefined)).toBe(58)
    expect(frameEstimateKg({ heightCm: 165, build: 'petite' })).toBeLessThan(58)
  })
})

describe('build inference + band (research/38 C3b)', () => {
  test('explicit build wins; otherwise waist/height bands infer it', () => {
    expect(resolveBuild({ waistCm: 85, build: 'petite' })).toBe('petite')
    expect(resolveBuild({ waistCm: 58 })).toBe('petite')
    expect(resolveBuild({ waistCm: 85 })).toBe('full')
    expect(resolveBuild({})).toBe('average')
  })

  test('wide hips bump the inferred build one step toward curvy', () => {
    expect(resolveBuild({ waistCm: 65 })).toBe('slim')
    expect(resolveBuild({ waistCm: 65, hipsCm: 92 })).toBe('average')
  })

  test('band = waist + build offset (the documented band trap, made visible)', () => {
    expect(bandCm({ waistCm: 61, build: 'average' })).toBe(66)
    expect(bandCm({ waistCm: 61 })).toBeCloseTo(64.7, 0) // inferred: smooth curve near slim
    expect(bandCm(undefined)).toBe(66) // reference frame: waist 61, average
    expect(bandCm({ waistCm: 65, build: 'curvy' })).toBe(73)
  })

  test('inferred band/weight move smoothly with waist — no threshold cliffs (research/39 finding 2)', () => {
    // The old step inference jumped +4 cm band and +4 kg weight at waist 72→73.
    for (let waist = 60; waist <= 84; waist++) {
      const bandStep = bandCm({ waistCm: waist + 1 }) - bandCm({ waistCm: waist })
      expect(bandStep).toBeGreaterThanOrEqual(1) // waist itself grows 1 cm
      expect(bandStep).toBeLessThanOrEqual(2.5) // offset drift stays gentle
      const totalA = measurements({ ...defaultBodyState(20), baseline: { waistCm: waist } })
      const totalB = measurements({ ...defaultBodyState(20), baseline: { waistCm: waist + 1 } })
      expect(Math.abs(totalB.totalBodyWeightKg - totalA.totalBodyWeightKg)).toBeLessThanOrEqual(1.5)
    }
  })

  test('insane anatomy inputs fall back instead of leaking (research/39 finding 3)', () => {
    expect(bandCm({ waistCm: Infinity })).toBe(66)
    expect(bandCm({ waistCm: -4 })).toBe(66)
    const infWeight = measurements({
      ...defaultBodyState(13),
      baseline: { bodyWeightKg: Infinity },
    })
    expect(infWeight.frameKg).toBe(57) // falls back to the estimate
    const infWaist = {
      ...defaultBodyState(13),
      baseline: { waistCm: Infinity, hipsCm: 90 },
    }
    expect(bwhCmString(infWaist)).toMatch(/^bust ~\d+ cm$/)
  })
})

describe('honest body weight (research/38 C3)', () => {
  test('total = frame (minus baseline-breast double-count) + current breast mass', () => {
    const m = measurements(defaultBodyState(47))
    expect(m.frameKg).toBe(57)
    expect(m.totalBodyWeightKg).toBeCloseTo(57 + m.nowTotalKg, 5)
    expect(m.totalBodyWeightKg).toBeCloseTo(71.4, 0)
  })

  test('an explicit frame weight overrides the estimate', () => {
    const state = { ...defaultBodyState(13), baseline: { bodyWeightKg: 70 } }
    expect(measurements(state).frameKg).toBe(69)
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

  test('natural hangs at large tiers; shapes diverge; droop tracks the hang channel', () => {
    expect(bodyRow(47, 'natural').hang).toBeTruthy()
    expect(bodyRow(47, 'gravity_defying').hang).toBe('')
    expect(bodyRow(47, 'natural').posture).not.toBe(bodyRow(47, 'gravity_defying').posture)
    expect(droopCm(47, 'natural', 0)).toBeGreaterThan(droopCm(47, 'gravity_defying', 0))
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

describe('sizing strings (metric convention, corrected letters)', () => {
  test('cup label is letter-only; tier 47 is a T-cup under the honest ladder', () => {
    expect(sizingString(47)).toBe('T-cup')
  })

  test('BWH renders bust-waist-hips in cm on her own band; bust alone when anatomy unset', () => {
    const full = {
      ...defaultBodyState(47),
      baseline: { waistCm: 81, hipsCm: 94, build: 'average' },
    }
    expect(bwhCmString(full)).toBe('137-81-94 cm')
    expect(bwhCmString(defaultBodyState(47))).toBe('bust ~117 cm')
  })

  test('BWH bust tracks fill (engorgement widens the measurement)', () => {
    const engorged = {
      ...defaultBodyState(47),
      baseline: { waistCm: 81, hipsCm: 94, build: 'average' },
      fluids: { fillPercent: 100, fluidType: 'milk' },
    }
    expect(bwhCmString(engorged)).toBe('143-81-94 cm')
  })
})

describe('image state cues', () => {
  const at = (extra: Partial<BodyState>): BodyState => ({ ...defaultBodyState(30), ...extra })

  test('graduated fill cues (40/75/90 rungs, strongest wins), arousal cue at 70+', () => {
    expect(imageStateCues(at({}))).toEqual([])
    const subtle = imageStateCues(at({ fluids: { fillPercent: 50, fluidType: 'milk' } }))
    expect(subtle).toHaveLength(1)
    expect(subtle[0]).toContain('subtly swollen')
    const engorged = imageStateCues(at({ fluids: { fillPercent: 80, fluidType: 'milk' } }))
    expect(engorged).toHaveLength(1)
    expect(engorged[0]).toContain('engorged')
    expect(engorged[0]).toContain('milk')
    const bursting = imageStateCues(at({ fluids: { fillPercent: 95, fluidType: 'milk' } }))
    expect(bursting).toHaveLength(1)
    expect(bursting[0]).toContain('leaking')
    const aroused = imageStateCues(at({ arousal: 85 }))
    expect(aroused.join(' ')).toContain('aroused')
  })

  test('emits a breast-expansion cue on the turn growth landed (lastGrowth set)', () => {
    // No growth marker → no expansion cue.
    expect(imageStateCues(at({})).join(' ')).not.toContain('breast expansion')

    // Single-increment land → gentle expansion cue.
    const small = imageStateCues(at({ lastGrowth: { delta: 1, tierBefore: 29 } }))
    expect(small[0]).toContain('breast expansion')
    expect(small[0]).toContain('growing larger')

    // Multi-increment surge → rapid expansion cue, and it LEADS the cue list.
    const surge = imageStateCues(
      at({
        lastGrowth: { delta: 3, tierBefore: 27 },
        arousal: 85,
      }),
    )
    expect(surge[0]).toContain('rapidly expanding')
    expect(surge.join(' ')).toContain('aroused') // still stacks with other cues
  })

  // research/49 R6: apparent swell is PRESENTATION — it rides the cue text and
  // never the tape (measurements() is untouched by it).
  test('engorged cues carry the apparent-swell magnitude; calm ones do not', () => {
    const calm = imageStateCues(at({ fluids: { fillPercent: 50, fluidType: 'milk' } }))
    expect(calm[0]).not.toContain('past her usual size')

    const engorged = imageStateCues(at({ fluids: { fillPercent: 80, fluidType: 'milk' } }))
    expect(engorged).toHaveLength(1)
    expect(engorged[0]).toContain('swollen a full cup past her usual size')

    const prone = imageStateCues(
      at({ quirks: ['pressure_prone'], fluids: { fillPercent: 65, fluidType: 'milk' } }),
    )
    expect(prone[0]).toContain('swollen two full cups past her usual size')
  })

  // Review fix 5: the register must follow HER engorge threshold. At fill 62 a
  // pressure_prone girl used to read "subtly swollen … , swollen two full cups
  // past her usual size" — the flat rung contradicting the per-girl swell.
  test('a pressure_prone girl past her own threshold gets the engorged register, not the subtle rung', () => {
    const prone = imageStateCues(
      at({ quirks: ['pressure_prone'], fluids: { fillPercent: 62, fluidType: 'milk' } }),
    )
    expect(prone).toHaveLength(1)
    expect(prone[0]).toContain('breasts visibly engorged')
    expect(prone[0]).not.toContain('subtly swollen')
    expect(prone[0]).toContain('swollen two full cups past her usual size')
  })

  test('below her own threshold she is back on the flat ladder, swell-free', () => {
    const prone = imageStateCues(
      at({ quirks: ['pressure_prone'], fluids: { fillPercent: 50, fluidType: 'milk' } }),
    )
    expect(prone).toEqual(['breasts subtly swollen with milk, skin gently taut'])
  })

  test('flat-threshold girls keep byte-identical cues at every rung', () => {
    const cueAt = (fillPercent: number): string[] =>
      imageStateCues(at({ fluids: { fillPercent, fluidType: 'milk' } }))
    expect(cueAt(50)).toEqual(['breasts subtly swollen with milk, skin gently taut'])
    expect(cueAt(75)).toEqual([
      'breasts visibly engorged, taut and heavy with milk, swollen a full cup past her usual size',
    ])
    expect(cueAt(95)).toEqual([
      'breasts hugely engorged with milk, skin stretched shiny-taut, visibly leaking, swollen a full cup past her usual size',
    ])
  })
})
