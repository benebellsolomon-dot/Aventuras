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
import { actGrowthCm, bankBonusCm, bonusCmForIntensity, cmPerTierAt, tiersForCm } from './magnitude'
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
    expect(tiersForCm(0, 0.1, null)).toEqual({ tiers: 0, carryCm: 0.1 })
    expect(tiersForCm(0, -3, null)).toEqual({ tiers: 0, carryCm: 0 })
    expect(tiersForCm(5, 50, 7)).toEqual({ tiers: 2, carryCm: 0 })
    expect(tiersForCm(7, 3, 7)).toEqual({ tiers: 0, carryCm: 0 })
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
})
