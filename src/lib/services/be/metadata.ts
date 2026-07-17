/**
 * BE engine — typed access to `character.metadata.bodyState` (31b §3.2 storage verdict:
 * piggyback on the metadata column; automatic checkpoint/snapshot/branch coverage).
 *
 * The Zod schema uses `.passthrough()` deliberately: a validator silently stripping
 * undeclared fields cost weeks in the ST era (31a lesson 3) — a newer build's extra
 * fields must survive a round-trip through an older reader.
 */

import { z } from 'zod'
import { tierForCupLetter } from './ladder'
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
  })
  .passthrough()

export function defaultBodyState(tier = 6): BodyState {
  return {
    tier: Math.max(0, tier),
    shape: 'natural',
    fluids: { fillPercent: 0, fluidType: 'milk' },
    conditions: [],
    locked: false,
    cooldown: 0,
  }
}

/** Seed a fresh state from a card's cup letter (e.g. "X" or "DD-cup"); null tier → default. */
export function seedBodyStateFromCup(letter: string): BodyState {
  const tier = tierForCupLetter(letter)
  return defaultBodyState(tier ?? defaultBodyState().tier)
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
