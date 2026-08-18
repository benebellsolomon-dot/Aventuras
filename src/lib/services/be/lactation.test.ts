/** Phase 3 lactation axis — pure supply math (research/49 Step 1, R1/R3/R4/R6/R7/R8). */
import { describe, expect, it } from 'vitest'

import {
  CHRONIC_SUPPLY_BEATS,
  CHRONIC_SUPPLY_TIER,
  ENGORGED_FILL_THRESHOLD,
  ENGORGED_FILL_THRESHOLD_PRESSURE_PRONE,
  MILK_UNIT_ML,
  SUPPLY_ADAPT_UP_BEATS,
  SUPPLY_EASE_IDLE_BEATS,
  SUPPLY_FILL_RATE_BONUS,
  SUPPLY_TIER_MAX,
} from './constants'
import {
  adaptSupply,
  apparentTierBonus,
  engorgeThreshold,
  lactationOf,
  milkYieldUnits,
  qualityFromBand,
  supplyFillMultiplier,
  supplyLabel,
  supplyMeter,
  tickChronic,
} from './lactation'
import { defaultBodyState } from './metadata'
import type { BodyState, LactationState } from './types'

const lactating = (overrides: Partial<LactationState> = {}): LactationState => ({
  active: true,
  supplyTier: 0,
  ...overrides,
})

const stateWith = (lactation?: LactationState, extra: Partial<BodyState> = {}): BodyState => ({
  ...defaultBodyState(10),
  ...extra,
  ...(lactation ? { lactation } : {}),
})

describe('lactationOf (read-through, no default write)', () => {
  it('returns null for an untouched state and never adds the key', () => {
    const state = defaultBodyState()
    expect(lactationOf(state)).toBeNull()
    expect(state.lactation).toBeUndefined()
  })

  it('returns the block when present', () => {
    expect(lactationOf(stateWith(lactating({ supplyTier: 2 })))?.supplyTier).toBe(2)
  })
})

describe('supplyLabel', () => {
  it('labels every tier and clamps out-of-range values', () => {
    expect(supplyLabel(0)).toBe('light')
    expect(supplyLabel(1)).toBe('steady')
    expect(supplyLabel(2)).toBe('heavy')
    expect(supplyLabel(SUPPLY_TIER_MAX)).toBe('torrential')
    // A tier from a newer build still renders (clamped), never undefined.
    expect(supplyLabel(7)).toBe('torrential')
    expect(supplyLabel(-3)).toBe('light')
  })
})

describe('supplyFillMultiplier (R4)', () => {
  it('is EXACTLY 1 when there is no lactation block or it is inactive', () => {
    expect(supplyFillMultiplier(defaultBodyState())).toBe(1)
    expect(supplyFillMultiplier(stateWith(lactating({ active: false, supplyTier: 3 })))).toBe(1)
  })

  it('clamps an out-of-range tier like supplyLabel/supplyMeter do (review fix 3)', () => {
    const max = supplyFillMultiplier(stateWith(lactating({ supplyTier: SUPPLY_TIER_MAX })))
    // A tier-9 save must not drive a runaway fill tick.
    expect(supplyFillMultiplier(stateWith(lactating({ supplyTier: 9 })))).toBe(max)
    expect(supplyFillMultiplier(stateWith(lactating({ supplyTier: -2 })))).toBe(1)
    expect(supplyFillMultiplier(stateWith(lactating({ supplyTier: Number.NaN })))).toBe(1)
  })

  it('scales by supply tier when active', () => {
    for (let tier = 0; tier <= SUPPLY_TIER_MAX; tier++) {
      expect(supplyFillMultiplier(stateWith(lactating({ supplyTier: tier })))).toBeCloseTo(
        1 + tier * SUPPLY_FILL_RATE_BONUS,
        10,
      )
    }
  })
})

describe('adaptSupply (R3 — demand up, neglect eases)', () => {
  it('milking raises supply at exactly the threshold, not before', () => {
    let block = lactating()
    for (let beat = 1; beat < SUPPLY_ADAPT_UP_BEATS; beat++) {
      const step = adaptSupply(block, true, true, false)
      expect(step.raised).toBe(false)
      expect(step.next.supplyTier).toBe(0)
      block = step.next
    }
    const final = adaptSupply(block, true, true, false)
    expect(final.raised).toBe(true)
    expect(final.next.supplyTier).toBe(1)
    expect(final.next.demandBeats).toBe(0)
    expect(final.next.beatsSinceMilked).toBe(0)
  })

  it('early_bloomer halves the adapt-up threshold (floor 1)', () => {
    const halved = Math.max(1, Math.floor(SUPPLY_ADAPT_UP_BEATS / 2))
    let block = lactating()
    for (let beat = 1; beat < halved; beat++) block = adaptSupply(block, true, true, true).next
    const step = adaptSupply(block, true, true, true)
    expect(step.raised).toBe(true)
    expect(step.next.supplyTier).toBe(1)
  })

  it('never raises past SUPPLY_TIER_MAX', () => {
    let block = lactating({ supplyTier: SUPPLY_TIER_MAX })
    for (let beat = 0; beat < SUPPLY_ADAPT_UP_BEATS * 3; beat++) {
      const step = adaptSupply(block, true, true, false)
      expect(step.raised).toBe(false)
      expect(step.next.supplyTier).toBe(SUPPLY_TIER_MAX)
      block = step.next
    }
    // The demand counter is bounded too — persisted state must not grow forever.
    expect(block.demandBeats).toBeLessThanOrEqual(SUPPLY_ADAPT_UP_BEATS)
  })

  it('neglect eases supply at the idle threshold and resets the clock', () => {
    let block = lactating({ supplyTier: 2, demandBeats: 1 })
    for (let beat = 1; beat < SUPPLY_EASE_IDLE_BEATS; beat++) {
      const step = adaptSupply(block, false, true, false)
      expect(step.eased).toBe(false)
      expect(step.next.demandBeats).toBe(0) // demand resets the moment she is neglected
      block = step.next
    }
    const final = adaptSupply(block, false, true, false)
    expect(final.eased).toBe(true)
    expect(final.next.supplyTier).toBe(1)
    expect(final.next.beatsSinceMilked).toBe(0)
  })

  it('supply never deactivates on its own — tier floors at 0, active stays true', () => {
    let block = lactating({ supplyTier: 0, beatsSinceMilked: SUPPLY_EASE_IDLE_BEATS })
    for (let beat = 0; beat < 10; beat++) block = adaptSupply(block, false, true, false).next
    expect(block.supplyTier).toBe(0)
    expect(block.active).toBe(true)
  })

  it('pins the idle clock at tier 0 — it cannot ease further, so it must not count forever', () => {
    // Review fix 6: verified unbounded to 500 beats before the pin.
    let block = lactating({ supplyTier: 0 })
    for (let beat = 0; beat < 200; beat++) block = adaptSupply(block, false, true, false).next
    expect(block.beatsSinceMilked).toBe(SUPPLY_EASE_IDLE_BEATS)
  })

  it('normalizes a NaN supplyTier instead of propagating it into persisted state', () => {
    // Review fix 7: a NaN here fails the schema parse and drops the WHOLE bodyState.
    const milked = adaptSupply(lactating({ supplyTier: Number.NaN }), true, true, false)
    expect(milked.next.supplyTier).toBe(0)
    const idle = adaptSupply(lactating({ supplyTier: Number.NaN }), false, true, false)
    expect(idle.next.supplyTier).toBe(0)
  })

  it('off-screen: the neglect clock HOLDS, but an evidenced milking still counts', () => {
    const idle = adaptSupply(lactating({ supplyTier: 2, beatsSinceMilked: 3 }), false, false, false)
    expect(idle.next).toEqual(lactating({ supplyTier: 2, beatsSinceMilked: 3 }))
    expect(idle.eased).toBe(false)

    const milked = adaptSupply(lactating({ beatsSinceMilked: 2 }), true, false, false)
    expect(milked.next.demandBeats).toBe(1)
    expect(milked.next.beatsSinceMilked).toBe(0)
  })

  it('an inactive block is left untouched', () => {
    const block = lactating({ active: false, supplyTier: 1 })
    expect(adaptSupply(block, true, true, false).next).toEqual(block)
  })
})

describe('tickChronic (R5 counter half)', () => {
  const highSupply = (chronicBeats?: number): LactationState =>
    lactating({
      supplyTier: CHRONIC_SUPPLY_TIER,
      ...(chronicBeats !== undefined ? { chronicBeats } : {}),
    })

  it('accumulates while supply is high and fires with the counter PINNED at the threshold', () => {
    let block = highSupply()
    for (let beat = 1; beat < CHRONIC_SUPPLY_BEATS; beat++) {
      const step = tickChronic(block, true)
      expect(step.fires).toBe(false)
      expect(step.next.chronicBeats).toBe(beat)
      block = step.next
    }
    const final = tickChronic(block, true)
    expect(final.fires).toBe(true)
    // Review fix 4: the counter is BANKED here, not spent — the reducer clears
    // it only when the roll actually happens, so a blocked fire retries.
    expect(final.next.chronicBeats).toBe(CHRONIC_SUPPLY_BEATS)
    const again = tickChronic(final.next, true)
    expect(again.fires).toBe(true)
    expect(again.next.chronicBeats).toBe(CHRONIC_SUPPLY_BEATS)
  })

  it('a NaN supplyTier reads as below the chronic tier rather than firing', () => {
    const step = tickChronic(lactating({ supplyTier: Number.NaN, chronicBeats: 5 }), true)
    expect(step.fires).toBe(false)
    expect(step.next.chronicBeats).toBe(0)
  })

  it('resets below the chronic tier', () => {
    const step = tickChronic(
      lactating({ supplyTier: CHRONIC_SUPPLY_TIER - 1, chronicBeats: 4 }),
      true,
    )
    expect(step.fires).toBe(false)
    expect(step.next.chronicBeats).toBe(0)
  })

  it('holds off-screen and on an inactive block', () => {
    const offScreen = highSupply(3)
    expect(tickChronic(offScreen, false)).toEqual({ next: offScreen, fires: false })
    const inactive = lactating({ active: false, supplyTier: 3, chronicBeats: 3 })
    expect(tickChronic(inactive, true)).toEqual({ next: inactive, fires: false })
  })
})

describe('engorgeThreshold / apparentTierBonus (R6)', () => {
  it('defaults to the flat threshold, drops for pressure_prone', () => {
    expect(engorgeThreshold(defaultBodyState())).toBe(ENGORGED_FILL_THRESHOLD)
    expect(engorgeThreshold({ ...defaultBodyState(), quirks: ['pressure_prone'] })).toBe(
      ENGORGED_FILL_THRESHOLD_PRESSURE_PRONE,
    )
    expect(ENGORGED_FILL_THRESHOLD_PRESSURE_PRONE).toBeLessThan(ENGORGED_FILL_THRESHOLD)
  })

  it('apparent bonus is zero unless Engorged, and doubles for pressure_prone', () => {
    const plain = defaultBodyState()
    const prone = { ...defaultBodyState(), quirks: ['pressure_prone'] }
    expect(apparentTierBonus(plain, false)).toBe(0)
    expect(apparentTierBonus(prone, false)).toBe(0)
    expect(apparentTierBonus(plain, true)).toBe(1)
    expect(apparentTierBonus(prone, true)).toBe(2)
  })
})

describe('milkYieldUnits (R7 floor math)', () => {
  it('floors sub-unit expression to nothing', () => {
    // 99 ml of a 1000 ml capacity is 9.9% drained → 0 whole units.
    expect(milkYieldUnits(9.9, 1000)).toBe(0)
    expect(milkYieldUnits(0, 5000)).toBe(0)
  })

  it('converts drained percent of capacity into whole 100 ml units', () => {
    expect(milkYieldUnits(10, 1000)).toBe(1)
    expect(milkYieldUnits(50, 1000)).toBe(5)
    expect(milkYieldUnits(100, 1000)).toBe(1000 / MILK_UNIT_ML)
    expect(milkYieldUnits(37, 1000)).toBe(3) // 370 ml → 3 whole units
  })

  it('never returns negative or non-finite units', () => {
    expect(milkYieldUnits(-40, 1000)).toBe(0)
    expect(milkYieldUnits(Number.NaN, 1000)).toBe(0)
    expect(milkYieldUnits(50, Number.NaN)).toBe(0)
  })
})

describe('qualityFromBand (R8)', () => {
  it('grades by check band; a botched check yields nothing', () => {
    expect(qualityFromBand('crit')).toBe('prime')
    expect(qualityFromBand('success')).toBe('rich')
    expect(qualityFromBand('partial')).toBe('thin')
    expect(qualityFromBand('fail')).toBeNull()
  })

  it('no check this turn → plain', () => {
    expect(qualityFromBand(null)).toBe('plain')
  })
})

describe('supplyMeter (Step 8 presentation helper — UI reads it, never restates it)', () => {
  it('fills the bar one band at a time, ending full at the max tier', () => {
    expect(supplyMeter(0, false).percent).toBe(25)
    expect(supplyMeter(1, false).percent).toBe(50)
    expect(supplyMeter(SUPPLY_TIER_MAX, false).percent).toBe(100)
  })

  it('carries the band word and clamps a tier from a newer build', () => {
    expect(supplyMeter(1, false).label).toBe('steady')
    expect(supplyMeter(7, false).label).toBe('torrential')
    expect(supplyMeter(7, false).percent).toBe(100)
    expect(supplyMeter(-3, false).percent).toBe(25)
    expect(supplyMeter(Number.NaN, false).label).toBe('light')
  })

  it('tints differently while engorged', () => {
    expect(supplyMeter(1, true).tint).not.toBe(supplyMeter(1, false).tint)
    expect(supplyMeter(1, true).tint).toBeTruthy()
  })
})
