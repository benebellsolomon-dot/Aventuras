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

import type { Character, CharacterSprite } from '$lib/types'
import { settings } from '$lib/stores/settings.svelte'
import { database } from '$lib/services/database'
import { generateImage as registryGenerateImage } from './providers/registry'
import {
  buildAnchorPrompt,
  buildAnchorSpec,
  buildSpritePrompt,
  buildSpriteSpec,
  type SpriteCellInput,
} from './spriteSpec'
import { getBackgroundMatte } from './matting'
import {
  readBodyState,
  spriteAppearanceHash,
  spriteSeed,
  type SpriteAppearanceInput,
  type SpriteExpression,
  type SpriteSelection,
} from '$lib/services/be'
import { createLogger } from '$lib/log'

const log = createLogger('SpriteService')

/** Default tier for anchor renders of characters without engine bodyState. */
const ANCHOR_FALLBACK_TIER = 14
/** FaceID weight for cell renders — below the bridge default 0.8 so expression
 * clusters stay distinct (Spec 4 OD#S4; tune against real renders). */
const SPRITE_FACEID_WEIGHT = 0.55
const SPRITE_OPENPOSE_STRENGTH = 1.0
const DEFAULT_SPRITE_SIZE = '832x1216'

/** The 5 cells of one band (engorged pins distressed — the 35-cell invariant). */
const BAND_CELLS: ReadonlyArray<{ expression: SpriteExpression; engorged: boolean }> = [
  { expression: 'positive', engorged: false },
  { expression: 'neutral', engorged: false },
  { expression: 'distressed', engorged: false },
  { expression: 'flushed', engorged: false },
  { expression: 'distressed', engorged: true },
]

const stripDataUrlPrefix = (dataUrl: string): string =>
  dataUrl.replace(/^data:image\/[^;]+;base64,/, '')

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

  // ===== V2b — lazy per-band cell generation =====

  private listeners = new Set<(characterId: string) => void>()
  private inFlight = new Set<string>()

  /** Subscribe to sprite completion/failure; returns the unsubscribe. */
  subscribe(listener: (characterId: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(characterId: string): void {
    for (const listener of this.listeners) listener(characterId)
  }

  /**
   * Cache-or-enqueue for one selection. On a miss the WHOLE band's 5 cells are
   * queued (needed cell first, sequential — solo renders, never crowd the GPU).
   * Returns the cached row (any status) or null when nothing exists yet /
   * sprites aren't configured.
   */
  async ensureSprite(
    character: Character,
    storyId: string,
    selection: SpriteSelection,
  ): Promise<CharacterSprite | null> {
    const imageSettings = settings.systemServicesSettings.imageGeneration
    const profileId = imageSettings.spriteProfileId ?? null
    const profile = profileId ? settings.getImageProfile(profileId) : undefined
    if (!profileId || !profile) return null

    const hash = currentAppearanceHash(character)
    const existing = await database.getSprite(
      character.id,
      hash,
      selection.bandIndex,
      selection.expression,
      selection.engorged,
    )
    if (existing && existing.status === 'complete') return existing
    if (existing && (existing.status === 'pending' || existing.status === 'generating')) {
      return existing
    }

    // Miss or failed → regenerate the band, needed cell first (fire-and-forget).
    void this.generateBand(character, storyId, hash, selection, profileId).catch((error) => {
      log('Band generation failed', { characterId: character.id, error })
    })
    return existing ?? null
  }

  private async generateBand(
    character: Character,
    storyId: string,
    hash: string,
    needed: SpriteSelection,
    profileId: string,
  ): Promise<void> {
    // Wholesale invalidation rides every regeneration: sets from any OTHER
    // appearance hash are stale by definition (bounded ≤35 rows/character).
    await database.deleteStaleSprites(character.id, hash).catch(() => {})
    const cells = [
      { expression: needed.expression, engorged: needed.engorged },
      ...BAND_CELLS.filter(
        (c) => !(c.expression === needed.expression && c.engorged === needed.engorged),
      ),
    ]
    for (const cell of cells) {
      await this.generateCell(character, storyId, hash, needed.bandIndex, cell, profileId)
    }
  }

  private async generateCell(
    character: Character,
    storyId: string,
    hash: string,
    bandIndex: number,
    cell: { expression: SpriteExpression; engorged: boolean },
    profileId: string,
  ): Promise<void> {
    const key = `${character.id}:${hash}:${bandIndex}:${cell.expression}:${cell.engorged}`
    if (this.inFlight.has(key)) return
    this.inFlight.add(key)
    const rowId = crypto.randomUUID()
    try {
      const existing = await database.getSprite(
        character.id,
        hash,
        bandIndex,
        cell.expression,
        cell.engorged,
      )
      if (existing?.status === 'complete' || existing?.status === 'generating') return

      const profile = settings.getImageProfile(profileId)
      if (!profile) return
      const state = readBodyState(character.metadata)
      const seed = spriteSeed(character.id, hash)

      await database.upsertSprite({
        id: rowId,
        storyId,
        characterId: character.id,
        appearanceHash: hash,
        bandIndex,
        expression: cell.expression,
        engorged: cell.engorged,
        imageData: '',
        seed,
        status: 'generating',
      })

      const input: SpriteCellInput = {
        name: character.name,
        visualDescriptors: character.visualDescriptors ?? null,
        bandIndex,
        expression: cell.expression,
        engorged: cell.engorged,
        fluidType: state?.fluids.fluidType ?? 'milk',
      }
      const isBridge = profile.providerType === 'si-bridge'
      // FaceID identity-hold needs an approved-and-current anchor; a krea2 pin
      // can't carry an anchor at all (image-conditioning forces Illustrious).
      const useAnchor = isBridge && profile.model !== 'krea2' && isAnchorCurrent(character)

      const result = await registryGenerateImage({
        profileId,
        model: profile.model ?? '',
        prompt: buildSpritePrompt(input),
        size: settings.systemServicesSettings.imageGeneration.spriteSize ?? DEFAULT_SPRITE_SIZE,
        seed,
        spec: isBridge ? buildSpriteSpec(input) : undefined,
        poseFaceAnchor: useAnchor ? stripDataUrlPrefix(character.spriteAnchor!) : undefined,
        faceidWeight: useAnchor ? SPRITE_FACEID_WEIGHT : undefined,
        openposeStrength: useAnchor ? SPRITE_OPENPOSE_STRENGTH : undefined,
      })
      if (!result.base64) throw new Error('No image data returned')

      const matte = await getBackgroundMatte()
      const finished = await matte.finish(result.base64)
      await database.updateSprite(rowId, { imageData: finished.dataUrl, status: 'complete' })
      log('Sprite cell complete', { key, matted: finished.matted })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log('Sprite cell failed', { key, error: message })
      // Emit-safe: a failed status write must not strand the row (mirrors
      // InlineImageService); listeners are notified either way below.
      try {
        await database.updateSprite(rowId, { status: 'failed', errorMessage: message })
      } catch (dbError) {
        log('Failed to persist sprite failure', { key, dbError })
      }
    } finally {
      this.inFlight.delete(key)
      this.notify(character.id)
    }
  }
}

export const spriteAnchorService = new SpriteAnchorService()
