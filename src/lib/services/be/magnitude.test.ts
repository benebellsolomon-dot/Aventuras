import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BE_STORY_CONFIG,
  DEFAULT_GROWTH_BASELINE_CM,
  GROWTH_BASELINE_CM_MAX,
  GROWTH_BASELINE_CM_MIN,
  MAX_GROWTH_BONUS_CM,
  beStoryConfigFromSettings,
  clampGrowthBaselineCm,
} from './constants'
import {
  actGrowthCm,
  bankBonusCm,
  bonusCmForIntensity,
  cmPerTierAt,
  previewActGrowth,
  safeBonusCm,
  safeCarryCm,
  tiersForCm,
} from './magnitude'
import { MAX_GROWTH_CARRY_CM, MAX_TIERS_PER_ACT } from './constants'
import { defaultBodyState } from './metadata'

describe('growth magnitude (research/66 §magnitude)', () => {
  it('cm per tier is positive and the cup ladder is roughly a letter per 2.5 cm at small sizes', () => {
    for (let t = 0; t < 60; t++) expect(cmPerTierAt(t)).toBeGreaterThan(0)
    expect(cmPerTierAt(0)).toBeGreaterThan(0.8)
    expect(cmPerTierAt(0)).toBeLessThan(2)
  })

  it('tiersForCm buys whole tiers and carries the remainder; stops at the cap with no carry', () => {
    const { tiers, carryCm } = tiersForCm(0, 2.5, null)
    expect(tiers).toBe(2)
    expect(carryCm).toBeGreaterThanOrEqual(0)
    expect(carryCm).toBeLessThan(cmPerTierAt(2))
    expect(tiersForCm(0, 0.1, null)).toMatchObject({ tiers: 0, carryCm: 0.1 })
    expect(tiersForCm(0, -3, null)).toMatchObject({ tiers: 0, carryCm: 0 })
    expect(tiersForCm(5, 50, 7)).toMatchObject({ tiers: 2, carryCm: 0 })
    expect(tiersForCm(7, 3, 7)).toMatchObject({ tiers: 0, carryCm: 0 })
  })

  it('bonus cm scales with intensity and the bank is capped', () => {
    expect(bonusCmForIntensity(2)).toBe(3)
    expect(bonusCmForIntensity(9)).toBe(bonusCmForIntensity(3))
    expect(bankBonusCm(undefined, 4)).toBe(4)
    expect(bankBonusCm(9, 4)).toBe(MAX_GROWTH_BONUS_CM)
  })

  it('actGrowthCm = baseline + bank + carry; config from settings clamps the baseline', () => {
    expect(
      actGrowthCm({ growthBaselineCm: 2.5 }, { growthBonusCm: 1.5, growthCarryCm: 0.4 }),
    ).toBeCloseTo(4.4)
    expect(actGrowthCm(DEFAULT_BE_STORY_CONFIG, defaultBodyState())).toBe(
      DEFAULT_GROWTH_BASELINE_CM,
    )
    expect(clampGrowthBaselineCm(undefined)).toBe(DEFAULT_GROWTH_BASELINE_CM)
    expect(clampGrowthBaselineCm('4')).toBe(4)
    expect(clampGrowthBaselineCm(999)).toBe(GROWTH_BASELINE_CM_MAX)
    expect(clampGrowthBaselineCm(0)).toBe(GROWTH_BASELINE_CM_MIN)
    const cfg = beStoryConfigFromSettings({
      beFluidType: 'honey',
      beGrowthEligibleKinds: ['catalyst'],
      beGrowthBaselineCm: 3,
    })
    expect(cfg).toMatchObject({
      enabled: true,
      fluidType: 'honey',
      growthEligibleKinds: ['catalyst'],
      growthBaselineCm: 3,
    })
    expect(beStoryConfigFromSettings(null).growthBaselineCm).toBe(DEFAULT_GROWTH_BASELINE_CM)
  })

  it('tiersForCm never loops: a per-act tier ceiling bounds huge or non-finite budgets', () => {
    expect(tiersForCm(0, 1e9, null).tiers).toBe(MAX_TIERS_PER_ACT)
    expect(tiersForCm(0, Number.POSITIVE_INFINITY, null).tiers).toBe(0) // non-finite budget = 0
    expect(tiersForCm(0, 1e9, null).carryCm).toBe(0)
    expect(tiersForCm(0, 2.5, null).carryCm).toBeLessThanOrEqual(MAX_GROWTH_CARRY_CM)
  })

  it('safe carriers clamp garbage; previewActGrowth modes match the reducer', () => {
    // A non-finite carrier is garbage: it grants nothing (never the cap).
    expect(safeBonusCm(Number.POSITIVE_INFINITY)).toBe(0)
    expect(safeBonusCm(50)).toBe(MAX_GROWTH_BONUS_CM)
    expect(safeBonusCm(-3)).toBe(0)
    expect(safeCarryCm(NaN)).toBe(0)
    const cfg = { growthBaselineCm: 2.5, sizeCapTier: null }
    const s = defaultBodyState()
    expect(previewActGrowth(cfg, s).mode).toBe('grows')
    expect(previewActGrowth(cfg, { ...s, locked: true }).mode).toBe('locked')
    expect(previewActGrowth({ ...cfg, growthBaselineCm: 0.3 }, s).mode).toBe('builds')
    expect(previewActGrowth({ ...cfg, sizeCapTier: s.tier }, s).mode).toBe('at_cap')
    expect(previewActGrowth(cfg, { ...s, growthBonusCm: 3 })).toMatchObject({
      cm: 5.5,
      bankedCm: 3,
    })
  })
})
