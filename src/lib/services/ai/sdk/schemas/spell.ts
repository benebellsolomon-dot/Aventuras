/**
 * Spell Schema (RPG Phase 4, research/50 R6)
 *
 * The structured shape the LLM emits when the player researches a spell in-game.
 * Effects are restricted to the closed EffectTag vocabulary — an out-of-vocab
 * effect fails validation and the generation is rejected/retried, never saved.
 * `school` must be a real SkillId. The validated object becomes a `type:'spell'`
 * lorebook Entry (SpellEntryState) and its id is pushed into rpgSheet.knownSpells.
 */

import { z } from 'zod'

import { effectTagSchema } from '$lib/services/be'
import { DC_MAX, DC_MIN, ESSENCE_COST_MAX, SKILL_IDS } from '$lib/services/rpg'
import type { Entry } from '$lib/types'

export const spellSchema = z.object({
  name: z.string().min(1).max(80).describe('The spell name'),
  description: z
    .string()
    .min(1)
    .max(600)
    .describe('Narrative description of the spell — what casting it looks and feels like'),
  school: z
    .enum(SKILL_IDS)
    .describe('Governing skill/school — prefer transmutation, enchantment, arcana, or ritualism'),
  essenceCost: z
    .number()
    .int()
    .min(0)
    .max(ESSENCE_COST_MAX)
    .describe('Essence cost to cast (0-6; most spells 1-3)'),
  dc: z.number().int().min(DC_MIN).max(DC_MAX).describe('Difficulty class to cast (8-24 typical)'),
  effects: z
    .array(effectTagSchema)
    .min(1)
    .max(4)
    .describe('1-4 engine-executed effects from the fixed vocabulary'),
  aliases: z
    .array(z.string())
    .optional()
    .describe('Alternate names for keyword-based lorebook injection'),
})

export type SpellGeneration = z.infer<typeof spellSchema>

/** The Entry fields the store fills in on insert. */
type NewEntryData = Omit<Entry, 'id' | 'storyId' | 'createdAt' | 'updatedAt' | 'branchId'>

/**
 * Build the lorebook Entry data for a learned spell (research/50 R1/R6). Pure:
 * the store adds id/storyId/timestamps/branch. Keyword injection carries the
 * spell name + aliases so a learned spell inherits relevance-injection. The spell
 * is blacklisted from AI lore management (its mechanical block is engine-owned,
 * not free-text the lore manager should rewrite).
 */
export function buildSpellEntryData(gen: SpellGeneration): NewEntryData {
  const aliases = gen.aliases ?? []
  return {
    name: gen.name,
    type: 'spell',
    description: gen.description,
    hiddenInfo: null,
    aliases,
    state: {
      type: 'spell',
      school: gen.school,
      essenceCost: gen.essenceCost,
      dc: gen.dc,
      effects: gen.effects,
      revealed: true,
    },
    adventureState: null,
    creativeState: null,
    injection: {
      mode: 'keyword',
      keywords: [gen.name, ...aliases],
      priority: 0,
    },
    firstMentioned: null,
    lastMentioned: null,
    mentionCount: 0,
    createdBy: 'ai',
    loreManagementBlacklisted: true,
  }
}
