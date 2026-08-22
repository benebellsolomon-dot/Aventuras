import { describe, expect, it } from 'vitest'

import { sanitizeActionChoices, stripGrowthIntent } from './action-choice-hygiene'
import type { ActionChoice } from '../sdk/schemas/actionchoices'

const choice = (text: string, extra: Record<string, unknown> = {}): ActionChoice =>
  ({ text, type: 'action', ...extra }) as unknown as ActionChoice

describe('sanitizeActionChoices', () => {
  it('drops stubs: empty, one word, or bare type words (the live "Say" choice)', () => {
    const kept = sanitizeActionChoices([
      choice('Say', { type: 'dialogue' }),
      choice(''),
      choice('Examine.'),
      choice('Sink back into her cushions and let her take you into her mouth'),
      choice('Go north'),
    ])
    expect(kept.map((c) => c.text)).toEqual([
      'Sink back into her cushions and let her take you into her mouth',
      'Go north',
    ])
  })
})

describe('stripGrowthIntent', () => {
  it('removes only the growthIntent flag', () => {
    const out = stripGrowthIntent(
      choice('Channel essence into your release', {
        skill: 'channeling',
        dc: 14,
        essenceCost: 2,
        growthIntent: true,
      }),
    )
    expect(out.growthIntent).toBeUndefined()
    expect(out).toMatchObject({ skill: 'channeling', dc: 14, essenceCost: 2 })
  })
})
