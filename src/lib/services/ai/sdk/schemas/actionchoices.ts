/**
 * Action Choices Schema
 *
 * Zod schema for validating action choices output from the LLM.
 * Used by ActionChoicesService for adventure mode.
 */

import { z } from 'zod'

import { DC_MAX, DC_MIN, ESSENCE_COST_MAX, SKILL_IDS, type SkillId } from '$lib/services/rpg'

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
  /** Type: action, dialogue, examine, or move. Tolerant: an off-list value
   * coerces to 'action' instead of voiding the whole response (D5 playtest:
   * a single enum miss killed every choice on providers that don't enforce
   * json-schema constraints). */
  type: z
    .enum(['action', 'dialogue', 'examine', 'move'])
    .catch('action')
    .describe('Type: action, dialogue, examine, or move'),
  /** Skill governing this choice's check — only on genuinely risky choices. */
  skill: z
    .enum(SKILL_IDS)
    .optional()
    .catch(undefined)
    .describe('Skill id for a risky choice; omit for safe choices'),
  /** Difficulty class for the check (with skill; omitted = no check). */
  dc: z
    .number()
    .int()
    .min(DC_MIN)
    .max(DC_MAX)
    .optional()
    .catch(undefined)
    .describe(
      'Difficulty class for a risky choice; default LOW (8-11 easy, 14 moderate), reserve 17+ for dangerous or expert feats. Set by fictional difficulty, not to force failure.',
    ),
  /** The girl this action targets — enables bond/quirk check modifiers. */
  targetCharacter: z
    .string()
    .optional()
    .catch(undefined)
    .describe('Exact name of the character this action targets, when it targets one'),
  /** Catalytic essence cost when the choice channels the player's power. */
  essenceCost: z
    .number()
    .int()
    .min(0)
    .max(ESSENCE_COST_MAX)
    .optional()
    .catch(undefined)
    .describe('Essence cost 1-3 when the choice channels catalytic power'),
  /** Spell lorebook entry id when this choice casts a known spell (Phase 4). */
  spellId: z
    .string()
    .optional()
    .catch(undefined)
    .describe(
      'Lorebook entry id of a spell the player already knows, ONLY when the choice is an explicit cast of that spell by name. Omit it for every other choice — physical, sexual, social, and mundane actions are never spell casts, and a spell the player has not learned is never a valid id.',
    ),
  /**
   * The action's explicit purpose is to grow/transform the target's body. A
   * successful check on such an action grows her deterministically (the check IS
   * the dice); a failed one suppresses the classifier's mirrored growth.
   */
  growthIntent: z
    .boolean()
    .optional()
    .catch(undefined)
    .describe(
      "True only when the action's explicit purpose is to grow or transform the target's body (channeling essence into her, a transformation working, feeding her a growth potion). Set targetCharacter alongside it whenever you can name her; never withhold this flag for lack of a name.",
    ),
})

/**
 * Schema for the action choices result.
 * Contains an array of 1-4 choices.
 */
export const actionChoicesResultSchema = z.object({
  // No hard .max(): overflow must not void the parse (callers slice to 4).
  // .min(1) stays — an empty list IS a failure worth surfacing.
  choices: z.array(actionChoiceSchema).min(1).describe('1-4 action choices'),
})

// Hand-declared (NOT z.infer): the tolerant `.catch()` coercions above make
// Zod infer `unknown` for those fields, but runtime output always matches
// this shape — catch values are in-domain.
export interface ActionChoice {
  text: string
  type: 'action' | 'dialogue' | 'examine' | 'move'
  skill?: SkillId
  dc?: number
  targetCharacter?: string
  essenceCost?: number
  spellId?: string
  growthIntent?: boolean
}
export interface ActionChoicesResult {
  choices: ActionChoice[]
}
