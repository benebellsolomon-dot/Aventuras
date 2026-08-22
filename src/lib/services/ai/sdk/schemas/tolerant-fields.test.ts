/**
 * Tolerant RPG field schemas (research/63 round 1b): the D5 live failure was
 * DC chips silently vanishing — models behind NanoGPT never saw the enum and
 * wrote "Perception" / "dc": "12", which the round-1 `.catch(undefined)`
 * dropped without a trace.
 */
import { describe, expect, it } from 'vitest'
import { zodSchema } from 'ai'

import { actionChoiceSchema, actionChoicesResultSchema } from './actionchoices'
import { riskAssessResultSchema } from './riskassess'
import { suggestionSchema } from './suggestions'
import { looseBoolean, looseInt, normalizeSkillInput } from './tolerant-fields'
import { classificationResultSchema, type ClassificationResult } from './classifier'
import type { RiskAssessResult } from './riskassess'
import type { z } from 'zod'

describe('normalizeSkillInput / looseInt', () => {
  it('folds case, labels, parenthetical attributes and spaces into skill ids', () => {
    expect(normalizeSkillInput('Perception')).toBe('perception')
    expect(normalizeSkillInput(' athletics (STR) ')).toBe('athletics')
    expect(normalizeSkillInput('SEDUCTION')).toBe('seduction')
    expect(normalizeSkillInput('')).toBeUndefined()
    expect(normalizeSkillInput(42)).toBe(42)
    // Whole-word fallback: a qualified form resolves when exactly one id appears.
    expect(normalizeSkillInput('Stealth check')).toBe('stealth')
    expect(normalizeSkillInput('skill: perception')).toBe('perception')
    expect(normalizeSkillInput('Arcana/Investigation')).toBe('arcanainvestigation')
    expect(normalizeSkillInput('stealth or deception')).toBe('stealth_or_deception')
  })

  it('folds boolean words', () => {
    expect(looseBoolean('true')).toBe(true)
    expect(looseBoolean('No')).toBe(false)
    expect(looseBoolean(1)).toBe(true)
    expect(looseBoolean('maybe')).toBe('maybe')
  })

  it('parses numeric strings and rounds floats, leaves junk to fail the inner schema', () => {
    expect(looseInt('12')).toBe(12)
    expect(looseInt(' 14 ')).toBe(14)
    expect(looseInt(11.6)).toBe(12)
    expect(looseInt('')).toBeUndefined()
    expect(looseInt('hard')).toBe('hard')
  })
})

describe('actionChoiceSchema tolerant RPG fields', () => {
  it('accepts the shapes a schema-blind model writes: cased skill, string dc, cased type', () => {
    expect(
      actionChoiceSchema.parse({ text: 'x', type: 'Examine', skill: 'Perception', dc: '12' }),
    ).toEqual({ text: 'x', type: 'examine', skill: 'perception', dc: 12 })
    expect(
      actionChoiceSchema.parse({ text: 'x', type: 'action', skill: 'athletics (STR)', dc: 11.4 }),
    ).toEqual({ text: 'x', type: 'action', skill: 'athletics', dc: 11 })
  })

  it('still drops an unknown skill / out-of-range dc without voiding the choice', () => {
    const parsed = actionChoiceSchema.parse({
      text: 'x',
      type: 'action',
      skill: 'lockpicking',
      dc: 99,
    })
    expect(parsed).toEqual({ text: 'x', type: 'action' })
  })

  it('treats blank skill/dc/essenceCost as unset', () => {
    expect(
      actionChoiceSchema.parse({
        text: 'x',
        type: 'action',
        skill: '',
        dc: '',
        essenceCost: 'none',
      }),
    ).toEqual({ text: 'x', type: 'action' })
  })

  it('keeps the response_format JSON schema intact (enum + integer bounds + descriptions)', () => {
    const js = zodSchema(actionChoicesResultSchema).jsonSchema as {
      properties: { choices: { items: { properties: Record<string, Record<string, unknown>> } } }
    }
    const props = js.properties.choices.items.properties
    expect(props.skill.enum).toContain('perception')
    expect(props.skill.description).toMatch(/risky choice/)
    expect(props.dc.type).toBe('integer')
    expect(props.dc.minimum).toBe(1)
    expect(props.dc.maximum).toBe(40)
    expect(props.growthIntent.type).toBe('boolean')
    expect(props.type.enum).toEqual(['action', 'dialogue', 'examine', 'move'])
    expect(js.properties.choices.items).toMatchObject({ required: ['text'] })
  })
})

describe('classifier enums', () => {
  it('folds cased statuses/types and drops off-list ones without voiding the turn', () => {
    const parsed = classificationResultSchema.parse({
      entryUpdates: {
        newCharacters: [{ name: 'Elara', status: 'Active' }],
        characterUpdates: [{ name: 'Amelia', changes: { status: 'Away' } }],
        newStoryBeats: [{ title: 'Find the chart', type: 'Quest', status: 'in progress' }],
      },
      scene: { currentLocationName: null, presentCharacterNames: [], timeProgression: 'Minutes' },
    })
    expect(parsed.entryUpdates.newCharacters[0].status).toBe('active')
    expect(parsed.entryUpdates.characterUpdates[0].changes.status).toBeUndefined()
    expect(parsed.entryUpdates.newStoryBeats[0]).toMatchObject({ type: 'quest' })
    expect(parsed.entryUpdates.newStoryBeats[0].status).toBeUndefined()
    expect(parsed.scene.timeProgression).toBe('minutes')
    expect(
      classificationResultSchema.parse({ entryUpdates: {}, scene: { timeProgression: 'ages' } })
        .scene.timeProgression,
    ).toBe('none')
  })

  it('still emits the enums in the response_format schema', () => {
    const js = zodSchema(classificationResultSchema).jsonSchema as {
      properties: { scene: { properties: { timeProgression: { enum: string[] } } } }
    }
    expect(js.properties.scene.properties.timeProgression.enum).toEqual([
      'none',
      'minutes',
      'hours',
      'days',
    ])
  })
})

describe('inferred types stay narrow', () => {
  it('z.infer of the tolerant schemas is assignable to the hand-declared interfaces', () => {
    type Inferred = z.infer<typeof riskAssessResultSchema>
    const check: RiskAssessResult = {} as Inferred
    const scene: ClassificationResult['scene'] = {
      currentLocationName: null,
      presentCharacterNames: [],
      timeProgression: 'none',
    }
    expect(check).toBeDefined()
    expect(scene.timeProgression).toBe('none')
  })
})

describe('riskAssessResultSchema tolerant RPG fields', () => {
  it('a "Perception"/"12" verdict resolves instead of failing the parse (→ not risky)', () => {
    expect(riskAssessResultSchema.parse({ risky: true, skill: 'Perception', dc: '12' })).toEqual({
      risky: true,
      skill: 'perception',
      dc: 12,
    })
  })

  it('unknown skill drops to unset (the service then treats the action as safe)', () => {
    expect(riskAssessResultSchema.parse({ risky: true, skill: 'lockpicking', dc: 12 })).toEqual({
      risky: true,
      dc: 12,
    })
  })
})

describe('suggestionSchema type', () => {
  it('case-normalises and falls back off-list', () => {
    expect(suggestionSchema.parse({ text: 'x', type: 'Twist' }).type).toBe('twist')
    expect(suggestionSchema.parse({ text: 'x', type: 'cliffhanger' }).type).toBe('action')
  })
})
