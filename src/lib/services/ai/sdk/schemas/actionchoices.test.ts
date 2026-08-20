import { describe, expect, it } from 'vitest'

import { actionChoiceSchema, actionChoicesResultSchema } from './actionchoices'

describe('actionChoiceSchema (research/47 Step 4)', () => {
  it('legacy bare {text,type} choices still parse (persisted sessions)', () => {
    const legacy = { text: 'Open the door', type: 'action' }
    expect(actionChoiceSchema.parse(legacy)).toEqual(legacy)
  })

  it('tagged risky choice parses with skill/dc/essenceCost', () => {
    const tagged = {
      text: 'Coax her into a second dose',
      type: 'dialogue',
      skill: 'seduction',
      dc: 17,
      essenceCost: 2,
    }
    expect(actionChoiceSchema.parse(tagged)).toEqual(tagged)
  })

  it('rejects unknown skill ids', () => {
    expect(
      actionChoiceSchema.safeParse({ text: 'x', type: 'action', skill: 'lockpicking', dc: 10 })
        .success,
    ).toBe(false)
  })

  it('rejects out-of-range dc and essenceCost', () => {
    expect(actionChoiceSchema.safeParse({ text: 'x', type: 'action', dc: 0 }).success).toBe(false)
    expect(actionChoiceSchema.safeParse({ text: 'x', type: 'action', dc: 41 }).success).toBe(false)
    expect(
      actionChoiceSchema.safeParse({ text: 'x', type: 'action', essenceCost: 9 }).success,
    ).toBe(false)
  })

  it('growthIntent parses alongside the target, and stays absent when unset', () => {
    const tagged = {
      text: 'Channel more essence to push her size even further',
      type: 'action',
      skill: 'channeling',
      dc: 14,
      essenceCost: 2,
      targetCharacter: 'Amelia',
      growthIntent: true,
    }
    expect(actionChoiceSchema.parse(tagged)).toEqual(tagged)
    expect(
      actionChoiceSchema.parse({ text: 'x', type: 'action', skill: 'stealth', dc: 12 }),
    ).not.toHaveProperty('growthIntent')
  })

  it('rejects a non-boolean growthIntent and strips unknown neighbours', () => {
    expect(
      actionChoiceSchema.safeParse({ text: 'x', type: 'action', growthIntent: 'yes' }).success,
    ).toBe(false)
    // Unknown keys are stripped, so a model cannot smuggle engine-only markers
    // (e.g. the reducer's `guaranteed`) in through the choice tag.
    expect(
      actionChoiceSchema.parse({ text: 'x', type: 'action', guaranteed: true }),
    ).not.toHaveProperty('guaranteed')
  })

  it('result schema keeps 1-4 bound with mixed tagged/untagged choices', () => {
    const result = {
      choices: [
        { text: 'a', type: 'action', skill: 'athletics', dc: 12 },
        { text: 'b', type: 'move' },
      ],
    }
    expect(actionChoicesResultSchema.parse(result)).toEqual(result)
  })
})
