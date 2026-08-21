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
  GROWTH_INTENT_BASE_INTENSITY,
  SPELL_BAND_INTENSITY_DELTA,
  SPELL_CONDITION_DEFAULT_TTL,
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
 * R9 anti-double-application (research/50), one-per-source (M-1, research/54): on a
 * cast turn the spell's prose describes its own effect, so the classifier tends to
 * re-propose that same effect for the target — grow her twice (spell event +
 * mirrored event) unless suppressed. The suppression is BUDGETED, not blanket: the
 * spell supersedes only as many classifier events as it actually contributes, so a
 * genuinely independent second cause (e.g. an in-prose potion the classifier read
 * as `contact`) survives its own roll rather than being erased with the mirror.
 * Growth is deduped as a FAMILY (any spell growth kind covers any classifier growth
 * kind, shared budget = spell growth-event count); every other kind dedupes on the
 * exact kind (per-kind budget). Extra classifier events beyond the budget are kept.
 * (The reducer's per-turn cooldown still bounds landed growth to one/turn, so kept
 * extras add roll attempts, never runaway.) Returns the classifier events to KEEP;
 * the caller appends the spell events after them (stable, index-seeded order).
 */
export function dedupeForCast(
  classifierEvents: ReadonlyArray<BeEvent>,
  spellEvents: ReadonlyArray<BeEvent>,
): BeEvent[] {
  if (spellEvents.length === 0) return [...classifierEvents]

  // Budget of classifier events the spell may supersede: growth is one shared
  // pool across the family; other kinds are counted per exact kind.
  let growthBudget = spellEvents.filter((e) => GROWTH_KIND_SET.has(e.kind)).length
  const kindBudget = new Map<string, number>()
  for (const e of spellEvents) {
    if (GROWTH_KIND_SET.has(e.kind)) continue
    kindBudget.set(e.kind, (kindBudget.get(e.kind) ?? 0) + 1)
  }

  const kept: BeEvent[] = []
  for (const e of classifierEvents) {
    if (GROWTH_KIND_SET.has(e.kind)) {
      if (growthBudget > 0) {
        growthBudget-- // this one mirrors a spell growth event — drop it
        continue
      }
      kept.push(e) // independent growth cause beyond the spell's contribution
      continue
    }
    const budget = kindBudget.get(e.kind) ?? 0
    if (budget > 0) {
      kindBudget.set(e.kind, budget - 1) // mirrors a same-kind spell event — drop it
      continue
    }
    kept.push(e)
  }
  return kept
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
          // The check already rolled and the narrator already saw the band, so
          // the reducer must not roll again — see BeEvent.guaranteed. Only a
          // non-fail band reaches this line (fail returned above), so a fizzled
          // cast can never emit a guaranteed event. The band's whole influence
          // is the intensity scaling above: crit lands bigger, partial smaller,
          // and BOTH land.
          guaranteed: true,
          // Crit punches through an armed cooldown (user ruling); success and
          // partial bank instead. Carried as its own flag rather than read off
          // the intensity, which a success-band cast can also drive to 3.
          ...(band === 'crit' ? { critPierce: true } : {}),
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
          // L-1: a cast condition with no ttl must not be permanent — default it
          // so it decays and can't crowd MAX_BE_CONDITIONS.
          ttl: effect.ttl ?? SPELL_CONDITION_DEFAULT_TTL,
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

/**
 * Check-backed growth WITHOUT a spell (the second "successful roll, no stats"
 * failure from live play). A free-text action whose stated purpose was to grow
 * the target got check-tagged and spent essence, but mapped to no spell — so
 * `computeSpellCast` produced nothing and the only growth left was the
 * classifier's mirrored `attempt` event, which a catalyst-only story discards
 * as not growth-eligible. Essence paid, check succeeded, narration described
 * growth, engine did nothing.
 *
 * Same ruling as the cast fix: the RPG check IS the dice, so the outcome the
 * narrator was shown must be the outcome the engine applies, in BOTH directions.
 * Takes the target's classifier events for the turn and returns her replacement
 * list:
 *
 * - Landed band (crit/success/partial): the FIRST growth-family event is
 *   PROMOTED in place to the cast-equivalent form — kind coerced to `catalyst`
 *   (the one kind a growth-restricted story is most likely to allow, and the
 *   kind a deliberate essence channel actually is), `guaranteed` set, intensity
 *   run through the cast's own band ladder. If the classifier proposed no growth
 *   for her at all, ONE such event is synthesized instead: a classifier that
 *   under-reports must not nullify a successful, paid-for growth action.
 * - Fail band: the first growth-family event is DROPPED, so a failed attempt
 *   cannot grow her through the classifier side door.
 *
 * One-per-source in both directions, mirroring `dedupeForCast`'s budget: the
 * action is a single cause, so it promotes/suppresses a single mirror and any
 * further growth event stays an independent cause that rolls on its own.
 * Promotion is IN PLACE (not drop-then-append like the cast path) so every other
 * event keeps its array index — the reducer seeds growth rolls as
 * `${seed}:${index}`, and leaving those indices alone keeps co-occurring ambient
 * outcomes byte-identical to a no-intent turn.
 *
 * Nothing here bypasses a reducer safety: eligibility, the size lock, cooldown,
 * the per-turn land cap, size caps, velocity and slow-burn banking all bind
 * exactly as they do for a cast. A story whose config excludes even `catalyst`
 * still grows nobody, and that is correct.
 */
export function promoteGrowthIntent(
  classifierEvents: ReadonlyArray<BeEvent>,
  band: CheckBand,
  targetCharacter: string,
): BeEvent[] {
  const mirrorIndex = classifierEvents.findIndex((e) => GROWTH_KIND_SET.has(e.kind))

  // Fail: the same gate the cast path uses for a fizzle (delta null = no effects).
  if (SPELL_BAND_INTENSITY_DELTA[band] === null) {
    if (mirrorIndex === -1) return [...classifierEvents]
    return classifierEvents.filter((_, index) => index !== mirrorIndex)
  }

  // Intensity comes from translateSpellEffects, not a reimplementation: same
  // band ladder (crit +1 / success +0 / partial −1), same clamp, same
  // `guaranteed` marker, so casts and check-backed growth can never drift apart.
  const base =
    mirrorIndex === -1 ? GROWTH_INTENT_BASE_INTENSITY : classifierEvents[mirrorIndex].intensity
  const [promoted] = translateSpellEffects(
    [{ kind: 'growth', intensity: base }],
    band,
    targetCharacter,
  ).events

  if (mirrorIndex === -1) return [...classifierEvents, promoted]
  return classifierEvents.map((event, index) => (index === mirrorIndex ? promoted : event))
}
