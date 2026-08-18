/**
 * RPG layer — milestone leveling + point spend (research/47 Step 8/12).
 *
 * Pure. Level grants come from interaction-milestone CROSSINGS (a girl's
 * carried mass passing an INTERACTION_MILESTONES threshold this turn).
 * Idempotency is load-bearing: every awarded crossing key is recorded on the
 * sheet, so a branch replay or re-cross NEVER double-grants.
 */

import { ATTRIBUTE_CAP, POINTS_PER_LEVEL, SKILL_RANK_CAP } from './constants'
import { essenceMax } from './derive'
import type { AttributeId, RpgSheet, SkillId } from './types'

/** Stable idempotency key for one milestone crossing. */
export const crossingKey = (characterId: string, massKg: number): string =>
  `${characterId}:${massKg}`

/**
 * Apply level grants for this turn's crossings. Returns a NEW sheet (or the
 * input sheet unchanged when every crossing was already awarded).
 */
export function applyLevelGrants(
  sheet: RpgSheet,
  crossings: ReadonlyArray<string>,
): { sheet: RpgSheet; granted: number } {
  const fresh = crossings.filter((key) => !sheet.awardedMilestones.includes(key))
  if (fresh.length === 0) return { sheet, granted: 0 }

  const level = sheet.level + fresh.length
  const max = essenceMax(level)
  return {
    granted: fresh.length,
    sheet: {
      ...sheet,
      level,
      awardedMilestones: [...sheet.awardedMilestones, ...fresh],
      unspentPoints: {
        attribute: sheet.unspentPoints.attribute + POINTS_PER_LEVEL.attribute * fresh.length,
        skill: sheet.unspentPoints.skill + POINTS_PER_LEVEL.skill * fresh.length,
      },
      essence: {
        max,
        // Leveling never drains the pool; current only ever clamps DOWN to max.
        current: Math.min(sheet.essence.current, max),
      },
    },
  }
}

export type SpendTarget = { kind: 'attribute'; id: AttributeId } | { kind: 'skill'; id: SkillId }

/**
 * Spend one unspent point (SheetPanel tap-to-allocate). Returns null when the
 * spend is invalid (no points, or the target is capped).
 */
export function spendPoint(sheet: RpgSheet, target: SpendTarget): RpgSheet | null {
  if (target.kind === 'attribute') {
    if (sheet.unspentPoints.attribute < 1) return null
    if (sheet.attributes[target.id] >= ATTRIBUTE_CAP) return null
    return {
      ...sheet,
      attributes: { ...sheet.attributes, [target.id]: sheet.attributes[target.id] + 1 },
      unspentPoints: { ...sheet.unspentPoints, attribute: sheet.unspentPoints.attribute - 1 },
    }
  }
  const ranks = sheet.skills[target.id] ?? 0
  if (sheet.unspentPoints.skill < 1) return null
  if (ranks >= SKILL_RANK_CAP) return null
  return {
    ...sheet,
    skills: { ...sheet.skills, [target.id]: ranks + 1 },
    unspentPoints: { ...sheet.unspentPoints, skill: sheet.unspentPoints.skill - 1 },
  }
}
