/**
 * BE engine — the narrative context block (research/31 §2.3, assembled per
 * research/35 §3.3).
 *
 * One pure function builds the whole `beStateBlock` string the narrative
 * templates render. Per character: cup + metric BWH (bust auto-derived from
 * tier/shape/fill — Ben's ruling: all measurements in cm, computed where
 * possible), the validated size comparative, carried-mass honesty (weight feel
 * + proportion), the baked shape/hang channel, posture/mobility/clothing
 * (verbatim NAI rungs), capacity-anchored fluid state, transformation mood,
 * the size-lock assertion, and the magnitude-scaled growth directive
 * (31a §3.5, register tier-gated).
 */

import { bandWord, comparative, cupLetter } from './ladder'
import { bodyRow, bwhCmString, fluidPressureLabel, measurements } from './measurements'
import type { BodyState } from './types'

export interface BeStateEntry {
  name: string
  state: BodyState
}

const HIGH_REGISTER_BANDS = new Set(['gigantic breasts', 'hyper breasts'])

const kg = (value: number): string => (value < 10 ? value.toFixed(1) : String(Math.round(value)))
const liters = (ml: number): string => (ml / 1000).toFixed(1)

// Timing note (by design, not a lag bug): events are extracted from turn N's
// prose, so the reducer resolves AFTER narration and lastGrowth surfaces this
// directive in turn N+1 — the turn that RENDERS the outcome. Turn N narrates
// only the attempt (the block's "never invent growth" + the genre rules'
// report-the-attempt-not-the-outcome instruction guard the gap).
function growthDirective(name: string, state: BodyState): string {
  const growth = state.lastGrowth
  if (!growth) return ''
  const highRegister = HIGH_REGISTER_BANDS.has(bandWord(state.tier))
  if (growth.delta >= 2) {
    const register = highRegister
      ? 'Dramatic register is earned: render the surge with full weight and spatial consequence.'
      : 'Render it as a clear, startling change — but keep comparisons within one band of her actual new size; no room-scale imagery.'
    return `GROWTH JUST LANDED: ${name} grew significantly this scene (${cupLetter(growth.tierBefore)} → ${cupLetter(state.tier)}). ${register}`
  }
  return `GROWTH JUST LANDED: ${name} grew one increment this scene (${cupLetter(growth.tierBefore)} → ${cupLetter(state.tier)}). Narrate it as subtle and incremental — noticeable strain and warmth, NOT a dramatic transformation. Exactly this much and no further.`
}

function characterLines(entry: BeStateEntry): string {
  const { name, state } = entry
  const row = bodyRow(state.tier, state.shape)
  const m = measurements(state)

  const lines: string[] = []
  lines.push(
    `${name} — ${cupLetter(state.tier)}-cup (tier ${state.tier}), ${bandWord(state.tier)}.`,
  )
  lines.push(`Measurements: ${bwhCmString(state)} (bust auto-derived from her current size).`)
  lines.push(`Size: ${comparative(state.tier)}`)

  const massBits = [`~${kg(m.dryTotalKg)} kg of breast tissue`]
  if (m.weightFeel) massBits.push(m.weightFeel)
  if (m.proportionNote) massBits.push(m.proportionNote)
  lines.push(`Carried mass: ${massBits.join(' — ')}.`)

  lines.push(`Shape: ${state.shape} — ${row.shape}${row.hang ? ` — ${row.hang}` : ''}.`)
  lines.push(`Posture: ${row.posture}; mobility: ${row.mobility}; clothing: ${row.clothing}.`)

  if (state.fluids.fillPercent > 0) {
    const fill = Math.round(state.fluids.fillPercent)
    const pressure = fluidPressureLabel(fill)
    let line = `${state.fluids.fluidType} fullness: ${fill}% (~${liters(m.fillMlTotal)} L of ~${liters(m.capacityTotalMl)} L capacity)`
    if (pressure) line += ` — ${pressure}`
    if (m.nowTotalKg - m.dryTotalKg >= 0.5)
      line += `, swollen to ~${kg(m.nowTotalKg)} kg with ${state.fluids.fluidType}`
    lines.push(`${line}.`)
  }

  const moodBits: string[] = []
  if (state.attitude) {
    moodBits.push(
      `transformation attitude ${state.attitude} — render her emotional response to her changing body accordingly`,
    )
  }
  if (state.arousal !== undefined) moodBits.push(`arousal ${Math.round(state.arousal)}/100`)
  if (moodBits.length > 0) lines.push(`Mood: ${moodBits.join('; ')}.`)

  if (state.locked) {
    lines.push(
      `SIZE LOCKED: ${name} is exactly ${cupLetter(state.tier)}-cup and stays that way. Assert her exact current size; never round up, never grow her in prose.`,
    )
  }
  const directive = growthDirective(name, state)
  if (directive) lines.push(directive)

  return lines.map((line, index) => (index === 0 ? line : `  ${line}`)).join('\n')
}

/**
 * Build the [BODY STATE] narrative block. Empty string when no character carries
 * bodyState — the template's `{% if beStateBlock != '' %}` gate then skips it.
 */
export function buildBeStateBlock(entries: BeStateEntry[]): string {
  if (entries.length === 0) return ''
  const body = entries.map(characterLines).join('\n')
  return `[BODY STATE — canonical and authoritative]
The following body states are engine-tracked ground truth. Prose must respect them exactly: sizes, measurements, mass, posture, mobility and clothing reality. All measurements are metric (cm/kg/L) — use these exact numbers, never invent different ones. Bust size changes ONLY when a growth directive in this block says it changed — never invent growth, shrinkage, or ambient size drift.
${body}`
}
