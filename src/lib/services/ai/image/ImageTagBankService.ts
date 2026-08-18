/**
 * Image Tag Bank Service
 *
 * Generates a locked booru identity-tag bank for a character from their
 * description and visual descriptors (Megumin dossier rule: 12-20 physical-only
 * tags in anchor → hair → eyes → skin → body → age → marks order). The result
 * seeds the Image Tag Bank draft in the character panel — the user reviews and
 * saves; nothing is written automatically.
 */

import { z } from 'zod'
import { BaseAIService } from '../BaseAIService'
import { ContextBuilder } from '$lib/services/context'
import { createLogger } from '$lib/log'
import type { Character } from '$lib/types'

const log = createLogger('ImageTagBank')

const tagBankSchema = z.object({
  tags: z
    .array(z.string().min(2))
    .min(8)
    .max(24)
    .describe('Atomic booru identity tags in dossier order'),
})

/** Fields that describe the body itself — clothing/accessories are excluded on purpose. */
const PHYSICAL_DESCRIPTOR_FIELDS = ['face', 'hair', 'eyes', 'build', 'distinguishing'] as const

export class ImageTagBankService extends BaseAIService {
  constructor() {
    // Rides the image-generation preset — same LLM that writes scene prompts.
    super('imageGeneration')
  }

  /**
   * Generate a comma-separated identity tag bank for the character.
   * Returns the joined tag string ready for the Image Tag Bank field.
   */
  async generateTagBank(character: Character): Promise<string> {
    const vd = character.visualDescriptors
    const descriptorLines = PHYSICAL_DESCRIPTOR_FIELDS.map((field) =>
      vd?.[field] ? `${field}: ${vd[field]}` : null,
    ).filter(Boolean)

    const ctx = new ContextBuilder()
    ctx.add({
      characterName: character.name,
      characterDescription: character.description || '(no description)',
      visualDescriptorsBlock:
        descriptorLines.length > 0 ? descriptorLines.join('\n') : '(no visual descriptors)',
    })
    const { system, user: prompt } = await ctx.render('image-tag-bank-generation')

    const result = await this.generate(tagBankSchema, system, prompt, 'image-tag-bank-generation')
    const bank = result.tags.map((t) => t.trim()).join(', ')
    log('Generated tag bank', { character: character.name, tagCount: result.tags.length })
    return bank
  }
}
