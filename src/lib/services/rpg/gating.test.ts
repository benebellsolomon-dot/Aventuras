import { describe, expect, it } from 'vitest'

import { availableInteractions, buildGatedActionsInstruction, type GateInput } from './gating'

function input(overrides: Partial<GateInput> = {}): GateInput {
  return {
    name: 'Mira',
    bond: 4,
    dependence: 0,
    quirks: [],
    lactationActive: false,
    supplyTier: 0,
    ...overrides,
  }
}

describe('availableInteractions gates (both sides of each boundary)', () => {
  it('intimate_handling at the bonded threshold (bond 9)', () => {
    expect(availableInteractions(input({ bond: 8 })).available).not.toContain('intimate_handling')
    expect(availableInteractions(input({ bond: 9 })).available).toContain('intimate_handling')
  })

  // research/49 R2/risk 8: the milking gate flipped from a carried-mass proxy to
  // an actual engine-tracked supply — expression before induction is gone, and
  // carried mass is no longer an input at all.
  it('milking needs bond AND an active supply', () => {
    expect(availableInteractions(input({ bond: 9 })).available).not.toContain('milking')
    expect(
      availableInteractions(input({ bond: 8, lactationActive: true })).available,
    ).not.toContain('milking')
    expect(availableInteractions(input({ bond: 9, lactationActive: true })).available).toContain(
      'milking',
    )
  })

  it('induce_lactation needs bond and is spent once she is lactating', () => {
    expect(availableInteractions(input({ bond: 8 })).available).not.toContain('induce_lactation')
    expect(availableInteractions(input({ bond: 9 })).available).toContain('induce_lactation')
    expect(
      availableInteractions(input({ bond: 9, lactationActive: true })).available,
    ).not.toContain('induce_lactation')
  })

  it('inducing and milking are mutually exclusive offers', () => {
    const before = availableInteractions(input({ bond: 12 })).available
    const after = availableInteractions(input({ bond: 12, lactationActive: true })).available
    expect(before).toContain('induce_lactation')
    expect(before).not.toContain('milking')
    expect(after).toContain('milking')
    expect(after).not.toContain('induce_lactation')
  })

  it('advanced_catalyst: deep trust OR hooked appetite', () => {
    expect(availableInteractions(input({ bond: 14 })).available).toContain('advanced_catalyst')
    expect(availableInteractions(input({ dependence: 35 })).available).toContain(
      'advanced_catalyst',
    )
    expect(availableInteractions(input({ bond: 13, dependence: 34 })).available).not.toContain(
      'advanced_catalyst',
    )
  })

  it('deep_ritual: both, not either', () => {
    expect(availableInteractions(input({ bond: 14, dependence: 60 })).available).toContain(
      'deep_ritual',
    )
    expect(availableInteractions(input({ bond: 14, dependence: 59 })).available).not.toContain(
      'deep_ritual',
    )
  })

  it('a fresh girl gates everything off, with requirements listed', () => {
    const result = availableInteractions(input())
    expect(result.available).toEqual([])
    expect(result.locked.length).toBe(5)
    expect(result.locked.every((l) => l.requirement.length > 0)).toBe(true)
  })
})

describe('buildGatedActionsInstruction', () => {
  it('empty roster → empty string (cache safety)', () => {
    expect(buildGatedActionsInstruction([])).toBe('')
  })

  it('lists per-girl availability and the hard rule', () => {
    const instruction = buildGatedActionsInstruction([
      input({ name: 'Mira', bond: 15, dependence: 40 }),
      input({ name: 'Sable' }),
    ])
    expect(instruction).toContain('Mira: intimate_handling, induce_lactation, advanced_catalyst')
    expect(instruction).toContain('Sable: no gated interactions yet')
    expect(instruction).toContain('Do not offer a gated interaction')
  })

  it('a lactating girl advertises her supply band alongside her offers', () => {
    const instruction = buildGatedActionsInstruction([
      input({ name: 'Mira', bond: 15, lactationActive: true, supplyTier: 3 }),
    ])
    expect(instruction).toContain('milking')
    expect(instruction).toContain('milk supply: torrential')
  })
})
