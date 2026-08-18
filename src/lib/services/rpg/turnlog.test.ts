import { describe, expect, it } from 'vitest'

import type { StoryEntry } from '$lib/types'
import { buildTurnLog } from './turnlog'

const check = (action: string) => ({
  action,
  skill: 'seduction' as const,
  dc: 14,
  nat: 12,
  bonusBreakdown: { attribute: 2, ranks: 0, modifiers: [] },
  bonus: 2,
  total: 14,
  margin: 0,
  band: 'success' as const,
  essenceSpent: 0,
})

const be = (note: string) => ({
  character: 'Mira',
  kind: 'catalyst' as const,
  outcome: 'success' as const,
  delta: 1,
  tierAfter: 7,
  note,
})

function entry(id: string, delta?: object): StoryEntry {
  return { id, type: 'narration', content: 'x', worldStateDelta: delta } as unknown as StoryEntry
}

describe('buildTurnLog (ordering ruling: newest entry first; check before be within one)', () => {
  it('interleaves correctly', () => {
    const rows = buildTurnLog([
      entry('e1', { beLog: [be('older')] }),
      entry('e2', { checkLog: [check('act')], beLog: [be('newer')] }),
    ])
    expect(rows.map((r) => `${r.kind}:${r.entryId}`)).toEqual(['check:e2', 'be:e2', 'be:e1'])
  })

  it('skips entries with neither log and honors the limit', () => {
    const entries = [
      entry('quiet'),
      ...Array.from({ length: 10 }, (_, i) => entry(`e${i}`, { beLog: [be(`n${i}`)] })),
    ]
    expect(buildTurnLog(entries, 4).length).toBe(4)
    expect(buildTurnLog([entry('quiet')])).toEqual([])
  })

  it('a delta with only beLog renders', () => {
    const rows = buildTurnLog([entry('e1', { beLog: [be('solo')] })])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('be')
  })
})
