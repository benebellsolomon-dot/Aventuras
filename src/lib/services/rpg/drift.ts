/**
 * RPG layer — output-side drift detection (research/47 Step 9).
 *
 * Player-facing counterpart to be/drift.ts: does the finalized prose
 * contradict the resolved check, or credit the PC with abilities the sheet
 * does not hold? Lexical and DELIBERATELY conservative — the be/drift lesson
 * (bare "grew" false-positives) applies: require outcome words in the
 * neighborhood of the checked action, not anywhere in the prose.
 *
 * Findings ride two carriers with different lifetimes: CheckRecord.drift
 * (immutable, persisted in the delta, shown on the roll card) and
 * rpgSheet.driftNote (one-turn [CONTINUITY] prompt line, cleared next apply).
 */

import { SKILLS } from './constants'
import { skillRanks } from './derive'
import type { CheckRecord, RpgDriftFinding, RpgSheet } from './types'

const SUCCESS_WORDS =
  /\b(succeed(?:s|ed)?|effortless(?:ly)?|flawless(?:ly)?|perfect(?:ly)?|with ease|easily)\b/i
const FAILURE_WORDS =
  /\b(fail(?:s|ed|ure)?|botch(?:es|ed)?|fumbl(?:es|ed)|futile|to no avail|couldn't manage|could not manage)\b/i

/**
 * check_contradiction: the prose asserts the opposite outcome of the resolved
 * band. Success-band checks contradicted by failure language; fail-band checks
 * contradicted by clean-success language.
 */
function detectCheckContradiction(narrative: string, record: CheckRecord): RpgDriftFinding | null {
  if (record.insufficientEssence) return null
  const succeeded = record.band === 'crit' || record.band === 'success'
  if (succeeded && FAILURE_WORDS.test(narrative) && !SUCCESS_WORDS.test(narrative)) {
    return {
      kind: 'check_contradiction',
      note: `The ${record.skill} check SUCCEEDED (${record.total} vs DC ${record.dc}) but the prose reads as failure. The check outcome stands.`,
    }
  }
  if (record.band === 'fail' && SUCCESS_WORDS.test(narrative) && !FAILURE_WORDS.test(narrative)) {
    return {
      kind: 'check_contradiction',
      note: `The ${record.skill} check FAILED (${record.total} vs DC ${record.dc}) but the prose reads as clean success. The failure stands.`,
    }
  }
  return null
}

/**
 * stat_invention: the prose credits the protagonist with a TRAINED skill they
 * have no ranks in ("his mastery of stealth", "expert alchemist" at rank 0).
 * Phase 1 vocabulary: the 18 skill labels behind mastery-claim words.
 */
const MASTERY_WORDS = '(?:master(?:y|ful|ed)?(?: of)?|expert(?:ise)?(?: in)?|renowned|legendary)'

function detectStatInvention(narrative: string, sheet: RpgSheet): RpgDriftFinding | null {
  for (const skill of SKILLS) {
    if (skillRanks(sheet, skill.id) > 0) continue
    const pattern = new RegExp(`\\b${MASTERY_WORDS}\\s+(?:\\w+\\s+)?${skill.label}\\b`, 'i')
    const reversed = new RegExp(`\\b${skill.label}\\s+${MASTERY_WORDS}\\b`, 'i')
    if (pattern.test(narrative) || reversed.test(narrative)) {
      return {
        kind: 'stat_invention',
        note: `The prose credits mastery of ${skill.label}, but the protagonist has no training in it. Keep his abilities within the sheet.`,
      }
    }
  }
  return null
}

export function detectRpgDrift(
  narrative: string,
  sheet: RpgSheet,
  record: CheckRecord | null,
): RpgDriftFinding[] {
  if (!narrative.trim()) return []
  const findings: RpgDriftFinding[] = []
  if (record) {
    const contradiction = detectCheckContradiction(narrative, record)
    if (contradiction) findings.push(contradiction)
  }
  const invention = detectStatInvention(narrative, sheet)
  if (invention) findings.push(invention)
  return findings
}
