import { describe, expect, it } from 'vitest'

import { defaultBodyState } from './metadata'
import {
  applyExposure,
  applyRelationshipTurn,
  bondCheckModifier,
  bondOf,
  bondStance,
  clampBond,
  clampTrack,
  decayDependence,
  dependenceOf,
  dependenceStage,
  relOf,
  stanceBlurb,
  withdrawalCondition,
} from './tracks'
import type { BodyState, BondEvent, RelationshipState } from './types'

const warm = (intensity: number): BondEvent => ({ character: 'Mira', direction: 'warm', intensity })
const strain = (intensity: number): BondEvent => ({
  character: 'Mira',
  direction: 'strain',
  intensity,
})

const rel = (overrides: Partial<RelationshipState> = {}): RelationshipState => ({
  bond: 4,
  sparks: 0,
  grudge: 0,
  ct: 0,
  warmed: false,
  ...overrides,
})

const onScreen = { ticks: true }
const offScreen = { ticks: false }

describe('band boundaries (single source of truth, −5..+20 scale)', () => {
  it('bond stances at every edge', () => {
    expect(bondStance(-5)).toBe('hostile')
    expect(bondStance(-3)).toBe('hostile')
    expect(bondStance(-2)).toBe('cold')
    expect(bondStance(-1)).toBe('cold')
    expect(bondStance(0)).toBe('wary')
    expect(bondStance(3)).toBe('wary')
    expect(bondStance(4)).toBe('warming')
    expect(bondStance(8)).toBe('warming')
    expect(bondStance(9)).toBe('bonded')
    expect(bondStance(13)).toBe('bonded')
    expect(bondStance(14)).toBe('deeply bonded')
    expect(bondStance(17)).toBe('deeply bonded')
    expect(bondStance(18)).toBe('devoted')
    expect(bondStance(20)).toBe('devoted')
  })

  it('dependence stages at every edge (unchanged 0-100 scale)', () => {
    expect(dependenceStage(0)).toBe('none')
    expect(dependenceStage(14)).toBe('none')
    expect(dependenceStage(15)).toBe('curious')
    expect(dependenceStage(34)).toBe('curious')
    expect(dependenceStage(35)).toBe('hooked')
    expect(dependenceStage(59)).toBe('hooked')
    expect(dependenceStage(60)).toBe('craving')
    expect(dependenceStage(84)).toBe('craving')
    expect(dependenceStage(85)).toBe('bound')
  })

  it('bond check modifier table', () => {
    expect(bondCheckModifier(-5)).toBe(-4)
    expect(bondCheckModifier(-3)).toBe(-4)
    expect(bondCheckModifier(-1)).toBe(-2)
    expect(bondCheckModifier(1)).toBe(-2)
    expect(bondCheckModifier(5)).toBe(0)
    expect(bondCheckModifier(10)).toBe(1)
    expect(bondCheckModifier(15)).toBe(2)
    expect(bondCheckModifier(19)).toBe(3)
  })

  it('every stance carries a behavior blurb', () => {
    for (const bond of [-5, -2, 0, 4, 10, 15, 20]) {
      expect(stanceBlurb(bondStance(bond)).length).toBeGreaterThan(10)
    }
  })
})

describe('relOf — read-through defaults and legacy conversion (research/60)', () => {
  it('unset fields default without touching state', () => {
    const state = defaultBodyState()
    expect(relOf(state)).toEqual({ bond: 4, sparks: 0, grudge: 0, ct: 0, warmed: false })
    expect(bondOf(state)).toBe(4)
    expect(dependenceOf(state)).toBe(0)
    expect(state.rel).toBeUndefined()
    expect(state.bond).toBeUndefined()
  })

  it('legacy 0-100 bond converts by floor(÷5) — every band edge preserved', () => {
    const legacy = (bond: number): BodyState => ({ ...defaultBodyState(), bond })
    expect(bondOf(legacy(0))).toBe(0)
    expect(bondOf(legacy(19))).toBe(3) // wary, as before
    expect(bondOf(legacy(20))).toBe(4)
    expect(bondOf(legacy(44))).toBe(8) // still warming — gates stay locked
    expect(bondOf(legacy(45))).toBe(9)
    expect(bondOf(legacy(69))).toBe(13)
    expect(bondOf(legacy(70))).toBe(14)
    expect(bondOf(legacy(89))).toBe(17)
    expect(bondOf(legacy(90))).toBe(18)
    expect(bondOf(legacy(100))).toBe(20)
  })

  it('legacy conversion preserves the stance at EVERY band edge', () => {
    const stanceOfLegacy = (bond: number): string =>
      bondStance(bondOf({ ...defaultBodyState(), bond }))
    expect(stanceOfLegacy(19)).toBe('wary')
    expect(stanceOfLegacy(20)).toBe('warming')
    expect(stanceOfLegacy(44)).toBe('warming')
    expect(stanceOfLegacy(45)).toBe('bonded')
    expect(stanceOfLegacy(69)).toBe('bonded')
    expect(stanceOfLegacy(70)).toBe('deeply bonded')
    expect(stanceOfLegacy(89)).toBe('deeply bonded')
    expect(stanceOfLegacy(90)).toBe('devoted')
  })

  it('rel wins over a stale legacy bond', () => {
    const state: BodyState = { ...defaultBodyState(), bond: 90, rel: rel({ bond: -2 }) }
    expect(bondOf(state)).toBe(-2)
  })

  it('clamps bounds', () => {
    expect(clampBond(-9)).toBe(-5)
    expect(clampBond(25)).toBe(20)
    expect(clampBond(3.6)).toBe(4)
    expect(clampBond(Number.NaN)).toBe(4)
    expect(clampTrack(-5)).toBe(0)
    expect(clampTrack(101)).toBe(100)
  })
})

describe('applyRelationshipTurn — events', () => {
  it('warm intensity 1 gives +1 spark, intensity 2+ gives +2', () => {
    expect(applyRelationshipTurn(rel(), [warm(1)], onScreen).rel.sparks).toBe(1)
    expect(applyRelationshipTurn(rel(), [warm(2)], onScreen).rel.sparks).toBe(2)
    expect(applyRelationshipTurn(rel(), [warm(3)], onScreen).rel.sparks).toBe(2)
  })

  it('sparks gain caps at +2 per turn and reports capped', () => {
    const result = applyRelationshipTurn(rel(), [warm(3), warm(3)], onScreen)
    expect(result.rel.sparks).toBe(2)
    expect(result.capped).toBe(true)
  })

  it('devoted_heart folds +1 per event AND raises the per-turn cap to 3', () => {
    const single = applyRelationshipTurn(rel(), [warm(1)], { ...onScreen, devotedHeart: true })
    expect(single.rel.sparks).toBe(2)
    const strong = applyRelationshipTurn(rel(), [warm(2)], { ...onScreen, devotedHeart: true })
    expect(strong.rel.sparks).toBe(3) // 2+1, cap 3 — the quirk is never inert
    const gushing = applyRelationshipTurn(rel(), [warm(3), warm(3)], {
      ...onScreen,
      devotedHeart: true,
    })
    expect(gushing.rel.sparks).toBe(3)
    expect(gushing.capped).toBe(true)
  })

  it('warm events NEVER raise bond directly', () => {
    const result = applyRelationshipTurn(rel({ bond: 10 }), [warm(3), warm(3)], onScreen)
    expect(result.rel.bond).toBe(10)
    expect(result.bondDelta).toBe(0)
  })

  it('strain: +1 grudge; only scene-defining (intensity 3) moves bond, −1', () => {
    const mild = applyRelationshipTurn(rel({ bond: 10 }), [strain(1)], onScreen)
    expect(mild.rel.grudge).toBe(1)
    expect(mild.rel.bond).toBe(10)
    const sharp = applyRelationshipTurn(rel({ bond: 10 }), [strain(2)], onScreen)
    expect(sharp.rel.grudge).toBe(1)
    expect(sharp.rel.bond).toBe(10) // no ratchet: sustained conflict damages via grudge
    const betrayal = applyRelationshipTurn(rel({ bond: 10 }), [strain(3)], onScreen)
    expect(betrayal.rel.bond).toBe(9)
  })

  it('grudge gain caps at +1/turn and direct loss at −2/turn', () => {
    const result = applyRelationshipTurn(
      rel({ bond: 10 }),
      [strain(3), strain(3), strain(3)],
      onScreen,
    )
    expect(result.rel.grudge).toBe(1)
    expect(result.rel.bond).toBe(8) // 3 × −1 capped to −2
    expect(result.capped).toBe(true)
  })

  it('a warm event of intensity >= 2 repairs 1 grudge', () => {
    const repaired = applyRelationshipTurn(rel({ grudge: 3 }), [warm(2)], onScreen)
    expect(repaired.rel.grudge).toBe(2)
    const notRepaired = applyRelationshipTurn(rel({ grudge: 3 }), [warm(1)], onScreen)
    expect(notRepaired.rel.grudge).toBe(3)
  })

  it('potent (spell-authored) warm events are cap-exempt and doubled', () => {
    const potent: BondEvent = { character: 'Mira', direction: 'warm', intensity: 2, potent: true }
    const result = applyRelationshipTurn(rel(), [potent, warm(2)], onScreen)
    expect(result.rel.sparks).toBe(6) // 4 potent (cap-exempt) + 2 classifier
    expect(result.capped).toBe(false)
  })

  it('potent strain (a guaranteed curse) lands: doubled grudge + direct loss', () => {
    const curse: BondEvent = { character: 'Mira', direction: 'strain', intensity: 3, potent: true }
    const result = applyRelationshipTurn(rel({ bond: 10 }), [curse], onScreen)
    expect(result.rel.grudge).toBe(2)
    expect(result.rel.bond).toBe(8)
  })

  it('the sparks bank is hard-capped: no passive bond ratchet', () => {
    // Bank at cap, then NO events for many active turns: at most ONE conversion
    // rides on the bank, then the remainder fades to nothing.
    const potent: BondEvent = { character: 'Mira', direction: 'warm', intensity: 2, potent: true }
    const banked = applyRelationshipTurn(rel({ sparks: 12 }), [potent], onScreen)
    expect(banked.rel.sparks).toBe(13) // SPARKS_BANK_CAP, not 16
    expect(banked.capped).toBe(true)

    let current = { ...banked.rel, ct: 0, warmed: false }
    let conversions = 0
    for (let turn = 0; turn < 60 && current.sparks > 0; turn++) {
      const result = applyRelationshipTurn(current, [], onScreen)
      conversions += result.conversions.filter((c) => c === 'sparks').length
      current = result.rel
    }
    expect(conversions).toBe(1) // 13 → 6 (one conversion), then fades below 7
    expect(current.sparks).toBe(0)
  })

  it('repair is void on a turn with fresh strain — mixed scenes accumulate grudge', () => {
    const mixed = applyRelationshipTurn(rel({ grudge: 2 }), [strain(2), warm(2)], onScreen)
    expect(mixed.rel.grudge).toBe(3) // +1 strain, NO same-scene repair
    const apology = applyRelationshipTurn(rel({ grudge: 3 }), [warm(2)], onScreen)
    expect(apology.rel.grudge).toBe(2)
  })

  it('bond clamps at −5', () => {
    const result = applyRelationshipTurn(rel({ bond: -4 }), [strain(3), strain(3)], onScreen)
    expect(result.rel.bond).toBe(-5)
  })
})

describe('applyRelationshipTurn — cadence', () => {
  it('ct only advances on interaction turns (off-screen never fades)', () => {
    expect(applyRelationshipTurn(rel(), [warm(1)], offScreen).rel.ct).toBe(0)
    expect(applyRelationshipTurn(rel(), [warm(1)], onScreen).rel.ct).toBe(1)
  })

  it('sparks convert to +1 bond at the 5th interaction turn when >= 7', () => {
    const result = applyRelationshipTurn(
      rel({ bond: 4, sparks: 6, ct: 4, warmed: true }),
      [warm(1)],
      onScreen,
    )
    expect(result.rel.bond).toBe(5)
    expect(result.rel.sparks).toBe(0) // 6+1=7, spends exactly the threshold
    expect(result.conversions).toEqual(['sparks'])
  })

  it('sub-threshold sparks fade −1 at the check only when the cycle saw no warmth', () => {
    const faded = applyRelationshipTurn(rel({ sparks: 3, ct: 4, warmed: false }), [], onScreen)
    expect(faded.rel.sparks).toBe(2)
    const held = applyRelationshipTurn(rel({ sparks: 3, ct: 4, warmed: true }), [], onScreen)
    expect(held.rel.sparks).toBe(3)
    expect(held.rel.warmed).toBe(false) // flag clears at the check
  })

  it('grudge >= 3 stalls conversion and sparks HOLD, banked until repair', () => {
    const stalled = applyRelationshipTurn(
      rel({ bond: 4, sparks: 8, grudge: 3, ct: 4, warmed: true }),
      [],
      onScreen,
    )
    expect(stalled.rel.bond).toBe(4)
    expect(stalled.rel.sparks).toBe(8)
    expect(stalled.conversions).toEqual(['stalled'])
  })

  it('at a joint check (ct=15) the stall reads the grudge AT the check — monotone', () => {
    // A worse grudge must never outperform a milder one (review R-4): grudge 5
    // boils over (−1) AND still blocks the sparks conversion.
    const worse = applyRelationshipTurn(
      rel({ bond: 4, sparks: 8, grudge: 5, ct: 14, warmed: true }),
      [],
      onScreen,
    )
    expect(worse.rel.bond).toBe(3)
    expect(worse.rel.sparks).toBe(8)
    expect(worse.conversions).toEqual(['grudge', 'stalled'])
    const milder = applyRelationshipTurn(
      rel({ bond: 4, sparks: 8, grudge: 4, ct: 14, warmed: true }),
      [],
      onScreen,
    )
    expect(milder.rel.bond).toBe(4)
    expect(milder.conversions).toEqual(['stalled'])
    const clean = applyRelationshipTurn(
      rel({ bond: 4, sparks: 8, grudge: 0, ct: 14, warmed: true }),
      [],
      onScreen,
    )
    expect(clean.rel.bond).toBe(5)
    expect(clean.rel.sparks).toBe(1)
    expect(clean.conversions).toEqual(['sparks'])
  })

  it('grudge converts to −1 bond at the 3rd interaction turn when >= 5, else decays', () => {
    const boiled = applyRelationshipTurn(rel({ bond: 4, grudge: 5, ct: 2 }), [], onScreen)
    expect(boiled.rel.bond).toBe(3)
    expect(boiled.rel.grudge).toBe(0)
    expect(boiled.conversions).toEqual(['grudge'])
    const decayed = applyRelationshipTurn(rel({ grudge: 2, ct: 2 }), [], onScreen)
    expect(decayed.rel.grudge).toBe(1)
  })

  it('a full patient arc: 7 warm turns convert exactly once', () => {
    let current = rel()
    for (let turn = 0; turn < 5; turn++) {
      current = applyRelationshipTurn(current, [warm(2)], onScreen).rel
    }
    // 5 turns × +2 = 10 sparks by the ct=5 check: bond 4→5, remainder banked
    expect(current.ct).toBe(5)
    expect(current.bond).toBe(5)
    expect(current.sparks).toBe(3) // 10 − 7: banked warmth is never burned
  })
})

describe('applyExposure / decay (unchanged)', () => {
  it('gain by intensity, capped per turn', () => {
    expect(applyExposure(0, [{ character: 'M', intensity: 1 }])).toEqual({
      value: 2,
      delta: 2,
      capped: false,
    })
    const big = applyExposure(0, [
      { character: 'M', intensity: 3 },
      { character: 'M', intensity: 3 },
    ]) // 12 raw → 4
    expect(big.value).toBe(4)
    expect(big.capped).toBe(true)
  })

  it('decays one point per idle beat, floored at 0', () => {
    expect(decayDependence(10)).toBe(9)
    expect(decayDependence(0)).toBe(0)
  })
})

describe('withdrawalCondition (R8, unchanged)', () => {
  it('fires at threshold and idle beats, not below either', () => {
    expect(withdrawalCondition(60, 3, false)?.label).toBe('Withdrawal')
    expect(withdrawalCondition(59, 3, false)).toBeNull()
    expect(withdrawalCondition(60, 2, false)).toBeNull()
  })

  it('devoted_heart lowers the threshold and harshens the note', () => {
    const harsh = withdrawalCondition(45, 3, true)
    expect(harsh).not.toBeNull()
    expect(harsh?.note).toContain('devotion')
    expect(withdrawalCondition(45, 3, false)).toBeNull()
  })

  it('carries a 2-beat ttl', () => {
    expect(withdrawalCondition(80, 5, false)?.ttl).toBe(2)
  })
})
