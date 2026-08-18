/**
 * Inline Image Tracker
 *
 * Tracks <pic> tags during streaming and starts image generation immediately.
 * Generated images are stored in memory until the entry is created in the DB,
 * at which point flushToDatabase() is called to persist them.
 *
 * This allows images to start generating while the narrative streams, improving
 * perceived performance, while avoiding FK constraint issues (entry must exist first).
 *
 * Usage:
 * 1. Create tracker before streaming starts with pre-generated entryId
 * 2. Call processChunk() with accumulated content on each chunk
 * 3. After entry is created, call flushToDatabase() to persist images
 */

import { extractPicTags, type ParsedPicTag } from '$lib/utils/inlineImageParser'
import {
  generateImage as registryGenerateImage,
  supportsImageGeneration,
} from './providers/registry'
import { database } from '$lib/services/database'
import { settings } from '$lib/stores/settings.svelte'
import { emitImageQueued, emitImageReady } from '$lib/services/events'
import { normalizeImageDataUrl, parseImageSize } from '$lib/utils/image'
import { assembleInlineImage } from './inlineAssembly'
import { type ResolvedLora } from './loraBinding'
import { DEFAULT_FALLBACK_STYLE_PROMPT } from './constants'
import type { StructuredImageSpecInput } from './providers/types'
import { createLogger } from '$lib/log'
import type { Character, EmbeddedImage } from '$lib/types'

const log = createLogger('InlineImageTracker')

interface PendingImage {
  id: string
  tag: ParsedPicTag
  prompt: string
  profileId: string
  model: string
  size: string
  referenceImageUrls?: string[]
  /** Promise that resolves to base64 image data or null on failure */
  generationPromise: Promise<{ base64: string | null; error?: string }>
}

export class InlineImageTracker {
  /** Set of original tag text that have already been processed */
  private processedTags = new Set<string>()
  /** Pending image generations (results stored in memory until flushed) */
  private pendingImages: PendingImage[] = []

  constructor(
    private storyId: string,
    private entryId: string,
    private getCharacters: () => Character[],
    /** BE grounding gate — mirrors the narrative block's beMode gating. */
    private getBeMode: () => boolean = () => false,
  ) {
    log('Tracker created', { storyId, entryId })
  }

  /**
   * Process accumulated content for new complete <pic> tags.
   * Called on each streaming chunk with the full accumulated content.
   */
  processChunk(accumulatedContent: string, referenceMode: boolean): void {
    const tags = extractPicTags(accumulatedContent)

    for (const tag of tags) {
      if (this.processedTags.has(tag.originalTag)) {
        continue
      }

      this.processedTags.add(tag.originalTag)

      log('New complete <pic> tag detected', {
        prompt: tag.prompt.slice(0, 50) + '...',
        characters: tag.characters,
      })

      // Fire-and-forget: style prompt fetch + generation start is async.
      // accumulatedContent (the narrative streamed so far) is the context
      // signal for the si-bridge spec's intimacy inference.
      this.startGeneration(tag, referenceMode, accumulatedContent).catch((error) => {
        log('startGeneration failed', { error })
      })
    }
  }

  /**
   * Start image generation for a tag. The generation runs async and stores
   * the result in pendingImages for later DB persistence.
   */
  private async startGeneration(
    tag: ParsedPicTag,
    referenceMode: boolean,
    narrativeSoFar: string,
  ): Promise<void> {
    const imageSettings = settings.systemServicesSettings.imageGeneration

    const imageId = crypto.randomUUID()

    // Determine profile and model
    let profileId = imageSettings.profileId
    let modelToUse = settings.getImageProfile(profileId ?? '')?.model ?? ''
    let referenceImageUrls: string[] | undefined

    // Check for portrait mode with character references
    if (referenceMode && tag.characters.length > 0) {
      const portraitUrls: string[] = []
      const characters = this.getCharacters()

      for (const charName of tag.characters.slice(0, 3)) {
        const character = characters.find((c) => c.name.toLowerCase() === charName.toLowerCase())
        const portraitUrl = normalizeImageDataUrl(character?.portrait)
        if (portraitUrl) {
          portraitUrls.push(portraitUrl)
        }
      }

      if (portraitUrls.length > 0) {
        profileId = imageSettings.referenceProfileId
        modelToUse = settings.getImageProfile(profileId ?? '')?.model ?? ''
        referenceImageUrls = portraitUrls
      }
    }

    if (!profileId) {
      log('No image profile configured, skipping')
      return
    }

    // Check if provider supports image generation
    const profile = settings.getImageProfile(profileId)
    if (!profile) return
    if (!supportsImageGeneration(profile.providerType)) return

    // Assemble the request via the shared helper — this streaming tracker is the
    // LIVE inline path, so it must produce the same grounding + per-character
    // LoRA/trigger words + spec as the post-hoc InlineImageService.
    const stylePrompt = await this.getStylePrompt(imageSettings.styleId)
    const { fullPrompt, bridgeSpec, loraOverride } = assembleInlineImage({
      presentCharacters: this.getCharacters(),
      tagPrompt: tag.prompt,
      tagCharacters: tag.characters,
      beMode: this.getBeMode(),
      stylePrompt,
      narrativeText: narrativeSoFar,
      providerType: profile.providerType,
      model: modelToUse,
    })
    if (bridgeSpec) {
      log('Built si-bridge structured spec', {
        characters: bridgeSpec.characters.length,
        tiers: bridgeSpec.characters.map((c) => c.tier_index),
        intimacy: bridgeSpec.intimacy,
        location: bridgeSpec.location,
        regional: bridgeSpec.regional ?? false,
      })
    }
    if (profile.providerType === 'si-bridge' && referenceImageUrls?.length) {
      // B1 anchor path not wired yet — portrait references cannot be consumed.
      log('si-bridge ignores portrait references (B1 identity anchors not yet wired)', {
        droppedReferences: referenceImageUrls.length,
      })
    }

    log('Starting async image generation', {
      imageId,
      prompt: tag.prompt.slice(0, 50) + '...',
      profileId,
      model: modelToUse,
    })

    // Start generation - store promise for later resolution
    const generationPromise = this.generateImage(
      profileId,
      modelToUse,
      fullPrompt,
      imageSettings.size,
      referenceImageUrls,
      bridgeSpec,
      loraOverride,
    )

    this.pendingImages.push({
      id: imageId,
      tag,
      prompt: fullPrompt,
      profileId,
      model: modelToUse,
      size: imageSettings.size,
      referenceImageUrls,
      generationPromise,
    })
  }

  /**
   * Generate an image and return the result (doesn't write to DB).
   */
  private async generateImage(
    profileId: string,
    model: string,
    prompt: string,
    size: string,
    referenceImageUrls?: string[],
    spec?: StructuredImageSpecInput,
    loraOverride?: ResolvedLora,
  ): Promise<{ base64: string | null; error?: string }> {
    try {
      const result = await registryGenerateImage({
        profileId,
        model,
        prompt,
        size,
        referenceImages: referenceImageUrls,
        spec,
        loraOverride,
      })

      if (!result.base64) {
        return { base64: null, error: 'No image data returned' }
      }

      log('Image generated successfully (in memory)')
      return { base64: result.base64 }
    } catch (error) {
      // Tauri's HTTP plugin throws plain strings on network failures
      // (connection refused etc.) — preserve them instead of "Unknown error".
      const errorMessage =
        error instanceof Error ? error.message : error ? String(error) : 'Unknown error'
      log('Image generation failed', { error: errorMessage })
      return { base64: null, error: errorMessage }
    }
  }

  /**
   * Get the style prompt for the selected style ID.
   * Image style templates are external (raw text) -- fetched directly from the database.
   */
  private async getStylePrompt(styleId: string): Promise<string> {
    try {
      const template = await database.getPackTemplate('default-pack', styleId)
      if (template?.content) return template.content
    } catch {
      // Template not found
    }

    return DEFAULT_FALLBACK_STYLE_PROMPT
  }

  /**
   * Flush all pending images to the database.
   * Creates records immediately with 'generating' status, then updates when done.
   * Call this AFTER the story entry has been created.
   */
  async flushToDatabase(): Promise<void> {
    if (this.pendingImages.length === 0) {
      log('No pending images to flush')
      return
    }

    log('Flushing pending images to database', { count: this.pendingImages.length })

    const imageSettings = settings.systemServicesSettings.imageGeneration

    for (const pending of this.pendingImages) {
      // Determine dimensions from size setting
      const { width, height } = parseImageSize(pending.size)

      // Create DB record immediately with 'generating' status
      const embeddedImage: Omit<EmbeddedImage, 'createdAt'> = {
        id: pending.id,
        storyId: this.storyId,
        entryId: this.entryId,
        sourceText: pending.tag.originalTag,
        prompt: pending.prompt,
        styleId: imageSettings.styleId,
        model: pending.model,
        imageData: '',
        width,
        height,
        status: 'generating',
        generationMode: 'inline',
      }

      await database.createEmbeddedImage(embeddedImage)
      emitImageQueued(pending.id, this.entryId)

      log('Image record created with generating status', { imageId: pending.id })

      // Update record when generation completes (non-blocking). A failed DB
      // write must not swallow the ready event — that would strand the row in
      // 'generating' with no UI signal (mirrors InlineImageService's catch).
      pending.generationPromise
        .then(async (result) => {
          let persisted = false
          try {
            await database.updateEmbeddedImage(pending.id, {
              imageData: result.base64 || '',
              status: result.base64 ? 'complete' : 'failed',
              errorMessage: result.error,
            })
            persisted = true
          } catch (dbError) {
            log('Failed to update image record', { imageId: pending.id, dbError })
          }
          // Success requires the image to actually be readable from the DB.
          emitImageReady(pending.id, this.entryId, !!result.base64 && persisted)
          log('Image record updated', {
            imageId: pending.id,
            status: result.base64 && persisted ? 'complete' : 'failed',
          })
        })
        .catch((error) => {
          log('Failed to finalize image record', { imageId: pending.id, error })
        })
    }

    log('All pending images flushed (generation continues in background)', {
      count: this.pendingImages.length,
    })
    this.pendingImages = []
  }

  /**
   * Get count of processed tags.
   */
  get processedCount(): number {
    return this.processedTags.size
  }

  /**
   * Check if there are pending images being generated.
   */
  get hasPendingImages(): boolean {
    return this.pendingImages.length > 0
  }
}
