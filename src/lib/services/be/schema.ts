/**
 * BE engine — classifier schema extension + event coercion.
 *
 * The classifier's Zod schema strips unknown keys (31b risk 1), so beEvents MUST be
 * added through schema extension, never as ad-hoc fields. The prompt instructions
 * piggyback on the existing `customVariableInstructions` template slot, so the
 * shipped classifier template needs no edit.
 */

import { z } from 'zod'
import { MAX_BE_CONDITIONS } from './constants'
import type { BeEvent, BeSoftState, BondEvent, ExposureEvent } from './types'

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

export const beConditionSchema = z.object({
  character: z.string().describe('Exact name of the affected female character'),
  label: z
    .string()
    .max(200)
    .describe('Short condition label, e.g. "aching fullness", "buoyancy charm", "lactation surge"'),
  note: z.string().describe('One-phrase detail, when the scene gives one').optional(),
  ttl: z
    .number()
    .describe('Turns the condition should persist; omit for until-resolved')
    .optional(),
})

const BE_CONDITIONS_DESCRIPTION =
  'Transient body conditions the scene ESTABLISHED this response (enchantments, states, afflictions affecting her transformation). Empty array when none.'

export const bondEventSchema = z.object({
  character: z.string().describe('Exact name of the female character'),
  direction: z
    .enum(['warm', 'strain'])
    .describe(
      'warm=the moment drew her closer to him; strain=it pushed her away or past her comfort',
    ),
  intensity: z.number().describe('1=a small moment, 2=a meaningful beat, 3=scene-defining'),
})

const BOND_EVENTS_DESCRIPTION =
  'Relationship movement between the protagonist and a female character that this response EVIDENCED. Report strain as readily as warmth — a scene where he pushed her past her comfort is a strain event, not an omission. Report what happened between them, never how much she now likes him; the engine owns the number. Empty array when the scene moved no relationship.'

export const exposureEventSchema = z.object({
  character: z.string().describe('Exact name of the female character'),
  intensity: z.number().describe('1=trace dose, 2=a full dose, 3=heavy or prolonged exposure'),
})

const EXPOSURE_EVENTS_DESCRIPTION =
  'Catalyst exposure this response: one event per scene in which she took the catalyst into her body (drank, absorbed, was infused), intensity by dose/duration. Distinct from beEvents — this feeds her dependence, not her growth. Empty array when no one was exposed.'

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
    beConditions: z
      .array(beConditionSchema)
      .max(MAX_BE_CONDITIONS)
      .default([])
      .describe(BE_CONDITIONS_DESCRIPTION),
    bondEvents: z
      .array(bondEventSchema)
      .max(MAX_BE_EVENTS_PER_TURN)
      .default([])
      .describe(BOND_EVENTS_DESCRIPTION),
    exposureEvents: z
      .array(exposureEventSchema)
      .max(MAX_BE_EVENTS_PER_TURN)
      .default([])
      .describe(EXPOSURE_EVENTS_DESCRIPTION),
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
Omit fields without evidence; empty array when nothing changed.

Also fill the top-level \`beConditions\` array with transient body conditions the scene ESTABLISHED (enchantments, blessings/curses, physical states affecting her transformation — e.g. "buoyancy charm", "lactation surge"):
- \`label\` = a short reusable name; \`note\` = one-phrase detail when given; \`ttl\` = how many turns it should persist, omitted for until-resolved.
- Report only conditions the prose actually established; empty array when none.

Also fill the top-level \`bondEvents\` array with relationship movement this response evidenced:
- \`direction\`: warm (the moment drew her closer to him) or strain (it pushed her away or past her comfort). Report strain as readily as warmth — a scene where he pushed her past her comfort is a strain event, not an omission.
- Report what HAPPENED between them, never how much she now likes him — the engine owns the number. \`intensity\` = 1 (small moment) to 3 (scene-defining).

Also fill the top-level \`exposureEvents\` array with catalyst exposure:
- One event per scene in which she took the catalyst into her body (drank, absorbed, was infused). \`intensity\` by dose/duration: 1 trace, 2 full dose, 3 heavy/prolonged.
- Distinct from beEvents: exposure feeds her dependence, not her growth. Empty array when no one was exposed.`

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

/** A classifier-proposed transient condition, still carrying its character attribution. */
export interface BeCharacterCondition {
  character: string
  label: string
  note?: string
  ttl?: number
}

/** Pull validated conditions off a classification result (same tolerance rules). */
export function beConditionsFromResult(result: Record<string, unknown>): BeCharacterCondition[] {
  const raw = result['beConditions']
  if (!Array.isArray(raw)) return []
  const conditions: BeCharacterCondition[] = []
  for (const candidate of raw.slice(0, MAX_BE_CONDITIONS)) {
    const parsed = beConditionSchema.safeParse(candidate)
    if (parsed.success) conditions.push(parsed.data)
  }
  return conditions
}

/** Pull validated bond events off a classification result (same tolerance rules). */
export function bondEventsFromResult(result: Record<string, unknown>): BondEvent[] {
  const raw = result['bondEvents']
  if (!Array.isArray(raw)) return []
  const events: BondEvent[] = []
  for (const candidate of raw.slice(0, MAX_BE_EVENTS_PER_TURN)) {
    const parsed = bondEventSchema.safeParse(candidate)
    if (parsed.success) events.push(parsed.data)
  }
  return events
}

/** Pull validated exposure events off a classification result (same tolerance rules). */
export function exposureEventsFromResult(result: Record<string, unknown>): ExposureEvent[] {
  const raw = result['exposureEvents']
  if (!Array.isArray(raw)) return []
  const events: ExposureEvent[] = []
  for (const candidate of raw.slice(0, MAX_BE_EVENTS_PER_TURN)) {
    const parsed = exposureEventSchema.safeParse(candidate)
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
