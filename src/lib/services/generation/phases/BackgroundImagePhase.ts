/**
 * ImagePhase - Handles image generation coordination
 * Supports inline (<pic> tags) and analyzed (LLM scene detection) modes.
 * Uses interchangeable profiles - this phase does NOT change that architecture.
 */

import type {
  GenerationEvent,
  PhaseStartEvent,
  PhaseCompleteEvent,
  AbortedEvent,
  ErrorEvent,
} from '../types'
import type { StoryEntry } from '$lib/types'

/** Dependencies for image phase - injected to avoid tight coupling */
export interface BackgroundImageDependencies {
  analyzeBackgroundChangeAndGenerateImage: (
    storyId: string,
    visibleEntries: StoryEntry[],
  ) => Promise<void>
  isImageGenerationEnabled: (
    storySettings?: any,
    type?: 'standard' | 'background' | 'portrait' | 'reference',
  ) => boolean
}

/** Settings needed for image phase decision making */
export interface BackgroundImageSettings {
  backgroundImagesEnabled?: boolean
  imageGenerationMode?: 'none' | 'agentic' | 'inline'
  /** V2 sprite engine: when a sprite profile is set, VN stages need backgrounds even in inline mode. */
  spriteProfileId?: string | null
}

/** Input for the image phase */
export interface BackgroundImageInput {
  storyId: string
  storyEntries: StoryEntry[]
  imageSettings: BackgroundImageSettings
  abortSignal?: AbortSignal
}

/** Result from image phase */
export interface BackgroundImageResult {
  started: boolean
  skippedReason?: 'disabled' | 'auto_generate_off' | 'not_configured' | 'aborted' | 'inline_mode'
}

/** Coordinates image generation. Errors are non-fatal. */
export class BackgroundImagePhase {
  constructor(private deps: BackgroundImageDependencies) {}

  /** Execute the image phase - yields events and returns result */
  async *execute(
    input: BackgroundImageInput,
  ): AsyncGenerator<GenerationEvent, BackgroundImageResult> {
    console.log('BackgroundImagePhase.execute')
    yield { type: 'phase_start', phase: 'image' } satisfies PhaseStartEvent

    const { storyId, storyEntries, imageSettings, abortSignal } = input

    // Check if background image generation is disabled
    if (imageSettings.backgroundImagesEnabled === false) {
      const result: BackgroundImageResult = { started: false, skippedReason: 'disabled' }
      yield { type: 'phase_complete', phase: 'image', result } satisfies PhaseCompleteEvent
      return result
    }

    // Skip in inline mode - we don't want agentic background analysis in pure
    // inline mode. EXCEPT when the VN sprite engine is active (a sprite profile
    // is configured): the VN stage composites cutout sprites over the
    // background, so inline-mode BE stories still need one (Spec 4 V2b Task 4).
    const spritesActive = !!imageSettings.spriteProfileId
    if (imageSettings.imageGenerationMode === 'inline' && !spritesActive) {
      const result: BackgroundImageResult = { started: false, skippedReason: 'inline_mode' }
      yield { type: 'phase_complete', phase: 'image', result } satisfies PhaseCompleteEvent
      return result
    }

    // Check if image generation is actually configured (profile exists)
    if (!this.deps.isImageGenerationEnabled(imageSettings, 'background')) {
      const result: BackgroundImageResult = { started: false, skippedReason: 'not_configured' }
      yield { type: 'phase_complete', phase: 'image', result } satisfies PhaseCompleteEvent
      return result
    }

    if (abortSignal?.aborted) {
      yield { type: 'aborted', phase: 'image' } satisfies AbortedEvent
      return { started: false, skippedReason: 'aborted' }
    }

    try {
      await this.deps.analyzeBackgroundChangeAndGenerateImage(storyId, storyEntries)

      const result: BackgroundImageResult = { started: true }
      yield { type: 'phase_complete', phase: 'image', result } satisfies PhaseCompleteEvent
      return result
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        yield { type: 'aborted', phase: 'image' } satisfies AbortedEvent
        return { started: false, skippedReason: 'aborted' }
      }

      // Image generation errors are non-fatal
      yield {
        type: 'error',
        phase: 'image',
        error: error instanceof Error ? error : new Error(String(error)),
        fatal: false,
      } satisfies ErrorEvent

      return { started: false }
    }
  }
}
