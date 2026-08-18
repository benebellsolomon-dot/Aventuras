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

describe('lactation_drift — milk prose while she is not lactating', () => {
  test('nursing/leaking/letdown prose on a non-lactating girl is flagged', () => {
    const findings = detectDrift(
      'Lucy’s breasts were leaking milk through her shirt.',
      'Lucy',
      at(20),
    )
    expect(findings.some((f) => f.kind === 'lactation_drift')).toBe(true)
    expect(findings[0]?.note).toContain('not lactating')
  })

  test('every milk-act phrasing fires', () => {
    for (const prose of [
      'Lucy nursed the child at her breast.',
      'Lucy gasped as milk sprayed across the sheets.',
      'Lucy’s milk let down without warning.',
      'Lucy was expressing milk into a jar.',
      'Lucy felt the letdown hit.',
    ]) {
      expect(kinds(prose, at(20))).toContain('lactation_drift')
    }
  })

  test('an inactive lactation block still counts as not lactating', () => {
    const idle = at(20, { lactation: { active: false, supplyTier: 0 } })
    expect(kinds('Lucy’s milk dripped down her ribs.', idle)).toContain('lactation_drift')
  })

  test('an active girl is never flagged for milk prose', () => {
    const active = at(20, { lactation: { active: true, supplyTier: 0 } })
    expect(kinds('Lucy’s breasts were leaking milk through her shirt.', active)).toEqual([])
  })

  test('NEGATIVE: bare "milk" as groceries or ingredient never fires', () => {
    for (const prose of [
      'Lucy bought milk and eggs at the market.',
      'Lucy poured milk into the batter and stirred.',
      'Lucy set the milk jug on the counter beside the bread.',
      'Lucy asked the nurse for directions to the ward.',
      'Lucy let down her hair and sighed.',
    ]) {
      expect(kinds(prose, at(20))).toEqual([])
    }
  })

  // Review fix 9: the game's own default fluid is milk, and the [BODY STATE]
  // block instructs the narrator to render her fullness. Correcting that is a
  // false positive on every pre-Phase-3 save.
  test('NEGATIVE: milk prose is legitimate when her tracked fluid IS milk and she is visibly full', () => {
    const full = at(20, { fluids: { fillPercent: 60, fluidType: 'milk' } })
    expect(kinds('Lucy’s breasts were leaking milk through her shirt.', full)).toEqual([])
    expect(kinds('Lucy felt the letdown hit.', full)).toEqual([])
    // Case-insensitive on the fluid name.
    const cased = at(20, { fluids: { fillPercent: 40, fluidType: 'Milk' } })
    expect(kinds('Lucy’s milk beaded at her nipple.', cased)).toEqual([])
  })

  test('POSITIVE: below the visible-swelling rung, or on another fluid, it still fires', () => {
    const low = at(20, { fluids: { fillPercent: 39, fluidType: 'milk' } })
    expect(kinds('Lucy’s breasts were leaking milk through her shirt.', low)).toContain(
      'lactation_drift',
    )
    const otherFluid = at(20, { fluids: { fillPercent: 90, fluidType: 'nectar' } })
    expect(kinds('Lucy’s breasts were leaking milk through her shirt.', otherFluid)).toContain(
      'lactation_drift',
    )
  })

  test('milk prose more than 240 chars from her name is not attributed', () => {
    const filler = 'The market stalls stretched on. '.repeat(10)
    expect(
      kinds(`Lucy smiled. ${filler} A stray cat lapped at milk dripping from a pail.`, at(20)),
    ).toEqual([])
  })
})

describe('lactation_drift — written dry while the engine tracks supply', () => {
  const steady = at(20, { lactation: { active: true, supplyTier: 1 } })

  test('dry prose on a steady-supply girl is flagged with her band word', () => {
    const findings = detectDrift('Lucy squeezed, but her breasts were dry.', 'Lucy', steady)
    expect(findings.some((f) => f.kind === 'lactation_drift')).toBe(true)
    expect(findings[0]?.note).toContain('steady')
    expect(findings[0]?.note).toContain('do not write her dry')
  })

  test('every dry phrasing fires', () => {
    for (const prose of [
      'Lucy had no milk to give.',
      'Lucy pressed and nothing came out.',
      'Lucy is not lactating, she insisted.',
      'Lucy’s nipples stayed dry.',
    ]) {
      expect(kinds(prose, steady)).toContain('lactation_drift')
    }
  })

  test('below steady supply the dry rule sleeps', () => {
    const light = at(20, { lactation: { active: true, supplyTier: 0 } })
    expect(kinds('Lucy squeezed, but her breasts were dry.', light)).toEqual([])
    expect(kinds('Lucy squeezed, but her breasts were dry.', at(20))).toEqual([])
  })

  test('NEGATIVE: ambient "dry" prose never fires', () => {
    for (const prose of [
      'Lucy pulled on a dry shirt and shivered.',
      'Lucy’s mouth went dry at the sight.',
      'Lucy laughed, dry and humourless.',
      'Lucy waited, but nothing came of the offer.',
    ]) {
      expect(kinds(prose, steady)).toEqual([])
    }
  })

  test('the two directions can never fire at once', () => {
    const active = at(20, { lactation: { active: true, supplyTier: 2 } })
    const both = detectDrift('Lucy’s milk dripped, though her breasts were dry.', 'Lucy', active)
    expect(both.filter((f) => f.kind === 'lactation_drift')).toHaveLength(1)
  })
})

describe('lactation_drift wire-through (reducer step 11)', () => {
  test('a lactation finding lands in the reduced driftNote', async () => {
    const { reduceCharacterBody } = await import('./reducer')
    const { DEFAULT_BE_STORY_CONFIG } = await import('./constants')
    const state = at(20)
    const findings = detectDrift('Lucy’s breasts were leaking milk.', 'Lucy', state)
    const result = reduceCharacterBody(
      state,
      [],
      { ...DEFAULT_BE_STORY_CONFIG, enabled: true },
      'seed',
      'Lucy',
      undefined,
      { driftFindings: findings },
    )
    expect(result.state.driftNote?.note).toContain('not lactating')
  })
})
