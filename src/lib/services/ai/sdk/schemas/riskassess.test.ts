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

  it('rejects a non-boolean growthIntent and strips unknown neighbours', () => {
    expect(riskAssessResultSchema.safeParse({ risky: true, growthIntent: 1 }).success).toBe(false)
    expect(riskAssessResultSchema.parse({ risky: true, guaranteed: true })).not.toHaveProperty(
      'guaranteed',
    )
  })

  it('rejects unknown skills and out-of-range dc', () => {
    expect(
      riskAssessResultSchema.safeParse({ risky: true, skill: 'piloting', dc: 12 }).success,
    ).toBe(false)
    expect(
      riskAssessResultSchema.safeParse({ risky: true, skill: 'stealth', dc: 55 }).success,
    ).toBe(false)
  })
})
