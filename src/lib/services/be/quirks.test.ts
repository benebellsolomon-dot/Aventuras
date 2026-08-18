import { describe, expect, it } from 'vitest'

import { defaultBodyState } from './metadata'
import { assignQuirks, hasQuirk, QUIRK_BY_ID, QUIRKS, readQuirks } from './quirks'

describe('assignQuirks (deterministic identity)', () => {
  it('same seed → identical array, across many seeds', () => {
    for (let i = 0; i < 200; i++) {
      const seed = `story-${i}:char-${i}:quirks`
      expect(assignQuirks(seed)).toEqual(assignQuirks(seed))
    }
  })

  it('count stays within 1-3, no duplicates', () => {
    for (let i = 0; i < 200; i++) {
      const quirks = assignQuirks(`s:${i}:quirks`)
      expect(quirks.length).toBeGreaterThanOrEqual(1)
      expect(quirks.length).toBeLessThanOrEqual(3)
      expect(new Set(quirks).size).toBe(quirks.length)
    }
  })

  it('distinct seeds diverge and every registry id is reachable', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      for (const id of assignQuirks(`reach:${i}`)) seen.add(id)
    }
    for (const def of QUIRKS) expect(seen.has(def.id)).toBe(true)
  })
})

describe('readQuirks / hasQuirk', () => {
  it('narrows persisted strings, dropping unknown future ids without throwing', () => {
    const state = { ...defaultBodyState(), quirks: ['proud', 'not_a_quirk', 'skittish'] }
    expect(readQuirks(state)).toEqual(['proud', 'skittish'])
    expect(hasQuirk(state, 'proud')).toBe(true)
    expect(hasQuirk(state, 'greedy_flesh')).toBe(false)
  })

  it('absent quirks read as empty', () => {
    expect(readQuirks(defaultBodyState())).toEqual([])
  })
})

describe('phase gating (R10)', () => {
  it('the two lactation quirks are registered but phase 3 (data-only)', () => {
    expect(QUIRK_BY_ID.get('early_bloomer')?.phase).toBe(3)
    expect(QUIRK_BY_ID.get('pressure_prone')?.phase).toBe(3)
    for (const id of [
      'fast_metabolizer',
      'slow_burn',
      'greedy_flesh',
      'stubborn_frame',
      'skittish',
      'devoted_heart',
      'needy_nipples',
      'proud',
    ] as const) {
      expect(QUIRK_BY_ID.get(id)?.phase).toBe(2)
    }
  })
})
