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
  /**
   * True once the one-time creation point grant (STARTING_POINTS) has been added.
   * Absent on sheets that predate the grant — `withStartingGrant` tops those up
   * exactly once and sets this, so the grant never double-applies.
   */
  startingGrant?: boolean
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
  /** Resolved target character NAME when the check targeted a girl (Phase 2).
   * Display + legacy-record fallback; prefer targetId for identity (Phase 5 D2). */
  target?: string
  /** Resolved target character ID (Phase 5 D2) — disambiguates two same-named
   * girls where matching by `target` name would collide. Optional so legacy
   * records (name-only) still resolve via the name fallback. */
  targetId?: string
  /** Spell lorebook Entry id when this check was a cast (Phase 4). Drives effect
   * application in the store and marks the turn log / drift as a cast. */
  spellId?: string
}
