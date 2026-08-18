/**
 * Risk Assess Schema (research/47 Step 5)
 *
 * Structured output for the free-text action pre-pass: does this player action
 * carry real risk, and if so which skill and DC govern it. Tolerant by design:
 * skill/dc are optional and only meaningful when risky is true.
 */

import { z } from 'zod'

import { DC_MAX, DC_MIN, ESSENCE_COST_MAX, SKILL_IDS } from '$lib/services/rpg'

export const riskAssessResultSchema = z.object({
  risky: z.boolean().describe('True only when the action has a real chance of failure'),
  skill: z.enum(SKILL_IDS).optional().describe('Governing skill id when risky'),
  dc: z
    .number()
    .int()
    .min(DC_MIN)
    .max(DC_MAX)
    .optional()
    .describe('Difficulty class 8-24 when risky'),
  essenceCost: z
    .number()
    .int()
    .min(0)
    .max(ESSENCE_COST_MAX)
    .optional()
    .describe('Essence cost 1-3 when the action channels catalytic power'),
  targetCharacter: z
    .string()
    .optional()
    .describe('Exact name of the character this action targets, when it targets one'),
  rationale: z.string().optional().describe('One short sentence of reasoning'),
})

export type RiskAssessResult = z.infer<typeof riskAssessResultSchema>
