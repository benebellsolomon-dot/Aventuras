/**
 * BE engine — the narrative context block (research/31 §2.3).
 *
 * One pure function builds the whole `beStateBlock` string the narrative templates
 * render; the ContextBuilder only gathers inputs. Carries per-character: canonical
 * size (letter + band + comparative), grounding facts, the size-lock assertion, and
 * the magnitude-scaled narration directive when growth just landed (31a §3.5 —
 * overshoot is a distinct failure from drift; register is tier-gated).
 */

import { groundingFacts } from './derive'
import { bandWord, comparative, cupLetter } from './ladder'
import type { BodyState } from './types'

export interface BeStateEntry {
  name: string
  state: BodyState
}

const HIGH_REGISTER_MIN_BAND = 'gigantic breasts'

// Timing note (by design, not a lag bug): events are extracted from turn N's
// prose, so the reducer resolves AFTER narration and lastGrowth surfaces this
// directive in turn N+1 — the turn that RENDERS the outcome. Turn N narrates
// only the attempt (the block's "never invent growth" + the genre rules'
// report-the-attempt-not-the-outcome instruction guard the gap).
function growthDirective(name: string, state: BodyState): string {
  const growth = state.lastGrowth
  if (!growth) return ''
  const band = bandWord(state.tier)
  const highRegister = band === HIGH_REGISTER_MIN_BAND || band === 'hyper breasts'
  if (growth.delta >= 2) {
    const register = highRegister
      ? 'Dramatic register is earned: render the surge with full weight and spatial consequence.'
      : 'Render it as a clear, startling change — but keep comparisons within one band of her actual new size; no room-scale imagery.'
    return `\n  GROWTH JUST LANDED: ${name} grew significantly this scene (${cupLetter(growth.tierBefore)} → ${cupLetter(state.tier)}). ${register}`
  }
  return `\n  GROWTH JUST LANDED: ${name} grew one increment this scene (${cupLetter(growth.tierBefore)} → ${cupLetter(state.tier)}). Narrate it as subtle and incremental — noticeable strain and warmth, NOT a dramatic transformation. Exactly this much and no further.`
}

function characterLines(entry: BeStateEntry): string {
  const { name, state } = entry
  const facts = groundingFacts(state.tier, state.shape)
  const lines = [
    `${name}: ${cupLetter(state.tier)}-cup (${bandWord(state.tier)}). ${comparative(state.tier)}`,
    `  Posture: ${facts.posture}. Mobility: ${facts.mobility}. Clothing: ${facts.clothing}.`,
  ]
  if (state.fluids.fillPercent >= 50) {
    lines.push(
      `  ${state.fluids.fluidType} fullness: ${Math.round(state.fluids.fillPercent)}% — visibly full, sensitive, heavy with it.`,
    )
  }
  if (state.conditions.length > 0) {
    const labels = state.conditions.map((c) => (c.note ? `${c.label} (${c.note})` : c.label))
    lines.push(`  Current conditions: ${labels.join('; ')}.`)
  }
  if (state.locked) {
    lines.push(
      `  SIZE LOCKED: ${name} is exactly ${cupLetter(state.tier)}-cup and stays that way. Assert her exact current size; never round up, never grow her in prose.`,
    )
  }
  const directive = growthDirective(name, state)
  if (directive) lines.push(directive.trimStart())
  return lines.map((line) => (line.startsWith(name) ? line : `  ${line.trim()}`)).join('\n')
}

/**
 * Build the [BODY STATE] narrative block. Empty string when no character carries
 * bodyState — the template's `{% if beStateBlock != '' %}` gate then skips it.
 */
export function buildBeStateBlock(entries: BeStateEntry[]): string {
  if (entries.length === 0) return ''
  const body = entries.map(characterLines).join('\n')
  return `[BODY STATE — canonical and authoritative]
The following body states are engine-tracked ground truth. Prose must respect them exactly: sizes, posture, mobility and clothing reality. Bust size changes ONLY when a growth directive in this block says it changed — never invent growth, shrinkage, or ambient size drift.
${body}`
}
