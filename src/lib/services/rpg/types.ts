/**
 * RPG layer — state types (research/46 §2.1, research/47 Step 2).
 *
 * The protagonist's sheet lives at `character.metadata.rpgSheet` (sibling of
 * bodyState/runtimeVars) so snapshot/branch/rollback coverage is inherited.
 * Engine-owned: the ONLY writers are StoryStore.applyRpgTurn and explicit
 * user actions in SheetPanel (point spend / rest).
 */

import type { CheckBand } from '$lib/services/be'

export type { CheckBand }

export type AttributeId = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export type SkillId =
  // BE-themed
  | 'alchemy'
  | 'anatomy'
  | 'transmutation'
  | 'channeling'
  | 'aftercare'
  | 'ritualism'
  | 'handling'
  | 'milking'
  | 'seduction'
  | 'enchantment'
  // Standard
  | 'athletics'
  | 'fortitude'
  | 'stealth'
  | 'perception'
  | 'investigation'
  | 'arcana'
  | 'persuasion'
  | 'deception'

export interface RpgSheet {
  level: number
  unspentPoints: { attribute: number; skill: number }
  /** Six D&D scores. Modifiers are always derived (floor((score-10)/2)), never stored. */
  attributes: Record<AttributeId, number>
  /** Skill ranks; a missing key reads as 0. */
  skills: Partial<Record<SkillId, number>>
  /** Catalyst power pool. Max is derived from level but stored for display/rollback. */
  essence: { current: number; max: number }
  /** Spell lorebook entry ids (Phase 4; declared now so saves round-trip). */
  knownSpells: string[]
  /** Idempotency keys for milestone level grants (`${characterId}:${massKg}`). */
  awardedMilestones: string[]
  /** One-turn continuity carrier from RPG drift detection; cleared next apply. */
  driftNote?: { note: string }
}

export interface CheckModifier {
  label: string
  value: number
}

export type RpgDriftKind = 'check_contradiction' | 'stat_invention'

export interface RpgDriftFinding {
  kind: RpgDriftKind
  note: string
}

/** One resolved check — the `checkLog` row riding worldStateDelta. */
export interface CheckRecord {
  action: string
  skill: SkillId
  dc: number
  /** Natural d20. 0 when the check never rolled (insufficient essence). */
  nat: number
  bonusBreakdown: {
    attribute: number
    ranks: number
    modifiers: CheckModifier[]
  }
  bonus: number
  total: number
  /** total - dc (negative = missed by that much). */
  margin: number
  band: CheckBand
  essenceSpent: number
  insufficientEssence?: boolean
  drift?: RpgDriftFinding[]
}
