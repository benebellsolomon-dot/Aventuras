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
import { resolveRatingRoute } from './ratingRouting'
import {
  generateImage as registryGenerateImage,
  supportsImageGeneration,
} from './providers/registry'
import { database } from '$lib/services/database'
import { settings } from '$lib/stores/settings.svelte'
import { emitImageQueued, emitImageReady } from '$lib/services/events'
import { normalizeImageDataUrl, parseImageSize } from '$lib/utils/image'
import { assembleInlineImage } from './inlineAssembly'
import { resolveScenePrompt } from './scenePromptWriter'
import { pickImageSize } from './aspectRatio'
import { bridgeIdentityAnchor } from './bridgeSpec'
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
  /**
   * In-flight `startGeneration` calls. Each resolves once its tag has been
   * assembled and pushed into `pendingImages`. Awaited before a flush so a slow
   * step inside startGeneration (the dedicated booru prompt-writer LLM call) can
   * never let an end-of-narrative tag's push race — and be dropped by — the
   * flush fired at phase_complete.
   */
  private startPromises: Promise<void>[] = []

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

      // Async start (style-prompt fetch + dedicated-writer LLM call + generation
      // kickoff). accumulatedContent (the narrative streamed so far) is the
      // context signal for the si-bridge spec's intimacy inference. The promise
      // is TRACKED (not fire-and-forget) so flushToDatabase can settle it first —
      // otherwise a slow writer would drop an end-of-narrative image.
      const startPromise = this.startGeneration(tag, referenceMode, accumulatedContent).catch(
        (error) => {
          log('startGeneration failed', { error })
        },
      )
      this.startPromises.push(startPromise)
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

    // Determine profile and model. Explicit beats route to the explicit profile
    // when configured (research/64 option B) and skip the portrait-reference
    // override.
    const route = resolveRatingRoute(tag.rating, imageSettings)
    let profileId = route.profileId
    let modelToUse = settings.getImageProfile(profileId ?? '')?.model ?? ''
    let referenceImageUrls: string[] | undefined
    if (route.routed) {
      log('Explicit beat routed to the explicit image profile', { profileId, model: modelToUse })
    }

    // Check for portrait mode with character references
    if (!route.routed && referenceMode && tag.characters.length > 0) {
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

    // Dedicated booru prompt writer (research/55 follow-up): for booru image
    // models the narration model's prose <pic> prompt is rewritten into proper
    // Danbooru tags (copying locked identity banks) by a focused LLM call.
    // Best-effort — returns tag.prompt unchanged when off / non-booru / on failure.
    const tagPrompt = await resolveScenePrompt({
      presentCharacters: this.getCharacters(),
      tagCharacterNames: tag.characters,
      scenePrompt: tag.prompt,
      narrativeText: narrativeSoFar,
      beMode: this.getBeMode(),
      storyId: this.storyId,
      model: modelToUse,
    })

    // Assemble the request via the shared helper — this streaming tracker is the
    // LIVE inline path, so it must produce the same grounding + per-character
    // LoRA/trigger words + spec as the post-hoc InlineImageService.
    const stylePrompt = await this.getStylePrompt(imageSettings.styleId)
    const { fullPrompt, bridgeSpec, loraOverride } = assembleInlineImage({
      presentCharacters: this.getCharacters(),
      tagPrompt,
      writerComposed: tagPrompt !== tag.prompt,
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
    // si-bridge has no img2img reference list — identity rides the FaceID/
    // OpenPose anchor channel instead (B1), one portrait per request.
    const poseFaceAnchor = bridgeIdentityAnchor({
      providerType: profile.providerType,
      model: modelToUse,
      referenceImages: referenceImageUrls,
    })
    if (profile.providerType === 'si-bridge' && referenceImageUrls?.length) {
      log('si-bridge portrait reference routed to the FaceID anchor', {
        anchored: !!poseFaceAnchor,
        // A krea2 pin cannot carry an anchor at all; extra portraits have no slot.
        droppedReferences: referenceImageUrls.length - (poseFaceAnchor ? 1 : 0),
      })
    }

    // Aspect ratio by shot type / subject count (research/55 Phase 2): a fixed
    // square crops full-body shots and merges people in multi-subject scenes.
    // Named characters on the tag are the subject count; booru-only (prose
    // shot vocab is unreliable), falls back to the configured size otherwise.
    const size = pickImageSize({
      prompt: fullPrompt,
      subjectCount: tag.characters.length,
      model: modelToUse,
      fallback: route.size,
    })

    log('Starting async image generation', {
      imageId,
      prompt: tag.prompt.slice(0, 50) + '...',
      profileId,
      model: modelToUse,
      size,
    })

    // Start generation - store promise for later resolution
    const generationPromise = this.generateImage(
      profileId,
      modelToUse,
      fullPrompt,
      size,
      referenceImageUrls,
      bridgeSpec,
      loraOverride,
      poseFaceAnchor,
    )

    this.pendingImages.push({
      id: imageId,
      tag,
      prompt: fullPrompt,
      profileId,
      model: modelToUse,
      size,
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
    poseFaceAnchor?: string,
  ): Promise<{ base64: string | null; error?: string }> {
    try {
      const result = await registryGenerateImage({
        profileId,
        model,
        prompt,
        size,
        referenceImages: referenceImageUrls,
        spec,
        poseFaceAnchor,
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
    // Settle every in-flight startGeneration first: a <pic> tag near the end of
    // the narrative may still be resolving its dedicated-writer LLM call when the
    // caller flushes at phase_complete, and its pendingImages push races the
    // flush. Awaiting the tracked start promises guarantees all pushes have
    // landed before we read pendingImages. allSettled never rejects (each start
    // is already .catch-wrapped), so a failed start just contributes no image.
    if (this.startPromises.length > 0) {
      await Promise.allSettled(this.startPromises)
      this.startPromises = []
    }

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
