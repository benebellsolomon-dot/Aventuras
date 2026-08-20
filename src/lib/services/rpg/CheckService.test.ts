import { describe, expect, it } from 'vitest'

import { seededRoll } from '$lib/services/be'
import { resolveCheck } from './CheckService'
import { defaultRpgSheet } from './derive'
import type { RpgSheet } from './types'

const SEED = 'story-abc:entry-123:check' // golden nat = 15 (roll.test.ts)

function sheetWith(overrides: Partial<RpgSheet> = {}): RpgSheet {
  return {
    ...defaultRpgSheet(),
    attributes: { ...defaultRpgSheet().attributes, int: 16, cha: 15 },
    skills: { alchemy: 2 },
    ...overrides,
  }
}

describe('resolveCheck', () => {
  it('resolves nat + attribute + ranks + modifiers against the DC', () => {
    const record = resolveCheck({
      seed: SEED,
      sheet: sheetWith(),
      skill: 'alchemy',
      dc: 14,
      action: 'Brew the catalyst',
      modifiers: [{ label: 'bond', value: 1 }],
    })
    expect(record.nat).toBe(15)
    expect(record.bonusBreakdown).toEqual({
      attribute: 3,
      ranks: 2,
      modifiers: [{ label: 'bond', value: 1 }],
    })
    expect(record.bonus).toBe(6)
    expect(record.total).toBe(21)
    expect(record.margin).toBe(7)
    expect(record.band).toBe('success')
    expect(record.essenceSpent).toBe(0)
  })

  it('is deterministic: same input → identical record', () => {
    const input = { seed: SEED, sheet: sheetWith(), skill: 'alchemy' as const, dc: 12, action: 'x' }
    expect(resolveCheck(input)).toEqual(resolveCheck(input))
  })

  it('the :check suffix is isolated from BE event/pressure seeds', () => {
    const prefix = 'story-abc:entry-123'
    const rolls = new Set([
      seededRoll(`${prefix}:check`),
      seededRoll(`${prefix}:0`),
      seededRoll(`${prefix}:pressure`),
    ])
    expect(rolls.size).toBe(3)
  })

  it('band boundaries: crit margin and partial window off the same sheet', () => {
    const sheet = sheetWith() // alchemy bonus +5
    // nat 15 + 5 = 20
    expect(resolveCheck({ seed: SEED, sheet, skill: 'alchemy', dc: 12, action: 'x' }).band).toBe(
      'crit',
    ) // margin 8
    expect(resolveCheck({ seed: SEED, sheet, skill: 'alchemy', dc: 13, action: 'x' }).band).toBe(
      'success',
    ) // margin 7
    expect(resolveCheck({ seed: SEED, sheet, skill: 'alchemy', dc: 21, action: 'x' }).band).toBe(
      'partial',
    ) // miss 1
    expect(resolveCheck({ seed: SEED, sheet, skill: 'alchemy', dc: 24, action: 'x' }).band).toBe(
      'partial',
    ) // miss 4
    expect(resolveCheck({ seed: SEED, sheet, skill: 'alchemy', dc: 25, action: 'x' }).band).toBe(
      'fail',
    ) // miss 5
  })

  it('insufficient essence: no roll, no spend, fail band, flagged', () => {
    const sheet = sheetWith({ essence: { current: 1, max: 8 } })
    const record = resolveCheck({
      seed: SEED,
      sheet,
      skill: 'alchemy',
      dc: 10,
      action: 'Channel a surge',
      essenceCost: 3,
    })
    expect(record.insufficientEssence).toBe(true)
    expect(record.essenceRequired).toBe(3)
    expect(record.nat).toBe(0)
    expect(record.essenceSpent).toBe(0)
    expect(record.band).toBe('fail')
  })

  it('sufficient essence records the spend (deduction happens at apply time)', () => {
    const record = resolveCheck({
      seed: SEED,
      sheet: sheetWith(),
      skill: 'channeling',
      dc: 10,
      action: 'Channel a surge',
      essenceCost: 3,
    })
    expect(record.essenceSpent).toBe(3)
    expect(record.insufficientEssence).toBeUndefined()
  })

  it('never mutates its input sheet', () => {
    const sheet = Object.freeze(sheetWith({ essence: Object.freeze({ current: 8, max: 8 }) }))
    expect(() =>
      resolveCheck({
        seed: SEED,
        sheet: sheet as RpgSheet,
        skill: 'alchemy',
        dc: 14,
        action: 'x',
        essenceCost: 2,
      }),
    ).not.toThrow()
  })
})

describe('resolveCheck — spell casts (Phase 4 Step 4)', () => {
  it('resolves normally when the spellId is a known spell', () => {
    const record = resolveCheck({
      seed: SEED,
      sheet: sheetWith({ knownSpells: ['spell-1'] }),
      skill: 'alchemy',
      dc: 14,
      action: 'Cast Swell',
      essenceCost: 2,
      spellId: 'spell-1',
    })
    expect(record.band).toBe('success')
    expect(record.essenceSpent).toBe(2)
    expect(record.spellId).toBe('spell-1')
    expect(record.unknownSpellDropped).toBeUndefined()
  })

  it('drops an unknown spellId and resolves as an ordinary rolled skill check', () => {
    const record = resolveCheck({
      seed: SEED,
      sheet: sheetWith({ knownSpells: ['spell-1'] }),
      skill: 'alchemy',
      dc: 14,
      action: 'Thrust back into her',
      essenceCost: 3,
      spellId: 'spell-unknown',
    })
    // Rolled for real — the tagger's bogus spell must not auto-fail the action.
    expect(record.nat).toBe(15)
    expect(record.total).toBe(record.nat + record.bonus)
    expect(record.band).toBe('success')
    expect(record.essenceSpent).toBe(3)
    // No spell effects downstream: nothing keys on a record with no spellId.
    expect(record.spellId).toBeUndefined()
    expect(record.unknownSpellDropped).toBe(true)
  })

  it('the dropped-spell record is byte-identical to the same check untagged', () => {
    const base = {
      seed: SEED,
      sheet: sheetWith({ knownSpells: ['spell-1'] }),
      skill: 'alchemy' as const,
      dc: 14,
      action: 'Thrust back into her',
      essenceCost: 3,
    }
    const { unknownSpellDropped, ...dropped } = resolveCheck({ ...base, spellId: 'spell-unknown' })
    expect(unknownSpellDropped).toBe(true)
    expect(dropped).toEqual(resolveCheck(base))
  })

  it('an unknown spellId still cannot buy essence it does not have', () => {
    const record = resolveCheck({
      seed: SEED,
      sheet: sheetWith({ essence: { current: 1, max: 8 }, knownSpells: [] }),
      skill: 'alchemy',
      dc: 14,
      action: 'Cast a spell she never learned',
      essenceCost: 3,
      spellId: 'spell-unknown',
    })
    expect(record.insufficientEssence).toBe(true)
    expect(record.essenceRequired).toBe(3)
    expect(record.nat).toBe(0)
    expect(record.essenceSpent).toBe(0)
    expect(record.spellId).toBeUndefined()
    expect(record.unknownSpellDropped).toBe(true)
  })
})
