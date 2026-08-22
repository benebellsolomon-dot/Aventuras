/**
 * Image Generation Utilities
 *
 * Helper functions for image generation using the standalone provider registry.
 */

import { generateImage, supportsImageGeneration } from './providers/registry'
import { sizeBandMarker, tierMarker } from './sizeBandMarker'
import { bridgeIdentityAnchor, buildPortraitSpec, type BridgeSpecSubject } from './bridgeSpec'
import { resolveLora, loraTriggerText, type ResolvedLora } from './loraBinding'
import { assembleInlineImage } from './inlineAssembly'
import { resolveBooruScenePrompt } from './booruPromptWriter'
import { DEFAULT_FALLBACK_STYLE_PROMPT } from './constants'
import { readBodyState } from '$lib/services/be'
import { database } from '$lib/services/database'
import { settings } from '$lib/stores/settings.svelte'
import type { Character, ImageProviderType, StorySettings } from '$lib/types'
import type { StructuredImageSpecInput } from './providers/types'
import { emitImageReady, emitImageAnalysisFailed } from '$lib/services/events'
import { matchAttribute } from '$lib/utils/inlineImageParser'
import { effectiveBeatRating, parseBeatRating, resolveRatingRoute } from './ratingRouting'
import { createLogger } from '$lib/log'
import { normalizeImageDataUrl, parseImageSize } from '$lib/utils/image'

const log = createLogger('ImageUtils')

/**
 * Check if image generation is enabled and has valid configuration.
 * Now checks Image Profiles instead of API Profiles.
 */
export function isImageGenerationEnabled(
  storySettings?: StorySettings,
  type: 'standard' | 'background' | 'portrait' | 'reference' = 'standard',
): boolean {
  const imageSettings = settings.systemServicesSettings.imageGeneration

  if (storySettings) {
    if (type !== 'background' && storySettings.imageGenerationMode === 'none') return false
  } else {
    if (!imageSettings?.profileId) return false
  }

  // Determine which profileId to check based on type
  let profileId: string | null = imageSettings.profileId
  if (type === 'background') profileId = imageSettings.backgroundProfileId
  if (type === 'portrait') profileId = imageSettings.portraitProfileId
  if (type === 'reference') profileId = imageSettings.referenceProfileId

  if (!profileId) return false

  const profile = settings.getImageProfile(profileId)
  if (!profile) return false

  return supportsImageGeneration(profile.providerType)
}

/**
 * Check if required credentials are configured for image generation.
 */
export function hasRequiredCredentials(): boolean {
  const imageSettings = settings.systemServicesSettings.imageGeneration
  const profileId = imageSettings?.profileId
  if (!profileId) return false

  const profile = settings.getImageProfile(profileId)
  if (!profile) return false

  if (!supportsImageGeneration(profile.providerType)) return false

  return (
    !!profile.apiKey ||
    profile.providerType === 'pollinations' ||
    profile.providerType === 'comfyui'
  )
}

/**
 * Get display name for the currently configured image generation provider.
 */
export function getProviderDisplayName(): string {
  const imageSettings = settings.systemServicesSettings.imageGeneration
  const profileId = imageSettings?.profileId
  if (!profileId) return 'No provider'

  const profile = settings.getImageProfile(profileId)
  if (!profile) return 'Unknown'

  const names: Record<string, string> = {
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    nanogpt: 'NanoGPT',
    chutes: 'Chutes',
    pollinations: 'Pollinations.ai',
    google: 'Google',
    zhipu: 'Zhipu',
    comfyui: 'ComfyUI',
  }

  return names[profile.providerType] || profile.providerType
}

/**
 * Scene context needed to rebuild an inline (<pic>) image request. Supplying it
 * routes a regenerate/retry through the canonical inline assembly pipeline
 * instead of re-sending the stored prompt, so a regenerated image keeps the
 * per-character trigger words/LoRA, BE size grounding + `__betier__` marker,
 * booru dialect handling and the CURRENT style prompt.
 */
export interface InlineRegenerationContext {
  /** Characters present in the scene (identity + bodyState + loraConfig source). */
  presentCharacters: Character[]
  /** BE grounding gate — mirrors the story's beMode setting. */
  beMode: boolean
  /** Narrative beat the image belongs to — signal for the bridge spec gates. */
  narrativeText: string
  /** User-edited raw <pic> prompt; defaults to the prompt recorded on the tag. */
  promptOverride?: string
  /**
   * Story's portrait-reference setting. Mirrors InlineImageContext.referenceMode:
   * with it on, a regenerate re-gathers the tagged characters' portraits so the
   * identity anchor survives the retry.
   */
  referenceMode?: boolean
}

/** Character names written on a <pic> tag, in tag order. */
function tagCharacterNames(sourceText: string): string[] {
  return (matchAttribute(sourceText, 'characters') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name)
}

/**
 * The portraits a retry should send as references — the same gather the
 * first-generation path does (InlineImageService.generateImageForTag): portrait
 * mode on, characters named on the tag, at most three.
 */
function collectReferenceImages(
  sourceText: string,
  context: InlineRegenerationContext,
): string[] | undefined {
  if (!context.referenceMode) return undefined
  const urls: string[] = []
  for (const name of tagCharacterNames(sourceText).slice(0, 3)) {
    const character = context.presentCharacters.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    )
    const portraitUrl = normalizeImageDataUrl(character?.portrait)
    if (portraitUrl) urls.push(portraitUrl)
  }
  return urls.length > 0 ? urls : undefined
}

/** Resolve the configured image style prompt, falling back to the built-in one. */
export async function resolveStylePrompt(styleId: string): Promise<string> {
  try {
    const template = await database.getPackTemplate('default-pack', styleId)
    if (template?.content) return template.content
  } catch {
    // Template not found, use fallback
  }
  return DEFAULT_FALLBACK_STYLE_PROMPT
}

/**
 * Rebuild an inline image's request through the shared assembly. Returns null
 * when the record is not an inline <pic> image (nothing to reassemble).
 */
async function assembleInlineRetry(
  image: { generationMode?: string; sourceText?: string },
  context: InlineRegenerationContext,
  providerType: ImageProviderType | undefined,
  model: string,
  styleId: string,
): Promise<{
  fullPrompt: string
  bridgeSpec?: StructuredImageSpecInput
  loraOverride?: ResolvedLora
} | null> {
  const sourceText = image.sourceText ?? ''
  if (image.generationMode !== 'inline' || !sourceText.startsWith('<pic')) return null

  const override = context.promptOverride?.trim()
  const rawPrompt = override || matchAttribute(sourceText, 'prompt')
  if (!rawPrompt) return null

  const tagCharacters = tagCharacterNames(sourceText)

  // Dedicated booru prompt writer (research/55 follow-up): a plain retry
  // re-extracts the ORIGINAL narration prose from the stored <pic> tag, so for
  // booru models it would regress to prose on every regenerate. Rewrite it into
  // Danbooru tags here too — but honor an explicit user prompt override verbatim
  // (that is deliberate user intent, not the narration model's prose).
  const tagPrompt = override
    ? rawPrompt
    : await resolveBooruScenePrompt({
        presentCharacters: context.presentCharacters,
        tagCharacterNames: tagCharacters,
        scenePrompt: rawPrompt,
        narrativeText: context.narrativeText,
        beMode: context.beMode,
        model,
      })

  return assembleInlineImage({
    presentCharacters: context.presentCharacters,
    tagPrompt,
    tagCharacters,
    beMode: context.beMode,
    stylePrompt: await resolveStylePrompt(styleId),
    narrativeText: context.narrativeText,
    providerType,
    model,
  })
}

/**
 * Retry image generation for a failed/existing image using current settings.
 * Pass `inlineContext` for inline <pic> images so the request is rebuilt via
 * the same assembly pipeline as first-time inline generation.
 */
export async function retryImageGeneration(
  imageId: string,
  prompt: string,
  inlineContext?: InlineRegenerationContext,
): Promise<void> {
  if (!isImageGenerationEnabled()) {
    log('Cannot retry - image generation not enabled')
    return
  }

  const image = await database.getEmbeddedImage(imageId)
  if (!image) {
    log('Cannot retry - image not found', { imageId })
    return
  }

  const imageSettings = settings.systemServicesSettings.imageGeneration
  if (!imageSettings.profileId) {
    log('Cannot retry - no profile configured')
    return
  }

  // Rating routing (research/64 option B) must survive a regenerate: the beat's
  // rating is the higher of the <pic rating> attribute and what the stored /
  // edited prompt text implies (a booru prompt opens with its rating tag). A
  // retry that ignored this sent explicit beats back to the primary profile.
  const declaredRating = parseBeatRating(matchAttribute(image.sourceText ?? '', 'rating'))
  const ratingText = [image.prompt, prompt, inlineContext?.promptOverride]
    .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    .join('\n')
  const route = resolveRatingRoute(effectiveBeatRating(declaredRating, ratingText), imageSettings)
  let profileId = route.profileId ?? imageSettings.profileId
  let size = route.size

  // Portrait references (Spec 4 B1): first-time generation swaps to the
  // reference profile/size when the tagged characters have portraits, and
  // routes si-bridge identity through the FaceID anchor. A retry that skipped
  // this re-rendered the image with no identity anchor at all. Routed explicit
  // beats skip references entirely, as first-time generation does.
  const isInlineRecord =
    image.generationMode === 'inline' && (image.sourceText ?? '').startsWith('<pic')
  const referenceImageUrls =
    inlineContext && isInlineRecord && !route.routed
      ? collectReferenceImages(image.sourceText ?? '', inlineContext)
      : undefined
  if (referenceImageUrls && imageSettings.referenceProfileId) {
    profileId = imageSettings.referenceProfileId
    size = imageSettings.referenceSize
  }

  const profile = settings.getImageProfile(profileId)
  const model = profile?.model ?? ''
  const { width, height } = parseImageSize(size)

  // Inline images go back through the canonical assembly so a regenerate picks
  // up trigger words/LoRA, BE grounding + marker, dialect handling and the
  // current style — the stored prompt alone would drop all of it.
  const assembled = inlineContext
    ? await assembleInlineRetry(
        image,
        inlineContext,
        profile?.providerType,
        model,
        imageSettings.styleId,
      )
    : null
  // Non-inline records have no assembly, so a user-edited prompt still needs
  // the current style appended. That happens here, from the one style fetch,
  // rather than in the caller (which then fetched the same template twice and
  // handed inline records a prompt the assembly discarded).
  const finalPrompt =
    assembled?.fullPrompt ??
    (inlineContext?.promptOverride?.trim()
      ? `${inlineContext.promptOverride.trim().replace(/\.+$/, '')}. ${await resolveStylePrompt(imageSettings.styleId)}`
      : prompt)

  const poseFaceAnchor = bridgeIdentityAnchor({
    providerType: profile?.providerType,
    model,
    referenceImages: referenceImageUrls,
  })

  await database.updateEmbeddedImage(imageId, {
    prompt: finalPrompt,
    model,
    status: 'generating',
    errorMessage: undefined,
    width,
    height,
  })

  log('Retrying image generation', {
    imageId,
    profileId,
    model,
    size,
    routedExplicit: route.routed,
    reassembled: !!assembled,
    references: referenceImageUrls?.length ?? 0,
    anchored: !!poseFaceAnchor,
  })

  try {
    const result = await generateImage({
      profileId,
      model,
      prompt: finalPrompt,
      size,
      referenceImages: referenceImageUrls,
      spec: assembled?.bridgeSpec,
      loraOverride: assembled?.loraOverride,
      poseFaceAnchor,
    })

    if (!result.base64) {
      throw new Error('No image data returned')
    }

    await database.updateEmbeddedImage(imageId, {
      imageData: result.base64,
      status: 'complete',
    })

    log('Image retry successful', { imageId })
    emitImageReady(imageId, image.entryId, true)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log('Image retry failed', { imageId, error: errorMessage })

    await database.updateEmbeddedImage(imageId, {
      status: 'failed',
      errorMessage,
    })

    emitImageReady(imageId, image.entryId, false)
    emitImageAnalysisFailed(image.entryId, errorMessage)
  }
}

/**
 * Generate a portrait image for a character.
 * Returns the base64 image data on success.
 */
export async function generatePortrait(
  prompt: string,
  subject?: BridgeSpecSubject,
): Promise<string> {
  // Per-character LoRA trigger words lead the prompt (provider-agnostic); the
  // LoRA file + tier-scaled weight (below) apply only on LoRA-capable providers.
  const triggerText = subject ? loraTriggerText([subject.loraConfig]) : ''
  if (triggerText) prompt = `${triggerText}, ${prompt}`
  const loraTier = readBodyState(subject?.metadata ?? null)?.tier ?? 0
  const loraOverride = resolveLora(subject?.loraConfig, loraTier) ?? undefined

  const imageSettings = settings.systemServicesSettings.imageGeneration

  const profileId = imageSettings.portraitProfileId
  if (!profileId) {
    throw new Error('No image generation profile configured')
  }

  const profile = settings.getImageProfile(profileId)

  // Size marker — engine tier when the subject has body state, text-derived
  // fallback otherwise. Only for the providers that parse it; everyone else
  // would receive a literal __betier_N__ token.
  if (profile?.providerType === 'si-bridge' || profile?.providerType === 'a1111') {
    const engineTier = readBodyState(subject?.metadata ?? null)?.tier
    prompt = `${tierMarker(engineTier) || sizeBandMarker(prompt)}${prompt}`
  }
  const model = profile?.model ?? ''
  if (!model) {
    throw new Error('No image model configured')
  }

  const size = imageSettings.portraitSize || '1024x1024'

  // si-bridge portraits send structure: identity via identity_tags + the tier
  // from engine state (or sniffed from the descriptors) — prose alone dropped
  // both bridge-side. The marked prompt stays as the recorded fallback.
  const spec =
    subject && profile?.providerType === 'si-bridge' ? buildPortraitSpec(subject) : undefined

  log('Generating portrait', { profileId, model, size, promptLength: prompt.length })

  const result = await generateImage({ profileId, model, prompt, size, spec, loraOverride })

  if (!result.base64) {
    throw new Error('No image data returned from provider')
  }

  return result.base64
}
