import { describe, it, expect } from 'vitest'

import {
  EFFECT_KINDS,
  effectTagSchema,
  coerceEffectTags,
  dedupeForCast,
  translateSpellEffects,
  type EffectTag,
} from './effects'
import {
  CHECK_DEBUFF_CONDITION_PREFIX,
  SPELL_CONDITION_DEFAULT_TTL,
  SUPPLY_SURGE_MAX_DELTA,
} from './constants'
import type { BeEvent } from './types'

describe('EffectTag vocabulary (Phase 4 Step 1)', () => {
  it('exposes exactly the v1 vocabulary', () => {
    expect([...EFFECT_KINDS].sort()).toEqual(
      [
        'bond',
        'check_debuff',
        'condition',
        'dependence',
        'fill',
        'growth',
        'induction',
        'supply_surge',
      ].sort(),
    )
  })

  it('accepts a well-formed tag for each kind', () => {
    const samples: Array<Record<string, unknown>> = [
      { kind: 'growth', intensity: 2 },
      { kind: 'induction', intensity: 1 },
      { kind: 'condition', label: 'buoyancy charm', ttl: 3 },
      { kind: 'bond', direction: 'warm', intensity: 2 },
      { kind: 'dependence', intensity: 1 },
      { kind: 'fill', fillMode: 'set', fillValue: 40 },
      { kind: 'check_debuff', label: 'arcane snare', ttl: 2 },
      { kind: 'supply_surge', intensity: 2 },
    ]
    for (const s of samples) {
      expect(effectTagSchema.safeParse(s).success, JSON.stringify(s)).toBe(true)
    }
  })

  it('rejects an out-of-vocabulary kind', () => {
    expect(effectTagSchema.safeParse({ kind: 'teleport' }).success).toBe(false)
    expect(effectTagSchema.safeParse({ kind: 'dependence_decrease' }).success).toBe(false)
  })

  it('rejects an out-of-range intensity but allows omission', () => {
    expect(effectTagSchema.safeParse({ kind: 'growth', intensity: 4 }).success).toBe(false)
    expect(effectTagSchema.safeParse({ kind: 'growth', intensity: 0 }).success).toBe(false)
    expect(effectTagSchema.safeParse({ kind: 'growth' }).success).toBe(true)
  })

  it('rejects a bad bond direction', () => {
    expect(effectTagSchema.safeParse({ kind: 'bond', direction: 'up' }).success).toBe(false)
  })
})

describe('coerceEffectTags — tolerant read (Phase 4 Step 1)', () => {
  it('keeps valid tags and drops invalid/unknown ones', () => {
    const raw = [
      { kind: 'growth', intensity: 2 },
      { kind: 'teleport' }, // unknown kind — dropped
      { kind: 'bond', direction: 'strain', intensity: 3 },
      { kind: 'growth', intensity: 99 }, // out of range — dropped
      'not an object', // junk — dropped
    ]
    const out = coerceEffectTags(raw)
    expect(out).toEqual([
      { kind: 'growth', intensity: 2 },
      { kind: 'bond', direction: 'strain', intensity: 3 },
    ])
  })

  it('returns [] for non-array input', () => {
    expect(coerceEffectTags(undefined)).toEqual([])
    expect(coerceEffectTags(null)).toEqual([])
    expect(coerceEffectTags({ kind: 'growth' })).toEqual([])
  })
})

describe('translateSpellEffects — channel routing (Phase 4 Step 2)', () => {
  const T = 'Amelia'

  it('routes each kind to the correct reducer channel', () => {
    const effects: EffectTag[] = [
      { kind: 'growth', intensity: 2 },
      { kind: 'induction', intensity: 1 },
      { kind: 'bond', direction: 'warm', intensity: 2 },
      { kind: 'dependence', intensity: 1 },
      { kind: 'condition', label: 'buoyancy charm', ttl: 3 },
      { kind: 'check_debuff', label: 'arcane snare', ttl: 2 },
      { kind: 'supply_surge', intensity: 2 },
    ]
    const out = translateSpellEffects(effects, 'success', T)

    expect(out.events).toEqual([
      { character: T, kind: 'catalyst', intensity: 2 },
      { character: T, kind: 'induction', intensity: 1 },
    ])
    expect(out.bondEvents).toEqual([{ character: T, direction: 'warm', intensity: 2 }])
    expect(out.exposureEvents).toEqual([{ character: T, intensity: 1 }])
    expect(out.softConditions).toContainEqual({ label: 'buoyancy charm', ttl: 3 })
    expect(out.softConditions).toContainEqual(
      expect.objectContaining({ label: `${CHECK_DEBUFF_CONDITION_PREFIX}arcane snare`, ttl: 2 }),
    )
    expect(out.supplyDelta).toBe(2)
  })

  it('a condition effect with no ttl gets a default (never permanent) (L-1)', () => {
    const out = translateSpellEffects([{ kind: 'condition', label: 'glamour' }], 'success', T)
    const cond = out.softConditions.find((c) => c.label === 'glamour')
    expect(cond).toBeDefined()
    expect(cond!.ttl).toBe(SPELL_CONDITION_DEFAULT_TTL)
    expect(cond!.ttl).toBeGreaterThan(0)
  })

  it('fail band applies NOTHING (essence still spent by the caller)', () => {
    const effects: EffectTag[] = [
      { kind: 'growth', intensity: 3 },
      { kind: 'condition', label: 'buoyancy charm' },
    ]
    const out = translateSpellEffects(effects, 'fail', T)
    expect(out.events).toEqual([])
    expect(out.bondEvents).toEqual([])
    expect(out.exposureEvents).toEqual([])
    expect(out.softConditions).toEqual([])
    expect(out.supplyDelta).toBe(0)
    expect(out.softState).toBeUndefined()
  })

  it('crit +1 / partial -1 scale intensity; partial floors at 1', () => {
    const g: EffectTag[] = [{ kind: 'growth', intensity: 2 }]
    expect(translateSpellEffects(g, 'crit', T).events[0].intensity).toBe(3)
    expect(translateSpellEffects(g, 'success', T).events[0].intensity).toBe(2)
    expect(translateSpellEffects(g, 'partial', T).events[0].intensity).toBe(1)
    // intensity 1 on a partial floors at 1, never 0
    const g1: EffectTag[] = [{ kind: 'growth', intensity: 1 }]
    expect(translateSpellEffects(g1, 'partial', T).events[0].intensity).toBe(1)
    // crit caps at 3
    const g3: EffectTag[] = [{ kind: 'growth', intensity: 3 }]
    expect(translateSpellEffects(g3, 'crit', T).events[0].intensity).toBe(3)
  })

  it('fill: drain → milking event, set → absolute softState', () => {
    const drain: EffectTag[] = [{ kind: 'fill', fillMode: 'drain', intensity: 2 }]
    const dout = translateSpellEffects(drain, 'success', T)
    expect(dout.events).toEqual([{ character: T, kind: 'milking', intensity: 2 }])
    expect(dout.softState).toBeUndefined()

    const set: EffectTag[] = [{ kind: 'fill', fillMode: 'set', fillValue: 40 }]
    const sout = translateSpellEffects(set, 'success', T)
    expect(sout.softState).toEqual({ character: T, fluidFill: 40 })
    expect(sout.events).toEqual([])
  })

  it('supply_surge clamps to SUPPLY_SURGE_MAX_DELTA even on a crit', () => {
    const s: EffectTag[] = [{ kind: 'supply_surge', intensity: 3 }]
    expect(translateSpellEffects(s, 'crit', T).supplyDelta).toBe(SUPPLY_SURGE_MAX_DELTA)
  })

  it('is pure and deterministic (same inputs → identical output)', () => {
    const effects: EffectTag[] = [{ kind: 'growth', intensity: 2 }, { kind: 'supply_surge' }]
    const a = translateSpellEffects(effects, 'success', T)
    const b = translateSpellEffects(effects, 'success', T)
    expect(a).toEqual(b)
  })

  it('intensityBonus (R11 alchemy-milk) adds to the scaled intensity, still capped at 3', () => {
    const g: EffectTag[] = [{ kind: 'growth', intensity: 1 }]
    // success (delta 0) + bonus 1 → 2
    expect(translateSpellEffects(g, 'success', T, 1).events[0].intensity).toBe(2)
    // crit (delta +1) + bonus 1 on intensity 2 → capped at 3
    const g2: EffectTag[] = [{ kind: 'growth', intensity: 2 }]
    expect(translateSpellEffects(g2, 'crit', T, 1).events[0].intensity).toBe(3)
    // a fail still applies nothing regardless of bonus
    expect(translateSpellEffects(g, 'fail', T, 1).events).toEqual([])
  })
})

describe('dedupeForCast — R9 anti-double-application (Phase 4 Step 4)', () => {
  const T = 'Amelia'
  const ev = (kind: BeEvent['kind'], intensity = 1): BeEvent => ({ character: T, kind, intensity })

  it('one spell growth supersedes ONE classifier growth event, not the whole family (M-1)', () => {
    const classifier = [ev('catalyst'), ev('contact'), ev('attempt')]
    const spell = [ev('catalyst', 2)]
    // budget = 1 spell growth → drop the first growth-family event; the other two
    // are genuinely independent causes and survive their own reducer rolls.
    expect(dedupeForCast(classifier, spell)).toEqual([ev('contact'), ev('attempt')])
  })

  it('growth budget scales with the number of spell growth events', () => {
    const classifier = [ev('catalyst'), ev('contact'), ev('attempt')]
    // two spell growth events → drop two classifier growth events, keep one
    expect(dedupeForCast(classifier, [ev('catalyst', 2), ev('contact')])).toEqual([ev('attempt')])
  })

  it('a lone classifier growth is fully superseded by a spell growth', () => {
    expect(dedupeForCast([ev('catalyst')], [ev('catalyst', 2)])).toEqual([])
  })

  it('induction and milking dedupe on the exact kind, one-per-source (M-1)', () => {
    const classifier = [ev('induction'), ev('milking'), ev('catalyst')]
    expect(dedupeForCast(classifier, [ev('induction')])).toEqual([ev('milking'), ev('catalyst')])
    expect(dedupeForCast(classifier, [ev('milking')])).toEqual([ev('induction'), ev('catalyst')])
  })

  it('a second independent milking (drain) survives one spell milking — additive (M-1)', () => {
    const classifier = [ev('milking'), ev('milking')]
    // one spell milking supersedes only one classifier drain; the second is a real
    // independent drain and stays (drains are additive in the reducer).
    expect(dedupeForCast(classifier, [ev('milking')])).toEqual([ev('milking')])
  })

  it('unrelated classifier events survive', () => {
    const classifier = [ev('stabilize'), ev('milking')]
    // spell only grows → nothing dropped (stabilize/milking are not growth)
    expect(dedupeForCast(classifier, [ev('catalyst')])).toEqual([ev('stabilize'), ev('milking')])
  })

  it('no spell events → classifier passes through unchanged', () => {
    const classifier = [ev('catalyst'), ev('induction')]
    expect(dedupeForCast(classifier, [])).toEqual(classifier)
  })
})
