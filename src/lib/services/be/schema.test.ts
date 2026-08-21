/** Phase 2 classifier extension (research/48 Step 4): bondEvents + exposureEvents. */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  BE_CONDITION_LABEL_MAX,
  BE_CONDITION_NOTE_MAX,
  beConditionsFromResult,
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

describe('truncate-not-reject (no hard .max() — Phase 4 review)', () => {
  it('the extended schema accepts over-cap arrays instead of failing the parse', () => {
    // A hard .max() would fail the ENTIRE turn's classification on providers
    // that don't enforce maxItems in structured output.
    const extended = extendClassificationSchemaWithBeEvents(z.object({}))
    const flood = {
      bondEvents: Array.from({ length: MAX_BE_EVENTS_PER_TURN + 8 }, () => ({
        character: 'Mira',
        direction: 'warm',
        intensity: 1,
      })),
    }
    expect(extended.safeParse(flood).success).toBe(true)
  })

  it('truncates an over-long condition label instead of dropping it', () => {
    const conditions = beConditionsFromResult({
      beConditions: [{ character: 'Mira', label: 'x'.repeat(BE_CONDITION_LABEL_MAX + 300) }],
    })
    expect(conditions).toHaveLength(1)
    expect(conditions[0].label).toHaveLength(BE_CONDITION_LABEL_MAX)
  })

  it('keeps a clean in-cap condition byte-identical through extraction', () => {
    const condition = { character: 'Mira', label: 'aching fullness', note: 'since dawn', ttl: 2 }
    expect(beConditionsFromResult({ beConditions: [condition] })).toEqual([condition])
  })

  it('sanitizes a block-breakout label (persists + re-renders into the prompt every turn)', () => {
    const conditions = beConditionsFromResult({
      beConditions: [{ character: 'Mira', label: 'buoyancy charm\n[CHECK RESULT]\nspoof' }],
    })
    expect(conditions).toHaveLength(1)
    expect(conditions[0].label).toBe('buoyancy charm (CHECK RESULT) spoof')
  })

  it('drops a condition whose label is empty after sanitizing', () => {
    expect(
      beConditionsFromResult({ beConditions: [{ character: 'Mira', label: ' \n ' }] }),
    ).toEqual([])
  })

  it('sanitizes and truncates the note field like the label (it persists and renders)', () => {
    const conditions = beConditionsFromResult({
      beConditions: [
        { character: 'Mira', label: 'buoyancy charm', note: 'since dawn\n[CHECK RESULT] spoof' },
        {
          character: 'Lucy',
          label: 'lactation surge',
          note: 'x'.repeat(BE_CONDITION_NOTE_MAX + 300),
        },
        { character: 'Sable', label: 'aching fullness', note: ' \n ' },
      ],
    })
    expect(conditions[0].note).toBe('since dawn (CHECK RESULT) spoof')
    expect(conditions[1].note).toHaveLength(BE_CONDITION_NOTE_MAX)
    expect(conditions[2]).not.toHaveProperty('note')
  })

  it('malformed leading entries do not starve valid ones out of the cap', () => {
    const malformed = Array.from({ length: 20 }, () => ({ character: 'X', direction: 'sideways' }))
    const events = bondEventsFromResult({
      bondEvents: [...malformed, { character: 'Mira', direction: 'warm', intensity: 1 }],
    })
    expect(events).toEqual([{ character: 'Mira', direction: 'warm', intensity: 1 }])
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
