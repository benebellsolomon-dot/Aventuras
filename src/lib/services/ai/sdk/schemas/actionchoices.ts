/**
 * Action Choices Schema
 *
 * Zod schema for validating action choices output from the LLM.
 * Used by ActionChoicesService for adventure mode.
 */

import { z } from 'zod'

import { DC_MAX, DC_MIN, ESSENCE_COST_MAX, SKILL_IDS } from '$lib/services/rpg'

/**
 * Schema for a single action choice.
 *
 * The RPG fields are OPTIONAL and unvalidated legacy choices ({text,type}
 * persisted before research/47 Step 4) must keep parsing — no .strict(), no
 * new required fields.
 */
export const actionChoiceSchema = z.object({
  /** The action text for the player */
  text: z.string().describe('The action text for the player'),
  /** Type: action, dialogue, examine, or move */
  type: z
    .enum(['action', 'dialogue', 'examine', 'move'])
    .describe('Type: action, dialogue, examine, or move'),
  /** Skill governing this choice's check — only on genuinely risky choices. */
  skill: z
    .enum(SKILL_IDS)
    .optional()
    .describe('Skill id for a risky choice; omit for safe choices'),
  /** Difficulty class for the check (with skill; omitted = no check). */
  dc: z
    .number()
    .int()
    .min(DC_MIN)
    .max(DC_MAX)
    .optional()
    .describe(
      'Difficulty class for a risky choice; default LOW (8-11 easy, 14 moderate), reserve 17+ for dangerous or expert feats. Set by fictional difficulty, not to force failure.',
    ),
  /** The girl this action targets — enables bond/quirk check modifiers. */
  targetCharacter: z
    .string()
    .optional()
    .describe('Exact name of the character this action targets, when it targets one'),
  /** Catalytic essence cost when the choice channels the player's power. */
  essenceCost: z
    .number()
    .int()
    .min(0)
    .max(ESSENCE_COST_MAX)
    .optional()
    .describe('Essence cost 1-3 when the choice channels catalytic power'),
  /** Spell lorebook entry id when this choice casts a known spell (Phase 4). */
  spellId: z
    .string()
    .optional()
    .describe('Lorebook entry id of the known spell this choice casts, when it is a cast'),
})

/**
 * Schema for the action choices result.
 * Contains an array of 1-4 choices.
 */
export const actionChoicesResultSchema = z.object({
  choices: z.array(actionChoiceSchema).min(1).max(4).describe('1-4 action choices'),
})

// Type exports inferred from schemas
export type ActionChoice = z.infer<typeof actionChoiceSchema>
export type ActionChoicesResult = z.infer<typeof actionChoicesResultSchema>
