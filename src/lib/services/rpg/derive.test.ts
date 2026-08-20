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
import type { CheckRecord, RpgSheet } from './types'

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

describe('formatCheckMath', () => {
  it('renders the labeled monospace math line', async () => {
    const { formatCheckMath } = await import('./derive')
    expect(
      formatCheckMath({
        action: 'x',
        skill: 'alchemy',
        dc: 14,
        nat: 15,
        bonusBreakdown: { attribute: 3, ranks: 2, modifiers: [] },
        bonus: 5,
        total: 20,
        margin: 6,
        band: 'success',
        essenceSpent: 0,
      }),
    ).toBe('Alchemy d20 15 +5 = 20 vs DC 14')
  })

  it('renders the insufficient-essence variant', async () => {
    const { formatCheckMath } = await import('./derive')
    expect(
      formatCheckMath({
        action: 'x',
        skill: 'channeling',
        dc: 10,
        nat: 0,
        bonusBreakdown: { attribute: 0, ranks: 0, modifiers: [] },
        bonus: 0,
        total: 0,
        margin: -10,
        band: 'fail',
        essenceSpent: 0,
        insufficientEssence: true,
        essenceRequired: 3,
      }),
    ).toBe('Channeling — not enough essence (needs ⬡3)')
  })

  it('omits the cost on a legacy record that never recorded one', async () => {
    const { formatCheckMath } = await import('./derive')
    expect(
      formatCheckMath({
        action: 'x',
        skill: 'channeling',
        dc: 10,
        nat: 0,
        bonusBreakdown: { attribute: 0, ranks: 0, modifiers: [] },
        bonus: 0,
        total: 0,
        margin: -10,
        band: 'fail',
        essenceSpent: 0,
        insufficientEssence: true,
      }),
    ).toBe('Channeling — not enough essence')
  })
})

describe('formatCheckMathCompact (Phase 5 W3)', () => {
  it('drops the d20/bonus breakdown, keeps result vs DC', async () => {
    const { formatCheckMathCompact } = await import('./derive')
    expect(
      formatCheckMathCompact({
        action: 'x',
        skill: 'alchemy',
        dc: 14,
        nat: 15,
        bonusBreakdown: { attribute: 3, ranks: 2, modifiers: [] },
        bonus: 5,
        total: 20,
        margin: 6,
        band: 'success',
        essenceSpent: 0,
      }),
    ).toBe('Alchemy 20 vs DC 14')
  })

  it('renders a short insufficient-essence variant', async () => {
    const { formatCheckMathCompact } = await import('./derive')
    expect(
      formatCheckMathCompact({
        action: 'x',
        skill: 'channeling',
        dc: 10,
        nat: 0,
        bonusBreakdown: { attribute: 0, ranks: 0, modifiers: [] },
        bonus: 0,
        total: 0,
        margin: -10,
        band: 'fail',
        essenceSpent: 0,
        insufficientEssence: true,
        essenceRequired: 2,
      }),
    ).toBe('Channeling — not enough essence (needs ⬡2)')
  })
})

describe('roll-card honesty for records that never rolled', () => {
  const notAttempted: CheckRecord = {
    action: 'x',
    skill: 'channeling',
    dc: 10,
    nat: 0,
    bonusBreakdown: { attribute: 0, ranks: 0, modifiers: [] },
    bonus: 0,
    total: 0,
    margin: -10,
    band: 'fail',
    essenceSpent: 0,
    insufficientEssence: true,
    essenceRequired: 3,
  }

  it('neither formatter prints the 0 nat/total as a die result', async () => {
    const { formatCheckMath, formatCheckMathCompact } = await import('./derive')
    for (const line of [formatCheckMath(notAttempted), formatCheckMathCompact(notAttempted)]) {
      expect(line).not.toMatch(/d20/)
      expect(line).not.toMatch(/\b0\b/)
    }
  })

  it('checkOutcomeLabel says "Not attempted" instead of "Failure"', async () => {
    const { checkOutcomeLabel } = await import('./derive')
    expect(checkOutcomeLabel(notAttempted)).toBe('Not attempted')
    expect(checkOutcomeLabel({ ...notAttempted, insufficientEssence: undefined })).toBe('Failure')
  })

  it('unknownSpellNote fires only on a dropped-spell record', async () => {
    const { unknownSpellNote } = await import('./derive')
    expect(unknownSpellNote({ ...notAttempted, unknownSpellDropped: true })).toBe(
      'unknown spell — resolved as a skill check',
    )
    expect(unknownSpellNote(notAttempted)).toBeNull()
  })
})

describe('checkRecordTargets (Phase 5 D2)', () => {
  it('prefers targetId — disambiguates two same-named girls', async () => {
    const { checkRecordTargets } = await import('./derive')
    const rec = { target: 'Amelia', targetId: 'char-2' }
    expect(checkRecordTargets(rec, 'char-2', 'Amelia')).toBe(true)
    // Same NAME, different id → not a match (the collision D2 fixes).
    expect(checkRecordTargets(rec, 'char-1', 'Amelia')).toBe(false)
  })

  it('falls back to name for legacy records without targetId', async () => {
    const { checkRecordTargets } = await import('./derive')
    const rec = { target: 'Amelia' }
    expect(checkRecordTargets(rec, 'char-1', 'amelia')).toBe(true) // case-insensitive
    expect(checkRecordTargets(rec, 'char-1', 'Beth')).toBe(false)
  })

  it('returns false when the record has no target at all', async () => {
    const { checkRecordTargets } = await import('./derive')
    expect(checkRecordTargets({}, 'char-1', 'Amelia')).toBe(false)
  })
})

describe('defaultRpgSheet', () => {
  it('level 1, all attributes 10, no ranks, essence full, creation points granted', () => {
    const sheet = defaultRpgSheet()
    expect(sheet.level).toBe(1)
    expect(Object.values(sheet.attributes)).toEqual([10, 10, 10, 10, 10, 10])
    expect(sheet.skills).toEqual({})
    expect(sheet.essence).toEqual({ current: 8, max: 8 })
    // A fresh sheet starts with the creation grant applied so the player can
    // specialize immediately via the Sheet panel.
    expect(sheet.unspentPoints).toEqual({ attribute: 8, skill: 6 })
    expect(sheet.startingGrant).toBe(true)
    expect(sheet.awardedMilestones).toEqual([])
  })
})
