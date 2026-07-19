/**
 * Output-side drift detection (Spec 1 Task 6; Era-1 detector ports per
 * research/36 §3 + the research/41 omission detector). Detectors compare
 * against the PRE-reduce state — what the narrator was shown.
 */
import { describe, expect, test } from 'vitest'
import { detectDrift } from './drift'
import { cupLetter } from './ladder'
import { defaultBodyState } from './metadata'
import type { BodyState } from './types'

const at = (tier: number, extra: Partial<BodyState> = {}): BodyState => ({
  ...defaultBodyState(tier),
  ...extra,
})

const kinds = (narrative: string, state: BodyState): string[] =>
  detectDrift(narrative, 'Lucy', state).map((f) => f.kind)

describe('cup_contradiction', () => {
  test('a prose cup ranking below her tracked cup is flagged', () => {
    // tier 47 is deep in the alphabet; DD is far below it
    const findings = detectDrift('Lucy adjusted her DD-cup bra with a sigh.', 'Lucy', at(47))
    expect(findings.some((f) => f.kind === 'cup_contradiction')).toBe(true)
    // The note deliberately names no absolute size — it can go stale before it
    // renders next turn; it defers to "current tracked size" instead.
    expect(findings[0]?.note).toContain('current tracked size')
  })

  test('her exact tracked cup is fine', () => {
    const letter = cupLetter(47)
    expect(kinds(`Lucy hefted her ${letter}-cup breasts.`, at(47))).toEqual([])
  })

  test('a mention more than 240 chars from her name is not attributed', () => {
    const filler = 'The market stalls stretched on. '.repeat(10) // > 240 chars
    expect(kinds(`Lucy smiled. ${filler} A DD-cup bra hung in the window.`, at(47))).toEqual([])
  })

  test('HTML tags do not shield a contradiction', () => {
    expect(kinds('<p>Lucy tugged at her <em>DD-cup</em> corset.</p>', at(47))).toContain(
      'cup_contradiction',
    )
  })
})

describe('size_overshoot', () => {
  test('a simile far above her band is flagged (12-tier margin)', () => {
    expect(kinds('Lucy’s breasts swayed like watermelons.', at(20))).toContain('size_overshoot')
  })

  test('the same simile within the margin passes', () => {
    expect(kinds('Lucy’s breasts swayed like watermelons.', at(50))).toEqual([])
  })

  test('beach balls need a truly hyper tier', () => {
    expect(kinds('Lucy’s chest loomed like beach balls.', at(100))).toContain('size_overshoot')
    expect(kinds('Lucy’s chest loomed like beach balls.', at(115))).toEqual([])
  })
})

describe('non_breast_growth', () => {
  test('other body parts growing is flagged', () => {
    expect(kinds('Lucy’s hips widened and swelled with the change.', at(20))).toContain(
      'non_breast_growth',
    )
  })

  test('breast growth language alone is not flagged', () => {
    expect(kinds('Lucy’s breasts swelled fuller against the fabric.', at(20))).toEqual([])
  })

  test('ambient "grew" is not flagged — only size-adjective growth (review S2)', () => {
    expect(kinds('Lucy’s shoulders grew tense as she listened.', at(20))).toEqual([])
    expect(kinds('Lucy’s legs grew tired on the long walk home.', at(20))).toEqual([])
    expect(kinds('Lucy’s hips grew wider with the change.', at(20))).toContain('non_breast_growth')
  })
})

describe('growth_omitted (research/41)', () => {
  const staged = at(48, { lastGrowth: { delta: 1, tierBefore: 47 } })

  test('a staged growth directive with zero growth language in the prose is flagged', () => {
    const findings = detectDrift(
      '<p>Lucy leaned back against the counter, her breath slow and even.</p>',
      'Lucy',
      staged,
    )
    expect(findings.some((f) => f.kind === 'growth_omitted')).toBe(true)
  })

  test('any growth-change language counts as rendered', () => {
    expect(
      kinds('<p>Her breasts were visibly swelling, growing fuller by the second.</p>', staged),
    ).toEqual([])
  })

  test('no staged growth, no omission finding', () => {
    expect(kinds('<p>Lucy hummed quietly over the dishes.</p>', at(48))).toEqual([])
  })
})
