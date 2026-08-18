import { describe, expect, it } from 'vitest'

import { availableInteractions, buildGatedActionsInstruction, type GateInput } from './gating'

function input(overrides: Partial<GateInput> = {}): GateInput {
  return { name: 'Mira', bond: 20, dependence: 0, massKg: 1, quirks: [], ...overrides }
}

describe('availableInteractions gates (both sides of each boundary)', () => {
  it('intimate_handling at bond 45', () => {
    expect(availableInteractions(input({ bond: 44 })).available).not.toContain('intimate_handling')
    expect(availableInteractions(input({ bond: 45 })).available).toContain('intimate_handling')
  })

  it('milking needs bond AND mass', () => {
    expect(availableInteractions(input({ bond: 45, massKg: 2.6 })).available).not.toContain(
      'milking',
    )
    expect(availableInteractions(input({ bond: 44, massKg: 3 })).available).not.toContain('milking')
    expect(availableInteractions(input({ bond: 45, massKg: 2.7 })).available).toContain('milking')
  })

  it('advanced_catalyst: deep trust OR hooked appetite', () => {
    expect(availableInteractions(input({ bond: 70 })).available).toContain('advanced_catalyst')
    expect(availableInteractions(input({ dependence: 35 })).available).toContain(
      'advanced_catalyst',
    )
    expect(availableInteractions(input({ bond: 69, dependence: 34 })).available).not.toContain(
      'advanced_catalyst',
    )
  })

  it('deep_ritual: both, not either', () => {
    expect(availableInteractions(input({ bond: 70, dependence: 60 })).available).toContain(
      'deep_ritual',
    )
    expect(availableInteractions(input({ bond: 70, dependence: 59 })).available).not.toContain(
      'deep_ritual',
    )
  })

  it('a fresh girl gates everything off, with requirements listed', () => {
    const result = availableInteractions(input())
    expect(result.available).toEqual([])
    expect(result.locked.length).toBe(4)
    expect(result.locked.every((l) => l.requirement.length > 0)).toBe(true)
  })
})

describe('buildGatedActionsInstruction', () => {
  it('empty roster → empty string (cache safety)', () => {
    expect(buildGatedActionsInstruction([])).toBe('')
  })

  it('lists per-girl availability and the hard rule', () => {
    const instruction = buildGatedActionsInstruction([
      input({ name: 'Mira', bond: 75, dependence: 40, massKg: 5 }),
      input({ name: 'Sable' }),
    ])
    expect(instruction).toContain('Mira: intimate_handling, milking, advanced_catalyst')
    expect(instruction).toContain('Sable: no gated interactions yet')
    expect(instruction).toContain('Do not offer a gated interaction')
  })
})
