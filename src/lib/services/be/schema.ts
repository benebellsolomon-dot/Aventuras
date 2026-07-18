/**
 * BE engine — classifier schema extension + event coercion.
 *
 * The classifier's Zod schema strips unknown keys (31b risk 1), so beEvents MUST be
 * added through schema extension, never as ad-hoc fields. The prompt instructions
 * piggyback on the existing `customVariableInstructions` template slot, so the
 * shipped classifier template needs no edit.
 */

import { z } from 'zod'
import type { BeEvent, BeSoftState } from './types'

export const beEventSchema = z.object({
  character: z.string().describe('Exact name of the affected female character'),
  kind: z
    .enum(['catalyst', 'contact', 'milking', 'attempt', 'stabilize'])
    .describe(
      'catalyst=magical/alchemical growth influence, contact=intimate physical escalation, attempt=explicit growth attempt that may fail, milking=draining, stabilize=calming/settling',
    ),
  intensity: z
    .number()
    .describe('1=incidental, 2=deliberate scene focus, 3=scene-defining ritual/climax'),
})

const BE_EVENTS_DESCRIPTION =
  'Body-transformation events that OCCURRED in this narrative response. Report the attempt/act itself, never its outcome — the game engine resolves outcomes. Empty array when nothing transformation-relevant happened.'

/** Hard cap on events per turn — bounds reducer work and the persisted cadence log. */
export const MAX_BE_EVENTS_PER_TURN = 16

export const beSoftStateSchema = z.object({
  character: z.string().describe('Exact name of the female character'),
  attitude: z
    .enum(['craving', 'accepting', 'conflicted', 'fearful', 'resentful'])
    .describe('Her CURRENT emotional stance toward her transformation, when the scene shows it')
    .optional(),
  arousal: z
    .number()
    .describe('Her current arousal 0-100, when the scene evidences a level')
    .optional(),
  fluidFill: z
    .number()
    .describe(
      'How full her breasts currently are, 0-100 percent of capacity, when the scene establishes it (engorgement, recent expressing, time passing)',
    )
    .optional(),
})

const BE_STATES_DESCRIPTION =
  'Per-character soft-state reads OBSERVED in this response: transformation attitude, arousal, fluid fullness. Include a character only when the scene gives evidence; omit fields you cannot ground. Empty array is correct when nothing changed.'

/**
 * Extend a classification schema (base or runtime-vars-extended — both are object
 * schemas with entryUpdates + scene) with the top-level beEvents array.
 */
export function extendClassificationSchemaWithBeEvents(schema: z.ZodType): z.ZodType {
  const objectSchema = schema as unknown as z.ZodObject<z.ZodRawShape>
  // Returns the input UNCHANGED when it isn't an extendable object schema —
  // callers detect the no-op by reference identity and should warn (BE
  // extraction silently disabled otherwise).
  if (typeof objectSchema.extend !== 'function') return schema
  return objectSchema.extend({
    beEvents: z
      .array(beEventSchema)
      .max(MAX_BE_EVENTS_PER_TURN)
      .default([])
      .describe(BE_EVENTS_DESCRIPTION),
    beStates: z
      .array(beSoftStateSchema)
      .max(MAX_BE_EVENTS_PER_TURN)
      .default([])
      .describe(BE_STATES_DESCRIPTION),
  })
}

/**
 * Prompt instruction block for BE event extraction. Appended to the classifier's
 * customVariableInstructions slot (rendered by the shipped template whenever
 * non-empty — and it is always non-empty in beMode).
 *
 * `growthCosmology` (per-story, research/41): teaches the classifier what this
 * world's growth driver IS, so the driving act maps to kind `catalyst` instead
 * of being filed as generic `contact` (the Lucy playtest filed the story-canon
 * catalyst as contact @i3).
 */
export function buildBeEventInstructions(growthCosmology?: string): string {
  const base = `## Body Transformation Events to Extract
This story tracks breast-expansion events mechanically. Additionally fill the top-level \`beEvents\` array:
- Report each transformation-relevant act in this response: catalyst (magical/alchemical/supernatural growth influence), contact (intimate escalation), attempt (explicit growth attempt), milking (draining), stabilize (settling).
- \`character\` = the affected female character's exact name. \`intensity\` = 1 (incidental) to 3 (scene-defining).
- Report the ATTEMPT, not the outcome — the engine rolls outcomes. Do not invent events; empty array is correct for scenes without transformation content.

Also fill the top-level \`beStates\` array with per-character soft-state reads the scene evidenced:
- \`attitude\`: her current emotional stance toward her transformation (craving/accepting/conflicted/fearful/resentful) — only when the scene shows it.
- \`arousal\`: 0-100 — only when the scene evidences a level.
- \`fluidFill\`: 0-100 percent of breast capacity — only when the scene establishes fullness (engorgement, expressing, time passing).
Omit fields without evidence; empty array when nothing changed.`

  // Settings JSON is unvalidated at load — a non-string here must not throw
  // (this runs in the classification hot path, outside its try/catch).
  const cosmology = typeof growthCosmology === 'string' ? growthCosmology.trim() : ''
  if (!cosmology) return base
  return `${base}

## This Story's Growth Cosmology
${cosmology}
When this response contains the driving act described above, classify it as kind 'catalyst' — reserve 'contact' for intimate escalation that is not the driver.`
}

/**
 * Pull validated BeEvents off a classification result object. Tolerates absence
 * (non-BE stories, old results) and silently drops malformed entries.
 */
export function beEventsFromResult(result: Record<string, unknown>): BeEvent[] {
  const raw = result['beEvents']
  if (!Array.isArray(raw)) return []
  const events: BeEvent[] = []
  for (const candidate of raw.slice(0, MAX_BE_EVENTS_PER_TURN)) {
    const parsed = beEventSchema.safeParse(candidate)
    if (parsed.success) events.push(parsed.data)
  }
  return events
}

/** Pull validated soft-state reads off a classification result (same tolerance rules). */
export function beSoftStatesFromResult(result: Record<string, unknown>): BeSoftState[] {
  const raw = result['beStates']
  if (!Array.isArray(raw)) return []
  const states: BeSoftState[] = []
  for (const candidate of raw.slice(0, MAX_BE_EVENTS_PER_TURN)) {
    const parsed = beSoftStateSchema.safeParse(candidate)
    if (parsed.success) states.push(parsed.data)
  }
  return states
}
