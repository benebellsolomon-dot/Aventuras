/**
 * RPG layer — skill registry + tuning constants (research/46 §2.2, §8).
 *
 * Tuning values are REFERENCE DEFAULTS in the D5 tradition: numbers chosen to
 * be sane on paper, to be re-derived against real play cadence data. Change
 * them from evidence, not taste.
 */

import type { AttributeId, SkillId } from './types'

export interface SkillDef {
  id: SkillId
  attribute: AttributeId
  label: string
  beThemed: boolean
}

export const SKILLS: ReadonlyArray<SkillDef> = [
  // BE-themed
  { id: 'alchemy', attribute: 'int', label: 'Alchemy', beThemed: true },
  { id: 'anatomy', attribute: 'int', label: 'Anatomy', beThemed: true },
  { id: 'transmutation', attribute: 'int', label: 'Transmutation', beThemed: true },
  { id: 'channeling', attribute: 'wis', label: 'Channeling', beThemed: true },
  { id: 'aftercare', attribute: 'wis', label: 'Aftercare', beThemed: true },
  { id: 'ritualism', attribute: 'wis', label: 'Ritualism', beThemed: true },
  { id: 'handling', attribute: 'dex', label: 'Handling', beThemed: true },
  { id: 'milking', attribute: 'dex', label: 'Milking', beThemed: true },
  { id: 'seduction', attribute: 'cha', label: 'Seduction', beThemed: true },
  { id: 'enchantment', attribute: 'cha', label: 'Enchantment', beThemed: true },
  // Standard
  { id: 'athletics', attribute: 'str', label: 'Athletics', beThemed: false },
  { id: 'fortitude', attribute: 'con', label: 'Fortitude', beThemed: false },
  { id: 'stealth', attribute: 'dex', label: 'Stealth', beThemed: false },
  { id: 'perception', attribute: 'wis', label: 'Perception', beThemed: false },
  { id: 'investigation', attribute: 'int', label: 'Investigation', beThemed: false },
  { id: 'arcana', attribute: 'int', label: 'Arcana', beThemed: false },
  { id: 'persuasion', attribute: 'cha', label: 'Persuasion', beThemed: false },
  { id: 'deception', attribute: 'cha', label: 'Deception', beThemed: false },
]

export const SKILL_IDS = SKILLS.map((s) => s.id) as [SkillId, ...SkillId[]]

export const SKILL_BY_ID: ReadonlyMap<SkillId, SkillDef> = new Map(SKILLS.map((s) => [s.id, s]))

export const ATTRIBUTE_IDS: ReadonlyArray<AttributeId> = ['str', 'dex', 'con', 'int', 'wis', 'cha']

export const ATTRIBUTE_LABELS: Readonly<Record<AttributeId, string>> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
}

// ---- Essence pool (research/46 §8 ruling) ----
export const ESSENCE_BASE = 6
export const ESSENCE_PER_LEVEL = 2
export const ESSENCE_REGEN_PER_PERIOD = 2
/** One "time period" for regen purposes = 6 in-game hours (research/47 ruling 4). */
export const HOURS_PER_PERIOD = 6

// ---- Leveling ----
export const POINTS_PER_LEVEL = { attribute: 1, skill: 2 } as const
/** Attribute scores are point-spent up to this cap (D&D-familiar ceiling). */
export const ATTRIBUTE_CAP = 20
export const SKILL_RANK_CAP = 10

// ---- Check bands (defined beside the resolver in be/roll.ts; re-exported here
// so the whole tuning surface is visible in one table) ----
export { CRIT_MARGIN, CRIT_NAT, PARTIAL_MISS_WINDOW } from '$lib/services/be'

// ---- Skill sets the bond modifier applies to (research/48 Step 7) ----
export const SOCIAL_SKILLS: ReadonlyArray<SkillId> = [
  'seduction',
  'persuasion',
  'deception',
  'enchantment',
]
export const INTIMATE_SKILLS: ReadonlyArray<SkillId> = ['handling', 'milking', 'aftercare']

// ---- DC bounds for generator-tagged choices ----
export const DC_MIN = 1
export const DC_MAX = 40
export const ESSENCE_COST_MAX = 6
