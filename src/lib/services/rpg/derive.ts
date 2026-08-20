/**
 * RPG layer — pure derivations (research/47 Step 2). Everything the UI or the
 * check pipeline computes from a sheet lives here so it is unit-testable;
 * .svelte files hold markup only.
 */

import type { TimeTracker } from '$lib/types'
import {
  ATTRIBUTE_IDS,
  ESSENCE_BASE,
  ESSENCE_PER_LEVEL,
  HOURS_PER_PERIOD,
  SKILL_BY_ID,
  STARTING_POINTS,
} from './constants'
import type { AttributeId, RpgSheet, SkillId } from './types'

export const attributeMod = (score: number): number => Math.floor((score - 10) / 2)

export function skillRanks(sheet: RpgSheet, skill: SkillId): number {
  return sheet.skills[skill] ?? 0
}

/** attribute mod + ranks — the sheet-derived part of a check bonus. */
export function checkBonus(sheet: RpgSheet, skill: SkillId): number {
  const def = SKILL_BY_ID.get(skill)
  const attrScore = def ? sheet.attributes[def.attribute] : 10
  return attributeMod(attrScore) + skillRanks(sheet, skill)
}

export const essenceMax = (level: number): number => ESSENCE_BASE + ESSENCE_PER_LEVEL * level

/** Monotone period counter over story time (24h days / 365d years, matching
 * StoryStore.normalizeTime). Regen fires when this increments across a turn. */
export function periodIndex(tracker: TimeTracker): number {
  const totalHours = ((tracker.years * 365 + tracker.days) * 24 + tracker.hours) as number
  return Math.floor(totalHours / HOURS_PER_PERIOD)
}

/**
 * P(success or better) for a d20 + bonus vs dc, as 0..1. Drives the DC-chip
 * odds tint — nat-based crit/fail nuances are irrelevant to "will it succeed".
 */
export function successOdds(bonus: number, dc: number): number {
  let wins = 0
  for (let nat = 1; nat <= 20; nat++) {
    if (nat + bonus >= dc) wins += 1
  }
  return wins / 20
}

export type OddsBand = 'favored' | 'even' | 'longshot'

export function oddsBand(odds: number): OddsBand {
  if (odds >= 0.7) return 'favored'
  if (odds >= 0.4) return 'even'
  return 'longshot'
}

// ---- Presentation helpers (CheckCard / DC chips / turn log) — pure so the
// .svelte files stay markup-only (research/47 testability constraint) ----

import type { CheckBand, CheckRecord } from './types'
import { SKILL_BY_ID as SKILL_DEFS } from './constants'

export const BAND_LABELS: Readonly<Record<CheckBand, string>> = {
  crit: 'Critical Success',
  success: 'Success',
  partial: 'Partial Success',
  fail: 'Failure',
}

/** Monospace math line for the roll card / turn log. */
export function formatCheckMath(record: CheckRecord): string {
  const label = SKILL_DEFS.get(record.skill)?.label ?? record.skill
  if (record.insufficientEssence) {
    return `${label} — not attempted (insufficient essence)`
  }
  const sign = record.bonus >= 0 ? '+' : ''
  return `${label} d20 ${record.nat} ${sign}${record.bonus} = ${record.total} vs DC ${record.dc}`
}

/** Compact roll-card line (Phase 5 W3): skill + result vs DC, no d20 breakdown. */
export function formatCheckMathCompact(record: CheckRecord): string {
  const label = SKILL_DEFS.get(record.skill)?.label ?? record.skill
  if (record.insufficientEssence) return `${label} — not attempted`
  return `${label} ${record.total} vs DC ${record.dc}`
}

/**
 * Does this check's target resolve to the given character (Phase 5 D2)? Prefers
 * the resolved `targetId` so two same-named girls never collide; falls back to
 * the `target` name for legacy records that predate targetId. False when the
 * record carries no target at all.
 */
export function checkRecordTargets(
  record: Pick<CheckRecord, 'target' | 'targetId'>,
  characterId: string,
  characterName: string,
): boolean {
  if (record.targetId) return record.targetId === characterId
  if (record.target) return record.target.toLowerCase() === characterName.toLowerCase()
  return false
}

export function defaultRpgSheet(): RpgSheet {
  const attributes = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) attributes[id] = 10
  return {
    level: 1,
    // Creation grant already applied (marker set) so a brand-new protagonist can
    // specialize immediately via the Sheet panel instead of starting at flat 10s.
    unspentPoints: { ...STARTING_POINTS },
    startingGrant: true,
    attributes,
    skills: {},
    essence: { current: essenceMax(1), max: essenceMax(1) },
    knownSpells: [],
    awardedMilestones: [],
  }
}
