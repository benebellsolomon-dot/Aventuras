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

  it('coerces unknown skill ids to no-skill instead of voiding the choice', () => {
    // One bad field must not void the whole response on providers that don't
    // enforce json-schema constraints (D5 playtest: every choice vanished).
    const parsed = actionChoiceSchema.parse({
      text: 'x',
      type: 'action',
      skill: 'lockpicking',
      dc: 10,
    })
    expect(parsed.skill).toBeUndefined()
    expect(parsed.dc).toBe(10)
  })

  it('coerces out-of-range dc and essenceCost to unset instead of voiding the choice', () => {
    expect(actionChoiceSchema.parse({ text: 'x', type: 'action', dc: 0 }).dc).toBeUndefined()
    expect(actionChoiceSchema.parse({ text: 'x', type: 'action', dc: 41 }).dc).toBeUndefined()
    expect(
      actionChoiceSchema.parse({ text: 'x', type: 'action', essenceCost: 9 }).essenceCost,
    ).toBeUndefined()
  })

  it('coerces an off-list type to action', () => {
    expect(actionChoiceSchema.parse({ text: 'x', type: 'combat' }).type).toBe('action')
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

  it('normalises boolean words for growthIntent, drops junk, strips unknown neighbours', () => {
    // Round 1b: "true"/1 are what a schema-blind model writes — they now resolve;
    // only an un-foldable value drops (to unset, never voiding the choice).
    expect(
      actionChoiceSchema.parse({ text: 'x', type: 'action', growthIntent: 'true' }).growthIntent,
    ).toBe(true)
    expect(
      actionChoiceSchema.parse({ text: 'x', type: 'action', growthIntent: 1 }).growthIntent,
    ).toBe(true)
    expect(
      actionChoiceSchema.parse({ text: 'x', type: 'action', growthIntent: 'maybe' }).growthIntent,
    ).toBeUndefined()
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
