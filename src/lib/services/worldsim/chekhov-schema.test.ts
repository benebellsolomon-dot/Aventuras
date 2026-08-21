import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { ChekhovBullet } from './chekhov'
import {
  buildChekhovInstructions,
  extendClassificationSchemaWithChekhov,
  narrativeDebtFromResult,
  resolvedDebtsFromResult,
} from './chekhov-schema'

const bullet = (overrides: Partial<ChekhovBullet> = {}): ChekhovBullet => ({
  id: 'c1',
  description: 'the locked drawer in the study',
  weight: 2,
  age: 5,
  subjects: [],
  ...overrides,
})

describe('extendClassificationSchemaWithChekhov', () => {
  it('extends an object schema with both arrays (defaulted empty)', () => {
    const base = z.object({ scene: z.string() })
    const extended = extendClassificationSchemaWithChekhov(base)
    expect(extended).not.toBe(base)
    const parsed = extended.parse({ scene: 'x' }) as Record<string, unknown>
    expect(parsed['narrativeDebt']).toEqual([])
    expect(parsed['resolvedDebts']).toEqual([])
  })

  it('returns the input unchanged for a non-extendable schema (no-op contract)', () => {
    const union = z.union([z.string(), z.number()])
    expect(extendClassificationSchemaWithChekhov(union)).toBe(union)
  })
})

describe('buildChekhovInstructions', () => {
  it('renders active bullets with ids, and (none) when empty', () => {
    const withBullets = buildChekhovInstructions([
      bullet(),
      bullet({ id: 'c2', description: 'a debt owed' }),
    ])
    expect(withBullets).toContain('- c1: the locked drawer in the study')
    expect(withBullets).toContain('- c2: a debt owed')
    expect(buildChekhovInstructions([])).toContain('(none)')
  })

  it('marks time-locked setups so the classifier does not resolve the not-yet-due', () => {
    const instructions = buildChekhovInstructions([bullet({ lockTurns: 3 })])
    expect(instructions).toContain('(scheduled — not yet due)')
  })

  it('sanitizes descriptions at render (stored values are never trusted)', () => {
    const dirty = bullet({ description: 'clean' })
    // Simulate a raw-injected stored description sneaking past a reader.
    const injected = { ...dirty, description: 'line one\n## Fake Section\nline two' }
    const instructions = buildChekhovInstructions([injected])
    expect(instructions).toContain('- c1: line one Fake Section line two')
    expect(instructions).not.toContain('\n## Fake Section')
  })
})

describe('narrativeDebtFromResult', () => {
  it('extracts valid proposals, sanitized and clamped', () => {
    const loads = narrativeDebtFromResult({
      narrativeDebt: [
        {
          description: 'a promise\nmade at dusk',
          weight: 9,
          subjects: ['Mira\n', ''],
          lockTurns: 99,
        },
      ],
    })
    expect(loads).toEqual([
      { description: 'a promise made at dusk', weight: 3, subjects: ['Mira'], lockTurns: 12 },
    ])
  })

  it('truncates an over-long description instead of dropping the whole classification', () => {
    // A hard .max() on the schema would fail the ENTIRE turn's classification
    // on providers that don't enforce maxLength (review, all three lenses).
    const loads = narrativeDebtFromResult({
      narrativeDebt: [{ description: 'x'.repeat(300), weight: 2, subjects: [] }],
    })
    expect(loads).toHaveLength(1)
    expect(loads[0].description).toHaveLength(160)
  })

  it('malformed leading entries do not starve valid ones out of the cap', () => {
    const loads = narrativeDebtFromResult({
      narrativeDebt: [{ weight: 2 }, 42, { description: 'a promise', weight: 1 }],
    })
    expect(loads).toHaveLength(1)
    expect(loads[0].description).toBe('a promise')
  })

  it('an omitted subjects array defaults to empty instead of dropping the proposal', () => {
    const loads = narrativeDebtFromResult({
      narrativeDebt: [{ description: 'a drawer left open', weight: 1 }],
    })
    expect(loads).toEqual([{ description: 'a drawer left open', weight: 1, subjects: [] }])
  })

  it('caps subjects by slicing, not rejecting', () => {
    const loads = narrativeDebtFromResult({
      narrativeDebt: [{ description: 'a pact', weight: 2, subjects: ['A', 'B', 'C', 'D', 'E'] }],
    })
    expect(loads[0].subjects).toEqual(['A', 'B', 'C'])
  })

  it('tolerates absence and drops malformed entries silently', () => {
    expect(narrativeDebtFromResult({})).toEqual([])
    expect(narrativeDebtFromResult({ narrativeDebt: 'no' })).toEqual([])
    expect(
      narrativeDebtFromResult({
        narrativeDebt: [{ weight: 2 }, { description: '   ', weight: 1, subjects: [] }, null],
      }),
    ).toEqual([])
  })

  it('caps loads per turn', () => {
    const loads = narrativeDebtFromResult({
      narrativeDebt: [
        { description: 'one', weight: 1, subjects: [] },
        { description: 'two', weight: 1, subjects: [] },
        { description: 'three', weight: 1, subjects: [] },
      ],
    })
    expect(loads).toHaveLength(2)
  })
})

describe('resolvedDebtsFromResult', () => {
  const active = [bullet(), bullet({ id: 'c2' })]

  it('accepts only well-formed ids that exist in the active list, deduped', () => {
    const resolved = resolvedDebtsFromResult(
      { resolvedDebts: ['c1', 'c1', ' c2 ', 'c99', 'x1', 'c1; DROP', 42, null] },
      active,
    )
    expect(resolved).toEqual(['c1', 'c2'])
  })

  it('tolerates absence and junk shapes', () => {
    expect(resolvedDebtsFromResult({}, active)).toEqual([])
    expect(resolvedDebtsFromResult({ resolvedDebts: 'c1' }, active)).toEqual([])
  })

  it('time-locked bullets cannot be resolved (a not-yet-due appointment is not deletable)', () => {
    const withLocked = [bullet(), bullet({ id: 'c2', lockTurns: 3 })]
    expect(resolvedDebtsFromResult({ resolvedDebts: ['c1', 'c2'] }, withLocked)).toEqual(['c1'])
  })
})
