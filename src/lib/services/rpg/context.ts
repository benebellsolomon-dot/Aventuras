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
import type { CheckRecord, GrowthVerdict, RpgSheet } from './types'

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
export function buildPlayerSheetBlock(
  sheet: RpgSheet,
  protagonistName: string,
  /** Preformatted known-spell display strings (Phase 4), e.g. "Swell (transmutation, ⬡2)". */
  knownSpells: ReadonlyArray<string> = [],
): string {
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
  ]
  // Known-spells line renders ONLY when she has learned spells, so a non-caster's
  // block is byte-identical to Phase 1-3 (prompt-cache guard, research/50 R8).
  if (knownSpells.length > 0) {
    lines.push(`Known spells: ${knownSpells.join('; ')}.`)
  }
  lines.push(
    'These are the ONLY abilities that exist. Do not invent stats, skills, spells, or levels the sheet does not show.',
  )
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
 * Pre-flight growth verdict → narration directive. `lands` renders NOTHING (the
 * band directive already licenses the growth, and adding a line there would
 * churn the prompt for every ordinary growth turn); every other verdict is an
 * explicit no-visible-growth instruction, because the narrator's only other
 * signal is the band and a crit reads as permission to erupt.
 */
const GROWTH_VERDICT_DIRECTIVES: Readonly<Record<GrowthVerdict, string | null>> = {
  lands: null,
  blocked_recovery:
    'GROWTH: her body is still settling from the last change — the power sinks in and BANKS for later. Describe absorbed, stored energy and the strain of holding it; her size does NOT visibly change this scene.',
  at_cap:
    'GROWTH: she is at her limit — no further growth is possible. Describe the power finding nowhere to go and the strain of it; her size does NOT change.',
  blocked:
    'GROWTH: something holds her body fixed and nothing takes. Describe the effort and the power refusing to bite; her size does NOT change.',
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
    // Spell cast (Phase 4, research/50 R8): the directive claims mechanical
    // effects were applied, so it must fire ONLY when they actually were —
    // mirror computeSpellCast's gate: a non-fail band AND a resolved target
    // girl. A fizzle (fail) applied nothing; an untargeted "narrative-only"
    // cast (R10, no `target`) applied nothing either — neither may claim effects.
    if (record.spellId && record.band !== 'fail' && record.target) {
      lines.push(
        'This was a spell cast; its effects are already applied mechanically. Narrate exactly those effects — do not invent additional powers or omit the result.',
      )
    }
    // Pre-flight growth verdict (be/preview.ts): the engine already knows
    // whether this turn's earned growth can land on her, so the narrator is
    // told BEFORE it writes rather than corrected a turn later.
    const verdictDirective = record.growthVerdict
      ? GROWTH_VERDICT_DIRECTIVES[record.growthVerdict]
      : null
    if (verdictDirective) lines.push(verdictDirective)
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
    '`induce_lactation` and `milking` actions use the `milking` skill and must set `targetCharacter`.',
    'Set `spellId` ONLY for an explicit cast of a spell the player already knows, named in the choice text. Physical, sexual, social, and mundane actions are never casts — leave `spellId` off them. Never invent an id, and never point it at a spell the player has not learned.',
    "Set `growthIntent: true` ONLY when the choice's explicit purpose is to grow or transform that character's body — channeling essence into her, working a transformation, feeding her a growth potion. Always set `targetCharacter` alongside it — but never drop `growthIntent` just because you are unsure of the name. A scene that merely happens to be sexual, or where growth is an incidental side effect, is NOT growth intent.",
  ].join('\n')
}
