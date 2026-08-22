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

import { GRUDGE_STALL_THRESHOLD, SUPPORT_HANG_GATE } from './constants'
import { bandWord, comparative, cupLetter } from './ladder'
import { fmtCm } from './magnitude'
import {
  bodyRow,
  bwhCmString,
  effectiveSupport,
  fluidPressureLabel,
  measurements,
} from './measurements'
import { apparentTierBonus, isEngorged, lactationOf, supplyLabel } from './lactation'
import { nextMilestone } from './milestones'
import { QUIRK_BY_ID, readQuirks, type QuirkDef } from './quirks'
import { bondStance, dependenceOf, dependenceStage, relOf, stanceBlurb } from './tracks'
import type { BodyState } from './types'

export interface BeStateEntry {
  name: string
  state: BodyState
  /**
   * Cosmology stories (research/66 §magnitude): what the story's growth act
   * would do to her THIS scene — stated up front so the narrator renders
   * exactly the cm the engine will apply if the act completes.
   */
  actGrowth?: { cm: number; tierAfter: number; bankedCm: number }
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
  // Mid-split: this turn's land is one stage of a larger surge — the ONSET line
  // (rendered separately) owns the "more is coming" half, so the directive must
  // not demand the full result NOR clamp against the coming remainder.
  if (state.pendingGrowth) {
    return `GROWTH SURGING: ${name} just grew (${cupLetter(growth.tierBefore)} → ${cupLetter(state.tier)}) and the surge is still building. Render THIS stage's change fully and physically now; the ONSET note below covers what is yet to come.`
  }
  const highRegister = HIGH_REGISTER_BANDS.has(bandWord(state.tier))
  // Combined multi-increment land in one turn (pending remainder + event, or
  // multi-event with no cooldown) — the dramatic register is earned.
  const cmNote = growth.cm !== undefined ? ` — exactly ${fmtCm(growth.cm)} cm of bust` : ''
  if (growth.delta >= 2) {
    const register = highRegister
      ? 'Dramatic register is earned: render the surge with full weight and spatial consequence.'
      : 'Render it as a clear, startling change — but keep comparisons within one band of her actual new size; no room-scale imagery.'
    return `GROWTH JUST LANDED: ${name} grew significantly this scene (${cupLetter(growth.tierBefore)} → ${cupLetter(state.tier)}${cmNote}). ${register}`
  }
  return `GROWTH JUST LANDED: ${name} grew one increment this scene (${cupLetter(growth.tierBefore)} → ${cupLetter(state.tier)}${cmNote}). Narrate it as subtle and incremental — noticeable strain and warmth, NOT a dramatic transformation. Exactly this much and no further this beat.`
}

/** Cosmology stories: the act's exact cm, told BEFORE the narrator writes (research/66 §magnitude). */
function actGrowthLine(
  name: string,
  state: BodyState,
  act: NonNullable<BeStateEntry['actGrowth']>,
): string {
  const bank =
    act.bankedCm > 0 ? ` (includes ${fmtCm(act.bankedCm)} cm banked from spells/skills)` : ''
  return `ACT GROWTH: if the story's growth act completes for ${name} in THIS scene, she grows exactly ${fmtCm(act.cm)} cm of bust (${cupLetter(state.tier)} → ${cupLetter(act.tierAfter)})${bank} — render that much and no more; if the act does not complete, her size does NOT change.`
}

function characterLines(entry: BeStateEntry): string {
  const { name, state, actGrowth } = entry
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
  lines.push(
    `Body weight: ~${Math.round(m.totalBodyWeightKg)} kg total (~${Math.round(m.frameKg)} kg frame + ~${kg(m.nowTotalKg)} kg breast).`,
  )

  const milestone = nextMilestone(m.nowTotalKg)
  if (milestone) {
    const away = milestone.remaining < 0.1 ? 'under 0.1' : kg(milestone.remaining)
    lines.push(
      `Next size milestone (NOT yet true — only if she grows another ~${away} kg): ${milestone.label}.`,
    )
  }

  // Support ≥ the gate suppresses the hang rung (buoyant/charmed busts don't hang).
  const showHang = Boolean(row.hang) && effectiveSupport(state) < SUPPORT_HANG_GATE
  const hangCm = showHang && m.droopCm >= 5 ? ` (~${Math.round(m.droopCm)} cm of hang)` : ''
  lines.push(`Shape: ${state.shape} — ${row.shape}${showHang ? ` — ${row.hang}${hangCm}` : ''}.`)
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

  // Lactation (research/49 R11): gated on `active`, so a non-lactating,
  // non-engorged girl's block stays byte-identical to the pre-Phase-3 string
  // (cache guard). It is NOT byte-identical once she is Engorged — the swell
  // line below is fill-gated by design (R6) and applies to any girl at her
  // threshold, lactating or not.
  const lactation = lactationOf(state)
  if (lactation?.active) {
    lines.push(
      `Lactation: active — ${supplyLabel(lactation.supplyTier)} supply; regular expression sustains it, neglect will ease it.`,
    )
  }
  // Apparent swell is temporary presentation, NOT growth — the parenthetical is
  // load-bearing: without it the narrator writes the swell as a new size.
  const swell = apparentTierBonus(state, isEngorged(state))
  if (swell > 0) {
    lines.push(
      `Engorgement swell: she presently looks ${swell >= 2 ? 'two full cups' : 'a full cup'} larger than her letter (temporary — do not treat as growth).`,
    )
  }

  if (state.conditions.length > 0) {
    const rendered = state.conditions
      .map((c) => {
        const label = c.label.slice(0, 60)
        return c.note ? `${label} (${c.note.slice(0, 80)})` : label
      })
      .join('; ')
    lines.push(`Active conditions: ${rendered}.`)
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
  if (state.pendingGrowth) {
    lines.push(
      `ONSET: ${name}'s body is mid-surge — tension building toward a further change next beat. Render anticipation/early strain, not the full result yet.`,
    )
  }

  const directive = growthDirective(name, state)
  if (directive) lines.push(directive)
  if (actGrowth) lines.push(actGrowthLine(name, state, actGrowth))

  // The note carries its own imperative (silently-correct vs render-now differ
  // per drift kind) — the wrapper adds no tail that could contradict it.
  if (state.driftNote) {
    lines.push(`[CONTINUITY] ${state.driftNote.note}.`)
  }

  return lines.map((line, index) => (index === 0 ? line : `  ${line}`)).join('\n')
}

/**
 * Build the [BODY STATE] narrative block. Empty string when no character carries
 * bodyState — the template's `{% if beStateBlock != '' %}` gate then skips it.
 */
export const HAREM_STATE_HEADER = '[HAREM STATE — canonical and authoritative]'

/**
 * Build the [HAREM STATE] block (research/48 Step 6): bond stance, dependence
 * stage, and quirks per girl carrying any track field. Concatenated AFTER
 * [BODY STATE] into the same beStateBlock context var (R9: no template edits;
 * appending after preserves the cache prefix). Empty string when no entry
 * carries a track field — a Phase-1 save renders nothing.
 */
export function buildHaremStateBlock(entries: BeStateEntry[]): string {
  const tracked = entries.filter(
    (e) =>
      e.state.rel !== undefined ||
      e.state.bond !== undefined ||
      e.state.dependence !== undefined ||
      (e.state.quirks?.length ?? 0) > 0 ||
      lactationOf(e.state)?.active === true,
  )
  if (tracked.length === 0) return ''
  const lines = tracked.map((entry) => {
    const parts: string[] = []
    const rel = relOf(entry.state)
    const stance = bondStance(rel.bond)
    // The behavioral blurb only for girls with actual relationship history —
    // asserting a manufactured stance for a never-touched girl would be
    // inventing state (review F4; same rule as expressionTags).
    const hasHistory = entry.state.rel !== undefined || entry.state.bond !== undefined
    parts.push(hasHistory ? `bond: ${stance} (${stanceBlurb(stance)})` : `bond: ${stance}`)
    if (rel.grudge >= GRUDGE_STALL_THRESHOLD)
      parts.push('carrying a grudge — warmth is not landing until she feels it repaired')
    const dependence = dependenceOf(entry.state)
    if (dependence > 0) parts.push(`dependence: ${dependenceStage(dependence)}`)
    const lactation = lactationOf(entry.state)
    if (lactation?.active) parts.push(`milk: ${supplyLabel(lactation.supplyTier)}`)
    const quirkBlurbs = readQuirks(entry.state)
      .map((id) => QUIRK_BY_ID.get(id))
      .filter((def): def is QuirkDef => def !== undefined)
      .map((def) => `${def.label.toLowerCase()} (${def.blurb})`)
    if (quirkBlurbs.length > 0) parts.push(`quirks: ${quirkBlurbs.join('; ')}`)
    return `${entry.name} — ${parts.join('. ')}.`
  })
  return `${HAREM_STATE_HEADER}
These stances are engine-tracked. Prose may express them; it may not advance or reverse them — a girl does not become devoted because the scene wants her to, and dependence deepens only through actual exposure.
${lines.join('\n')}`
}

export function buildBeStateBlock(entries: BeStateEntry[]): string {
  if (entries.length === 0) return ''
  const body = entries.map(characterLines).join('\n')
  return `[BODY STATE — canonical and authoritative]
The following body states are engine-tracked ground truth. Prose must respect them exactly: sizes, measurements, mass, posture, mobility and clothing reality. All measurements are metric (cm/kg/L) — use these exact numbers, never invent different ones. The cup letter is her size-identity (volume-anchored, the same for every shape); the bust cm is the shape-adjusted tape measurement — firm and gravity-defying shapes tape larger than the letter alone implies, and that is correct, not a contradiction. Bust size changes ONLY when a growth directive in this block says it changed — never invent growth, shrinkage, or ambient size drift. If world lore, story rules, or character text describe growth timing, cause, speed, or limits differently, THIS BLOCK WINS — lore supplies flavor and mechanism; this block alone decides when growth happens and how much.
${body}`
}
