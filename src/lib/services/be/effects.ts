/**
 * BE layer — spell effect vocabulary + translation (RPG Phase 4, research/50).
 *
 * `EffectTag` is the CLOSED, engine-executed vocabulary a spell carries (§2.5).
 * A spell's `effects: EffectTag[]` are translated (Step 2, `translateSpellEffects`)
 * into the reducer's existing input channels — `events[]`, `ReducerExtras`,
 * `softState`, and the Phase-4 `supplyDelta` — so casting reuses one engine.
 *
 * Placement is `be/` deliberately: translation constructs BE types (`BeEvent`,
 * `ReducerExtras`, `BeSoftState`). It must NOT import `rpg/` — the spell's
 * `school` is a `SkillId` but reaches the caster path as a plain string
 * (research/50 trickiest #5), never an import edge from `be/` into `rpg/`.
 */

import { z } from 'zod'

import {
  CHECK_DEBUFF_CONDITION_PREFIX,
  CHECK_DEBUFF_DC_PENALTY,
  GROWTH_EVENT_KINDS,
  SPELL_BAND_INTENSITY_DELTA,
  SUPPLY_SURGE_MAX_DELTA,
} from './constants'
import type { CheckBand } from './roll'
import type { BeEvent, BeSoftState, BodyCondition, BondEvent, ExposureEvent } from './types'

/**
 * The v1 effect vocabulary (research/50 R2). Each kind maps to an existing
 * reducer channel except `supply_surge`, which adds the one new step-7 path.
 * Deferred by ruling O1: dependence-decrease and PC self-buff (no clean path).
 */
export const EFFECT_KINDS = [
  'growth', // catalyst BeEvent (intensity), full growth gates
  'induction', // induction BeEvent
  'condition', // softConditions entry (label + ttl)
  'bond', // BondEvent (direction + intensity)
  'dependence', // ExposureEvent (gain only)
  'fill', // milking BeEvent (drain) OR softState.fluidFill (set)
  'check_debuff', // softConditions label read by rpg buildTargetCheckModifiers
  'supply_surge', // NEW step-7 supplyTier bump
] as const

export type EffectKind = (typeof EFFECT_KINDS)[number]

export interface EffectTag {
  kind: EffectKind
  /** 1–3 magnitude for growth / bond / dependence / supply_surge; default 1. */
  intensity?: number
  /** Condition / check_debuff label. */
  label?: string
  /** Condition / check_debuff duration in turns. */
  ttl?: number
  /** Bond direction. */
  direction?: 'warm' | 'strain'
  /** Fill mode: drain reduces fill (via a milking event), set writes absolute %. */
  fillMode?: 'drain' | 'set'
  /** Fill magnitude: intensity for drain, absolute 0–100 percentage for set. */
  fillValue?: number
}

/**
 * Strict validation for GENERATED spells (research/50 R6): an LLM-authored
 * effect outside this vocabulary fails and is rejected/retried, never saved.
 */
export const effectTagSchema = z.object({
  kind: z.enum(EFFECT_KINDS),
  intensity: z.number().int().min(1).max(3).optional(),
  label: z.string().min(1).max(60).optional(),
  ttl: z.number().int().min(0).max(99).optional(),
  direction: z.enum(['warm', 'strain']).optional(),
  fillMode: z.enum(['drain', 'set']).optional(),
  fillValue: z.number().optional(),
})

/**
 * Tolerant read for PERSISTED spell effects (research/50 R2): drop any entry a
 * newer client authored with an unknown kind, so an older reader survives the
 * spell minus the unknown effect. Matches the beEventSchema coercer posture.
 */
export function coerceEffectTags(raw: unknown): EffectTag[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    const parsed = effectTagSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

/**
 * The reducer inputs a cast's effects translate into, fanned across the three
 * channels of one reduceCharacterBody call plus the Phase-4 supplyDelta.
 * `bondEvents`/`exposureEvents`/`softConditions` slot into ReducerExtras;
 * `softState` is the per-character softState arg; `events` append to the
 * events array (seeded by array index inside the reducer — the caller must
 * append them in a stable order for retry/undo determinism, research/50 R5).
 */
export interface SpellTranslation {
  events: BeEvent[]
  bondEvents: BondEvent[]
  exposureEvents: ExposureEvent[]
  softConditions: BodyCondition[]
  softState?: BeSoftState
  supplyDelta: number
}

function clampIntensity(n: number): number {
  return Math.max(1, Math.min(3, Math.round(n)))
}

const GROWTH_KIND_SET: ReadonlySet<string> = new Set(GROWTH_EVENT_KINDS)

/**
 * R9 anti-double-application (research/50): on a cast turn the spell's effects
 * are authoritative for the target, so the classifier's duplicate same-kind
 * events for that girl are dropped — otherwise a cast that grows her, and whose
 * prose describes the growth, grows her twice (spell event + re-proposed event).
 * Narrow by design: growth is a family (any spell growth kind suppresses all
 * classifier growth kinds); induction/milking dedupe on the exact kind; unrelated
 * classifier events survive untouched. Returns the classifier events to KEEP;
 * the caller appends the spell events after them (stable, index-seeded order).
 */
export function dedupeForCast(
  classifierEvents: ReadonlyArray<BeEvent>,
  spellEvents: ReadonlyArray<BeEvent>,
): BeEvent[] {
  if (spellEvents.length === 0) return [...classifierEvents]
  const spellHasGrowth = spellEvents.some((e) => GROWTH_KIND_SET.has(e.kind))
  const spellKinds = new Set(spellEvents.map((e) => e.kind))
  return classifierEvents.filter((e) => {
    if (spellHasGrowth && GROWTH_KIND_SET.has(e.kind)) return false
    return !spellKinds.has(e.kind)
  })
}

/**
 * Translate a spell's EffectTag[] into reducer inputs, gated and scaled by the
 * cast's band (research/50 R4/R5). Pure: no clock, no RNG (the reducer owns the
 * growth roll). fail → empty (the caller still spends essence). Band adjusts the
 * emitted intensity: crit +1 (cap 3), success +0, partial −1 (floor 1). Kinds
 * with no intensity (condition/check_debuff/fill-set) are gated on non-fail only.
 */
export function translateSpellEffects(
  effects: ReadonlyArray<EffectTag>,
  band: CheckBand,
  targetCharacter: string,
  /** Flat bonus added to every scaled intensity (R11 alchemy-milk empowerment). */
  intensityBonus = 0,
): SpellTranslation {
  const out: SpellTranslation = {
    events: [],
    bondEvents: [],
    exposureEvents: [],
    softConditions: [],
    supplyDelta: 0,
  }

  const delta = SPELL_BAND_INTENSITY_DELTA[band]
  if (delta === null) return out // fail band applies nothing

  const scaled = (base: number | undefined): number =>
    clampIntensity((base ?? 1) + delta + intensityBonus)

  for (const effect of effects) {
    switch (effect.kind) {
      case 'growth':
        out.events.push({
          character: targetCharacter,
          kind: 'catalyst',
          intensity: scaled(effect.intensity),
        })
        break
      case 'induction':
        out.events.push({
          character: targetCharacter,
          kind: 'induction',
          intensity: scaled(effect.intensity),
        })
        break
      case 'bond':
        out.bondEvents.push({
          character: targetCharacter,
          direction: effect.direction ?? 'warm',
          intensity: scaled(effect.intensity),
        })
        break
      case 'dependence':
        out.exposureEvents.push({ character: targetCharacter, intensity: scaled(effect.intensity) })
        break
      case 'condition':
        out.softConditions.push({
          label: effect.label ?? 'enchanted',
          ...(effect.ttl !== undefined ? { ttl: effect.ttl } : {}),
        })
        break
      case 'check_debuff':
        out.softConditions.push({
          label: `${CHECK_DEBUFF_CONDITION_PREFIX}${effect.label ?? 'arcane snare'}`,
          note: `hexed — the caster's checks against her land +${CHECK_DEBUFF_DC_PENALTY} easier`,
          ttl: effect.ttl ?? 2,
        })
        break
      case 'fill':
        if (effect.fillMode === 'set') {
          // Last set wins; the reducer takes one softState per character.
          out.softState = {
            character: targetCharacter,
            fluidFill: Math.max(0, Math.min(100, effect.fillValue ?? 0)),
          }
        } else {
          out.events.push({
            character: targetCharacter,
            kind: 'milking',
            intensity: scaled(effect.intensity ?? effect.fillValue),
          })
        }
        break
      case 'supply_surge':
        out.supplyDelta = Math.min(
          out.supplyDelta + scaled(effect.intensity),
          SUPPLY_SURGE_MAX_DELTA,
        )
        break
    }
  }

  return out
}
