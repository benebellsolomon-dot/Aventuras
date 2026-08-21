/**
 * boundClassifierExtensionArrays — the extension-seam bound that replaces the
 * removed hard .max()s before the raw result is extracted from and persisted
 * (worldStateDelta.classificationResult).
 */
import { describe, expect, it } from 'vitest'

import { boundClassifierExtensionArrays } from './classifier-bounds'

const bondEvent = () => ({ character: 'Mira', direction: 'warm', intensity: 1 })

describe('boundClassifierExtensionArrays', () => {
  it('returns the same object untouched when no extension arrays are present', () => {
    const result = { entryUpdates: { characterUpdates: [] }, scene: { timeProgression: 'none' } }
    const bound = boundClassifierExtensionArrays(result)
    expect(bound.result).toBe(result)
    expect(bound.overflow).toEqual({})
  })

  it('bounds a runaway array with headroom above the engine cap and reports the overflow', () => {
    const bound = boundClassifierExtensionArrays({
      bondEvents: Array.from({ length: 4000 }, bondEvent),
    })
    // 4× headroom over the engine cap (16) so extractors can still skip
    // malformed leading entries; nothing near 4000 reaches persistence.
    expect((bound.result.bondEvents as unknown[]).length).toBe(64)
    expect(bound.overflow).toEqual({ bondEvents: '4000>16' })
  })

  it('does not report overflow for in-cap arrays and leaves base fields alone', () => {
    const entryUpdates = { characterUpdates: [{ name: 'Mira', update: 'x'.repeat(5000) }] }
    const bound = boundClassifierExtensionArrays({
      entryUpdates,
      bondEvents: [bondEvent()],
    })
    expect(bound.overflow).toEqual({})
    // Base-schema fields are never touched (legit long content lives there).
    expect(bound.result.entryUpdates).toBe(entryUpdates)
    expect(bound.result.bondEvents).toEqual([bondEvent()])
  })

  it('caps entry strings and nested arrays inside extension entries', () => {
    const bound = boundClassifierExtensionArrays({
      beConditions: [{ character: 'Mira', label: 'x'.repeat(40_000), note: 'ok' }],
      narrativeDebt: [
        { description: 'a promise', weight: 2, subjects: Array.from({ length: 50 }, () => 'Mira') },
      ],
      resolvedDebts: ['c1', 'y'.repeat(40_000)],
    })
    const condition = (bound.result.beConditions as Record<string, unknown>[])[0]
    expect((condition.label as string).length).toBe(256)
    expect(condition.note).toBe('ok')
    const debt = (bound.result.narrativeDebt as Record<string, unknown>[])[0]
    expect((debt.subjects as unknown[]).length).toBe(16)
    const resolved = bound.result.resolvedDebts as string[]
    expect(resolved[0]).toBe('c1')
    expect(resolved[1].length).toBe(256)
  })
})
