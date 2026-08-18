import { describe, expect, it } from 'vitest'

import { defaultRpgSheet } from './derive'
import { detectRpgDrift } from './drift'
import type { CheckRecord, RpgSheet } from './types'

function record(overrides: Partial<CheckRecord> = {}): CheckRecord {
  return {
    action: 'Sneak past the guards',
    skill: 'stealth',
    dc: 14,
    nat: 15,
    bonusBreakdown: { attribute: 0, ranks: 0, modifiers: [] },
    bonus: 0,
    total: 15,
    margin: 1,
    band: 'success',
    essenceSpent: 0,
    ...overrides,
  }
}

const sheet: RpgSheet = defaultRpgSheet()

describe('check_contradiction', () => {
  it('fires when a successful check is narrated as failure', () => {
    const findings = detectRpgDrift(
      'He crept forward, but the attempt failed utterly; a guard seized him.',
      sheet,
      record({ band: 'success' }),
    )
    expect(findings.some((f) => f.kind === 'check_contradiction')).toBe(true)
  })

  it('fires when a failed check is narrated as clean success', () => {
    const findings = detectRpgDrift(
      'He slipped by effortlessly, unseen and untroubled.',
      sheet,
      record({ band: 'fail' }),
    )
    expect(findings.some((f) => f.kind === 'check_contradiction')).toBe(true)
  })

  it('does NOT fire on a partial narrated with both success and cost', () => {
    const findings = detectRpgDrift(
      'He succeeded in slipping past — but his sleeve tore, a failure of stealth in miniature that left evidence behind.',
      sheet,
      record({ band: 'partial' }),
    )
    expect(findings.filter((f) => f.kind === 'check_contradiction')).toEqual([])
  })

  it('does not fire without a check record', () => {
    expect(detectRpgDrift('The attempt failed.', sheet, null)).toEqual([])
  })
})

describe('stat_invention', () => {
  it('fires when prose credits mastery of an untrained skill', () => {
    const findings = detectRpgDrift(
      'Drawing on his mastery of Alchemy, he identified the tonic at a glance.',
      sheet,
      null,
    )
    expect(findings.some((f) => f.kind === 'stat_invention')).toBe(true)
  })

  it('does not fire for a trained skill', () => {
    const trained = { ...sheet, skills: { alchemy: 3 } }
    expect(detectRpgDrift('His expertise in alchemy showed immediately.', trained, null)).toEqual(
      [],
    )
  })

  it('does not fire on plain common-noun mentions of a skill word', () => {
    expect(
      detectRpgDrift('Her perception of him shifted; his deception stung.', sheet, null),
    ).toEqual([])
  })
})
