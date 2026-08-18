/**
 * RPG layer — prompt blocks (research/47 Steps 4+7).
 *
 * Stable-order contract for prompt caching: block headers are FIXED STRINGS
 * (context.test.ts snapshots them); volatile numbers render inside the block
 * body only. [PLAYER SHEET] sits in the system prompt right after the BE state
 * block; [CHECK RESULT] is appended dead last in the user prompt.
 */

import { ATTRIBUTE_IDS, ATTRIBUTE_LABELS, SKILL_BY_ID, SKILLS } from './constants'
import { attributeMod, skillRanks } from './derive'
import type { CheckRecord, RpgSheet } from './types'

export const PLAYER_SHEET_HEADER = '[PLAYER SHEET]'
export const CHECK_RESULT_HEADER = '[CHECK RESULT — already resolved, immutable]'

const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)

/** Top skills line: every ranked skill (max 6), as "Alchemy +5". */
function notableSkills(sheet: RpgSheet): string {
  const ranked = SKILLS.filter((s) => skillRanks(sheet, s.id) > 0)
    .map((s) => ({
      label: s.label,
      bonus: attributeMod(sheet.attributes[s.attribute]) + skillRanks(sheet, s.id),
    }))
    .sort((a, b) => b.bonus - a.bonus)
    .slice(0, 6)
  return ranked.map((s) => `${s.label} ${signed(s.bonus)}`).join(', ')
}

/**
 * The system-prompt sheet block. Qualitative-first: the narrator needs
 * capability context, not an invitation to do math.
 */
export function buildPlayerSheetBlock(sheet: RpgSheet, protagonistName: string): string {
  const mods = ATTRIBUTE_IDS.map(
    (id) => `${ATTRIBUTE_LABELS[id]} ${signed(attributeMod(sheet.attributes[id]))}`,
  ).join(' · ')
  const skills = notableSkills(sheet)
  const lines = [
    PLAYER_SHEET_HEADER,
    `${protagonistName} — level ${sheet.level}.`,
    `Attribute modifiers: ${mods}.`,
    skills ? `Trained skills: ${skills}.` : 'No trained skills yet.',
    `Catalytic essence: ${sheet.essence.current}/${sheet.essence.max}.`,
    'These are the ONLY abilities that exist. Do not invent stats, skills, spells, or levels the sheet does not show.',
  ]
  if (sheet.driftNote?.note) {
    lines.push(`[CONTINUITY] ${sheet.driftNote.note}`)
  }
  return lines.join('\n')
}

/** One-line summary for service prompts (choice tagging, risk assess). */
export function buildPlayerSheetSummary(sheet: RpgSheet): string {
  const mods = ATTRIBUTE_IDS.map(
    (id) => `${ATTRIBUTE_LABELS[id]}${signed(attributeMod(sheet.attributes[id]))}`,
  ).join(' ')
  const skills = notableSkills(sheet)
  return `L${sheet.level} · ${mods} · essence ${sheet.essence.current}/${sheet.essence.max}${skills ? ` · ${skills}` : ''}`
}

const BAND_DIRECTIVES: Record<CheckRecord['band'], string> = {
  crit: 'Critical success: the attempt succeeds beyond intent — narrate a meaningful extra benefit.',
  success: 'Success: the attempt achieves what was intended.',
  partial:
    'Partial success: the attempt succeeds, but at a real cost or complication — narrate BOTH the success and its price.',
  fail: 'Failure: the attempt does not achieve its intent. The failure is real and sticks — narrate it honestly.',
}

/**
 * The immutable resolved-check block appended to the user prompt on checked
 * turns. Carries the anti-fudge hard rule (research/46 §4).
 */
export function buildCheckResultBlock(record: CheckRecord): string {
  const skillLabel = SKILL_BY_ID.get(record.skill)?.label ?? record.skill
  const lines = [CHECK_RESULT_HEADER]
  if (record.insufficientEssence) {
    lines.push(
      `Action: ${record.action}`,
      `${skillLabel} check NOT attempted — insufficient catalytic essence. Narrate the power failing to answer the call.`,
    )
  } else {
    lines.push(
      `Action: ${record.action}`,
      `${skillLabel} check: d20 ${record.nat} ${signed(record.bonus)} = ${record.total} vs DC ${record.dc} → ${record.band.toUpperCase()}.`,
      BAND_DIRECTIVES[record.band],
    )
    if (record.essenceSpent > 0) {
      lines.push(`Catalytic essence spent: ${record.essenceSpent}.`)
    }
  }
  lines.push(
    'This outcome is an already-resolved fact. Softening a failure, skipping its consequences, or granting unearned success is a continuity error.',
  )
  return lines.join('\n')
}

/**
 * Choice-generator instruction: how to tag risky choices with skill/dc/cost.
 * Rendered into the action-choices template only for BE-mode stories.
 */
export function buildCheckTaggingInstruction(sheet: RpgSheet): string {
  const skillList = SKILLS.map((s) => `${s.id} (${ATTRIBUTE_LABELS[s.attribute]})`).join(', ')
  return [
    '## Skill Check Tagging',
    `The player has an RPG sheet: ${buildPlayerSheetSummary(sheet)}.`,
    'For each choice, decide whether it carries REAL risk of failure. If it does, add `skill` and `dc` fields; leave safe choices untagged (no skill, no dc).',
    `Valid skill ids: ${skillList}.`,
    'DC rubric: 8 trivial-but-fumblable · 11 easy · 14 moderate · 17 hard · 20 very hard · 24 near-impossible. Judge from the fiction, not the player convenience.',
    "If a choice channels the player's catalytic power (growth influence, transformation magic), also set `essenceCost` 1-3 by potency. Do not tag more than 3 of the choices.",
    'When the action targets a specific character, set `targetCharacter` to her exact name — her trust and traits modify the check.',
  ].join('\n')
}
