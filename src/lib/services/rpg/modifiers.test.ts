import { describe, expect, it } from 'vitest'

import { defaultBodyState } from '$lib/services/be'
import type { BodyState } from '$lib/services/be'
import { buildTargetCheckModifiers } from './modifiers'

function girl(overrides: Partial<BodyState> = {}): BodyState {
  return { ...defaultBodyState(6), ...overrides }
}

const sum = (state: BodyState | null, skill: Parameters<typeof buildTargetCheckModifiers>[1]) =>
  buildTargetCheckModifiers(state, skill).reduce((total, m) => total + m.value, 0)

describe('buildTargetCheckModifiers (research/48 R4 sign contract)', () => {
  it('null state → no modifiers (Phase-1 behavior exactly)', () => {
    expect(buildTargetCheckModifiers(null, 'seduction')).toEqual([])
  })

  it('bond stance table on social skills (default bond 20 = warming = 0)', () => {
    expect(sum(girl(), 'seduction')).toBe(0)
    expect(sum(girl({ bond: 5 }), 'seduction')).toBe(-2)
    expect(sum(girl({ bond: 50 }), 'seduction')).toBe(1)
    expect(sum(girl({ bond: 75 }), 'handling')).toBe(2)
    expect(sum(girl({ bond: 95 }), 'aftercare')).toBe(3)
  })

  it('bond does not touch non-social skills', () => {
    expect(buildTargetCheckModifiers(girl({ bond: 95 }), 'athletics')).toEqual([])
    expect(buildTargetCheckModifiers(girl({ bond: 5 }), 'alchemy')).toEqual([])
  })

  it('skittish: social bonus −2 (DC +2, sign INVERTED) — off at bond exactly 50', () => {
    expect(sum(girl({ quirks: ['skittish'], bond: 30 }), 'persuasion')).toBe(-2)
    expect(sum(girl({ quirks: ['skittish'], bond: 50 }), 'persuasion')).toBe(1) // bond only
  })

  it('needy_nipples: Handling/Milking bonus +2 (DC −2), nothing else', () => {
    expect(sum(girl({ quirks: ['needy_nipples'] }), 'handling')).toBe(2)
    expect(sum(girl({ quirks: ['needy_nipples'] }), 'milking')).toBe(2)
    expect(sum(girl({ quirks: ['needy_nipples'] }), 'seduction')).toBe(0)
  })

  it('proud: Persuasion −2; Seduction explicitly untouched', () => {
    expect(sum(girl({ quirks: ['proud'] }), 'persuasion')).toBe(-2)
    expect(sum(girl({ quirks: ['proud'] }), 'seduction')).toBe(0)
  })

  it('stacking is deterministic and labeled', () => {
    const mods = buildTargetCheckModifiers(
      girl({ quirks: ['skittish', 'proud'], bond: 10 }),
      'persuasion',
    )
    expect(mods.map((m) => m.value)).toEqual([-2, -2, -2]) // bond wary, skittish, proud
    expect(mods.every((m) => m.label.length > 0)).toBe(true)
  })
})
