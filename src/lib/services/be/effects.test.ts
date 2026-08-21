import { describe, it, expect } from 'vitest'

import {
  EFFECT_KINDS,
  effectTagSchema,
  coerceEffectTags,
  dedupeForCast,
  promoteGrowthIntent,
  translateSpellEffects,
  type EffectTag,
} from './effects'
import {
  CHECK_DEBUFF_CONDITION_PREFIX,
  GROWTH_INTENT_BASE_INTENSITY,
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

    // The growth event carries `guaranteed` — a successful cast's growth does not
    // re-roll in the reducer (the RPG check was the dice). Induction never rolled
    // to begin with, so it carries no marker.
    expect(out.events).toEqual([
      { character: T, kind: 'catalyst', intensity: 2, guaranteed: true },
      { character: T, kind: 'induction', intensity: 1 },
    ])
    // `potent` marks the engine-authored (spell-cast) origin: cap-exempt and
    // doubled in the sparks math (research/60 R-2), classifier can never set it.
    expect(out.bondEvents).toEqual([
      { character: T, direction: 'warm', intensity: 2, potent: true },
    ])
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

  it('every non-fail band marks its growth event guaranteed; other kinds never are', () => {
    // The check already rolled and the narrator already saw the band, so growth
    // from ANY landing band skips the reducer's own d20 — a partial-band cast
    // lands its reduced intensity just as deterministically as a crit.
    const g: EffectTag[] = [{ kind: 'growth', intensity: 2 }]
    for (const band of ['crit', 'success', 'partial'] as const) {
      expect(translateSpellEffects(g, band, T).events[0].guaranteed).toBe(true)
    }
    // Induction and milking resolve without a growth roll to begin with — no
    // marker, so the flag can never leak onto a path that does not read it.
    const others = translateSpellEffects(
      [{ kind: 'induction' }, { kind: 'fill', fillMode: 'drain', intensity: 1 }],
      'success',
      T,
    )
    for (const event of others.events) expect(event.guaranteed).toBeUndefined()
  })

  it('only the CRIT band marks growth as punching through the cooldown', () => {
    // User ruling: a crit lands even on a recovering body; success and partial
    // bank instead. The flag is explicit because intensity cannot carry it — a
    // success-band cast of an intensity-3 spell also emits intensity 3.
    const g: EffectTag[] = [{ kind: 'growth', intensity: 2 }]
    expect(translateSpellEffects(g, 'crit', T).events[0].critPierce).toBe(true)
    for (const band of ['success', 'partial'] as const) {
      expect(translateSpellEffects(g, band, T).events[0].critPierce).toBeUndefined()
    }
    // promoteGrowthIntent rides the same translator, so it inherits the ruling.
    expect(promoteGrowthIntent([], 'crit', T)[0].critPierce).toBe(true)
    expect(promoteGrowthIntent([], 'success', T)[0].critPierce).toBeUndefined()
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

describe('promoteGrowthIntent — check-backed growth without a spell', () => {
  const T = 'Amelia'
  const ev = (kind: BeEvent['kind'], intensity = 1): BeEvent => ({ character: T, kind, intensity })

  it('promotes the mirrored growth event in place, guaranteed and catalyst-kinded', () => {
    // The live failure: a catalyst-only story discards `attempt`, so the paid,
    // successful channel produced nothing at all.
    const out = promoteGrowthIntent([ev('attempt', 2)], 'success', T)
    expect(out).toEqual([{ character: T, kind: 'catalyst', intensity: 2, guaranteed: true }])
  })

  it('synthesizes one catalyst when the classifier proposed no growth at all', () => {
    const out = promoteGrowthIntent([], 'success', T)
    expect(out).toEqual([
      { character: T, kind: 'catalyst', intensity: GROWTH_INTENT_BASE_INTENSITY, guaranteed: true },
    ])
  })

  it('synthesis appends after unrelated classifier events, leaving their indices intact', () => {
    const out = promoteGrowthIntent([ev('milking'), ev('stabilize')], 'success', T)
    expect(out.slice(0, 2)).toEqual([ev('milking'), ev('stabilize')])
    expect(out[2]).toMatchObject({ kind: 'catalyst', guaranteed: true })
  })

  it('rides the cast band ladder exactly: crit +1, success +0, partial −1 (partial still lands)', () => {
    const at = (band: 'crit' | 'success' | 'partial'): number =>
      promoteGrowthIntent([ev('contact', 2)], band, T)[0].intensity
    expect(at('crit')).toBe(3)
    expect(at('success')).toBe(2)
    expect(at('partial')).toBe(1)
    // Partial is a REDUCED landing, not a suppression — same as a partial cast.
    expect(promoteGrowthIntent([ev('contact', 2)], 'partial', T)[0].guaranteed).toBe(true)
  })

  it('fail suppresses the mirrored growth event so a failed attempt cannot grow her', () => {
    expect(promoteGrowthIntent([ev('attempt', 2)], 'fail', T)).toEqual([])
    expect(promoteGrowthIntent([], 'fail', T)).toEqual([])
  })

  it('one-per-source in BOTH directions: a second growth cause keeps rolling on its own', () => {
    const two = [ev('attempt', 2), ev('contact', 1)]
    // success: the first is promoted, the second stays an independent ambient roll
    expect(promoteGrowthIntent(two, 'success', T)).toEqual([
      { character: T, kind: 'catalyst', intensity: 2, guaranteed: true },
      ev('contact', 1),
    ])
    // fail: only the mirror is suppressed
    expect(promoteGrowthIntent(two, 'fail', T)).toEqual([ev('contact', 1)])
  })

  it('never touches non-growth events in either band', () => {
    const others = [ev('milking'), ev('stabilize'), ev('induction')]
    expect(promoteGrowthIntent(others, 'fail', T)).toEqual(others)
    expect(promoteGrowthIntent(others, 'success', T).slice(0, 3)).toEqual(others)
  })
})
