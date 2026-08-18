/**
 * BE engine — per-girl quirk registry (research/46 §8, research/48 Step 2).
 *
 * Mechanics live in CODE (reducer hooks + rpg/modifiers), never in the blurb
 * string. Assignment is deterministic off `${storyId}:${characterId}:quirks` —
 * NEVER an entryId, or a retry rerolls her personality (research/48 R3).
 */

import { seededRoll } from './roll'
import type { BodyState } from './types'

export type QuirkId =
  | 'fast_metabolizer'
  | 'slow_burn'
  | 'greedy_flesh'
  | 'stubborn_frame'
  | 'early_bloomer'
  | 'pressure_prone'
  | 'skittish'
  | 'devoted_heart'
  | 'needy_nipples'
  | 'proud'

export interface QuirkDef {
  id: QuirkId
  label: string
  family: 'growth' | 'lactation' | 'social'
  /** 3 = data-only until the lactation axis lands (research/48 R10). */
  phase: 2 | 3
  /** Prompt/UI-facing one-liner. Flavor only — mechanics live in code. */
  blurb: string
}

export const QUIRKS: ReadonlyArray<QuirkDef> = [
  {
    id: 'fast_metabolizer',
    label: 'Fast Metabolizer',
    family: 'growth',
    phase: 2,
    blurb: 'catalysts hit her harder than they should',
  },
  {
    id: 'slow_burn',
    label: 'Slow Burn',
    family: 'growth',
    phase: 2,
    blurb: 'her growth always arrives a beat late — and lingers',
  },
  {
    id: 'greedy_flesh',
    label: 'Greedy Flesh',
    family: 'growth',
    phase: 2,
    blurb: 'her body recovers fast and always wants more',
  },
  {
    id: 'stubborn_frame',
    label: 'Stubborn Frame',
    family: 'growth',
    phase: 2,
    blurb: 'slow to change, but what she gains she never loses',
  },
  {
    id: 'early_bloomer',
    label: 'Early Bloomer',
    family: 'lactation',
    phase: 3,
    blurb: 'her body is eager to produce at the slightest prompting',
  },
  {
    id: 'pressure_prone',
    label: 'Pressure-Prone',
    family: 'lactation',
    phase: 3,
    blurb: 'she engorges early and dramatically',
  },
  {
    id: 'skittish',
    label: 'Skittish',
    family: 'social',
    phase: 2,
    blurb: 'hard to approach until she truly trusts',
  },
  {
    id: 'devoted_heart',
    label: 'Devoted Heart',
    family: 'social',
    phase: 2,
    blurb: 'attaches deeply and fast — and suffers absence badly',
  },
  {
    id: 'needy_nipples',
    label: 'Needy Nipples',
    family: 'social',
    phase: 2,
    blurb: 'exquisitely sensitive; touch undoes her',
  },
  {
    id: 'proud',
    label: 'Proud',
    family: 'social',
    phase: 2,
    blurb: 'reason will not move her; desire might',
  },
]

export const QUIRK_IDS = QUIRKS.map((q) => q.id)

export const QUIRK_BY_ID: ReadonlyMap<QuirkId, QuirkDef> = new Map(QUIRKS.map((q) => [q.id, q]))

/** Narrow persisted strings to known ids — unknown future ids drop, never throw. */
export function readQuirks(state: BodyState): QuirkId[] {
  if (!Array.isArray(state.quirks)) return []
  return state.quirks.filter((id): id is QuirkId =>
    (QUIRK_IDS as ReadonlyArray<string>).includes(id),
  )
}

export function hasQuirk(state: BodyState, id: QuirkId): boolean {
  return readQuirks(state).includes(id)
}

/**
 * Deterministically assign 1-3 quirks for a seed (50/35/15 count weighting).
 * Same seed → same quirks, forever — assignment is identity, not dice drama.
 */
export function assignQuirks(seed: string): QuirkId[] {
  const countRoll = seededRoll(`${seed}:count`) // 1-20
  const count = countRoll <= 10 ? 1 : countRoll <= 17 ? 2 : 3
  const picked: QuirkId[] = []
  let attempt = 0
  while (picked.length < count && attempt < 50) {
    const index = (seededRoll(`${seed}:${attempt}`) - 1) % QUIRKS.length
    const id = QUIRKS[index].id
    if (!picked.includes(id)) picked.push(id)
    attempt += 1
  }
  return picked
}
