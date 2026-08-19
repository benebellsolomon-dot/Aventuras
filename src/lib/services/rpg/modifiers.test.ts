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

  // research/49 R10: the induction bonus, sign-pinned like every other quirk.
  it('early_bloomer: Milking bonus +4 (DC −4) while she is NOT yet lactating', () => {
    const mods = buildTargetCheckModifiers(girl({ quirks: ['early_bloomer'] }), 'milking')
    expect(mods).toContainEqual({ label: 'early bloomer (DC −4)', value: 4 })
    expect(sum(girl({ quirks: ['early_bloomer'] }), 'milking')).toBe(4)
  })

  it('early_bloomer: the row is gone once her supply is active (induction is done)', () => {
    const active = girl({
      quirks: ['early_bloomer'],
      lactation: { active: true, supplyTier: 0 },
    })
    expect(sum(active, 'milking')).toBe(0)
    // An inactive block (editor toggle off) is the same as no block at all.
    const toggledOff = girl({
      quirks: ['early_bloomer'],
      lactation: { active: false, supplyTier: 2 },
    })
    expect(sum(toggledOff, 'milking')).toBe(4)
  })

  it('early_bloomer touches nothing but milking checks', () => {
    expect(sum(girl({ quirks: ['early_bloomer'] }), 'handling')).toBe(0)
    expect(sum(girl({ quirks: ['early_bloomer'] }), 'alchemy')).toBe(0)
  })

  it('stacks with needy_nipples on the same milking check', () => {
    expect(sum(girl({ quirks: ['early_bloomer', 'needy_nipples'] }), 'milking')).toBe(6)
  })

  it('stacking is deterministic and labeled', () => {
    const mods = buildTargetCheckModifiers(
      girl({ quirks: ['skittish', 'proud'], bond: 10 }),
      'persuasion',
    )
    expect(mods.map((m) => m.value)).toEqual([-2, -2, -2]) // bond wary, skittish, proud
    expect(mods.every((m) => m.label.length > 0)).toBe(true)
  })

  it('a check_debuff hex condition grants the caster a bonus on any skill (Phase 4)', () => {
    const hexed = girl({ conditions: [{ label: 'hex:arcane snare', ttl: 2 }] })
    expect(sum(hexed, 'transmutation')).toBe(2)
    expect(sum(hexed, 'athletics')).toBe(2) // general — not just social/intimate
    // No hex → no bonus.
    expect(sum(girl(), 'transmutation')).toBe(0)
    // A non-hex condition does not trigger it.
    expect(sum(girl({ conditions: [{ label: 'Engorged', ttl: 2 }] }), 'transmutation')).toBe(0)
  })
})
