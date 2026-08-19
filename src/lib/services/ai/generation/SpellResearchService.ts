/**
 * Spell Research Service (RPG Phase 4, research/50 R6).
 *
 * In-game spell generation: the player researches/discovers a spell, the model
 * emits one into the closed spellSchema (effects restricted to the EffectTag
 * vocabulary — an out-of-vocab effect fails validation and the whole generation
 * is rejected). The validated object is handed to StoryStore.learnSpell, which
 * makes it a lorebook Entry and adds it to knownSpells. Fails safe to null.
 *
 * Uses an inline system/prompt (no template file) — the vocabulary is small and
 * fully described here, and this keeps the feature self-contained.
 */

import { BaseAIService } from '../BaseAIService'
import { createLogger } from '$lib/log'
import { EFFECT_KINDS } from '$lib/services/be'
import { SPELL_SCHOOLS } from '$lib/services/rpg'
import { spellSchema, type SpellGeneration } from '../sdk/schemas/spell'

const log = createLogger('SpellResearch')

const SYSTEM = [
  'You design a single spell for a body-transformation fantasy RPG, as structured data.',
  '',
  'The spell MUST use ONLY these effect kinds (an unknown kind is invalid):',
  `  ${EFFECT_KINDS.join(', ')}.`,
  'Effect meanings: growth (enlarges the target, intensity 1-3), induction (starts lactation),',
  'supply_surge (raises an already-lactating supply), fill (drains or sets fluid fullness),',
  'condition (a temporary named body condition), bond (warms or strains her feelings),',
  'dependence (deepens catalyst dependence), check_debuff (a hex that penalizes checks on her).',
  '',
  `Prefer a school from: ${SPELL_SCHOOLS.join(', ')}. Set dc 8-24 by difficulty and`,
  'essenceCost 1-3 by potency. Give 1-3 effects that match the description. Keep it grounded',
  'in the requested concept — do not invent mechanics beyond the listed effect kinds.',
].join('\n')

export class SpellResearchService extends BaseAIService {
  constructor(serviceId: string) {
    super(serviceId)
  }

  /**
   * Generate one spell from a player's research brief. Returns null on any
   * failure (model error, validation failure) — the caller narrates a failed
   * research attempt rather than crashing.
   */
  async research(brief: string, sheetSummary: string): Promise<SpellGeneration | null> {
    try {
      const prompt = [
        `Player sheet: ${sheetSummary}.`,
        `Research brief: ${brief.trim() || 'a useful transformation spell suited to the caster'}.`,
        'Design one spell fitting the brief.',
      ].join('\n')
      return await this.generate(spellSchema, SYSTEM, prompt, 'spellResearch')
    } catch (error) {
      log('spell research failed', { error })
      return null
    }
  }
}
