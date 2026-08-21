/**
 * BE engine — typed access to `character.metadata.bodyState` (31b §3.2 storage verdict:
 * piggyback on the metadata column; automatic checkpoint/snapshot/branch coverage).
 *
 * The Zod schema uses `.passthrough()` deliberately: a validator silently stripping
 * undeclared fields cost weeks in the ST era (31a lesson 3) — a newer build's extra
 * fields must survive a round-trip through an older reader.
 */

import { z } from 'zod'
import { sanitizeDebtText } from '$lib/services/worldsim'
import { BE_CONDITION_LABEL_MAX, BE_CONDITION_NOTE_MAX } from './constants'
import { bandWord, tierForCupLetter } from './ladder'
import type { BodyCondition, BodyState } from './types'

export const BODY_STATE_KEY = 'bodyState'

const conditionSchema = z
  .object({
    label: z.string(),
    note: z.string().optional(),
    ttl: z.number().int().nonnegative().optional(),
  })
  .passthrough()

export const bodyStateSchema = z
  .object({
    tier: z.number().nonnegative(),
    shape: z.enum(['natural', 'firm', 'gravity_defying']),
    fluids: z
      .object({ fillPercent: z.number().min(0).max(100), fluidType: z.string() })
      .passthrough(),
    conditions: z.array(conditionSchema),
    locked: z.boolean(),
    cooldown: z.number().int().nonnegative().default(0),
    baseline: z
      .object({
        heightCm: z.number().positive().optional(),
        build: z.string().optional(),
        waistCm: z.number().positive().optional(),
        hipsCm: z.number().positive().optional(),
        bodyWeightKg: z.number().positive().optional(),
      })
      .passthrough()
      .optional(),
    pendingGrowth: z.object({ delta: z.number(), source: z.string() }).passthrough().optional(),
    lastGrowth: z.object({ delta: z.number(), tierBefore: z.number() }).passthrough().optional(),
    attitude: z.enum(['craving', 'accepting', 'conflicted', 'fearful', 'resentful']).optional(),
    arousal: z.number().min(0).max(100).optional(),
    growthPressure: z.number().nonnegative().optional(),
    driftNote: z.object({ note: z.string() }).passthrough().optional(),
    // LEGACY 0-100 bond — read-only conversion input (research/60); kept so
    // old saves parse. `rel` below is authoritative once present.
    bond: z.number().min(0).max(100).optional(),
    // Relationship track (research/60): bond −5..+20, sparks/grudge/ct
    // accumulators. Optional block — a save without it parses key-identical.
    // NO min/max on bond and defaults on the counters (31a lesson 3 + review
    // R-8): a wider-range value from a newer build must survive this older
    // reader — clampBond/clampCounter normalize at read time in relOf(), and a
    // strict bound here would nuke the ENTIRE body state on parse failure.
    // .catch(undefined): a malformed rel (null, a number, wrong-typed fields)
    // degrades to "no relationship history" instead of failing the WHOLE body
    // state parse — total-loss surface, fix-diff MEDIUM-4.
    rel: z
      .object({
        bond: z.number(),
        sparks: z.number().default(0),
        grudge: z.number().default(0),
        ct: z.number().default(0),
        warmed: z.boolean().default(false),
      })
      .passthrough()
      .optional()
      .catch(undefined),
    dependence: z.number().min(0).max(100).optional(),
    // Plain strings, NOT z.enum(QUIRK_IDS): an unknown future quirk id must
    // survive a round-trip through this (older) reader — narrowing happens at
    // read time in quirks.ts (31a lesson 3).
    quirks: z.array(z.string()).max(3).optional(),
    beatsSinceExposure: z.number().int().nonnegative().optional(),
    // Optional block, optional counters (research/49 R1): a save with no
    // `lactation` key parses back key-identical. `supplyTier` has NO max — an
    // unknown future tier must survive a round-trip through this older reader.
    lactation: z
      .object({
        active: z.boolean(),
        supplyTier: z.number().int().min(0),
        beatsSinceMilked: z.number().int().nonnegative().optional(),
        demandBeats: z.number().int().nonnegative().optional(),
        chronicBeats: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

/** Genre-default transformation fluid — a fallback only; the played story's
 * `settings.beFluidType` is the canonical source at seed time. */
export const DEFAULT_FLUID_TYPE = 'milk'

export function defaultBodyState(tier = 6, fluidType: string = DEFAULT_FLUID_TYPE): BodyState {
  return {
    tier: Math.max(0, tier),
    shape: 'natural',
    fluids: { fillPercent: 0, fluidType: fluidType.trim() || DEFAULT_FLUID_TYPE },
    conditions: [],
    locked: false,
    cooldown: 0,
  }
}

/** Seed a fresh state from a card's cup letter (e.g. "X" or "DD-cup"); null tier → default. */
export function seedBodyStateFromCup(letter: string, fluidType?: string): BodyState {
  const tier = tierForCupLetter(letter)
  return defaultBodyState(tier ?? defaultBodyState().tier, fluidType)
}

/**
 * Stored condition labels/notes are never trusted at read (the worldsim
 * agenda/chekhov reader rule): extraction-time sanitizing only guards NEW
 * writes, and a label poisoned before that hardening (an embedded newline +
 * "[CHECK RESULT]" fake) re-renders into the BE prompt block every turn. A
 * condition whose label sanitizes away entirely is dropped; `note` is
 * overwritten unconditionally — a conditional spread would let the raw value
 * survive the sanitized-empty case (agenda fix-diff lesson).
 */
function sanitizeConditions(conditions: ReadonlyArray<BodyCondition>): BodyCondition[] {
  const sanitized: BodyCondition[] = []
  for (const condition of conditions) {
    const label = sanitizeDebtText(condition.label, BE_CONDITION_LABEL_MAX)
    if (label === '') continue
    const note =
      condition.note === undefined ? '' : sanitizeDebtText(condition.note, BE_CONDITION_NOTE_MAX)
    const next: BodyCondition = { ...condition, label }
    delete next.note
    if (note !== '') next.note = note
    sanitized.push(next)
  }
  return sanitized
}

/**
 * Read bodyState out of a character's metadata. Returns null when absent or
 * unparseable — callers decide whether to seed (BE stories) or ignore (others).
 */
export function readBodyState(metadata: Record<string, unknown> | null): BodyState | null {
  if (!metadata || typeof metadata !== 'object') return null
  const raw = metadata[BODY_STATE_KEY]
  if (raw === undefined || raw === null) return null
  const parsed = bodyStateSchema.safeParse(raw)
  if (!parsed.success) return null
  // The schema defaults `cooldown` for legacy states that predate the field.
  const state = parsed.data as BodyState
  return { ...state, conditions: sanitizeConditions(state.conditions) }
}

/**
 * Return a NEW metadata object with bodyState written, preserving every sibling key
 * (runtimeVars etc.) untouched. The stored state is a deep copy — later mutation of
 * the caller's object cannot reach through into the metadata.
 */
export function writeBodyState(
  metadata: Record<string, unknown> | null,
  state: BodyState,
): Record<string, unknown> {
  return { ...(metadata ?? {}), [BODY_STATE_KEY]: structuredClone(state) }
}

/**
 * Largest engine-tracked tier among the named characters (case-insensitive), or
 * null when none of them carries bodyState.
 */
export function maxBodyStateTier(
  characters: ReadonlyArray<{ name: string; metadata: Record<string, unknown> | null }>,
  names: ReadonlyArray<string>,
): number | null {
  let max: number | null = null
  for (const name of names) {
    const character = characters.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (!character) continue
    const state = readBodyState(character.metadata)
    if (state && (max === null || state.tier > max)) max = state.tier
  }
  return max
}

/**
 * The single body state for an image prompt's cue channel: defined ONLY when
 * exactly one named character carries bodyState (a shared prompt can't wear one
 * character's engorgement/arousal cues).
 */
export function soloBodyState(
  characters: ReadonlyArray<{ name: string; metadata: Record<string, unknown> | null }>,
  names: ReadonlyArray<string>,
): BodyState | null {
  let found: BodyState | null = null
  for (const name of names) {
    const character = characters.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (!character) continue
    const state = readBodyState(character.metadata)
    if (!state) continue
    if (found) return null
    found = state
  }
  return found
}

/**
 * The grounding tier for an image prompt: defined ONLY when every named
 * character carrying bodyState falls in the same size band (then the largest
 * tier of that band, for marker precision). Characters in different bands
 * return null — grounding a shared prompt to one character's size would render
 * the others wrong, so the caller must fall back to the model's own words.
 */
export function uniformBodyStateTier(
  characters: ReadonlyArray<{ name: string; metadata: Record<string, unknown> | null }>,
  names: ReadonlyArray<string>,
): number | null {
  let max: number | null = null
  let band: string | null = null
  for (const name of names) {
    const character = characters.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (!character) continue
    const state = readBodyState(character.metadata)
    if (!state) continue
    const characterBand = bandWord(state.tier)
    if (band === null) band = characterBand
    else if (band !== characterBand) return null
    if (max === null || state.tier > max) max = state.tier
  }
  return max
}
