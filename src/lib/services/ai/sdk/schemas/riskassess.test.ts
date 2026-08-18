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

  it('rejects unknown skills and out-of-range dc', () => {
    expect(
      riskAssessResultSchema.safeParse({ risky: true, skill: 'piloting', dc: 12 }).success,
    ).toBe(false)
    expect(
      riskAssessResultSchema.safeParse({ risky: true, skill: 'stealth', dc: 55 }).success,
    ).toBe(false)
  })
})
