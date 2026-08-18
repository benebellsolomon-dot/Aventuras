import { describe, expect, it } from 'vitest'

import { defaultRpgSheet } from './derive'
import { applyLevelGrants, crossingKey, spendPoint } from './leveling'

describe('applyLevelGrants (idempotent milestone leveling)', () => {
  it('a single crossing grants once: +1 level, +1 attr point, +2 skill points, bigger pool', () => {
    const { sheet, granted } = applyLevelGrants(defaultRpgSheet(), [crossingKey('mira', 2.7)])
    expect(granted).toBe(1)
    expect(sheet.level).toBe(2)
    expect(sheet.unspentPoints).toEqual({ attribute: 1, skill: 2 })
    expect(sheet.essence.max).toBe(10)
    expect(sheet.awardedMilestones).toEqual(['mira:2.7'])
  })

  it('replaying the same crossing grants zero (branch/retry safety)', () => {
    const first = applyLevelGrants(defaultRpgSheet(), [crossingKey('mira', 2.7)]).sheet
    const { sheet, granted } = applyLevelGrants(first, [crossingKey('mira', 2.7)])
    expect(granted).toBe(0)
    expect(sheet).toBe(first) // same reference — no-op
  })

  it('two crossings in one turn grant two levels', () => {
    const { sheet } = applyLevelGrants(defaultRpgSheet(), [
      crossingKey('mira', 2.7),
      crossingKey('sable', 4.0),
    ])
    expect(sheet.level).toBe(3)
    expect(sheet.unspentPoints).toEqual({ attribute: 2, skill: 4 })
  })

  it('current essence never rises from a level-up, and clamps down to the new max', () => {
    const inflated = {
      ...defaultRpgSheet(),
      essence: { current: 99, max: 8 },
    }
    const { sheet } = applyLevelGrants(inflated, [crossingKey('mira', 2.7)])
    expect(sheet.essence).toEqual({ current: 10, max: 10 })
  })
})

describe('spendPoint', () => {
  it('spends an attribute point up to the cap', () => {
    const base = { ...defaultRpgSheet(), unspentPoints: { attribute: 1, skill: 0 } }
    const spent = spendPoint(base, { kind: 'attribute', id: 'int' })
    expect(spent?.attributes.int).toBe(11)
    expect(spent?.unspentPoints.attribute).toBe(0)
    expect(spendPoint(spent!, { kind: 'attribute', id: 'int' })).toBeNull() // no points left
  })

  it('rejects spends past the attribute cap', () => {
    const capped = {
      ...defaultRpgSheet(),
      attributes: { ...defaultRpgSheet().attributes, str: 20 },
      unspentPoints: { attribute: 5, skill: 0 },
    }
    expect(spendPoint(capped, { kind: 'attribute', id: 'str' })).toBeNull()
  })

  it('spends skill points from rank 0 and rejects past the rank cap', () => {
    const base = { ...defaultRpgSheet(), unspentPoints: { attribute: 0, skill: 2 } }
    const spent = spendPoint(base, { kind: 'skill', id: 'alchemy' })
    expect(spent?.skills.alchemy).toBe(1)
    const maxed = {
      ...base,
      skills: { alchemy: 10 },
    }
    expect(spendPoint(maxed, { kind: 'skill', id: 'alchemy' })).toBeNull()
  })
})
