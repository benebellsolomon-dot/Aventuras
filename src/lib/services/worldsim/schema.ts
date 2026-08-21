/**
 * E4 — classifier schema extension for agenda proposals (research/61).
 *
 * Same contract as be/schema.ts: the classifier's Zod schema strips unknown
 * keys, so the array MUST arrive via schema extension; prompt instructions
 * piggyback on the customVariableInstructions template slot; extraction is
 * tolerant (malformed entries dropped, never thrown on).
 *
 * The classifier only PROPOSES goals — the engine owns the slot (a proposal
 * lands only where no active agenda exists), the ticking, the completion
 * effects, and the rendering. Never LLM-self-reported state.
 *
 * Deliberately NO hard `.max()` length/count constraints (chekhov-schema
 * pattern, Phase 4 review): providers that don't enforce maxLength/maxItems
 * in structured output would fail the WHOLE classification parse on overflow,
 * silently voiding every entity update for the turn. Caps live in the
 * `.describe` text for the model and are enforced by sanitize-and-truncate in
 * agendaProposalsFromResult (agendaFromProposal re-sanitizes on the way to
 * persistence, which is behavior-neutral).
 */

import { z } from 'zod'
import { MAX_AGENDA_PROPOSALS } from './constants'
import { AGENDA_MAX_STEPS } from './constants'
import {
  AGENDA_GOAL_MAX,
  AGENDA_PLACE_MAX,
  sanitizeAgendaText,
  type AgendaKind,
  type NpcAgenda,
} from './agenda'

export const agendaProposalSchema = z.object({
  character: z.string().describe('Exact name of the named NPC'),
  goal: z
    .string()
    .describe(
      `Short phrase for what they are off doing, under ${AGENDA_GOAL_MAX} characters, e.g. "restocking herbs in the lower market"`,
    ),
  kind: z
    .enum(['travel', 'research', 'rest', 'reconcile', 'confront', 'mundane'])
    .describe(
      'travel=going somewhere, research=investigating/learning, rest=recovering, reconcile=working up to repairing things with the protagonist, confront=building toward a confrontation with the protagonist, mundane=everyday errand',
    ),
  maxSteps: z
    .number()
    .describe(`How many turns it takes, 1 (quick) to ${AGENDA_MAX_STEPS} (a long undertaking)`),
  destination: z
    .string()
    .describe(`For travel: where they are headed, under ${AGENDA_PLACE_MAX} characters`)
    .optional(),
})

export type AgendaProposal = z.infer<typeof agendaProposalSchema>

const AGENDA_PROPOSALS_DESCRIPTION = `Off-screen agenda proposals for named NPCs who LEFT the scene this response, were described as pursuing something elsewhere, or departed after being introduced. Ground each goal in what this response actually showed or implied. Empty array when nobody left with a purpose; at most ${MAX_AGENDA_PROPOSALS}.`

/**
 * Extend a classification schema with the top-level agendaProposals array.
 * Returns the input UNCHANGED when it isn't an extendable object schema —
 * callers detect the no-op by reference identity and should warn.
 */
export function extendClassificationSchemaWithAgendas(schema: z.ZodType): z.ZodType {
  const objectSchema = schema as unknown as z.ZodObject<z.ZodRawShape>
  if (typeof objectSchema.extend !== 'function') return schema
  return objectSchema.extend({
    agendaProposals: z
      .array(agendaProposalSchema)
      .default([])
      .describe(AGENDA_PROPOSALS_DESCRIPTION),
  })
}

/** Prompt instruction block, appended to the classifier's customVariableInstructions slot. */
export function buildAgendaInstructions(): string {
  return `## Off-Screen Agendas to Propose
This story tracks what named NPCs do while off-screen. Additionally fill the top-level \`agendaProposals\` array:
- Propose an agenda for a named NPC who LEFT the scene this response, was described as pursuing something elsewhere, or was introduced and then departed.
- \`goal\` = a short concrete phrase grounded in this response (what they said they would do, or what their exit implied). \`kind\` = travel / research / rest / reconcile / confront / mundane. \`maxSteps\` = 1 (quick) to ${AGENDA_MAX_STEPS} (a long undertaking). For travel, include \`destination\`.
- reconcile/confront are RESERVED for movement toward the protagonist specifically — use them only when the response evidenced that intent.
- At most ${MAX_AGENDA_PROPOSALS} proposals — pick the most significant departures.
- Do not propose for characters who stayed in the scene, and do not invent purposes the response gave no hint of; the engine assigns mundane routines on its own. Empty array is correct most turns.`
}

/**
 * Pull validated proposals off a classification result. Tolerates absence and
 * silently drops malformed entries (same rules as the be/*FromResult family);
 * an empty-after-sanitizing goal drops the proposal too. Length caps the
 * schema no longer hard-enforces are applied here by the same
 * sanitize-and-truncate agendaFromProposal uses (sanitizing must come FIRST:
 * a raw prefix slice could keep the sanitize-gate's pass verdict while
 * storing an all-filler prefix that later sanitizes to an empty goal).
 * agendaFromProposal's re-sanitize is behavior-neutral on this output: at
 * most it trims a dangling space the cap cut left behind, and it can never
 * empty a non-empty once-sanitized goal.
 */
export function agendaProposalsFromResult(result: Record<string, unknown>): AgendaProposal[] {
  const raw = result['agendaProposals']
  if (!Array.isArray(raw)) return []
  const proposals: AgendaProposal[] = []
  // Cap VALID entries, not raw indexes — a run of malformed leading entries
  // must not starve out well-formed ones behind it.
  for (const candidate of raw) {
    if (proposals.length >= MAX_AGENDA_PROPOSALS) break
    const parsed = agendaProposalSchema.safeParse(candidate)
    if (!parsed.success) continue
    const goal = sanitizeAgendaText(parsed.data.goal, AGENDA_GOAL_MAX)
    if (goal === '') continue
    proposals.push({
      ...parsed.data,
      goal,
      ...(parsed.data.destination !== undefined
        ? { destination: sanitizeAgendaText(parsed.data.destination, AGENDA_PLACE_MAX) }
        : {}),
    })
  }
  return proposals
}

/** An accepted proposal as a fresh agenda (step 0, bounds clamped, strings
 * sanitized — goal/destination are LLM-authored and render into the prompt). */
export function agendaFromProposal(proposal: AgendaProposal): NpcAgenda {
  const maxSteps = Number.isFinite(proposal.maxSteps)
    ? Math.min(AGENDA_MAX_STEPS, Math.max(1, Math.round(proposal.maxSteps)))
    : 1
  const destination = sanitizeAgendaText(proposal.destination ?? '', AGENDA_PLACE_MAX)
  return {
    goal: sanitizeAgendaText(proposal.goal, AGENDA_GOAL_MAX),
    kind: proposal.kind as AgendaKind,
    step: 0,
    maxSteps,
    ...(destination ? { destination } : {}),
  }
}
