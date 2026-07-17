/**
 * BE engine — typed access to `character.metadata.bodyState` (31b §3.2 storage verdict:
 * piggyback on the metadata column; automatic checkpoint/snapshot/branch coverage).
 *
 * The Zod schema uses `.passthrough()` deliberately: a validator silently stripping
 * undeclared fields cost weeks in the ST era (31a lesson 3) — a newer build's extra
 * fields must survive a round-trip through an older reader.
 */

import { z } from 'zod'
import { bandWord, tierForCupLetter } from './ladder'
import type { BodyState } from './types'

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
      .object({ heightCm: z.number().positive().optional(), build: z.string().optional() })
      .passthrough()
      .optional(),
    pendingGrowth: z.object({ delta: z.number(), source: z.string() }).passthrough().optional(),
    lastGrowth: z.object({ delta: z.number(), tierBefore: z.number() }).passthrough().optional(),
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
  return parsed.data as BodyState
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
