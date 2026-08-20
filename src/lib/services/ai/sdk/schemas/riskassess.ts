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
    .describe(
      'Difficulty class when risky; default LOW (8-11 easy, 14 moderate), reserve 17+ for dangerous or expert feats. Set by fictional difficulty, not to force failure.',
    ),
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
  spellId: z
    .string()
    .optional()
    .describe(
      'Lorebook entry id of a spell the player already knows, ONLY when the action is an explicit cast of that spell by name. Omit it for every other action — physical, sexual, social, and mundane actions are never spell casts, and a spell the player has not learned is never a valid id.',
    ),
  /**
   * The action's explicit purpose is to grow/transform the target's body. A
   * successful check on such an action grows her deterministically (the check IS
   * the dice); a failed one suppresses the classifier's mirrored growth.
   */
  growthIntent: z
    .boolean()
    .optional()
    .describe(
      "True only when the action's explicit purpose is to grow or transform the target's body (channeling essence into her, a transformation working, feeding her a growth potion). Set targetCharacter alongside it whenever you can name her; never withhold this flag for lack of a name.",
    ),
  rationale: z.string().optional().describe('One short sentence of reasoning'),
})

export type RiskAssessResult = z.infer<typeof riskAssessResultSchema>
