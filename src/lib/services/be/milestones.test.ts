import { describe, expect, test } from 'vitest'
import { INTERACTION_MILESTONES, nextMilestone } from './milestones'

describe('nextMilestone', () => {
  test('rows ascend strictly by mass', () => {
    for (let i = 1; i < INTERACTION_MILESTONES.length; i++) {
      expect(INTERACTION_MILESTONES[i].massKg).toBeGreaterThan(INTERACTION_MILESTONES[i - 1].massKg)
    }
  })

  test('from zero the first milestone is ahead', () => {
    expect(nextMilestone(0)).toEqual({
      label: 'can no longer go braless comfortably',
      remaining: 1.5,
    })
  })

  test('between rows the next-strictly-ahead row wins, with exact remaining math', () => {
    expect(nextMilestone(5)).toEqual({
      label: 'cannot reach past them to touch her toes',
      remaining: 1,
    })
  })

  test('sitting exactly on a threshold advances to the following row', () => {
    expect(nextMilestone(1.5)?.label).toBe('cleavage visible in any neckline')
  })

  test('past the top of the ladder there is nothing to approach', () => {
    expect(nextMilestone(999)).toBeNull()
  })
})
