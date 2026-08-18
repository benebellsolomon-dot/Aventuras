/**
 * Inline Image Generation Service
 *
 * Processes narrative content for <pic> tags and generates images inline.
 * Uses SDK-based image generation with API Profiles as the source of truth.
 *
 * When inline image mode is enabled:
 * 1. AI outputs <pic prompt="..." characters="..."></pic> tags in its narrative
 * 2. This service detects those tags and triggers image generation
 * 3. Images are stored as EmbeddedImage records with generationMode='inline'
 * 4. The rendering layer replaces <pic> tags with actual images
 */

import type { Character, EmbeddedImage } from '$lib/types'
import {
  generateImage as registryGenerateImage,
  supportsImageGeneration,
} from './providers/registry'
import { database } from '$lib/services/database'
import { settings } from '$lib/stores/settings.svelte'
import { emitImageQueued, emitImageReady, emitImageAnalysisFailed } from '$lib/services/events'
import { normalizeImageDataUrl, parseImageSize } from '$lib/utils/image'
import { extractPicTags, type ParsedPicTag } from '$lib/utils/inlineImageParser'
import { assembleInlineImage } from './inlineAssembly'
import { type ResolvedLora } from './loraBinding'
import type { StructuredImageSpecInput } from './providers/types'
import { DEFAULT_FALLBACK_STYLE_PROMPT } from './constants'
import { createLogger } from '$lib/log'

const log = createLogger('InlineImageGen')

export interface InlineImageContext {
  storyId: string
  entryId: string
  narrativeContent: string
  presentCharacters: Character[]
  referenceMode: boolean
  /** BE grounding gate — mirrors the narrative block's beMode gating. */
  beMode: boolean
}

export class InlineImageGenerationService {
  /**
   * Check if inline image generation is enabled and configured.
   * Uses profile-based configuration - checks if a valid image-capable profile is selected.
   */
  static isEnabled(): boolean {
    const imageSettings = settings.systemServicesSettings.imageGeneration

    const profileId = imageSettings.profileId
    if (!profileId) return false

    const profile = settings.getImageProfile(profileId)
    if (!profile) return false

    return supportsImageGeneration(profile.providerType)
  }

  /**
   * Process narrative content for <pic> tags and generate images.
   * This is the main entry point called after narrative generation completes
   * when inline image mode is enabled.
   */
  async processNarrativeForInlineImages(context: InlineImageContext): Promise<void> {
    const imageSettings = settings.systemServicesSettings.imageGeneration

    // Extract all <pic> tags from the narrative
    const picTags = extractPicTags(context.narrativeContent)

    if (picTags.length === 0) {
      log('No <pic> tags found in narrative')
      return
    }

    log('Found <pic> tags', {
      count: picTags.length,
      tags: picTags.map((t) => ({
        prompt: t.prompt.slice(0, 50) + '...',
        characters: t.characters,
      })),
    })

    // Apply max images limit
    const maxImages = imageSettings.maxImagesPerMessage ?? 3
    const tagsToProcess = maxImages === 0 ? picTags : picTags.slice(0, maxImages)

    if (tagsToProcess.length < picTags.length) {
      log('Limiting to max images', {
        found: picTags.length,
        processing: tagsToProcess.length,
        maxAllowed: maxImages,
      })
    }

    // Process each tag
    for (const tag of tagsToProcess) {
      await this.generateImageForTag(context, tag, imageSettings)
    }

    log('All inline images queued', { count: tagsToProcess.length })
  }

  /**
   * Generate image for a single <pic> tag.
   * Selects appropriate profile and model based on portrait mode and character availability.
   */
  private async generateImageForTag(
    context: InlineImageContext,
    tag: ParsedPicTag,
    imageSettings: typeof settings.systemServicesSettings.imageGeneration,
  ): Promise<void> {
    const imageId = crypto.randomUUID()

    // Determine which profile and model to use
    let profileId = imageSettings.profileId
    let modelToUse = settings.getImageProfile(profileId ?? '')?.model ?? ''
    let sizeToUse = imageSettings.size
    let referenceImageUrls: string[] | undefined

    // If portrait mode is enabled and tag specifies characters, look for their portraits
    if (context.referenceMode && tag.characters.length > 0) {
      const portraitUrls: string[] = []
      const charactersWithPortraits: string[] = []
      const charactersWithoutPortraits: string[] = []

      for (const charName of tag.characters.slice(0, 3)) {
        const character = context.presentCharacters.find(
          (c) => c.name.toLowerCase() === charName.toLowerCase(),
        )

        const portraitUrl = normalizeImageDataUrl(character?.portrait)
        if (portraitUrl) {
          portraitUrls.push(portraitUrl)
          charactersWithPortraits.push(charName)
        } else {
          charactersWithoutPortraits.push(charName)
        }
      }

      if (portraitUrls.length > 0) {
        // Use reference profile and model for img2img
        profileId = imageSettings.referenceProfileId
        modelToUse = settings.getImageProfile(profileId ?? '')?.model ?? ''
        sizeToUse = imageSettings.referenceSize
        referenceImageUrls = portraitUrls
        log('Using character portraits as reference', {
          characters: charactersWithPortraits,
          count: portraitUrls.length,
          profileId,
          model: modelToUse,
        })
      }

      if (charactersWithoutPortraits.length > 0) {
        log('Some characters missing portraits', {
          missing: charactersWithoutPortraits,
          proceeding: 'yes - user explicitly requested via <pic> tag',
        })
      }
    }

    // Validate we have a profile
    if (!profileId) {
      log('No image profile configured, skipping')
      return
    }

    // Assemble the request (BE grounding + cues + per-character LoRA/trigger
    // words + style + si-bridge spec) via the shared helper, so this post-hoc
    // path and the streaming tracker cannot drift.
    const stylePrompt = await this.getStylePrompt(imageSettings.styleId)
    const activeProviderType = settings.getImageProfile(profileId)?.providerType
    const { fullPrompt, bridgeSpec, loraOverride } = assembleInlineImage({
      presentCharacters: context.presentCharacters,
      tagPrompt: tag.prompt,
      tagCharacters: tag.characters,
      beMode: context.beMode,
      stylePrompt,
      narrativeText: context.narrativeContent,
      providerType: activeProviderType,
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
    if (activeProviderType === 'si-bridge' && referenceImageUrls?.length) {
      // B1 anchor path not wired yet — the native provider cannot consume
      // portrait references; the render proceeds spec/prompt-only.
      log('si-bridge ignores portrait references (B1 identity anchors not yet wired)', {
        droppedReferences: referenceImageUrls.length,
      })
    }

    const { width, height } = parseImageSize(sizeToUse)

    // Create pending record in database
    const embeddedImage: Omit<EmbeddedImage, 'createdAt'> = {
      id: imageId,
      storyId: context.storyId,
      entryId: context.entryId,
      sourceText: tag.originalTag,
      prompt: fullPrompt,
      styleId: imageSettings.styleId,
      model: modelToUse,
      imageData: '',
      width,
      height,
      status: 'pending',
      generationMode: 'inline',
    }

    await database.createEmbeddedImage(embeddedImage)
    log('Created pending inline image record', {
      imageId,
      prompt: tag.prompt.slice(0, 50) + '...',
      profileId,
      model: modelToUse,
    })

    // Emit queued event
    emitImageQueued(imageId, context.entryId)

    // Start async generation (fire-and-forget)
    this.generateImage(
      imageId,
      fullPrompt,
      profileId,
      modelToUse,
      sizeToUse,
      context.entryId,
      referenceImageUrls,
      bridgeSpec,
      loraOverride,
    ).catch((error) => {
      log('Async inline image generation failed', { imageId, error })
    })
  }

  /**
   * Get the style prompt for the selected style ID.
   * Image style templates are external (raw text) -- fetched directly from the database.
   */
  private async getStylePrompt(styleId: string): Promise<string> {
    try {
      const template = await database.getPackTemplate('default-pack', styleId)
      if (template?.content) {
        return template.content
      }
    } catch {
      // Template not found, use fallback
    }

    return DEFAULT_FALLBACK_STYLE_PROMPT
  }

  /**
   * Generate a single image using the SDK (runs asynchronously)
   */
  private async generateImage(
    imageId: string,
    prompt: string,
    profileId: string,
    model: string,
    size: string,
    entryId: string,
    referenceImageUrls?: string[],
    spec?: StructuredImageSpecInput,
    loraOverride?: ResolvedLora | null,
  ): Promise<void> {
    try {
      // Update status to generating
      await database.updateEmbeddedImage(imageId, { status: 'generating' })

      log('Generating inline image via SDK', {
        imageId,
        profileId,
        model,
        hasReference: !!referenceImageUrls?.length,
        hasLora: !!loraOverride,
      })

      // Generate image using SDK
      const result = await registryGenerateImage({
        profileId,
        model,
        prompt,
        size,
        referenceImages: referenceImageUrls,
        spec,
        loraOverride: loraOverride ?? undefined,
      })

      if (!result.base64) {
        throw new Error('No image data returned')
      }

      // Update record with image data
      await database.updateEmbeddedImage(imageId, {
        imageData: result.base64,
        status: 'complete',
      })

      log('Inline image generated successfully', {
        imageId,
        hasReference: !!referenceImageUrls,
      })

      // Emit ready event
      emitImageReady(imageId, entryId, true)
    } catch (error) {
      // Tauri's HTTP plugin throws plain strings on network failures
      // (connection refused etc.) — preserve them instead of "Unknown error".
      const errorMessage =
        error instanceof Error ? error.message : error ? String(error) : 'Unknown error'
      log('Inline image generation failed', { imageId, error: errorMessage })

      // Update record with error. A failed write must not swallow the UI
      // events below — that would strand the row in 'generating' with no signal.
      try {
        await database.updateEmbeddedImage(imageId, {
          status: 'failed',
          errorMessage,
        })
      } catch (dbError) {
        log('Failed to persist image failure status', { imageId, dbError })
      }

      // Emit ready event (with failure) and notify UI
      emitImageReady(imageId, entryId, false)
      emitImageAnalysisFailed(entryId, errorMessage)
    }
  }
}

// Export singleton instance
export const inlineImageService = new InlineImageGenerationService()
