/**
 * RPG layer — check resolution (research/47 Step 3).
 *
 * Pure: no state mutation, no clock, no i/o, no model call. The single caller
 * in production is CheckPhase; the sheet WRITE (essence deduction) happens
 * later, at classification time, in StoryStore.applyRpgTurn — this module only
 * computes what happened.
 *
 * Seed contract (research/47 ruling 3): `${storyId}:${userActionEntryId}:check`.
 * A retry creates a new user_action entry and therefore re-rolls; undo/branch
 * replay of a preserved entry replays identically.
 */

import { resolveCheckBand, seededRoll } from '$lib/services/be'
import { checkBonus, skillRanks, attributeMod } from './derive'
import { SKILL_BY_ID } from './constants'
import type { CheckModifier, CheckRecord, RpgSheet, SkillId } from './types'

export interface ResolveCheckInput {
  seed: string
  sheet: RpgSheet
  skill: SkillId
  dc: number
  action: string
  essenceCost?: number
  modifiers?: ReadonlyArray<CheckModifier>
  /** Set when the check is a spell cast (Phase 4). Validated against knownSpells. */
  spellId?: string
}

export function resolveCheck(input: ResolveCheckInput): CheckRecord {
  const { seed, sheet, skill, dc, action } = input
  const essenceCost = Math.max(0, input.essenceCost ?? 0)
  const modifiers = [...(input.modifiers ?? [])]

  const def = SKILL_BY_ID.get(skill)
  const attribute = def ? attributeMod(sheet.attributes[def.attribute]) : 0
  const ranks = skillRanks(sheet, skill)
  const modifierSum = modifiers.reduce((sum, m) => sum + m.value, 0)
  const bonus = checkBonus(sheet, skill) + modifierSum

  // Unknown spell (Phase 4, research/50 R4): a cast of a spell not in knownSpells
  // is refused before rolling — no roll, no spend. The stat_invention detector
  // flags the narrative side; here we only guarantee no unearned essence burn.
  if (input.spellId !== undefined && !sheet.knownSpells.includes(input.spellId)) {
    return {
      action,
      skill,
      dc,
      nat: 0,
      bonusBreakdown: { attribute, ranks, modifiers },
      bonus,
      total: 0,
      margin: -dc,
      band: 'fail',
      essenceSpent: 0,
    }
  }

  // Insufficient essence: the action can't be powered, so the check never
  // rolls — a fail-band record with no spend, never a negative pool.
  if (essenceCost > sheet.essence.current) {
    return {
      action,
      skill,
      dc,
      nat: 0,
      bonusBreakdown: { attribute, ranks, modifiers },
      bonus,
      total: 0,
      margin: -dc,
      band: 'fail',
      essenceSpent: 0,
      insufficientEssence: true,
    }
  }

  const nat = seededRoll(seed)
  const total = nat + bonus
  return {
    action,
    skill,
    dc,
    nat,
    bonusBreakdown: { attribute, ranks, modifiers },
    bonus,
    total,
    margin: total - dc,
    band: resolveCheckBand(nat, total, dc),
    essenceSpent: essenceCost,
  }
}
