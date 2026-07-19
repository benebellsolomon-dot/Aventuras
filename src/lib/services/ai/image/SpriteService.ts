/**
 * Sprite anchor service (Spec 4 V2a Task 7; V2b adds cell generation).
 *
 * The dedicated approved anchor render (Ben's ruling): a per-character render
 * at the character's OWN tier, generated through the provider-agnostic
 * spriteProfileId slot, explicitly approved in the CharacterPanel. Stored
 * raw/un-matted on the character (it is the FaceID/pose SOURCE — matting it
 * would corrupt pose detection). Persistence goes through a caller-supplied
 * callback (story.updateCharacter — COW-safe) to avoid a store import cycle.
 */

import type { Character } from '$lib/types'
import { settings } from '$lib/stores/settings.svelte'
import { generateImage as registryGenerateImage } from './providers/registry'
import { buildAnchorPrompt, buildAnchorSpec } from './spriteSpec'
import { readBodyState, spriteAppearanceHash, type SpriteAppearanceInput } from '$lib/services/be'
import { createLogger } from '$lib/log'

const log = createLogger('SpriteService')

/** Default tier for anchor renders of characters without engine bodyState. */
const ANCHOR_FALLBACK_TIER = 14

export type PersistCharacter = (
  characterId: string,
  updates: Partial<Character>,
) => Promise<unknown>

function appearanceInput(character: Character): SpriteAppearanceInput {
  const state = readBodyState(character.metadata)
  return {
    visualDescriptors: character.visualDescriptors ?? null,
    shape: state?.shape ?? 'natural',
    stylePreset: 'semireal',
    register: 'color',
  }
}

/** The appearance hash the character's anchor + sprite set must match to be current. */
export function currentAppearanceHash(character: Character): string {
  return spriteAppearanceHash(appearanceInput(character))
}

/** An anchor is usable only when approved for the character's CURRENT appearance. */
export function isAnchorCurrent(character: Character): boolean {
  return (
    character.spriteAnchorStatus === 'approved' &&
    !!character.spriteAnchor &&
    character.spriteAnchorHash === currentAppearanceHash(character)
  )
}

export class SpriteAnchorService {
  /** Render (or re-render) the anchor; leaves it in 'ready' awaiting approval. */
  async generateAnchor(character: Character, persist: PersistCharacter): Promise<void> {
    const imageSettings = settings.systemServicesSettings.imageGeneration
    const profileId = imageSettings.spriteProfileId ?? null
    const profile = profileId ? settings.getImageProfile(profileId) : undefined
    if (!profileId || !profile) {
      throw new Error('No sprite profile configured (Settings → Images → Sprite Profile)')
    }

    const hash = currentAppearanceHash(character)
    const tier = readBodyState(character.metadata)?.tier ?? ANCHOR_FALLBACK_TIER

    await persist(character.id, { spriteAnchorStatus: 'generating' })
    try {
      const isBridge = profile.providerType === 'si-bridge'
      const result = await registryGenerateImage({
        profileId,
        model: profile.model ?? '',
        prompt: buildAnchorPrompt(tier, character.visualDescriptors ?? null),
        size: imageSettings.spriteSize ?? '832x1216',
        spec: isBridge ? buildAnchorSpec(tier, character.visualDescriptors ?? null) : undefined,
      })
      if (!result.base64) throw new Error('No image data returned')
      await persist(character.id, {
        spriteAnchor: `data:image/png;base64,${result.base64}`,
        spriteAnchorStatus: 'ready',
        spriteAnchorHash: hash,
      })
      log('Anchor rendered', { characterId: character.id, tier, hash })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Best-effort status write; the UI also surfaces the thrown error.
      await persist(character.id, { spriteAnchorStatus: 'failed' }).catch(() => {})
      log('Anchor generation failed', { characterId: character.id, error: message })
      throw error
    }
  }

  /** Explicit approval — the anchor becomes the set's identity source. */
  async approveAnchor(character: Character, persist: PersistCharacter): Promise<void> {
    if (character.spriteAnchorStatus !== 'ready' || !character.spriteAnchor) {
      throw new Error('No rendered anchor awaiting approval')
    }
    await persist(character.id, { spriteAnchorStatus: 'approved' })
    log('Anchor approved', { characterId: character.id })
  }
}

export const spriteAnchorService = new SpriteAnchorService()
