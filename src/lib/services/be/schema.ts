/**
 * BE engine — classifier schema extension + event coercion.
 *
 * The classifier's Zod schema strips unknown keys (31b risk 1), so beEvents MUST be
 * added through schema extension, never as ad-hoc fields. The prompt instructions
 * piggyback on the existing `customVariableInstructions` template slot, so the
 * shipped classifier template needs no edit.
 */

import { z } from 'zod'
import type { BeEvent } from './types'

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
  })
}

/**
 * Prompt instruction block for BE event extraction. Appended to the classifier's
 * customVariableInstructions slot (rendered unconditionally by the shipped template).
 */
export function buildBeEventInstructions(): string {
  return `## Body Transformation Events to Extract
This story tracks breast-expansion events mechanically. Additionally fill the top-level \`beEvents\` array:
- Report each transformation-relevant act in this response: catalyst (magical/alchemical influence), contact (intimate escalation), attempt (explicit growth attempt), milking (draining), stabilize (settling).
- \`character\` = the affected female character's exact name. \`intensity\` = 1 (incidental) to 3 (scene-defining).
- Report the ATTEMPT, not the outcome — the engine rolls outcomes. Do not invent events; empty array is correct for scenes without transformation content.`
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
