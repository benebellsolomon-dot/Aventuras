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
