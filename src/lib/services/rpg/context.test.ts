import { describe, expect, it } from 'vitest'

import {
  buildCheckResultBlock,
  buildCheckTaggingInstruction,
  buildPlayerSheetBlock,
  buildPlayerSheetSummary,
  CHECK_RESULT_HEADER,
  PLAYER_SHEET_HEADER,
} from './context'
import { defaultRpgSheet } from './derive'
import type { CheckRecord, RpgSheet } from './types'

function sheet(): RpgSheet {
  return {
    ...defaultRpgSheet(),
    level: 3,
    attributes: { ...defaultRpgSheet().attributes, int: 16, cha: 8 },
    skills: { alchemy: 2, seduction: 1 },
    essence: { current: 6, max: 12 },
  }
}

function record(overrides: Partial<CheckRecord> = {}): CheckRecord {
  return {
    action: 'Brew the catalyst',
    skill: 'alchemy',
    dc: 14,
    nat: 15,
    bonusBreakdown: { attribute: 3, ranks: 2, modifiers: [] },
    bonus: 5,
    total: 20,
    margin: 6,
    band: 'success',
    essenceSpent: 2,
    ...overrides,
  }
}

describe('buildPlayerSheetBlock', () => {
  it('header is the exact stable string, first line (cache-prefix contract)', () => {
    const block = buildPlayerSheetBlock(sheet(), 'Ben')
    expect(block.startsWith(`${PLAYER_SHEET_HEADER}\n`)).toBe(true)
    expect(PLAYER_SHEET_HEADER).toBe('[PLAYER SHEET]')
  })

  it('renders signed mods, ranked skills, essence, and the anti-invention rule', () => {
    const block = buildPlayerSheetBlock(sheet(), 'Ben')
    expect(block).toContain('INT +3')
    expect(block).toContain('CHA -1')
    expect(block).toContain('Alchemy +5')
    expect(block).toContain('Seduction +0') // CHA -1 + 1 rank
    expect(block).toContain('Catalytic essence: 6/12.')
    expect(block).toContain('Do not invent stats, skills, spells, or levels')
  })

  it('carries the one-turn continuity note when present', () => {
    const s = { ...sheet(), driftNote: { note: 'Last turn credited an unknown spell.' } }
    expect(buildPlayerSheetBlock(s, 'Ben')).toContain('[CONTINUITY] Last turn credited')
  })

  it('a non-caster block is byte-identical with and without the empty spell arg (cache guard)', () => {
    expect(buildPlayerSheetBlock(sheet(), 'Ben')).toBe(buildPlayerSheetBlock(sheet(), 'Ben', []))
  })

  it('renders a known-spells line only when spells are learned (Phase 4)', () => {
    const withSpells = buildPlayerSheetBlock(sheet(), 'Ben', [
      'Swell of the Vale (transmutation, ⬡2)',
    ])
    expect(withSpells).toContain('Known spells: Swell of the Vale (transmutation, ⬡2).')
    // The line is absent for a non-caster — no empty "Known spells:" noise.
    expect(buildPlayerSheetBlock(sheet(), 'Ben')).not.toContain('Known spells:')
  })
})

describe('buildCheckResultBlock', () => {
  it('shows the full math, band directive, spend, and the immutability rule', () => {
    const block = buildCheckResultBlock(record())
    expect(block.startsWith(`${CHECK_RESULT_HEADER}\n`)).toBe(true)
    expect(block).toContain('d20 15 +5 = 20 vs DC 14 → SUCCESS')
    expect(block).toContain('Catalytic essence spent: 2.')
    expect(block).toContain('already-resolved fact')
  })

  it('adds a cast directive only for a LANDED, TARGETED spell cast (Phase 4)', () => {
    expect(buildCheckResultBlock(record())).not.toContain('spell cast')
    // Landed + a resolved target → effects applied → the directive fires.
    const cast = buildCheckResultBlock(record({ spellId: 'spell-1', target: 'Amelia' }))
    expect(cast).toContain('This was a spell cast; its effects are already applied')
    // A fizzled cast (fail band) applied nothing — no effect claim.
    const fizzle = buildCheckResultBlock(
      record({ spellId: 'spell-1', band: 'fail', target: 'Amelia' }),
    )
    expect(fizzle).not.toContain('spell cast')
    // An untargeted "narrative-only" cast (R10) applied nothing either.
    const untargeted = buildCheckResultBlock(record({ spellId: 'spell-1' }))
    expect(untargeted).not.toContain('spell cast')
  })

  it.each(['crit', 'success', 'partial', 'fail'] as const)('band %s gets its directive', (band) => {
    const block = buildCheckResultBlock(record({ band }))
    const expectations = {
      crit: 'Critical success',
      success: 'Success:',
      partial: 'Partial success',
      fail: 'Failure:',
    }
    expect(block).toContain(expectations[band])
  })

  it('renders the pre-flight growth verdict as an explicit no-growth directive', () => {
    // The seam this closes: narration sees the band and nothing else, so a crit
    // on a cooldown turn read as permission to write a room-filling eruption.
    const banked = buildCheckResultBlock(
      record({ band: 'crit', growthVerdict: 'blocked_recovery' }),
    )
    expect(banked).toContain('still settling from the last change')
    expect(banked).toContain('BANKS')
    expect(banked).toContain('does NOT visibly change this scene')

    const capped = buildCheckResultBlock(record({ growthVerdict: 'at_cap' }))
    expect(capped).toContain('she is at her limit')

    const blocked = buildCheckResultBlock(record({ growthVerdict: 'blocked' }))
    expect(blocked).toContain('holds her body fixed')
  })

  it('a landing verdict adds nothing — the band directive already licenses it', () => {
    expect(buildCheckResultBlock(record({ growthVerdict: 'lands' }))).toBe(
      buildCheckResultBlock(record()),
    )
  })

  it('insufficient essence renders the not-attempted variant', () => {
    const block = buildCheckResultBlock(
      record({ insufficientEssence: true, nat: 0, essenceSpent: 0 }),
    )
    expect(block).toContain('NOT attempted — insufficient catalytic essence')
    expect(block).not.toContain('d20 0')
  })
})

describe('summaries and tagging instruction', () => {
  it('summary is one line with level, mods, and essence', () => {
    const summary = buildPlayerSheetSummary(sheet())
    expect(summary).toContain('L3')
    expect(summary).toContain('INT+3')
    expect(summary).toContain('essence 6/12')
    expect(summary).not.toContain('\n')
  })

  it('tagging instruction lists valid skill ids and the DC rubric', () => {
    const instruction = buildCheckTaggingInstruction(sheet())
    expect(instruction).toContain('alchemy (INT)')
    expect(instruction).toContain('stealth (DEX)')
    expect(instruction).toContain('DC rubric')
    expect(instruction).toContain('essenceCost')
  })
})
