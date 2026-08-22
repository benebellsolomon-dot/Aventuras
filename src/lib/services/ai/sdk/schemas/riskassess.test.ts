import { describe, expect, it } from 'vitest'

import { riskAssessResultSchema } from './riskassess'

describe('riskAssessResultSchema (research/47 Step 5)', () => {
  it('not-risky verdict needs nothing else', () => {
    expect(riskAssessResultSchema.parse({ risky: false })).toEqual({ risky: false })
  })

  it('risky verdict parses with skill/dc/essenceCost', () => {
    const verdict = { risky: true, skill: 'stealth', dc: 14, essenceCost: 0, rationale: 'guards' }
    expect(riskAssessResultSchema.parse(verdict)).toEqual(verdict)
  })

  it('growthIntent parses alongside the target, and stays absent when unset', () => {
    const verdict = {
      risky: true,
      skill: 'channeling',
      dc: 14,
      essenceCost: 2,
      targetCharacter: 'Amelia',
      growthIntent: true,
    }
    expect(riskAssessResultSchema.parse(verdict)).toEqual(verdict)
    expect(riskAssessResultSchema.parse({ risky: false })).not.toHaveProperty('growthIntent')
  })

  it('normalises boolean words for growthIntent, drops junk, strips unknown neighbours', () => {
    // Pre-1b a non-boolean growthIntent voided the whole verdict (→ not risky).
    expect(riskAssessResultSchema.parse({ risky: true, growthIntent: 'true' }).growthIntent).toBe(
      true,
    )
    expect(riskAssessResultSchema.parse({ risky: true, growthIntent: 1 }).growthIntent).toBe(true)
    expect(riskAssessResultSchema.parse({ risky: true, growthIntent: 'maybe' })).not.toHaveProperty(
      'growthIntent',
      expect.anything(),
    )
    expect(riskAssessResultSchema.parse({ risky: true, guaranteed: true })).not.toHaveProperty(
      'guaranteed',
    )
  })

  it('drops unknown skills and out-of-range dc instead of voiding the verdict (research/63 round 1b)', () => {
    // Pre-1b this was a hard reject; the service caught the parse failure and
    // returned NOT_RISKY, so a schema-blind model ("Perception") silently lost
    // every typed-action check. Now the unusable field drops and the service's
    // own "risky without skill/dc → safe" rule decides.
    expect(riskAssessResultSchema.parse({ risky: true, skill: 'piloting', dc: 12 })).toEqual({
      risky: true,
      dc: 12,
    })
    expect(riskAssessResultSchema.parse({ risky: true, skill: 'stealth', dc: 55 })).toEqual({
      risky: true,
      skill: 'stealth',
    })
  })
})
