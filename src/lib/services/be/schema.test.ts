/** Phase 2 classifier extension (research/48 Step 4): bondEvents + exposureEvents. */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  beEventsFromResult,
  bondEventsFromResult,
  buildBeEventInstructions,
  exposureEventsFromResult,
  extendClassificationSchemaWithBeEvents,
  MAX_BE_EVENTS_PER_TURN,
} from './schema'

describe('extendClassificationSchemaWithBeEvents (Phase 2 arrays)', () => {
  it('adds bondEvents/exposureEvents beside the Phase-1 arrays', () => {
    const base = z.object({ entryUpdates: z.object({}), scene: z.object({}) })
    const extended = extendClassificationSchemaWithBeEvents(base) as z.ZodObject<z.ZodRawShape>
    const shape = extended.shape
    expect(shape.beEvents).toBeDefined()
    expect(shape.bondEvents).toBeDefined()
    expect(shape.exposureEvents).toBeDefined()
  })

  it('degrades gracefully: a non-object schema returns by reference', () => {
    const notExtendable = z.string()
    expect(extendClassificationSchemaWithBeEvents(notExtendable)).toBe(notExtendable)
  })
})

describe('coercers (tolerant, Phase-1-compatible)', () => {
  it('a legacy result with only beEvents yields [] from both new coercers', () => {
    const legacy = { beEvents: [{ character: 'Mira', kind: 'catalyst', intensity: 2 }] }
    expect(bondEventsFromResult(legacy)).toEqual([])
    expect(exposureEventsFromResult(legacy)).toEqual([])
  })

  it('valid events coerce; malformed entries drop silently', () => {
    const result = {
      bondEvents: [
        { character: 'Mira', direction: 'warm', intensity: 2 },
        { character: 'Sable', direction: 'sideways', intensity: 1 }, // bad direction
        { character: 'Nell' }, // missing fields
      ],
      exposureEvents: [{ character: 'Mira', intensity: 3 }, { intensity: 1 }],
    }
    expect(bondEventsFromResult(result)).toEqual([
      { character: 'Mira', direction: 'warm', intensity: 2 },
    ])
    expect(exposureEventsFromResult(result)).toEqual([{ character: 'Mira', intensity: 3 }])
  })

  it('a classifier-invented `guaranteed` flag is stripped, never honored', () => {
    // `guaranteed` bypasses the reducer's growth roll, so ONLY the cast
    // translation may set it. The classifier's schema has no such field and Zod
    // strips unknown keys — a model that invents it is silently disarmed.
    const smuggled = {
      beEvents: [{ character: 'Mira', kind: 'catalyst', intensity: 3, guaranteed: true }],
    }
    expect(beEventsFromResult(smuggled)).toEqual([
      { character: 'Mira', kind: 'catalyst', intensity: 3 },
    ])
  })

  it('over-max arrays slice to the cap', () => {
    const flood = {
      bondEvents: Array.from({ length: 40 }, () => ({
        character: 'Mira',
        direction: 'warm',
        intensity: 1,
      })),
    }
    expect(bondEventsFromResult(flood).length).toBe(MAX_BE_EVENTS_PER_TURN)
  })
})

describe('induction events (research/49 Step 3)', () => {
  it('an induction event parses through the beEvents coercer', () => {
    const result = { beEvents: [{ character: 'Mira', kind: 'induction', intensity: 2 }] }
    expect(beEventsFromResult(result)).toEqual([
      { character: 'Mira', kind: 'induction', intensity: 2 },
    ])
  })

  it('the kind enum still rejects invented kinds', () => {
    const result = {
      beEvents: [
        { character: 'Mira', kind: 'lactation', intensity: 1 },
        { character: 'Mira', kind: 'milking', intensity: 1 },
      ],
    }
    expect(beEventsFromResult(result)).toEqual([
      { character: 'Mira', kind: 'milking', intensity: 1 },
    ])
  })

  it('a legacy result carrying only growth kinds still coerces unchanged', () => {
    const legacy = {
      beEvents: [
        { character: 'Mira', kind: 'catalyst', intensity: 2 },
        { character: 'Sable', kind: 'contact', intensity: 1 },
      ],
    }
    expect(beEventsFromResult(legacy)).toEqual(legacy.beEvents)
  })
})

describe('instruction copy', () => {
  it('carries the anti-positivity strain rule and the exposure/growth distinction', () => {
    const instructions = buildBeEventInstructions()
    expect(instructions).toContain('bondEvents')
    expect(instructions).toContain('strain as readily as warmth')
    expect(instructions).toContain('the engine owns the number')
    expect(instructions).toContain('exposureEvents')
    expect(instructions).toContain('dependence, not her growth')
  })

  it('renders the induction section exactly once, with the failed-attempt rule', () => {
    const instructions = buildBeEventInstructions()
    expect(instructions.match(/induction/g)?.length).toBeGreaterThan(0)
    expect(instructions).toContain('her body BEGINS producing')
    expect(instructions).toContain('never because it was attempted')
    // One section, not one per array — the copy must not duplicate.
    expect(instructions.match(/a failed attempt is NOT an induction/g)?.length).toBe(1)
  })

  it('the cosmology suffix does not duplicate the induction copy', () => {
    const withCosmology = buildBeEventInstructions('Ambrosia drives every change here.')
    expect(withCosmology.match(/a failed attempt is NOT an induction/g)?.length).toBe(1)
    expect(withCosmology).toContain('Growth Cosmology')
  })
})
