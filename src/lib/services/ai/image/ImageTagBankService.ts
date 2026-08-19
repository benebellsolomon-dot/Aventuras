/**
 * Image Tag Bank Service
 *
 * Generates a locked booru identity-tag bank for a character (Megumin dossier
 * rule: 12-20 physical-only tags in anchor → hair → eyes → skin → body → age →
 * marks order). The result seeds the Image Tag Bank draft in the character panel
 * — the user reviews and saves; nothing is written automatically.
 *
 * The dossier tag rules now live in the unified identity-extraction utility
 * (research/55 component A). This service DELEGATES to `extractIdentity` and
 * returns just the joined identity tags, keeping the manual-button contract
 * (`(character) => Promise<string>`) unchanged for CharacterPanel.svelte.
 */

import { createLogger } from '$lib/log'
import type { Character } from '$lib/types'
import { extractIdentity } from './identityExtraction'

const log = createLogger('ImageTagBank')

export class ImageTagBankService {
  /**
   * Generate a comma-separated identity tag bank for the character by delegating
   * to the unified identity extraction. Returns the joined tag string ready for
   * the Image Tag Bank field, or an empty string when extraction is unavailable
   * (best-effort: no configured text model / failure).
   */
  async generateTagBank(character: Character): Promise<string> {
    const extraction = await extractIdentity({
      visualDescriptors: character.visualDescriptors,
      name: character.name,
      description: character.description ?? undefined,
    })
    if (!extraction) {
      log('No extraction (best-effort skip) — returning empty bank', { character: character.name })
      return ''
    }
    const bank = extraction.identityTags.join(', ')
    log('Generated tag bank', {
      character: character.name,
      tagCount: extraction.identityTags.length,
    })
    return bank
  }
}
